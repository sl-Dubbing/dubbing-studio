# ---------------------------------------------------------------
# voice_engine.py — محرك الصوت الاحترافي
# يُستدعى من الـ backend (server.py) لتوليد صوت بنبرة ABDU SELAM
# ---------------------------------------------------------------

import os, uuid, logging
from pathlib import Path

# -----------------------------------------------------------------
# إعدادات Logging
# -----------------------------------------------------------------
logger = logging.getLogger(__name__)
if not logger.handlers:
    # في حال تم استيراد الملف من سكريبت آخر قد تكون الإعدادات مُعرَّفة مسبقًا
    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s - %(levelname)s - %(message)s')

# -----------------------------------------------------------------
# مسارات مؤقتة
# -----------------------------------------------------------------
TMP = Path('/tmp')
TMP.mkdir(parents=True, exist_ok=True)

# -----------------------------------------------------------------
# خريطة اللغات ── XTTS & gTTS
# -----------------------------------------------------------------
XTTS_LANGS = {
    'ar': 'ar', 'en': 'en', 'es': 'es', 'fr': 'fr', 'de': 'de',
    'it': 'it', 'ru': 'ru', 'tr': 'tr',
    'zh': 'zh-cn', 'hi': 'hi', 'nl': 'nl'
}
GTTS_LANGS = {
    'ar': 'ar', 'en': 'en', 'es': 'es', 'fr': 'fr',
    'de': 'de', 'it': 'it', 'ru': 'ru', 'tr': 'tr',
    'zh': 'zh', 'hi': 'hi', 'fa': 'fa',
    'sv': 'sv', 'nl': 'nl'
}

# -----------------------------------------------------------------
# استيراد الأدوات المساعدة من utils.py
# -----------------------------------------------------------------
from utils import (
    fetch_voice_sample,        # تحميل (أو إرجاع) عينة صوتية مخزَّنة على Cloudinary
    mp3_to_wav,               # تحويل mp3 → wav باستخدام ffmpeg
)

# -----------------------------------------------------------------
# تحميل نموذج XTTS (يُحمل مرة واحدة فقط)
# -----------------------------------------------------------------
_TTS_ENGINE = None

def _load_xtts():
    """تحميل نموذج XTTS v2 في الذاكرة (مجرد مرة واحدة)."""
    global _TTS_ENGINE
    if _TTS_ENGINE is not None:
        return _TTS_ENGINE

    try:
        from TTS.api import TTS
        logger.info("⏳ Loading XTTS v2 model…")
        _TTS_ENGINE = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
        logger.info("✅ XTTS v2 loaded")
        return _TTS_ENGINE
    except Exception as exc:
        logger.error(f"❌ Failed to load XTTS model: {exc}")
        return None


# -----------------------------------------------------------------
# توليد الصوت بـ XTTS
# -----------------------------------------------------------------
def _synthesize_xtts(text: str, lang: str, voice_path: str, out_path: str) -> bool:
    """
    توليد ملف صوتي باستخدام XTTS مع عينة صوت `voice_path`.
    يُعيد True عند النجاح.
    """
    tts = _load_xtts()
    if not tts:
        return False

    xtts_lang = XTTS_LANGS.get(lang)
    if not xtts_lang:
        logger.warning(f"XTTS does not support language '{lang}'")
        return False

    try:
        tts.tts_to_file(
            text=text,
            speaker_wav=voice_path,
            language=xtts_lang,
            file_path=out_path,
        )
        logger.info(f"✅ XTTS generated → {out_path}")
        return True
    except Exception as exc:
        logger.error(f"❌ XTTS generation error: {exc}")
        return False


# -----------------------------------------------------------------
# توليد الصوت بـ gTTS (fallback)
# -----------------------------------------------------------------
def _synthesize_gtts(text: str, lang: str, out_path: str) -> bool:
    """
    توليد ملف صوتي بصوت افتراضي عبر gTTS.
    يُعيد True إذا نجح.
    """
    try:
        from gtts import gTTS
        gtts_lang = GTTS_LANGS.get(lang, 'en')
        gTTS(text=text, lang=gtts_lang, slow=False).save(out_path)
        logger.info(f"✅ gTTS generated → {out_path}")
        return True
    except Exception as exc:
        logger.error(f"❌ gTTS error: {exc}")
        return False


# -----------------------------------------------------------------
# الدالة العامة `synthesize`
# -----------------------------------------------------------------
def synthesize(text: str, lang: str, use_custom_voice: bool = False) -> tuple:
    """
    توليد ملف صوت (WAV أو MP3) من النص.

    المعاملات
    ----------
    text               : النص المراد تحويله.
    lang               : رمز اللغة (ar, en, …).
    use_custom_voice   : إذا كان True ستُستعمل عينة صوت ABDU SELAM
                         المخزَّنة على Cloudinary؛ وإلا يُستعمل gTTS
                         (الصوت الافتراضي).

    تُعيد
    -----
    (file_path, method)   – حيث `method` إما "xtts_v2" أو "gtts"
    أو (None, None) إذا فشل التوليد.
    """
    # مسارات مؤقتة فريدة
    out_wav = TMP / f"out_{uuid.uuid4()}.wav"
    out_mp3 = TMP / f"out_{uuid.uuid4()}.mp3"

    # 1️⃣  إذا طلبنا صوت مخصَّص (XTTS)
    if use_custom_voice:
        voice_path = fetch_voice_sample()          # يحمّل العينة من Cloudinary (أو يستخدم cached)
        if voice_path:
            if _synthesize_xtts(text, lang, voice_path, str(out_wav)):
                return str(out_wav), 'xtts_v2'
            logger.warning("XTTS generation failed → fallback إلى gTTS")
        else:
            logger.warning("Voice sample غير متوفرة → fallback إلى gTTS")

    # 2️⃣  fallback إلى gTTS (صوت افتراضي)
    if _synthesize_gtts(text, lang, str(out_mp3)):
        # نُحوِّل MP3 إلى WAV لتوحيد الصيغة (يستقبل باقي الـ API WAV)
        if mp3_to_wav(out_mp3, out_wav):
            return str(out_wav), 'gtts'
        # إذا فشل التحويل نستمر بـ MP3 (قد يتم إرساله للعميل مباشرة)
        return str(out_mp3), 'gtts'

    # لا شيء نجح
    return None, None


# -----------------------------------------------------------------
# تشغيل اختبار سريع عند استدعاء الملف مباشرة
# -----------------------------------------------------------------
if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    print("\n🧪 اختبار voice_engine →")

    # اختبار gTTS (بدون عينة مخصَّسة)
    path, method = synthesize(
        text="مرحباً بكم في sl‑Dubbing",
        lang="ar",
        use_custom_voice=False,
    )
    print(f"gTTS   → method: {method}, file: {path}")

    # اختبار XTTS (يحتاج اتصال بـ Cloudinary وعينة صوتية)
    path, method = synthesize(
        text="Hello from sl‑Dubbing",
        lang="en",
        use_custom_voice=True,
    )
    print(f"XTTS   → method: {method}, file: {path}")

    print("\n✅ الاختبار انتهى")
