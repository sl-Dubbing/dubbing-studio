from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from gtts import gTTS
import os
import uuid
import logging

# إعداد logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# لغات gTTS المدعومة
LANGUAGES = {
    'en': 'en',
    'es': 'es',
    'fr': 'fr',
    'de': 'de',
    'ru': 'ru',
    'tr': 'tr',
    'ar': 'ar',
    'zh': 'zh-CN',
    'hi': 'hi',
    'fa': 'fa',
    'it': 'it',
    'nl': 'nl',
    'sv': 'sv',
}

@app.route('/api/health')
def health():
    logger.info('Health check OK')
    return jsonify({'status': 'ok'})

@app.route('/api/dub', methods=['POST'])
def dub():
    logger.info('=== DUB REQUEST STARTED ===')
    try:
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Empty JSON'}), 400
            
        text = data.get('text', '')
        lang = data.get('lang', 'ar')
        
        logger.info(f'Text length: {len(text)}')
        logger.info(f'Language: {lang}')
        
        if not text or len(text.strip()) == 0:
            return jsonify({'error': 'No text provided'}), 400
        
        # الحصول على كود اللغة لـ gTTS
        lang_code = LANGUAGES.get(lang, 'ar')
        logger.info(f'gTTS Language: {lang_code}')
        
        # إنشاء اسم الملف
        filename = f"dub_{uuid.uuid4().hex}.mp3"
        filepath = f"/tmp/{filename}"
        logger.info(f'Output filepath: {filepath}')
        
        # توليد الصوت باستخدام gTTS
        logger.info('Starting gTTS generation...')
        try:
            tts = gTTS(text=text, lang=lang_code, slow=False)
            tts.save(filepath)
            logger.info('gTTS generation completed')
        except Exception as tts_error:
            logger.error(f'gTTS Error: {str(tts_error)}')
            return jsonify({'error': f'TTS failed: {str(tts_error)}'}), 500
        
        # التحقق من الملف
        if os.path.exists(filepath):
            file_size = os.path.getsize(filepath)
            logger.info(f'File exists! Size: {file_size} bytes')
            
            if file_size > 0:
                logger.info(f'=== DUB SUCCESS: {filename} ===')
                return jsonify({
                    'success': True, 
                    'file': filename,
                    'size': file_size
                })
            else:
                logger.error('File exists but is EMPTY')
                return jsonify({'error': 'Generated file is empty'}), 500
        else:
            logger.error('File was NOT created')
            return jsonify({'error': 'File not created'}), 500
            
    except Exception as e:
        logger.error(f'=== DUB ERROR: {str(e)} ===')
        return jsonify({'error': str(e)}), 500

@app.route('/api/download/<filename>')
def download(filename):
    logger.info(f'Download requested: {filename}')
    try:
        filepath = f"/tmp/{filename}"
        
        if os.path.exists(filepath):
            file_size = os.path.getsize(filepath)
            logger.info(f'File found: {file_size} bytes')
            
            if file_size > 0:
                return send_file(
                    filepath, 
                    as_attachment=True, 
                    download_name=filename,
                    mimetype='audio/mpeg'
                )
            else:
                return jsonify({'error': 'File is empty'}), 500
        else:
            return jsonify({'error': 'File not found'}), 404
            
    except Exception as e:
        logger.error(f'Download error: {str(e)}')
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    logger.info(f'Server starting on port {port}')
    app.run(host='0.0.0.0', port=port, debug=False)
