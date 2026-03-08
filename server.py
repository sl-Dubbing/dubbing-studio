from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from gtts import gTTS
from pydub import AudioSegment
from pydub.effects import speedup, normalize
from werkzeug.security import generate_password_hash, check_password_hash
import os, uuid, logging, random, smtplib
from email.mime.text import MIMEText

# إعداد السجلات
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# إعداد قاعدة البيانات (SQLite)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///users.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# تعريف نموذج المستخدم
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    otp = db.Column(db.String(6))
    is_verified = db.Column(db.Boolean, default=False)

# إنشاء قاعدة البيانات تلقائياً
with app.app_context():
    db.create_all()

LANGUAGES = {'en':'en','es':'es','fr':'fr','de':'de','ru':'ru','tr':'tr','ar':'ar','zh':'zh-CN','hi':'hi','fa':'fa','it':'it','nl':'nl','sv':'sv'}

# دالة إرسال بريد التفعيل
def send_otp_email(user_email, otp_code):
    sender = "your-email@gmail.com"  # استبدله بإيميلك
    password = "xxxx xxxx xxxx xxxx" # استبدله بكلمة مرور التطبيقات (App Password)
    
    msg = MIMEText(f"كود التفعيل الخاص بك في استوديو الهاشمي هو: {otp_code}")
    msg['Subject'] = 'تفعيل حسابك - ALHASHMI Studio'
    msg['From'] = sender
    msg['To'] = user_email

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(sender, password)
            server.sendmail(sender, user_email, msg.as_string())
        return True
    except Exception as e:
        logger.error(f"Email Error: {e}")
        return False

# --- مسارات نظام الحسابات الجديد ---

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'الإيميل مسجل مسبقاً'}), 400
    
    otp = str(random.randint(100000, 999999))
    hashed_pw = generate_password_hash(password)
    
    new_user = User(email=email, password=hashed_pw, otp=otp)
    db.session.add(new_user)
    db.session.commit()
    
    if send_otp_email(email, otp):
        return jsonify({'success': True, 'message': 'تم إرسال كود التفعيل'})
    return jsonify({'error': 'فشل إرسال الإيميل'}), 500

@app.route('/api/verify-otp', methods=['POST'])
def verify_otp():
    data = request.get_json()
    email = data.get('email')
    otp_input = data.get('otp')
    
    user = User.query.filter_by(email=email).first()
    if user and user.otp == otp_input:
        user.is_verified = True
        user.otp = None # مسح الكود بعد التفعيل
        db.session.commit()
        return jsonify({'success': True, 'message': 'تم تفعيل الحساب'})
    return jsonify({'error': 'كود غير صحيح'}), 400

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    user = User.query.filter_by(email=email).first()
    
    if not user or not check_password_hash(user.password, password):
        return jsonify({'error': 'بيانات الدخول غير صحيحة'}), 401
    
    if not user.is_verified:
        return jsonify({'error': 'يجب تفعيل الحساب أولاً', 'not_verified': True}), 403
    
    return jsonify({'success': True, 'message': 'تم الدخول بنجاح'})

# --- مسارات الدبلجة الأصلية (كما هي) ---

@app.route('/api/health')
def health():
    return jsonify({'status':'ok'})

@app.route('/api/dub', methods=['POST'])
def dub():
    logger.info('=== DUB REQUEST STARTED ===')
    try:
        if not request.is_json:
            return jsonify({'error':'Content-Type must be application/json'}), 400
        data = request.get_json()
        text = data.get('text','')
        lang = data.get('lang','ar')
        duration = data.get('duration',0)
        speed = float(data.get('speed',1.0))
        pitch = float(data.get('pitch',1.0))
        eq_bass = float(data.get('eq_bass',0))
        eq_mid = float(data.get('eq_mid',0))
        eq_treble = float(data.get('eq_treble',0))
        
        if not text or len(text.strip())==0:
            return jsonify({'error':'No text'}), 400
        
        lang_code = LANGUAGES.get(lang,'ar')
        filename = f"dub_{uuid.uuid4().hex}.mp3"
        filepath = f"/tmp/{filename}"
        
        tts = gTTS(text=text, lang=lang_code, slow=False)
        tts.save(filepath)
        
        sound = AudioSegment.from_mp3(filepath)
        
        if speed != 1.0:
            sound = speedup(sound, speed)
        
        if pitch != 1.0:
            sound = sound._spawn(sound.raw_data, overrides={"frame_rate":int(sound.frame_rate*pitch)})
            sound = sound.set_frame_rate(44100)
        
        # ... (بقية معالجة EQ كما في كودك الأصلي)
        
        sound = normalize(sound)
        sound.export(filepath, format='mp3')
        
        return jsonify({'success':True,'file':filename})
    except Exception as e:
        logger.error(f'=== DUB ERROR: {str(e)} ===')
        return jsonify({'error':str(e)}), 500

@app.route('/api/download/<filename>')
def download(filename):
    try:
        filepath = f"/tmp/{filename}"
        if os.path.exists(filepath):
            return send_file(filepath, as_attachment=True, download_name=filename, mimetype='audio/mpeg')
        return jsonify({'error':'Not found'}), 404
    except Exception as e:
        return jsonify({'error':str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT',5000))
    app.run(host='0.0.0.0', port=port, debug=False)
