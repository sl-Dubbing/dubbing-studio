# =============================================================
# voice_engine.py — محرك الصوت
# XTTS v2 يُحمَّل مرة واحدة عند بدء الخادم
# =============================================================
import os, uuid, logging, threading
from pathlib import Path
from utils import fetch_voice_sample

logger = logging.getLogger(__name__)

AUDIO_DIR = Path('/tmp/sl_audio')
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

XTTS_LANGS = {
    'ar':'ar','en':'en','es':'es','fr':'fr','de':'de',
    'it':'it','ru':'ru','tr':'tr','zh':'zh-cn','hi':'hi','nl':'nl'
}
GTTS_LANGS = {
    'ar':'ar','en':'en','es':'es','fr':'fr','de':'de','it':'it',
    'ru':'ru','tr':'tr','zh':'zh-TW','hi':'hi','fa':'fa','sv':'sv','nl':'nl'
}

# ── تحميل XTTS v2 مرة واحدة ──────────────────────────────────
_TTS   = None
_LOCK  = threading.Lock()
_READY = False

def _load_model():
    """يُشغَّل في thread منفصل عند بدء الخادم"""
    global _TTS, _READY
    try:
        os.environ['COQUI_TOS_AGREED'] = '1'
        from TTS.api import TTS
        logger.info("⏳ Loading XTTS v2 model...")
        with _LOCK:
            _TTS = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
            _READY = True
        logger.info("✅ XTTS v2 ready!")
    except Exception as e:
        logger.error(f"❌ XTTS load failed: {e}")
        _READY = False

# ابدأ التحميل في الخلفية فوراً عند استيراد الملف
_thread = threading.Thread(target=_load_model, daemon=True)
_thread.start()

def is_ready() -> bool:
    return _READY and _TTS is not None

# ── تقسيم النص الطويل ────────────────────────────────────────
def _split(text: str, max_chars: int = 300) -> list:
    if len(text) <= max_chars:
        return [text]
    chunks, cur = [], ""
    for s in text.replace('،','.').replace('؟','.').replace('!','.').split('.'):
        s = s.strip()
        if not s: continue
        if len(cur) + len(s) < max_chars:
            cur += s + '. '
        else:
            if cur: chunks.append(cur.strip())
            cur = s + '. '
    if cur: chunks.append(cur.strip())
    return chunks or [text]

# ── دمج WAV ──────────────────────────────────────────────────
def _merge_wav(files: list, output: str):
    import wave
    params, data = None, []
    for f in files:
        try:
            with wave.open(str(f), 'rb') as w:
                if not params: params = w.getparams()
                data.append(w.readframes(w.getnframes()))
        except: pass
    if not params: return
    with wave.open(output, 'wb') as out:
        out.setparams(params)
        for d in data: out.writeframes(d)

# ── XTTS توليد ───────────────────────────────────────────────
def _xtts(text: str, lang: str, voice: str, out: str) -> bool:
    if not is_ready():
        logger.warning("⚠️ XTTS not ready yet")
        return False
    xl = XTTS_LANGS.get(lang)
    if not xl:
        logger.warning(f"XTTS لا يدعم: {lang} → gtts fallback")
        return False
    try:
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
        logger.info(f"✅ XTTS OK → {out}")
        return True
    except Exception as e:
        logger.error(f"❌ XTTS error: {e}")
        return False

# ── gTTS توليد ───────────────────────────────────────────────
def _gtts(text: str, lang: str, out: str) -> bool:
    try:
        from gtts import gTTS
        gTTS(text=text, lang=GTTS_LANGS.get(lang,'en'), slow=False).save(out)
        logger.info(f"✅ gTTS OK → {out}")
        return True
    except Exception as e:
        logger.error(f"❌ gTTS: {e}")
        return False

# ── الدالة الرئيسية ───────────────────────────────────────────
def synthesize(text: str, lang: str, use_custom_voice: bool = False) -> tuple:
    """
    توليد صوت مدبلج
    use_custom_voice=True → XTTS بنبرة ABDU SELAM
    use_custom_voice=False → gTTS افتراضي
    """
    out_wav = str(AUDIO_DIR / f"out_{uuid.uuid4()}.wav")
    out_mp3 = str(AUDIO_DIR / f"out_{uuid.uuid4()}.mp3")

    if use_custom_voice:
        if not is_ready():
            logger.warning("⏳ XTTS لم يكتمل تحميله بعد → gTTS مؤقتاً")
        else:
            voice = fetch_voice_sample()
            if voice:
                if _xtts(text, lang, voice, out_wav):
                    return out_wav, 'xtts_v2'
                logger.warning("XTTS فشل → gTTS fallback")
            else:
                logger.warning("❌ العينة غير متاحة على Cloudinary")

    if _gtts(text, lang, out_mp3):
        return out_mp3, 'gtts'

    return None, None

def get_status() -> dict:
    return {
        'xtts_ready':    _READY,
        'xtts_loading':  _thread.is_alive(),
        'model':         'xtts_v2' if _READY else 'none'
    }
