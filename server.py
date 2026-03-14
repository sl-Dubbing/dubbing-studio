# server.py
# ==========================================================
# sl‑Dubbing & Translation – Backend (Render / HF Spaces)
# يدعم:
#   • تسجيل/دخول مستخدمين (SQLite)
#   • رفع عينة صوت (Cloudinary) وربطها بالحساب
#   • دبلجة نصوص باستخدام XTTS أو gTTS
#   • تحميل الملفات الصوتية
#   • حدود للضيوف (6 طلبات/يوم)
# ==========================================================
import os, uuid, time, logging, subprocess
from pathlib import Path
from datetime import datetime
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# -----------------------------------------------------------------
# استيراد الأدوات المساعدة من utils.py
# -----------------------------------------------------------------
from utils import (
    upload_to_cloudinary,
    fetch_voice_sample,
    mp3_to_wav,
)

# -----------------------------------------------------------------
# إعداد Logging
# -----------------------------------------------------------------
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# -----------------------------------------------------------------
# Flask & CORS
# -----------------------------------------------------------------
app = Flask(__name__)

ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "https://sl-dubbing.github.io, http://localhost:*"
).split(",")

CORS(app,
     resources={r"/api/*": {"origins": ALLOWED_ORIGINS}},
     supports_credentials=True)

# -----------------------------------------------------------------
# Rate Limiting
# -----------------------------------------------------------------
limiter = Limiter(
    app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
)

# -----------------------------------------------------------------
# قاعدة البيانات (SQLite)
# -----------------------------------------------------------------
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///users.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)


class User(db.Model):
    __tablename__ = 'users'
    id               = db.Column(db.Integer, primary_key=True)
    email            = db.Column(db.String(120), unique=True, nullable=False)
    password         = db.Column(db.String(200), nullable=False)

    # معرف العينة الصوتية المخزَّنة على Cloudinary (public_id)
    voice_public_id  = db.Column(db.String(255), nullable=True)

    usage_tts        = db.Column(db.Integer, default=0)
    usage_dub        = db.Column(db.Integer, default=0)
    usage_srt        = db.Column(db.Integer, default=0)

    unlocked_tts     = db.Column(db.Boolean, default=False)
    unlocked_dub     = db.Column(db.Boolean, default=False)
    unlocked_srt     = db.Column(db.Boolean, default=False)


with app.app_context():
    db.create_all()


# -----------------------------------------------------------------
# إعدادات الملفات المؤقتة
# -----------------------------------------------------------------
AUDIO_DIR = Path('/tmp/sl_audio')
VOICE_DIR = Path('/tmp/sl_voices')
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
VOICE_DIR.mkdir(parents=True, exist_ok=True)

# -----------------------------------------------------------------
# حد الضيوف (6 طلبات/يوم)
# -----------------------------------------------------------------
GUEST_LIMIT = 6
GUEST_USAGE = {}

def reset_guest(ip: str):
    """إعادة ضبط عداد الضيف كل 24 ساعة."""
    now = time.time()
    usage = GUEST_USAGE.get(ip)
    if usage is None or now - usage.get('ts', 0) > 86400:
        GUEST_USAGE[ip] = {'tts': 0, 'dub': 0, 'srt': 0, 'ts': now}


# -----------------------------------------------------------------
# معرف العينة الافتراضية (ABDU SELAM) – يُقرأ من المتغيّر البيئي
# -----------------------------------------------------------------
DEFAULT_VOICE_ID = os.getenv('DEFAULT_VOICE_ID', '5_gtygjb')


# -----------------------------------------------------------------
# مساعدة للحصول على مسار عينة صوت للمستخدم (أو الافتراضية)
# -----------------------------------------------------------------
def get_user_voice_path(email: str | None) -> Path | None:
    """
    إذا كان للمستخدم عينة صوتية (voice_public_id) تُحمَّل من Cloudinary.
    وإلا تُعيد عينة الـ DEFAULT_VOICE_ID.
    """
    if email:
        user = User.query.filter_by(email=email.lower()).first()
        if user and user.voice_public_id:
            return fetch_voice_sample(user.voice_public_id)

    # لا توجد عينة مخصَّصة → استعمل العينة الافتراضية
    return fetch_voice_sample()


# -----------------------------------------------------------------
# توليد الصوت (XTTS أو gTTS)
# -----------------------------------------------------------------
def synthesize_xtts(text: str, lang: str, voice_path: str, out_path: str) -> bool:
    """يستخدم الدالة الموجودة في voice_engine عبر استيراد مباشر."""
    # الآن نستدعي الدالة من voice_engine مباشرةً لتوحيد المنطق
    from voice_engine import _synthesize_xtts as _xtts
    return _xtts(text, lang, voice_path, out_path)


def synthesize_gtts(text: str, lang: str, out_path: str) -> bool:
    """يستخدم الدالة الموجودة في voice_engine."""
    from voice_engine import _synthesize_gtts as _gtts
    return _gtts(text, lang, out_path)


# -----------------------------------------------------------------
# Routes
# -----------------------------------------------------------------
@app.route('/')
def root():
    return jsonify({
        'status': 'ok',
        'service': 'sl‑Dubbing Backend',
        'xtts_ready': True,          # في الواقع يتم تحميل النموذج عند الحاجة
        'cloudinary': os.getenv('CLOUDINARY_CLOUD_NAME')
    })


@app.route('/api/health')
def health():
    return jsonify({
        'status': 'ok',
        'xtts_ready': True,
        'cloudinary': os.getenv('CLOUDINARY_CLOUD_NAME')
    })


# -----------------------------------------------------------------
# التسجيل
# -----------------------------------------------------------------
@app.route('/api/register', methods=['POST'])
@limiter.limit("10 per hour")
def register():
    try:
        data = request.get_json() or {}
        email = data.get('email', '').strip().lower()
        pw    = data.get('password', '')

        if not email or '@' not in email:
            return jsonify({'error': 'بريد غير صالح'}), 400
        if not pw:
            return jsonify({'error': 'كلمة المرور فارغة'}), 400

        if User.query.filter_by(email=email).first():
            return jsonify({'error': 'البريد مسجَّل'}), 400

        user = User(email=email, password=generate_password_hash(pw))
        db.session.add(user)
        db.session.commit()
        logger.info(f"✅ New user registered: {email}")

        return jsonify({'success': True, 'email': email}), 201
    except Exception as exc:
        logger.error(f"Register error: {exc}")
        return jsonify({'error': 'خطأ داخلي'}), 500


# -----------------------------------------------------------------
# الدخول
# -----------------------------------------------------------------
@app.route('/api/login', methods=['POST'])
@limiter.limit("15 per hour")
def login():
    try:
        data = request.get_json() or {}
        email = data.get('email', '').strip().lower()
        pw    = data.get('password', '')

        user = User.query.filter_by(email=email).first()
        if not user or not check_password_hash(user.password, pw):
            return jsonify({'error': 'بيانات غير صحيحة'}), 401

        return jsonify({
            'success'   : True,
            'email'     : user.email,
            'has_voice' : bool(user.voice_public_id),
            'usage'     : {
                'tts': user.usage_tts,
                'dub': user.usage_dub,
                'srt': user.usage_srt,
            },
            'unlocked'  : {
                'tts': user.unlocked_tts,
                'dub': user.unlocked_dub,
                'srt': user.unlocked_srt,
            }
        })
    except Exception as exc:
        logger.error(f"Login error: {exc}")
        return jsonify({'error': 'خطأ داخلي'}), 500


# -----------------------------------------------------------------
# رفع عينة صوت (Cloudinary) وربطها بالحساب إذا تم إرسال email
# -----------------------------------------------------------------
@app.route('/api/upload-voice', methods=['POST'])
@limiter.limit("20 per hour")
def upload_voice():
    try:
        email = request.form.get('email', '').strip().lower()
        if 'voice' not in request.files:
            return jsonify({'error': 'لم يتم رفع ملف'}), 400

        file = request.files['voice']
        if not file.filename:
            return jsonify({'error': 'اسم الملف فارغ'}), 400

        ext = Path(file.filename).suffix.lower()
        if ext not in {'.wav', '.mp3', '.ogg', '.m4a'}:
            return jsonify({'error': 'الامتداد غير مدعوم (wav/mp3/ogg/m4a)'}), 400

        # حفظ ملف مؤقتاً
        tmp_path = Path('/tmp') / f"voice_{uuid.uuid4()}{ext}"
        file.save(str(tmp_path))

        # إذا كان غير WAV → تحويله إلى WAV
        wav_path = tmp_path
        if ext != '.wav':
            wav_path = tmp_path.with_suffix('.wav')
            try:
                subprocess.run(
                    ['ffmpeg', '-y', '-i', str(tmp_path), '-ar', '22050', '-ac', '1', str(wav_path)],
                    capture_output=True, timeout=30
                )
                if wav_path.exists():
                    tmp_path.unlink(missing_ok=True)
                else:
                    wav_path = tmp_path   # fallback إلى الملف الأصلي
            except Exception as exc:
                logger.warning(f"ffmpeg conversion error: {exc}")

        # بناء public_id فريد (إذا كان email موجودًا ندمجه مع UUID لتفادي التصادم)
        uid_part = email if email else f"guest_{uuid.uuid4()}"
        public_id = f"{uid_part}_{uuid.uuid4()}"
        url = upload_to_cloudinary(str(wav_path), public_id)
        wav_path.unlink(missing_ok=True)

        if not url:
            return jsonify({'error': 'فشل الرفع إلى Cloudinary'}), 500

        # ربط العينة بالحساب (إن كان موجوداً)
        if email:
            user = User.query.filter_by(email=email).first()
            if user:
                user.voice_public_id = public_id
                db.session.commit()
                logger.info(f"✅ Voice sample linked to user {email}")

        return jsonify({
            'success'   : True,
            'message'   : 'تم حفظ عينة الصوت على Cloudinary ✅',
            'url'       : url,
            'public_id' : public_id,
        })
    except Exception as exc:
        logger.error(f"/api/upload-voice error: {exc}")
        return jsonify({'error': str(exc)}), 500


# -----------------------------------------------------------------
# دبلجة النص (XTTS أو gTTS)
# -----------------------------------------------------------------
@app.route('/api/dub', methods=['POST'])
@limiter.limit("30 per hour")
def dub():
    try:
        data = request.get_json() or {}
        text      = data.get('text', '').strip()
        lang      = data.get('lang', 'ar')
        email     = (data.get('email') or '').strip().lower()
        voice_mode = data.get('voice_mode', 'gtts').lower()   # "gtts" أو "xtts"

        if not text:
            return jsonify({'error': 'النص فارغ'}), 400

        # ---- حدّ الضيوف ----
        ip = request.remote_addr
        reset_guest(ip)
        if GUEST_USAGE[ip].get('dub', 0) >= GUEST_LIMIT:
            return jsonify({'error': 'انتهى الحد المجاني', 'limit_reached': True}), 403
        GUEST_USAGE[ip]['dub'] += 1
        remaining = GUEST_LIMIT - GUEST_USAGE[ip]['dub']

        # ---- اختيار مسار عينة الصوت (إن طلب XTTS) ----
        voice_path = None
        if voice_mode == 'xtts':
            voice_path = get_user_voice_path(email)   # إرجاع Path أو None

        # ---- توليد الصوت ----
        out_path = AUDIO_DIR / f"dub_{uuid.uuid4()}.wav"
        method   = 'gtts'   # افتراض fallback

        if voice_path:
            if synthesize_xtts(text, lang, str(voice_path), str(out_path)):
                method = 'xtts_v2'
            else:
                logger.warning("XTTS generation failed → fallback إلى gTTS")
                voice_path = None   # للـ fallback

        if not voice_path:
            # gTTS ينتج MP3 → نحوله إلى WAV
            tmp_mp3 = AUDIO_DIR / f"dub_{uuid.uuid4()}.mp3"
            if not synthesize_gtts(text, lang, str(tmp_mp3)):
                return jsonify({'error': 'فشل توليد صوت gTTS'}), 500
            if not mp3_to_wav(tmp_mp3, out_path):
                return jsonify({'error': 'فشل تحويل MP3 إلى WAV'}), 500
            method = 'gtts'

        if not out_path.exists():
            return jsonify({'error': 'ملف الصوت غير موجود'}), 500

        filename  = out_path.name
        audio_url = f"{request.host_url.rstrip('/')}/api/download/{filename}"

        logger.info(f"✅ Dub OK – method={method} – remaining={remaining}")
        return jsonify({
            'success'   : True,
            'audio_url' : audio_url,
            'filename'  : filename,
            'method'    : method,
            'remaining' : remaining,
            'lang'      : lang,
        })
    except Exception as exc:
        logger.error(f"/api/dub error: {exc}")
        return jsonify({'error': str(exc)}), 500


# -----------------------------------------------------------------
# تحميل ملف صوتي (wav أو mp3)
# -----------------------------------------------------------------
@app.route('/api/download/<filename>')
def download(filename):
    try:
        safe_name = Path(filename).name          # منع path‑traversal
        fpath = AUDIO_DIR / safe_name
        if not fpath.exists():
            return jsonify({'error': 'الملف غير موجود'}), 404

        mime = 'audio/wav' if safe_name.endswith('.wav') else 'audio/mpeg'
        return send_file(str(fpath), as_attachment=True,
                         download_name=safe_name, mimetype=mime)
    except Exception as exc:
        logger.error(f"Download error: {exc}")
        return jsonify({'error': 'فشل التحميل'}), 500


# -----------------------------------------------------------------
# إرجاع الأسعار (من ملف prices.json)
# -----------------------------------------------------------------
import json as _json
PRICES_FILE = Path(__file__).parent / 'prices.json'

def load_prices():
    try:
        with open(PRICES_FILE, 'r', encoding='utf-8') as f:
            return _json.load(f)
    except Exception as exc:
        logger.error(f"prices.json load error: {exc}")
        return {}

@app.route('/api/prices')
def prices():
    """إرجاع الأسعار – عدّل الأسعار في ملف prices.json فقط."""
    return jsonify({'success': True, 'prices': load_prices()})


# -----------------------------------------------------------------
# معلومات (entitlements) – هل للمستخدم عينة صوتية؟
# -----------------------------------------------------------------
@app.route('/api/entitlements')
def entitlements():
    """
    تُستَخدم من الـ frontend لتحديد ما إذا كان للمستخدم
    عينة صوت مخصَّصة أم لا.
    """
    email = request.args.get('email', '').strip().lower()
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': 'المستخدم غير موجود'}), 404

    return jsonify({
        'success'   : True,
        'has_voice' : bool(user.voice_public_id),
        'voice_id'  : user.voice_public_id,
    })


# -----------------------------------------------------------------
# تنظيف مؤقت قبل كل طلب (حذف ملفات قديمة)
# -----------------------------------------------------------------
@app.before_request
def before_any_request():
    # (وظيفة purge_tmp_folder موجودة في utils.py)
    from utils import purge_tmp_folder
    purge_tmp_folder()


# -----------------------------------------------------------------
# تشغيل التطبيق (للـ development فقط)
# -----------------------------------------------------------------
if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    logger.info(f"🚀 Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
