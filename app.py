# ============================================================
# app.py — sl-Dubbing | نظام أصوات متعددة من Cloudinary
# ============================================================
import os, uuid, time, re, torch, json
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.after_request
def add_cors(r):
    r.headers["Access-Control-Allow-Origin"]  = "*"
    r.headers["Access-Control-Allow-Headers"] = "Content-Type, ngrok-skip-browser-warning"
    r.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return r

@app.before_request
def preflight():
    if request.method == "OPTIONS":
        res = jsonify({"ok": True})
        res.headers["Access-Control-Allow-Origin"]  = "*"
        res.headers["Access-Control-Allow-Headers"] = "Content-Type, ngrok-skip-browser-warning"
        res.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return res, 200

OUTPUT_DIR  = Path("outputs");       OUTPUT_DIR.mkdir(exist_ok=True)
VOICES_DIR  = Path("voices_cache");  VOICES_DIR.mkdir(exist_ok=True)
LATENTS_DIR = Path("latents_cache"); LATENTS_DIR.mkdir(exist_ok=True)

CLOUDINARY_CLOUD  = "dxbmvzsiz"
CLOUDINARY_KEY    = "432687952743126"
CLOUDINARY_SECRET = "BrFvzlPFXBJZ-B-cZyxCc-0wHRo"

tts_engine = None

def load_xtts():
    global tts_engine
    try:
        os.environ["COQUI_TOS_AGREED"] = "1"
        from TTS.api import TTS
        tts_engine = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=False)
        print("✅ XTTS v2 محمّل")
    except Exception as e:
        print(f"⚠️ XTTS فشل: {e}")

def get_voices_from_cloudinary():
    try:
        import cloudinary, cloudinary.api
        cloudinary.config(
            cloud_name=CLOUDINARY_CLOUD,
            api_key=CLOUDINARY_KEY,
            api_secret=CLOUDINARY_SECRET
        )
        voices = []
        # جرب كل أنواع الموارد وكل طرق البحث
        for rtype in ["video", "raw"]:
            for prefix in ["sl_voices/", ""]:
                try:
                    result = cloudinary.api.resources(
                        type="upload",
                        prefix=prefix,
                        resource_type=rtype,
                        max_results=50
                    )
                    for r in result.get("resources", []):
                        pid = r["public_id"]
                        # فلتر فقط ملفات sl_voices
                        if "sl_voices" not in pid and prefix == "":
                            continue
                        # تجنب التكرار
                        if any(v["public_id"] == pid for v in voices):
                            continue
                        name = Path(pid).stem
                        vid  = pid.replace("/","_").replace(" ","_")
                        voices.append({
                            "id":        vid,
                            "name":      name.replace("_"," ").title(),
                            "url":       r["secure_url"],
                            "public_id": pid
                        })
                except Exception as e:
                    print(f"cloudinary search {rtype}/{prefix}: {e}")

        # إذا لم نجد شيئاً — ابحث بدون prefix
        if not voices:
            try:
                result = cloudinary.api.resources(
                    type="upload",
                    resource_type="video",
                    max_results=50
                )
                for r in result.get("resources", []):
                    pid  = r["public_id"]
                    name = Path(pid).stem
                    vid  = pid.replace("/","_").replace(" ","_")
                    voices.append({
                        "id":        vid,
                        "name":      name.replace("_"," ").title(),
                        "url":       r["secure_url"],
                        "public_id": pid
                    })
            except Exception as e:
                print(f"cloudinary fallback: {e}")

        return voices
    except Exception as e:
        print(f"⚠️ Cloudinary error: {e}")
        return []

def download_voice(voice_url, voice_id):
    local = VOICES_DIR / f"{voice_id}.wav"
    if local.exists(): return str(local)
    try:
        import urllib.request
        from pydub import AudioSegment
        tmp = VOICES_DIR / f"{voice_id}_raw"
        urllib.request.urlretrieve(voice_url, str(tmp))
        AudioSegment.from_file(str(tmp)).export(str(local), format="wav")
        tmp.unlink(missing_ok=True)
        return str(local)
    except Exception as e:
        print(f"⚠️ فشل تحميل {voice_id}: {e}")
        return None

def get_latents(voice_id, voice_url):
    latent_file = LATENTS_DIR / f"{voice_id}.pth"
    if latent_file.exists():
        try:
            data = torch.load(str(latent_file), map_location="cpu")
            print(f"⚡ Latents جاهزة: {voice_id}")
            return data["gpt_cond"], data["speaker_emb"]
        except: pass
    if not tts_engine: return None, None
    wav = download_voice(voice_url, voice_id)
    if not wav: return None, None
    try:
        print(f"⏳ تحليل: {voice_id}")
        model = tts_engine.synthesizer.tts_model
        gpt_cond, speaker_emb = model.get_conditioning_latents(audio_path=[wav])
        torch.save({"gpt_cond": gpt_cond, "speaker_emb": speaker_emb}, str(latent_file))
        print(f"✅ محفوظ: {voice_id}")
        return gpt_cond, speaker_emb
    except Exception as e:
        print(f"⚠️ latents error: {e}")
        return None, None

def synth_xtts(text, lang, out, voice_id, voice_url):
    if not tts_engine or not voice_id: return False
    gpt_cond, speaker_emb = get_latents(voice_id, voice_url)
    if gpt_cond is None: return False
    try:
        model   = tts_engine.synthesizer.tts_model
        out_wav = model.inference(
            text=text, language=lang,
            gpt_cond_latent=gpt_cond,
            speaker_embedding=speaker_emb,
            speed=1.0
        )
        import torchaudio
        torchaudio.save(out, torch.tensor(out_wav["wav"]).unsqueeze(0), 24000)
        return True
    except Exception as e:
        print(f"XTTS err: {e}"); return False

def synth_gtts(text, lang, out):
    try:
        from gtts import gTTS
        gTTS(text=text, lang=lang[:2]).save(out); return True
    except Exception as e:
        print(f"gTTS err: {e}"); return False

def srt_time(s):
    s = s.replace(",",".")
    p = s.split(":")
    return int(p[0])*3600 + int(p[1])*60 + float(p[2])

def parse_srt(content):
    blocks, cur = [], None
    for line in content.split("\n"):
        line = line.strip()
        if not line:
            if cur: blocks.append(cur)
            cur = None
        elif re.match(r"^\d+$", line):
            cur = {"i":int(line),"start":0,"end":0,"text":""}
        elif "-->" in line and cur:
            p = line.split("-->")
            cur["start"] = srt_time(p[0].strip())
            cur["end"]   = srt_time(p[1].strip())
        elif cur:
            cur["text"] += line + " "
    if cur: blocks.append(cur)
    return blocks

def assemble_srt(blocks, lang, vm, voice_id, voice_url):
    from pydub import AudioSegment
    timeline = AudioSegment.empty()
    cursor   = 0.0
    for b in blocks:
        text = b["text"].strip()
        if not text: continue
        tmp = str(OUTPUT_DIR / f"seg_{uuid.uuid4().hex[:6]}.wav")
        ok  = synth_xtts(text, lang, tmp, voice_id, voice_url) if vm=="xtts" else False
        if not ok: ok = synth_gtts(text, lang, tmp)
        if not ok: continue
        seg = AudioSegment.from_file(tmp)
        gap = b["start"] - cursor
        if gap > 0: timeline += AudioSegment.silent(int(gap*1000))
        elif gap < 0: seg = seg[:int((b["end"]-b["start"])*1000)]
        timeline += seg
        cursor = b["start"] + len(seg)/1000
    out = str(OUTPUT_DIR / f"dub_{uuid.uuid4().hex[:8]}.mp3")
    timeline.export(out, format="mp3")
    return out

@app.route("/api/health")
def health():
    return jsonify({
        "status":        "ok",
        "xtts":          tts_engine is not None,
        "engine":        "xtts_v2" if tts_engine else "gtts",
        "voices_cached": len(list(LATENTS_DIR.glob("*.pth")))
    })

@app.route("/api/voices")
def api_voices():
    voices = get_voices_from_cloudinary()
    return jsonify({"success": True, "voices": voices, "count": len(voices)})

@app.route("/api/preload_voice", methods=["POST","OPTIONS"])
def preload_voice():
    if request.method == "OPTIONS": return jsonify({"ok":True})
    data = request.get_json(force=True)
    vid  = data.get("voice_id","")
    vurl = data.get("voice_url","")
    if not vid or not vurl:
        return jsonify({"success":False,"error":"مطلوب voice_id و voice_url"}), 400
    gpt, _ = get_latents(vid, vurl)
    return jsonify({"success": gpt is not None, "message":"✅ تم تحليل الصوت" if gpt else "⚠️ فشل"})

@app.route("/api/dub", methods=["POST","OPTIONS"])
def dub():
    if request.method == "OPTIONS": return jsonify({"ok":True})
    data  = request.get_json(force=True)
    srt   = data.get("srt",""); text = data.get("text","")
    lang  = data.get("lang","ar"); vm = data.get("voice_mode","gtts")
    vid   = data.get("voice_id",""); vurl = data.get("voice_url","")
    t0    = time.time()
    if srt.strip():
        blocks = parse_srt(srt); out = assemble_srt(blocks,lang,vm,vid,vurl); synced=True
    else:
        out = str(OUTPUT_DIR/f"dub_{uuid.uuid4().hex[:8]}.mp3")
        ok  = synth_xtts(text,lang,out,vid,vurl) if vm=="xtts" else False
        if not ok: ok = synth_gtts(text,lang,out)
        if not ok: return jsonify({"success":False,"error":"فشل"}),500
        synced=False
    if not out or not Path(out).exists():
        return jsonify({"success":False,"error":"فشل التجميع"}),500
    method = "xtts_v2" if (vm=="xtts" and tts_engine and vid) else "gtts"
    return jsonify({
        "success":   True,
        "audio_url": f"https://{request.host}/api/file/{Path(out).name}",
        "method":    method,
        "synced":    synced,
        "time_sec":  round(time.time()-t0,1)
    })

@app.route("/api/tts", methods=["POST","OPTIONS"])
def tts():
    if request.method == "OPTIONS": return jsonify({"ok":True})
    data = request.get_json(force=True)
    text = data.get("text","").strip(); lang = data.get("lang","ar")
    vm   = data.get("voice_mode","gtts"); vid = data.get("voice_id",""); vurl = data.get("voice_url","")
    if not text: return jsonify({"success":False,"error":"النص فارغ"}),400
    out = str(OUTPUT_DIR/f"tts_{uuid.uuid4().hex[:8]}.mp3")
    ok  = synth_xtts(text,lang,out,vid,vurl) if vm=="xtts" else False
    if not ok: ok = synth_gtts(text,lang,out)
    if not ok: return jsonify({"success":False,"error":"فشل"}),500
    return jsonify({
        "success":   True,
        "audio_url": f"https://{request.host}/api/file/{Path(out).name}"
    })

@app.route("/api/file/<filename>")
def get_file(filename):
    p = OUTPUT_DIR/filename
    if not p.exists(): return jsonify({"error":"غير موجود"}),404
    return send_file(str(p), mimetype="audio/mpeg")

load_xtts()
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=7860, debug=False)
