# server.py — sl-Dubbing Backend (Final)
import os, uuid, time, logging, subprocess, re
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, ngrok-skip-browser-warning, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

AUDIO_DIR = Path('/tmp/sl_audio')
VOICE_DIR = Path('/tmp/sl_voices')
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
VOICE_DIR.mkdir(parents=True, exist_ok=True)

# ✅ Cache
VOICE_CACHE = {}
XTTS_MODEL = None

# ═══════════════════════════════════════════
# XTTS Init — يُحمّل مرة واحدة عند البدء
# ═══════════════════════════════════════════
def init_xtts():
    global XTTS_MODEL
    if XTTS_MODEL is not None:
        return True
    try:
        from TTS.api import TTS
        logger.info("⏳ Loading XTTS v2...")
        XTTS_MODEL = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=True)
        logger.info("✅ XTTS ready")
        return True
    except Exception as e:
        logger.error(f"XTTS load error: {e}")
        return False

init_xtts()  # ✅ تحميل عند بدء التشغيل

# ═══════════════════════════════════════════
# Voice Sample Download + Cache
# ═══════════════════════════════════════════
def fetch_voice_sample(voice_url, voice_id):
    if voice_id in VOICE_CACHE and Path(VOICE_CACHE[voice_id]).exists():
        return VOICE_CACHE[voice_id]
    try:
        import urllib.request
        local_path = VOICE_DIR / f"{voice_id}.wav"
        if not local_path.exists():
            logger.info(f"⏳ Downloading voice: {voice_id}")
            tmp = VOICE_DIR / f"{voice_id}.tmp.mp3"
            urllib.request.urlretrieve(voice_url, str(tmp))
            subprocess.run(['ffmpeg', '-y', '-i', str(tmp), '-ar', '22050', '-ac', '1', str(local_path)], capture_output=True, timeout=30)
            tmp.unlink(missing_ok=True)
        if local_path.exists():
            VOICE_CACHE[voice_id] = str(local_path)
            logger.info(f"✅ Voice ready: {voice_id}")
            return str(local_path)
    except Exception as e:
        logger.error(f"Voice download error: {e}")
    return None

# ═══════════════════════════════════════════
# Synthesis
# ═══════════════════════════════════════════
def synthesize_xtts(text, lang, voice_path, output_path):
    global XTTS_MODEL
    try:
        if XTTS_MODEL is None and not init_xtts():
            return None, "xtts_init_failed"
        if not voice_path or not Path(voice_path).exists():
            return None, "voice_not_found"
        XTTS_MODEL.tts_to_file(text=text, speaker_wav=voice_path, language=lang[:2], file_path=output_path)
        if Path(output_path).exists() and Path(output_path).stat().st_size > 0:
            return output_path, "xtts"
        return None, "xtts_empty"
    except Exception as e:
        logger.error(f"XTTS error: {e}")
        return None, f"xtts_error"

def synthesize_gtts(text, lang, output_path):
    try:
        from gtts import gTTS
        gTTS(text=text, lang=lang[:2]).save(output_path)
        if Path(output_path).exists() and Path(output_path).stat().st_size > 0:
            return output_path, "gtts"
        return None, "gtts_empty"
    except Exception as e:
        logger.error(f"gTTS error: {e}")
        return None, "gtts_error"

def synthesize_voice(text, lang, use_xtts=False, voice_url=None, voice_id=None):
    output_path = str(AUDIO_DIR / f"audio_{uuid.uuid4().hex[:8]}.wav")
    # ✅ محاولة XTTS أولاً ثم gTTS كـ fallback
    if use_xtts and voice_url and voice_id:
        voice_path = fetch_voice_sample(voice_url, voice_id)
        if voice_path:
            result, method = synthesize_xtts(text, lang, voice_path, output_path)
            if result:
                return result, method
            logger.warning("XTTS failed → falling back to gTTS")
    return synthesize_gtts(text, lang, output_path)

# ═══════════════════════════════════════════
# SRT Parsing + Assembly
# ═══════════════════════════════════════════
def srt_time(s):
    s = s.replace(",", ".")
    p = s.split(":")
    return int(p[0]) * 3600 + int(p[1]) * 60 + float(p[2])

def parse_srt(content):
    blocks, cur = [], None
    for line in content.split("\n"):
        line = line.strip()
        if not line:
            if cur: blocks.append(cur)
            cur = None
        elif re.match(r"^\d+$", line):
            cur = {"i": int(line), "start": 0, "end": 0, "text": ""}
        elif "-->" in line and cur:
            p = line.split("-->")
            cur["start"] = srt_time(p[0].strip())
            cur["end"] = srt_time(p[1].strip())
        elif cur:
            cur["text"] += line + " "
    if cur: blocks.append(cur)
    return blocks

def assemble_srt(blocks, lang, use_xtts=False, voice_url=None, voice_id=None):
    from pydub import AudioSegment
    if not blocks:
        return None, "no_blocks"

    # ✅ حساب المدة الإجمالية من آخر جملة (ليس empty/0!)
    total_ms = int(blocks[-1]["end"] * 1000) + 2000
    logger.info(f"[ASSEMBLE] {len(blocks)} blocks, total={total_ms/1000:.1f}s")
    timeline = AudioSegment.silent(duration=total_ms)

    for i, b in enumerate(blocks):
        text = b["text"].strip()
        if not text:
            continue
        duration = b["end"] - b["start"]
        res_path, method = synthesize_voice(text, lang, use_xtts, voice_url, voice_id)
        if not res_path or not Path(res_path).exists():
            continue
        try:
            seg = AudioSegment.from_file(res_path)
            # ✅ قص إذا أطول من الفترة الزمنية
            if len(seg) / 1000.0 > duration:
                seg = seg[:int(duration * 1000)]
            # ✅ overlay في الموقع الصحيح
            timeline = timeline.overlay(seg, position=int(b["start"] * 1000))
        except Exception as e:
            logger.error(f"Block {i} error: {e}")

    out = str(AUDIO_DIR / f"dub_{uuid.uuid4().hex[:8]}.mp3")
    timeline.export(out, format="mp3", bitrate="128k")
    logger.info(f"[ASSEMBLE] ✅ Done: {out}")
    return out, "xtts" if use_xtts else "gtts"

# ═══════════════════════════════════════════
# Routes
# ═══════════════════════════════════════════
@app.route('/api/health')
def health():
    return jsonify({
        'status': 'ok',
        'xtts_ready': XTTS_MODEL is not None,
        'engine': 'xtts' if XTTS_MODEL else 'gtts',
        'voice_cache': len(VOICE_CACHE)
    })

@app.route('/api/dub', methods=['POST', 'OPTIONS'])
def dub():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        data = request.get_json(force=True) or {}  # ✅ force=True للقراءة بدون Content-Type header
        text = data.get('text', '').strip()
        lang = data.get('lang', 'ar')
        voice_url = data.get('voice_url', None)
        voice_id = data.get('voice_id', None)
        srt = data.get('srt', '')

        if not text and not srt:
            return jsonify({'error': 'empty text'}), 400

        use_xtts = bool(voice_url and voice_id)
        logger.info(f"🎬 DUB: lang={lang} voice={voice_id} xtts={use_xtts}")
        t0 = time.time()

        if srt.strip():
            blocks = parse_srt(srt)
            out, method = assemble_srt(blocks, lang, use_xtts, voice_url, voice_id)
            synced = True
        else:
            out, method = synthesize_voice(text, lang, use_xtts, voice_url, voice_id)
            synced = False

        if not out or not Path(out).exists():
            return jsonify({'success': False, 'error': 'generation_failed'}), 500

        audio_url = f"https://{request.host}/api/file/{Path(out).name}"
        logger.info(f"✅ DUB done: {method} in {time.time()-t0:.1f}s")

        return jsonify({
            'success': True, 'audio_url': audio_url, 'method': method,
            'voice_id': voice_id, 'synced': synced,
            'time_sec': round(time.time() - t0, 1)
        })
    except Exception as e:
        logger.error(f"DUB error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/tts', methods=['POST', 'OPTIONS'])
def tts():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    try:
        data = request.get_json(force=True) or {}
        text = data.get('text', '').strip()
        lang = data.get('lang', 'ar')
        voice_url = data.get('voice_url', None)
        voice_id = data.get('voice_id', None)
        if not text:
            return jsonify({'error': 'empty'}), 400
        use_xtts = bool(voice_url and voice_id)
        out, method = synthesize_voice(text, lang, use_xtts, voice_url, voice_id)
        if not out or not Path(out).exists():
            return jsonify({'success': False, 'error': 'generation_failed'}), 500
        audio_url = f"https://{request.host}/api/file/{Path(out).name}"
        return jsonify({'success': True, 'audio_url': audio_url, 'method': method, 'voice_id': voice_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/file/<filename>')
def get_file(filename):
    p = AUDIO_DIR / filename
    if not p.exists():
        return jsonify({'error': 'not found'}), 404
    mime = 'audio/wav' if str(p).endswith('.wav') else 'audio/mpeg'
    return send_file(str(p), mimetype=mime, as_attachment=False)

@app.route('/api/preload_voice', methods=['POST', 'OPTIONS'])
def preload_voice():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    data = request.get_json(force=True)
    vid = data.get('voice_id', '')
    vurl = data.get('voice_url', '')
    if vid and vurl:
        path = fetch_voice_sample(vurl, vid)
        if path:
            return jsonify({'success': True, 'path': path})
    return jsonify({'success': False}), 404

if __name__ == '__main__':
    logger.info("🚀 Server starting on :5000")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
