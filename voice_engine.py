# =============================================================
# voice_engine.py — يتصل بـ XTTS Server المنفصل
# إذا فشل → gTTS fallback
# =============================================================
import os, uuid, logging, requests
from pathlib import Path
from utils import fetch_voice_sample

logger = logging.getLogger(__name__)

AUDIO_DIR   = Path('/tmp/sl_audio')
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# رابط خادم XTTS المنفصل
XTTS_SERVER = os.environ.get(
    'XTTS_SERVER_URL',
    'https://abdulselam1996-sl-dubbing-xtts.hf.space'
)

GTTS_LANGS = {
    'ar':'ar','en':'en','es':'es','fr':'fr','de':'de','it':'it',
    'ru':'ru','tr':'tr','zh':'zh-TW','hi':'hi','fa':'fa','sv':'sv','nl':'nl'
}

def _call_xtts(text: str, lang: str) -> str | None:
    """يرسل النص للخادم الثاني ويستقبل WAV"""
    try:
        url = f"{XTTS_SERVER.rstrip('/')}/synthesize"
        logger.info(f"📡 Calling XTTS server: {url}")
        res = requests.post(url,
            json={'text': text, 'lang': lang},
            timeout=120
        )
        if res.status_code == 200:
            out = str(AUDIO_DIR / f"xtts_{uuid.uuid4()}.wav")
            with open(out, 'wb') as f:
                f.write(res.content)
            logger.info(f"✅ XTTS server response saved: {out}")
            return out
        elif res.status_code == 503:
            logger.warning("⏳ XTTS server لم يكتمل تحميله بعد")
        else:
            logger.error(f"❌ XTTS server: {res.status_code} {res.text[:200]}")
    except requests.Timeout:
        logger.error("❌ XTTS server timeout (120s)")
    except Exception as e:
        logger.error(f"❌ XTTS call error: {e}")
    return None

def _gtts(text: str, lang: str, out: str) -> bool:
    try:
        from gtts import gTTS
        gTTS(text=text, lang=GTTS_LANGS.get(lang,'en'), slow=False).save(out)
        logger.info(f"✅ gTTS OK")
        return True
    except Exception as e:
        logger.error(f"❌ gTTS: {e}")
        return False

def synthesize(text: str, lang: str, use_custom_voice: bool = False) -> tuple:
    """
    use_custom_voice=True  → XTTS Server (نبرة ABDU SELAM)
    use_custom_voice=False → gTTS افتراضي
    """
    if use_custom_voice:
        path = _call_xtts(text, lang)
        if path:
            return path, 'xtts_v2'
        logger.warning("XTTS server فشل → gTTS fallback")

    out = str(AUDIO_DIR / f"gtts_{uuid.uuid4()}.mp3")
    if _gtts(text, lang, out):
        return out, 'gtts'

    return None, None

def get_status() -> dict:
    try:
        r = requests.get(f"{XTTS_SERVER}/health", timeout=5)
        d = r.json()
        return {
            'xtts_ready':   d.get('xtts_ready', False),
            'voice_ready':  d.get('voice_ready', False),
            'xtts_server':  XTTS_SERVER
        }
    except:
        return {'xtts_ready': False, 'xtts_server': XTTS_SERVER}
