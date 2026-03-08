# =============================================================
# sl-Dubbing & Translation - Backend
# =============================================================
import os, uuid, logging, random, smtplib, time
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_mail import Mail, Message
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# =============================================================
# إعدادات التطبيق
# =============================================================
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///users.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# إعدادات البريد
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 465
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME', 'your-email@gmail.com')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD', 'your-app-password')
app.config['MAIL_USE_TLS'] = False
app.config['MAIL_USE_SSL'] = True

db = SQLAlchemy(app)
mail = Mail(app)

# =============================================================
# نموذج المستخدم
# =============================================================
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    otp = db.Column(db.String(6))
    otp_expiry = db.Column(db.DateTime)
    is_verified = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # الاستخدام
    usage_tts = db.Column(db.Integer, default=0)
    usage_dub = db.Column(db.Integer, default=0)
    usage_srt = db.Column(db.Integer, default=0)
    
    # الصلاحيات
    unlocked_tts = db.Column(db.Boolean, default=False)
    unlocked_dub = db.Column(db.Boolean, default=False)
    unlocked_srt = db.Column(db.Boolean, default=False)

with app.app_context():
    db.create_all()

# =============================================================
# ثوابت
# =============================================================
GUEST_LIMIT = 6
GUEST_USAGE = {}

# =============================================================
# دوال مساعدة
# =============================================================
def send_otp_email(user_email, otp_code):
    """إرسال كود OTP عبر الإيميل"""
    try:
        msg = Message(
            '🔐 كود تفعيل حسابك - sl-Dubbing',
            sender=app.config['MAIL_USERNAME'],
            recipients=[user_email]
        )
        msg.body = f'''
مرحباً بك في sl-Dubbing!

كود تفعيل حسابك هو: {otp_code}

هذا الكود صالح لمدة 10 دقائق.

إذا لم تقم بإنشاء حساب، يرجى تجاهل هذا البريد.
        '''
        msg.html = f'''
        <html>
        <body style="font-family: Arial; background: #0a0a1a; color: #e0e0ff; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1a0533, #0a0a1a); padding: 30px; border-radius: 20px; border: 2px solid #a78bfa;">
                <h2 style="color: #a78bfa; text-align: center;">🎉 مرحباً بك!</h2>
                <p style="text-align: center; color: #9ca3af;">كود التفعيل:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <span style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #2563eb); color: white; padding: 20px 40px; border-radius: 12px; font-size: 2rem; font-weight: bold; letter-spacing: 5px;">{otp_code}</span>
                </div>
                <p style="text-align: center; color: #6b7280;">صالح لمدة 10 دقائق</p>
            </div>
        </body>
        </html>
        '''
        mail.send(msg)
        logger.info(f"OTP sent to {user_email}")
        return True
    except Exception as e:
        logger.error(f"Email error: {e}")
        return False

def reset_guest_usage_if_needed(ip):
    """إعادة تعيين استخدام الضيف كل 24 ساعة"""
    if ip in GUEST_USAGE:
        last_reset = GUEST_USAGE[ip].get('last_reset', 0)
        if time.time() - last_reset > 86400:
            GUEST_USAGE[ip] = {'tts': 0, 'dub': 0, 'srt': 0, 'last_reset': time.time()}
    else:
        GUEST_USAGE[ip] = {'tts': 0, 'dub': 0, 'srt': 0, 'last_reset': time.time()}

# =============================================================
# المسارات
# =============================================================

@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'timestamp': datetime.utcnow().isoformat()})

@app.route('/api/register', methods=['POST'])
def register():
    """تسجيل مستخدم جديد"""
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    
    if not email or '@' not in email:
        return jsonify({'error': 'بريد غير صحيح'}), 400
    
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'البريد مسجل'}), 400
    
    # إنشاء OTP
    otp = str(random.randint(100000, 999999))
    
    # إنشاء المستخدم
    user = User(
        email=email,
        password=generate_password_hash(password),
        otp=otp,
        otp_expiry=datetime.utcnow() + timedelta(minutes=10)
    )
    db.session.add(user)
    db.session.commit()
    
    # إرسال OTP
    send_otp_email(email, otp)
    
    return jsonify({'success': True, 'message': 'تم التسجيل'})

@app.route('/api/send-otp', methods=['POST'])
def send_otp():
    """إرسال OTP جديد"""
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': 'مستخدم غير موجود'}), 404
    
    # إنشاء OTP جديد
    otp = str(random.randint(100000, 999999))
    user.otp = otp
    user.otp_expiry = datetime.utcnow() + timedelta(minutes=10)
    db.session.commit()
    
    send_otp_email(email, otp)
    
    return jsonify({'success': True})

@app.route('/api/verify-otp', methods=['POST'])
def verify_otp():
    """التحقق من OTP"""
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    otp = data.get('otp', '')
    
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': 'مستخدم غير موجود'}), 404
    
    if user.otp != otp:
        return jsonify({'error': 'كود خاطئ'}), 400
    
    if user.otp_expiry and user.otp_expiry < datetime.utcnow():
        return jsonify({'error': 'الكود منتهي'}), 400
    
    # تفعيل الحساب
    user.is_verified = True
    user.otp = None
    user.otp_expiry = None
    db.session.commit()
    
    return jsonify({'success': True})

@app.route('/api/login', methods=['POST'])
def login():
    """تسجيل الدخول"""
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    
    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password, password):
        return jsonify({'error': 'بيانات خاطئة'}), 401
    
    if not user.is_verified:
        return jsonify({'error': 'الحساب غير مفعل', 'not_verified': True}), 403
    
    return jsonify({
        'success': True,
        'email': user.email,
        'unlocked': {
            'tts': user.unlocked_tts,
            'dub': user.unlocked_dub,
            'srt': user.unlocked_srt
        }
    })

@app.route('/api/entitlements')
def get_entitlements():
    """جلب صلاحيات المستخدم"""
    email = request.args.get('email', '').strip().lower()
    
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({'error': 'مستخدم غير موجود'}), 404
    
    return jsonify({
        'unlocked': {
            'tts': user.unlocked_tts,
            'dub': user.unlocked_dub,
            'srt': user.unlocked_srt
        },
        'usage': {
            'tts': user.usage_tts,
            'dub': user.usage_dub,
            'srt': user.usage_srt
        }
    })

@app.route('/api/dub', methods=['POST'])
def dub():
    """معالجة الدبلجة/النطق"""
    data = request.get_json()
    text = data.get('text', '')
    lang = data.get('lang', 'ar')
    email = data.get('email', '').strip().lower() if data.get('email') else None
    feature = data.get('feature', 'dub')
    
    if feature not in ['tts', 'dub', 'srt']:
        feature = 'dub'
    
    # فحص الحد للضيوف
    if not email:
        ip = request.remote_addr
        reset_guest_usage_if_needed(ip)
        
        if GUEST_USAGE[ip].get(feature, 0) >= GUEST_LIMIT:
            return jsonify({'error': 'انتهى الحد', 'limit_reached': True}), 403
        
        GUEST_USAGE[ip][feature] = GUEST_USAGE[ip].get(feature, 0) + 1
        remaining = GUEST_LIMIT - GUEST_USAGE[ip][feature]
    else:
        user = User.query.filter_by(email=email).first()
        if not user or not user.is_verified:
            return jsonify({'error': 'يجب التفعيل', 'not_verified': True}), 403
        
        unlocked_field = f'unlocked_{feature}'
        usage_field = f'usage_{feature}'
        
        if not getattr(user, unlocked_field, False):
            current_usage = getattr(user, usage_field, 0)
            if current_usage >= GUEST_LIMIT:
                return jsonify({'error': 'انتهى الحد', 'limit_reached': True}), 403
            
            setattr(user, usage_field, current_usage + 1)
            db.session.commit()
            remaining = GUEST_LIMIT - getattr(user, usage_field, 0)
        else:
            remaining = 'unlimited'
    
    # هنا تضع كود المعالجة الفعلي
    # مثال: إنشاء ملف صوتي باستخدام gTTS
    
    return jsonify({
        'success': True,
        'remaining': remaining,
        'message': 'تمت المعالجة'
    })

@app.route('/api/webhook/lemonsqueezy', methods=['POST'])
def lemonsqueezy_webhook():
    """Webhook لاستلام تأكيدات الدفع"""
    data = request.get_json()
    event_name = data.get('event_name', '')
    
    if event_name == 'order_created':
        order_data = data.get('data', {}).get('attributes', {})
        customer_email = order_data.get('email', '').lower()
        custom_data = order_data.get('custom', {})
        feature_hint = custom_data.get('feature_hint', '')
        
        if customer_email and feature_hint in ['tts', 'dub', 'srt']:
            user = User.query.filter_by(email=customer_email).first()
            if user:
                unlocked_field = f'unlocked_{feature_hint}'
                setattr(user, unlocked_field, True)
                db.session.commit()
                logger.info(f"User {customer_email} unlocked {feature_hint}")
    
    return jsonify({'success': True})

# =============================================================
# تشغيل التطبيق
# =============================================================
if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
