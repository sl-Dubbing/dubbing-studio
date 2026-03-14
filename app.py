# =============================================================
# xtts_server — خادم XTTS v2 مخصص
# HF Space منفصل — يستقبل نص + عينة ويولّد WAV
# =============================================================
import os, uuid, logging, threading, time, requests, hashlib
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins=["*"])
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

TMP       = Path('/tmp')
AUDIO_DIR = TMP / 'xtts_out'
VOICE_DIR = TMP / 'xtts_voices'
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
VOICE_DIR.mkdir(parents=True, exist_ok=True)

# ── Cloudinary ────────────────────────────────────────────────
CLOUD_NAME    = os.environ.get('CLOUDINARY_CLOUD_NAME', 'dxbmvzsiz')
API_SECRET    = os.environ.get('CLOUDINARY_API_SECRET', 'BrFvzlPFXBJZ-B-cZyxCc-0wHRo')
DEFAULT_VOICE = os.environ.get('DEFAULT_VOICE_ID', '5_gtygjb')
FOLDER        = "sl_voices"

def fetch_voice() -> str | None:
    """تحميل العينة من Cloudinary مع cache محلي"""
    local = VOICE_DIR / f"{DEFAULT_VOICE}.wav"
    if local.exists() and local.stat().st_size > 5000:
        return str(local)
    # جرب WAV أولاً
    for url in [
        f"https://res.cloudinary.com/{CLOUD_NAME}/raw/upload/{FOLDER}/{DEFAULT_VOICE}",
        f"https://res.cloudinary.com/{CLOUD_NAME}/video/upload/v1773450710/{DEFAULT_VOICE}.mp3",
    ]:
        try:
            r = requests.get(url, timeout=30)
            if r.status_code == 200:
                ext = '.wav' if 'raw' in url else '.mp3'
                tmp = VOICE_DIR / f"{DEFAULT_VOICE}{ext}"
                tmp.write_bytes(r.content)
                if ext == '.mp3':
                    import subprocess
                    subprocess.run(['ffmpeg','-y','-i',str(tmp),
                                    '-ar','22050','-ac','1',str(local)],
                                   capture_output=True, timeout=30)
                    tmp.unlink(missing_ok=True)
                else:
                    tmp.rename(local)
                if local.exists():
                    logger.info(f"✅ Voice ready: {local.stat().st_size/1024:.1f}KB")
                    return str(local)
        except Exception as e:
            logger.warning(f"fetch attempt failed: {e}")
    return None

# ── XTTS v2 ───────────────────────────────────────────────────
_TTS   = None
_READY = False
_LOCK  = threading.Lock()

XTTS_LANGS = {
    'ar':'ar','en':'en','es':'es','fr':'fr','de':'de',
    'it':'it','ru':'ru','tr':'tr','zh':'zh-cn','hi':'hi','nl':'nl'
}

def _load():
    global _TTS, _READY
    try:
        os.environ['COQUI_TOS_AGREED'] = '1'
        from TTS.api import TTS
        logger.info("⏳ Loading XTTS v2...")
        _TTS   = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        _READY = True
        logger.info("✅ XTTS v2 ready!")
        # حمّل العينة فوراً بعد جاهزية النموذج
        fetch_voice()
    except Exception as e:
        logger.error(f"❌ XTTS load: {e}")

threading.Thread(target=_load, daemon=True).start()

def _split(text, max_chars=300):
    if len(text) <= max_chars:
        return [text]
    chunks, cur = [], ""
    for s in text.replace('،','.').replace('؟','.').split('.'):
        s = s.strip()
        if not s: continue
        if len(cur)+len(s) < max_chars: cur += s+'. '
        else:
            if cur: chunks.append(cur.strip())
            cur = s+'. '
    if cur: chunks.append(cur.strip())
    return chunks or [text]

def _merge_wav(files, output):
    import wave
    params, data = None, []
    for f in files:
        with wave.open(str(f),'rb') as w:
            if not params: params = w.getparams()
            data.append(w.readframes(w.getnframes()))
    with wave.open(output,'wb') as out:
        out.setparams(params)
        for d in data: out.writeframes(d)

# ══════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════

@app.route('/')
@app.route('/health')
def health():
    voice = fetch_voice() if _READY else None
    return jsonify({
        'status':      'ok',
        'xtts_ready':  _READY,
        'voice_ready': voice is not None,
        'service':     'XTTS v2 Server'
    })

@app.route('/synthesize', methods=['POST'])
def synthesize():
    """
    POST JSON:
      { "text": "...", "lang": "ar" }
    Returns: WAV audio file
    """
    try:
        if not _READY:
            return jsonify({'error': 'XTTS لم يكتمل تحميله بعد، انتظر قليلاً'}), 503

        d    = request.get_json() or {}
        text = d.get('text','').strip()
        lang = d.get('lang','ar')

        if not text:
            return jsonify({'error': 'النص فارغ'}), 400

        xl = XTTS_LANGS.get(lang)
        if not xl:
            return jsonify({'error': f'اللغة {lang} غير مدعومة في XTTS'}), 400

        voice = fetch_voice()
        if not voice:
            return jsonify({'error': 'العينة الصوتية غير متاحة'}), 503

        out = str(AUDIO_DIR / f"xtts_{uuid.uuid4()}.wav")

        with _LOCK:
            chunks = _split(text)
            if len(chunks) == 1:
                _TTS.tts_to_file(text=text, speaker_wav=voice,
                                 language=xl, file_path=out)
            else:
                parts = []
                for chunk in chunks:
                    p = str(AUDIO_DIR / f"c_{uuid.uuid4()}.wav")
                    _TTS.tts_to_file(text=chunk, speaker_wav=voice,
                                     language=xl, file_path=p)
                    parts.append(p)
                _merge_wav(parts, out)
                for p in parts: Path(p).unlink(missing_ok=True)

        logger.info(f"✅ Synthesized: {out}")
        return send_file(out, mimetype='audio/wav',
                        as_attachment=True, download_name='dubbed.wav')

    except Exception as e:
        logger.error(f"synthesize: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)
