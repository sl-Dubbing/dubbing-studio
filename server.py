# server.py
# ==============================================================
# sl‑Dubbing & Translation – Backend (Render / HF Spaces / Colab)
# ==============================================================

import os, uuid, time, logging, subprocess, json
from pathlib import Path
from datetime import datetime
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# -----------------------------------------------------------------
# Logging
# -----------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

# -----------------------------------------------------------------
# Flask & CORS
# -----------------------------------------------------------------
app = Flask(__name__)

ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "https://sl-dubbing.github.io,http://localhost:*,https://*.ngrok-free.app"
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
    voice_public_id  = db.Column(db.String(255), nullable=True)
    voice_url        = db.Column(db.String(500), nullable=True)
    usage_tts        = db.Column(db.Integer, default=0)
    usage_dub        = db.Column(db.Integer, default=0)
    usage_srt        = db.Column(db.Integer, default=0)
    unlocked_tts     = db.Column(db.Boolean, default=False)
    unlocked_dub     = db.Column(db.Boolean, default=False)
    unlocked_srt     = db.Column(db.Boolean, default=False)


with app.app_context():
    db.create_all()


# -----------------------------------------------------------------
# إعدادات ملفات الصوت المؤقتة
# -----------------------------------------------------------------
AUDIO_DIR = Path('/tmp/sl_audio')
VOICE_DIR = Path('/tmp/sl_voices')
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
VOICE_DIR.mkdir(parents=True, exist_ok=True)

# -----------------------------------------------------------------
# حدّ الضيوف (6 طلبات/يوم)
# -----------------------------------------------------------------
GUEST_LIMIT = 6
GUEST_USAGE = {}

def reset_guest(ip: str):
    now = time.time()
    usage = GUEST_USAGE.get(ip)
    if usage is None or now - usage.get('ts', 0) > 86400:
        GUEST_USAGE[ip] = {'tts': 0, 'dub': 0, 'srt': 0, 'ts': now}


# -----------------------------------------------------------------
# Cloudinary Upload Helper
# -----------------------------------------------------------------
def upload_to_cloudinary(file_path, public_id):
    try:
        import cloudinary
        import cloudinary.uploader
        cloudinary.config(
            cloud_name=os.getenv('CLOUDINARY_CLOUD', 'dxbmvzsiz'),
            api_key=os.getenv('CLOUDINARY_API_KEY', '432687952743126'),
            api_secret=os.getenv('CLOUDINARY_SECRET', 'BrFvzlPFXBJZ-B-cZyxCc-0wHRo')
        )
        result = cloudinary.uploader.upload(
            file_path,
            public_id=public_id,
            resource_type='video',
            overwrite=True
        )
        return result.get('secure_url')
    except Exception as e:
        logger.error(f"Cloudinary upload error: {e}")
        return None


def fetch_voice_sample(voice_url, save_path):
    try:
        import urllib.request
        urllib.request.urlretrieve(voice_url, save_path)
        return True
    except Exception as e:
        logger.error(f"Voice download error: {e}")
        return False


# -----------------------------------------------------------------
# XTTS Voice Synthesis
# -----------------------------------------------------------------
XTTS_MODEL = None

def init_xtts():
    global XTTS_MODEL
    try:
        from TTS.api import TTS
        logger.info("⏳ Loading XTTS model...")
        XTTS_MODEL = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=True)
        logger.info("✅ XTTS model loaded successfully")
        return True
    except Exception as e:
        logger.error(f"XTTS init error: {e}")
        return False


def synthesize_xtts(text, lang, voice_url, output_path):
    """توليد الصوت باستخدام XTTS مع عينة صوت مخصصة"""
    global XTTS_MODEL
    
    try:
        if XTTS_MODEL is None:
            if not init_xtts():
                return False, "xtts_init_failed"
        
        ref_audio = VOICE_DIR / f"ref_{uuid.uuid4().hex[:8]}.wav"
        if not fetch_voice_sample(voice_url, str(ref_audio)):
            return False, "voice_download_failed"
        
        if not ref_audio.suffix == '.wav':
            wav_path = ref_audio.with_suffix('.wav')
            try:
                subprocess.run(
                    ['ffmpeg', '-y', '-i', str(ref_audio), '-ar', '22050', '-ac', '1', str(wav_path)],
                    capture_output=True, timeout=30
                )
                if wav_path.exists():
                    ref_audio.unlink(missing_ok=True)
                    ref_audio = wav_path
            except:
                pass
        
        XTTS_MODEL.tts_to_file(
            text=text,
            speaker_wav=str(ref_audio),
            language=lang[:2],
            file_path=output_path
        )
        
        ref_audio.unlink(missing_ok=True)
        
        if Path(output_path).exists() and Path(output_path).stat().st_size > 0:
            logger.info(f"✅ XTTS synthesis complete: {output_path}")
            return True, "xtts"
        else:
            return False, "xtts_empty_output"
            
    except Exception as e:
        logger.error(f"XTTS synthesis error: {e}")
        return False, f"xtts_error: {str(e)}"


# -----------------------------------------------------------------
# gTTS Voice Synthesis (Fallback)
# -----------------------------------------------------------------
def synthesize_gtts(text, lang, output_path):
    """توليد الصوت باستخدام gTTS"""
    try:
        from gtts import gTTS
        tts = gTTS(text=text, lang=lang[:2])
        tts.save(output_path)
        
        if Path(output_path).exists() and Path(output_path).stat().st_size > 0:
            logger.info(f"✅ gTTS synthesis complete: {output_path}")
            return True, "gtts"
        else:
            return False, "gtts_empty_output"
    except Exception as e:
        logger.error(f"gTTS error: {e}")
        return False, f"gtts_error: {str(e)}"


# -----------------------------------------------------------------
# Voice Synthesis Router
# -----------------------------------------------------------------
def synthesize_voice(text, lang, use_xtts=False, voice_url=None):
    """توجيه التوليد لـ XTTS أو gTTS"""
    output_path = str(AUDIO_DIR / f"audio_{uuid.uuid4().hex[:8]}.wav")
    
    logger.info(f"🎤 synthesize_voice: use_xtts={use_xtts}, voice_url={voice_url}")
    
    if use_xtts and voice_url:
        success, method = synthesize_xtts(text, lang, voice_url, output_path)
        if success:
            return output_path, method
        logger.warning("XTTS failed, falling back to gTTS")
    
    success, method = synthesize_gtts(text, lang, output_path)
    return (output_path, method) if success else (None, method)


# -----------------------------------------------------------------
# SRT Parsing
# -----------------------------------------------------------------
def srt_time(s):
    s = s.replace(",", ".")
    p = s.split(":")
    return int(p[0])*3600 + int(p[1])*60 + float(p[2])


def parse_srt(content):
    blocks, cur = [], None
    for line in content.split("\n"):
        line = line.strip()
        if not line:
            if cur: blocks.append(cur)
            cur = None
        elif line.isdigit():
            cur = {"i": int(line), "start": 0, "end": 0, "text": ""}
        elif "-->" in line and cur:
            p = line.split("-->")
            cur["start"] = srt_time(p[0].strip())
            cur["end"] = srt_time(p[1].strip())
        elif cur:
            cur["text"] += line + " "
    if cur: blocks.append(cur)
    return blocks


def assemble_srt(blocks, lang, use_xtts=False, voice_url=None):
    """دمج مقاطع SRT مع الصوت"""
    from pydub import AudioSegment
    
    timeline = AudioSegment.empty()
    cursor = 0.0
    results = []
    
    for b in blocks:
        text = b["text"].strip()
        if not text:
            continue
        
        tmp = str(AUDIO_DIR / f"seg_{uuid.uuid4().hex[:6]}.wav")
        success, method = synthesize_voice(text, lang, use_xtts, voice_url)
        
        if not success or not Path(tmp).exists():
            logger.warning(f"Segment {b['i']} failed")
            continue
        
        try:
            seg = AudioSegment.from_file(tmp)
            gap = b["start"] - cursor
            if gap > 0:
                timeline += AudioSegment.silent(int(gap * 1000))
            elif gap < 0:
                seg = seg[:int((b["end"] - b["start"]) * 1000)]
            timeline += seg
            cursor = b["start"] + len(seg) / 1000
            results.append(tmp)
        except Exception as e:
            logger.error(f"Assembly error: {e}")
            continue
    
    if not results:
        return None, "no_segments"
    
    out = str(AUDIO_DIR / f"dub_{uuid.uuid4().hex[:8]}.mp3")
    try:
        timeline.export(out, format="mp3", bitrate="128k")
        return out, "xtts" if use_xtts else "gtts"
    except Exception as e:
        logger.error(f"Export error: {e}")
        return None, "export_failed"


# -----------------------------------------------------------------
# Routes
# -----------------------------------------------------------------
@app.route('/')
def root():
    return jsonify({
        'status': 'ok',
        'service': 'sl‑Dubbing Backend',
        'xtts_ready': XTTS_MODEL is not None,
        'cloudinary': os.getenv('CLOUDINARY_CLOUD', 'dxbmvzsiz')
    })


@app.route('/api/health')
def health():
    return jsonify({
        'status': 'ok',
        'xtts_ready': XTTS_MODEL is not None,
        'engine': 'xtts' if XTTS_MODEL else 'gtts',
        'cloudinary': os.getenv('CLOUDINARY_CLOUD', 'dxbmvzsiz')
    })


@app.route('/api/register', methods=['POST'])
@limiter.limit("10 per hour")
def register():
    try:
        data = request.get_json() or {}
        email = data.get('email', '').strip().lower()
        pw = data.get('password', '')
        
        if not email or '@' not in email:
            return jsonify({'error': 'بريد غير صالح'}), 400
        if not pw:
            return jsonify({'error': 'كلمة المرور فارغة'}), 400
        
        if User.query.filter_by(email=email).first():
            return jsonify({'error': 'البريد مسجَّل مسبقاً'}), 400
        
        user = User(email=email, password=generate_password_hash(pw))
        db.session.add(user)
        db.session.commit()
        logger.info(f"✅ New user registered: {email}")
        
        return jsonify({'success': True, 'email': email}), 201
    except Exception as e:
        logger.error(f"Register error: {e}")
        return jsonify({'error': 'خطأ داخلي'}), 500


@app.route('/api/login', methods=['POST'])
@limiter.limit("15 per hour")
def login():
    try:
        data = request.get_json() or {}
        email = data.get('email', '').strip().lower()
        pw = data.get('password', '')
        
        user = User.query.filter_by(email=email).first()
        if not user or not check_password_hash(user.password, pw):
            return jsonify({'error': 'بيانات غير صحيحة'}), 401
        
        return jsonify({
            'success': True,
            'email': user.email,
            'has_voice': bool(user.voice_url),
            'voice_url': user.voice_url,
            'usage': {'tts': user.usage_tts, 'dub': user.usage_dub, 'srt': user.usage_srt},
            'unlocked': {'tts': user.unlocked_tts, 'dub': user.unlocked_dub, 'srt': user.unlocked_srt}
        })
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({'error': 'خطأ داخلي'}), 500


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
            return jsonify({'error': 'امتداد غير مدعوم'}), 400
        
        tmp_path = Path('/tmp') / f"voice_{uuid.uuid4()}{ext}"
        file.save(str(tmp_path))
        
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
                    wav_path = tmp_path
            except:
                pass
        
        public_id = f"{email or 'guest'}_{uuid.uuid4().hex[:8]}"
        url = upload_to_cloudinary(str(wav_path), public_id)
        wav_path.unlink(missing_ok=True)
        
        if not url:
            return jsonify({'error': 'فشل الرفع إلى Cloudinary'}), 500
        
        if email:
            user = User.query.filter_by(email=email).first()
            if user:
                user.voice_public_id = public_id
                user.voice_url = url
                db.session.commit()
                logger.info(f"✅ Voice linked to {email}")
        
        return jsonify({
            'success': True,
            'message': 'تم حفظ عينة الصوت ✅',
            'url': url,
            'public_id': public_id,
        })
    except Exception as e:
        logger.error(f"Upload voice error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/dub', methods=['POST', 'OPTIONS'])
@limiter.limit("30 per hour")
def dub():
    if request.method == 'OPTIONS':
        res = jsonify({'ok': True})
        res.headers['Access-Control-Allow-Origin'] = '*'
        return res, 200
    
    try:
        data = request.get_json() or {}
        text = data.get('text', '').strip()
        lang = data.get('lang', 'ar')
        email = (data.get('email') or '').strip().lower()
        voice_mode = data.get('voice_mode', 'gtts').lower()
        voice_url = data.get('voice_url', None)
        voice_id = data.get('voice_id', None)
        srt = data.get('srt', '')
        
        if not text and not srt:
            return jsonify({'error': 'النص فارغ'}), 400
        
        ip = request.remote_addr
        reset_guest(ip)
        if GUEST_USAGE[ip].get('dub', 0) >= GUEST_LIMIT:
            return jsonify({'error': 'انتهى الحد المجاني', 'limit_reached': True}), 403
        GUEST_USAGE[ip]['dub'] += 1
        
        if not voice_url and email:
            user = User.query.filter_by(email=email).first()
            if user and user.voice_url:
                voice_url = user.voice_url
        
        # ✅ الإصلاح: استخدام voice_url بدلاً من voice_mode
        use_xtts = bool(voice_url)
        
        logger.info("=" * 60)
        logger.info("🎬 [DUB] Received request:")
        logger.info(f"   lang: {lang}")
        logger.info(f"   voice_id: {voice_id}")
        logger.info(f"   voice_url: {voice_url}")
        logger.info(f"   use_xtts: {use_xtts}")
        logger.info(f"   srt blocks: {len(parse_srt(srt)) if srt else 0}")
        logger.info("=" * 60)
        
        t0 = time.time()
        
        if srt.strip():
            blocks = parse_srt(srt)
            out, method = assemble_srt(blocks, lang, use_xtts, voice_url)
            synced = True
        else:
            out, method = synthesize_voice(text, lang, use_xtts, voice_url)
            synced = False
        
        if not out or not Path(out).exists():
            return jsonify({'success': False, 'error': 'فشل التوليد'}), 500
        
        filename = Path(out).name
        audio_url = f"{request.host_url.rstrip('/')}/api/download/{filename}"
        
        logger.info(f"✅ Dub OK – method={method} – time={time.time()-t0:.1f}s")
        
        return jsonify({
            'success': True,
            'audio_url': audio_url,
            'filename': filename,
            'method': method,
            'voice_id': voice_id,
            'voice_url': voice_url,
            'synced': synced,
            'time_sec': round(time.time() - t0, 1),
            'remaining': GUEST_LIMIT - GUEST_USAGE[ip]['dub']
        })
    except Exception as e:
        logger.error(f"Dub error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/tts', methods=['POST', 'OPTIONS'])
@limiter.limit("30 per hour")
def tts():
    if request.method == 'OPTIONS':
        res = jsonify({'ok': True})
        res.headers['Access-Control-Allow-Origin'] = '*'
        return res, 200
    
    try:
        data = request.get_json() or {}
        text = data.get('text', '').strip()
        lang = data.get('lang', 'ar')
        email = (data.get('email') or '').strip().lower()
        voice_mode = data.get('voice_mode', 'gtts').lower()
        voice_url = data.get('voice_url', None)
        voice_id = data.get('voice_id', None)
        
        if not text:
            return jsonify({'error': 'النص فارغ'}), 400
        
        ip = request.remote_addr
        reset_guest(ip)
        if GUEST_USAGE[ip].get('tts', 0) >= GUEST_LIMIT:
            return jsonify({'error': 'انتهى الحد المجاني', 'limit_reached': True}), 403
        GUEST_USAGE[ip]['tts'] += 1
        
        if not voice_url and email:
            user = User.query.filter_by(email=email).first()
            if user and user.voice_url:
                voice_url = user.voice_url
        
        # ✅ الإصلاح: استخدام voice_url بدلاً من voice_mode
        use_xtts = bool(voice_url)
        
        logger.info("=" * 60)
        logger.info("🎤 [TTS] Received request:")
        logger.info(f"   lang: {lang}")
        logger.info(f"   voice_id: {voice_id}")
        logger.info(f"   voice_url: {voice_url}")
        logger.info(f"   use_xtts: {use_xtts}")
        logger.info("=" * 60)
        
        out, method = synthesize_voice(text, lang, use_xtts, voice_url)
        
        if not out or not Path(out).exists():
            return jsonify({'success': False, 'error': 'فشل التوليد'}), 500
        
        filename = Path(out).name
        audio_url = f"{request.host_url.rstrip('/')}/api/download/{filename}"
        
        return jsonify({
            'success': True,
            'audio_url': audio_url,
            'filename': filename,
            'method': method,
            'voice_id': voice_id,
            'remaining': GUEST_LIMIT - GUEST_USAGE[ip]['tts']
        })
    except Exception as e:
        logger.error(f"TTS error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/download/<filename>')
def download(filename):
    try:
        safe_name = Path(filename).name
        fpath = AUDIO_DIR / safe_name
        if not fpath.exists():
            return jsonify({'error': 'الملف غير موجود'}), 404
        
        mime = 'audio/wav' if safe_name.endswith('.wav') else 'audio/mpeg'
        return send_file(str(fpath), as_attachment=True, download_name=safe_name, mimetype=mime)
    except Exception as e:
        logger.error(f"Download error: {e}")
        return jsonify({'error': 'فشل التحميل'}), 500


@app.route('/api/entitlements')
def entitlements():
    email = request.args.get('email', '').strip().lower()
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': 'المستخدم غير موجود'}), 404
    
    return jsonify({
        'success': True,
        'has_voice': bool(user.voice_url),
        'voice_id': user.voice_public_id,
        'voice_url': user.voice_url,
    })


@app.route('/api/preload_voice', methods=['POST', 'OPTIONS'])
def preload_voice():
    if request.method == 'OPTIONS':
        res = jsonify({'ok': True})
        res.headers['Access-Control-Allow-Origin'] = '*'
        return res, 200
    
    data = request.get_json(force=True)
    voice_url = data.get('voice_url', '')
    voice_id = data.get('voice_id', '')
    logger.info(f"📥 preload_voice: {voice_id}")
    
    if voice_url:
        fetch_voice_sample(voice_url, str(VOICE_DIR / f"{voice_id}.mp3"))
    
    return jsonify({'success': True, 'message': 'Voice ready'})


# -----------------------------------------------------------------
# تشغيل التطبيق
# -----------------------------------------------------------------
if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    
    logger.info("⏳ Initializing XTTS model...")
    try:
        init_xtts()
    except Exception as e:
        logger.warning(f"XTTS not available, will use gTTS: {e}")
    
    logger.info(f"🚀 Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
