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

import wave
import re

def srt_to_dub(srt_path: str, lang: str, use_custom_voice: bool = False, silence_wav: str = None) -> str:
    """
    دبلجة ملف SRT مع توقيتاته، وتوليد ملف صوتي متوافق مع زمن الترجمة
    السطر: [رقم]
    زمن البداية --> زمن النهاية
    النص
    """
    def parse_srt(srt_path):
        pattern = re.compile(r"(\d+)\s*\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\s*\n([\s\S]*?)(?=\n\d+\s*\n|\Z)")
        with open(srt_path, 'r', encoding='utf-8') as f:
            content = f.read()
        entries = []
        for match in pattern.finditer(content):
            idx, start, end, text = match.groups()
            entries.append({
                'start': start,
                'end': end,
                'text': text.replace('\n', ' ').strip()
            })
        return entries

    def time_to_ms(t):
        h, m, s = t.split(':')
        s, ms = s.split(',')
        return (int(h)*3600 + int(m)*60 + int(s))*1000 + int(ms)

    entries = parse_srt(srt_path)
    wav_files = []
    for i, entry in enumerate(entries):
        start_ms = time_to_ms(entry['start'])
        end_ms   = time_to_ms(entry['end'])
        duration = end_ms - start_ms
        # توليد الصوت
        wav_path, method = synthesize(entry['text'], lang, use_custom_voice)
        if not wav_path:
            # توليد صمت إذا فشل الصوت
            silence = silence_wav or str(AUDIO_DIR / f'silence_{i}.wav')
            subprocess.run([
                'ffmpeg', '-y', '-f', 'lavfi', '-i', f'anullsrc=r=22050:cl=mono',
                '-t', f'{duration/1000}', silence
            ], capture_output=True)
            wav_files.append(silence)
        else:
            # إذا كان الصوت أقصر من المدة المطلوبة، نضيف صمت
            with wave.open(wav_path, 'rb') as w:
                frames = w.getnframes()
                rate = w.getframerate()
                wav_dur = frames / rate
            if wav_dur < duration/1000:
                silence = silence_wav or str(AUDIO_DIR / f'silence_{i}.wav')
                subprocess.run([
                    'ffmpeg', '-y', '-f', 'lavfi', '-i', f'anullsrc=r=22050:cl=mono',
                    '-t', f'{duration/1000 - wav_dur}', silence
                ], capture_output=True)
                wav_files.append(wav_path)
                wav_files.append(silence)
            else:
                wav_files.append(wav_path)

    # دمج جميع المقاطع
    output = str(AUDIO_DIR / f'dubbed_{uuid.uuid4()}.wav')
    with wave.open(output, 'wb') as out:
        params = None
        for f in wav_files:
            with wave.open(f, 'rb') as w:
                if not params:
                    params = w.getparams()
                    out.setparams(params)
                out.writeframes(w.readframes(w.getnframes()))
    return output

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
