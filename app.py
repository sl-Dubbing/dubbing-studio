# ============================================================
# app.py — sl-Dubbing على Hugging Face Spaces
# ============================================================
import os, uuid, time, re, torch
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, ngrok-skip-browser-warning"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

@app.before_request
def preflight():
    if request.method == "OPTIONS":
        res = jsonify({"ok": True})
        res.headers["Access-Control-Allow-Origin"]  = "*"
        res.headers["Access-Control-Allow-Headers"] = "Content-Type, ngrok-skip-browser-warning"
        res.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return res, 200

OUTPUT_DIR = Path("outputs"); OUTPUT_DIR.mkdir(exist_ok=True)
VOICE_DIR  = Path("voices");  VOICE_DIR.mkdir(exist_ok=True)
LATENTS_PATH = Path("voices/latents.pth")

tts_engine   = None
gpt_cond     = None   # latents محفوظة
speaker_emb  = None   # latents محفوظة

# ── تحميل XTTS ───────────────────────────────────────────────
def load_xtts():
    global tts_engine, gpt_cond, speaker_emb
    try:
        from TTS.api import TTS
        tts_engine = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        print("✅ XTTS v2 محمّل")
        load_or_compute_latents()
    except Exception as e:
        print(f"⚠️ XTTS فشل: {e}")

# ── Voice Latents ─────────────────────────────────────────────
def load_or_compute_latents():
    global gpt_cond, speaker_emb

    # إن وُجدت latents محفوظة → حمّلها مباشرة
    if LATENTS_PATH.exists():
        try:
            data       = torch.load(str(LATENTS_PATH))
            gpt_cond   = data["gpt_cond"]
            speaker_emb = data["speaker_emb"]
            print("✅ Voice latents محمّلة من الملف (سريع)")
            return
        except Exception as e:
            print(f"⚠️ فشل تحميل latents: {e}")

    # لا توجد latents → احسبها من الملف الصوتي
    voice_file = get_voice()
    if not voice_file or not tts_engine:
        print("⚠️ لا يوجد ملف صوتي لحساب latents")
        return

    try:
        print("⏳ حساب voice latents (مرة واحدة فقط)...")
        model = tts_engine.synthesizer.tts_model
        gpt_cond, speaker_emb = model.get_conditioning_latents(
            audio_path=[voice_file]
        )
        # احفظها لكل المرات القادمة
        torch.save(
            {"gpt_cond": gpt_cond, "speaker_emb": speaker_emb},
            str(LATENTS_PATH)
        )
        print("✅ Voice latents محسوبة ومحفوظة!")
    except Exception as e:
        print(f"⚠️ فشل حساب latents: {e}")

def get_voice():
    for ext in ["*.wav","*.mp3","*.ogg","*.m4a"]:
        f = list(VOICE_DIR.glob(ext))
        if f: return str(f[0])
    return None

# ── توليد XTTS باستخدام الـ latents ─────────────────────────
def synth_xtts(text: str, lang: str, out: str) -> bool:
    global gpt_cond, speaker_emb
    if not tts_engine: return False

    # إن لم تكن latents محملة → جرب تحميلها
    if gpt_cond is None:
        load_or_compute_latents()
    if gpt_cond is None: return False

    try:
        model = tts_engine.synthesizer.tts_model
        out_wav = model.inference(
            text          = text,
            language      = lang,
            gpt_cond_latent = gpt_cond,
            speaker_embedding = speaker_emb,
            speed         = 1.0
        )
        import torchaudio
        torchaudio.save(out, torch.tensor(out_wav["wav"]).unsqueeze(0), 24000)
        return True
    except Exception as e:
        print(f"XTTS err: {e}")
        return False

def synth_gtts(text: str, lang: str, out: str) -> bool:
    try:
        from gtts import gTTS
        gTTS(text=text, lang=lang[:2]).save(out)
        return True
    except Exception as e:
        print(f"gTTS err: {e}")
        return False

# ── SRT ──────────────────────────────────────────────────────
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

def assemble_srt(blocks, lang, voice_mode):
    from pydub import AudioSegment
    timeline = AudioSegment.empty()
    cursor   = 0.0
    for b in blocks:
        text = b["text"].strip()
        if not text: continue
        tmp = str(OUTPUT_DIR / f"seg_{uuid.uuid4().hex[:6]}.wav")
        ok  = synth_xtts(text, lang, tmp) if voice_mode=="xtts" else False
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

# ── Endpoints ────────────────────────────────────────────────
@app.route("/api/health")
def health():
    return jsonify({
        "status":  "ok",
        "xtts":    tts_engine is not None,
        "latents": LATENTS_PATH.exists(),
        "voice":   get_voice() is not None,
        "engine":  "xtts_v2" if tts_engine else "gtts"
    })

@app.route("/api/upload_voice", methods=["POST","OPTIONS"])
def upload_voice():
    f = request.files.get("voice")
    if not f: return jsonify({"success":False,"error":"لا يوجد ملف"}), 400
    ext = Path(f.filename).suffix.lower()
    if ext not in [".wav",".mp3",".ogg",".m4a"]:
        return jsonify({"success":False,"error":"امتداد غير مدعوم"}), 400
    raw = VOICE_DIR / f"voice_{uuid.uuid4().hex[:8]}{ext}"
    f.save(str(raw))
    try:
        from pydub import AudioSegment
        AudioSegment.from_file(str(raw)).export(str(VOICE_DIR/"speaker.wav"), format="wav")
        # احذف latents القديمة لإعادة الحساب
        if LATENTS_PATH.exists(): LATENTS_PATH.unlink()
        # احسب latents الجديدة
        load_or_compute_latents()
        return jsonify({"success":True,"message":"✅ تم رفع الصوت وحساب latents"})
    except Exception as e:
        return jsonify({"success":False,"error":str(e)}), 500

@app.route("/api/dub", methods=["POST","OPTIONS"])
def dub():
    if request.method == "OPTIONS": return jsonify({"ok":True})
    data   = request.get_json(force=True)
    srt    = data.get("srt","")
    text   = data.get("text","")
    lang   = data.get("lang","ar")
    vm     = data.get("voice_mode","gtts")
    t0     = time.time()
    if srt.strip():
        blocks = parse_srt(srt)
        out    = assemble_srt(blocks, lang, vm)
        synced = True
    else:
        out = str(OUTPUT_DIR / f"dub_{uuid.uuid4().hex[:8]}.mp3")
        ok  = synth_xtts(text, lang, out) if vm=="xtts" else False
        if not ok: ok = synth_gtts(text, lang, out)
        if not ok: return jsonify({"success":False,"error":"فشل"}), 500
        synced = False
    if not out or not Path(out).exists():
        return jsonify({"success":False,"error":"فشل التجميع"}), 500
    method = "xtts_v2" if (vm=="xtts" and tts_engine and gpt_cond is not None) else "gtts"
    return jsonify({
        "success":   True,
        "audio_url": f"{request.host_url}api/file/{Path(out).name}",
        "method":    method,
        "synced":    synced,
        "time_sec":  round(time.time()-t0,1)
    })

@app.route("/api/tts", methods=["POST","OPTIONS"])
def tts():
    if request.method == "OPTIONS": return jsonify({"ok":True})
    data = request.get_json(force=True)
    text = data.get("text","").strip()
    lang = data.get("lang","ar")
    vm   = data.get("voice_mode","gtts")
    if not text: return jsonify({"success":False,"error":"النص فارغ"}), 400
    out = str(OUTPUT_DIR / f"tts_{uuid.uuid4().hex[:8]}.mp3")
    ok  = synth_xtts(text, lang, out) if vm=="xtts" else False
    if not ok: ok = synth_gtts(text, lang, out)
    if not ok: return jsonify({"success":False,"error":"فشل"}), 500
    return jsonify({
        "success":   True,
        "audio_url": f"{request.host_url}api/file/{Path(out).name}"
    })

@app.route("/api/file/<filename>")
def get_file(filename):
    p = OUTPUT_DIR / filename
    if not p.exists(): return jsonify({"error":"غير موجود"}), 404
    return send_file(str(p), mimetype="audio/mpeg")

# ── تشغيل ────────────────────────────────────────────────────
load_xtts()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=7860)
