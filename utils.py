# utils.py
# ==========================================================
# أدوات مساعدة للـ backend:
#   • رفع / تحميل عينات صوتية من Cloudinary
#   • تحويل MP3 → WAV (ffmpeg)
#   • حذف ملفات مؤقّتة قديمة
# ==========================================================
import os, logging, uuid, requests, subprocess, time
from pathlib import Path
import cloudinary
import cloudinary.uploader
import cloudinary.api

logger = logging.getLogger(__name__)

# ---------------------- Cloudinary config ----------------------
CLOUD_NAME = os.getenv('CLOUDINARY_CLOUD_NAME')
API_KEY    = os.getenv('CLOUDINARY_API_KEY')
API_SECRET = os.getenv('CLOUDINARY_API_SECRET')
FOLDER     = os.getenv('CLOUDINARY_FOLDER', 'sl_voices')

if not all([CLOUD_NAME, API_KEY, API_SECRET]):
    raise RuntimeError('❌ Cloudinary credentials missing – set them in the environment.')

cloudinary.config(
    cloud_name = CLOUD_NAME,
    api_key    = API_KEY,
    api_secret = API_SECRET,
    secure     = True,
    timeout    = 30,
)

# ---------------------- Upload to Cloudinary ------------------
def upload_to_cloudinary(local_path: str, public_id: str) -> str | None:
    """
    رفع ملف RAW (WAV/MP3/…) إلى Cloudinary.
    يُعيد secure_url إذا نجح، وإلا None.
    """
    try:
        result = cloudinary.uploader.upload(
            local_path,
            public_id   = public_id,
            folder      = FOLDER,
            resource_type = "raw",
            overwrite   = True,
            tags        = ["voice_sample"]
        )
        logger.info(f"✅ Cloudinary upload: {public_id} → {result.get('secure_url')}")
        return result.get('secure_url')
    except Exception as exc:
        logger.error(f"❌ Cloudinary upload error ({public_id}): {exc}")
        return None


# ---------------------- Download (cache) ----------------------
TMP_DIR = Path('/tmp')
TMP_DIR.mkdir(parents=True, exist_ok=True)

def fetch_voice_sample(public_id: str | None = None) -> Path | None:
    """
    تحميل عينة صوت من Cloudinary إلى /tmp (مع caching).
    إذا لم يُعطى public_id يُستعمل المتغيّر البيئي DEFAULT_VOICE_ID.
    """
    from server import DEFAULT_VOICE_ID          # تعريفه في server.py
    vid = public_id or DEFAULT_VOICE_ID
    local_path = TMP_DIR / f"voice_{vid}.wav"

    # إذا كان موجوداً محلياً (أكبر من 5 KB) نعيده فوراً
    if local_path.exists() and local_path.stat().st_size > 5_000:
        logger.info(f"✅ Using cached voice sample: {local_path}")
        return local_path

    # بناء URL للملف (raw)
    url, _ = cloudinary.utils.cloudinary_url(
        f"{FOLDER}/{vid}",
        resource_type = "raw",
        sign_url = False
    )
    logger.info(f"⬇️ Downloading voice sample from Cloudinary: {url}")

    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        with open(local_path, "wb") as f:
            f.write(r.content)
        logger.info(f"✅ Voice sample saved locally: {local_path}")
        return local_path
    except Exception as exc:
        logger.error(f"❌ Failed to download voice sample ({vid}): {exc}")
        return None


# ---------------------- MP3 → WAV (ffmpeg) --------------------
def mp3_to_wav(mp3_path: Path, wav_path: Path) -> bool:
    """
    تحويل ملف MP3 إلى WAV (22 kHz, mono) باستخدام ffmpeg.
    يُعيد True إذا نجح التحويل.
    """
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(mp3_path), "-ar", "22050", "-ac", "1", str(wav_path)],
            capture_output=True, timeout=30
        )
        if wav_path.exists():
            mp3_path.unlink(missing_ok=True)
            return True
    except Exception as exc:
        logger.error(f"ffmpeg conversion error: {exc}")
    return False


# ---------------------- تنظيف /tmp ---------------------------
def purge_tmp_folder(older_than_seconds: int = 7_200):
    """يمسح جميع الملفات داخل /tmp التي مضى عليها أكثر من `older_than_seconds`."""
    now = time.time()
    for p in TMP_DIR.iterdir():
        if p.is_file() and (now - p.stat().st_mtime) > older_than_seconds:
            try:
                p.unlink()
                logger.debug(f"🗑️ Purged temp file: {p}")
            except Exception:
                pass
