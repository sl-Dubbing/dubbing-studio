# server.py
# ==============================================================
# sl‑Dubbing & Translation – Backend (Colab Ready)
# الإصلاحات: pydub silent + XTTS startup + SRT sync
# ==============================================================

import os, uuid, time, logging, subprocess, json, re
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, ngrok-skip-browser-warning, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

AUDIO_DIR = Path('/tmp/sl_audio')
VOICE_DIR = Path('/tmp/sl_voices')
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
VOICE_DIR.mkdir(parents=True, exist_ok=True)

# ✅ Voice Cache لتجنب التحميل المتكرر
VOICE_CACHE = {}

XTTS_MODEL = None

def init_xtts():
    """تحميل XTTS مرة واحدة فقط - عند بدء التشغيل"""
    global XTTS_MODEL
    if XTTS_MODEL is not None:
        return True
    try:
        from TTS.api import TTS
        logger.info("⏳ Loading XTTS model...")
        XTTS_MODEL = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=True)
        logger.info("✅ XTTS ready")
        return True
    except Exception as e:
        logger.error(f"XTTS error: {e}")
        return False

# ✅ تحميل XTTS عند بدء التشغيل (ليس عند أول طلب)
init_xtts()

def fetch_voice_sample(voice_url, voice_id):
    """تحميل العينة مع التخزين المؤقت"""
    if voice_id in VOICE_CACHE and Path(VOICE_CACHE[voice_id]).exists():
        logger.info(f"✅ Voice cached: {voice_id}")
        return VOICE_CACHE[voice_id]
    
    try:
        import urllib.request
        local_path = VOICE_DIR / f"{voice_id}.wav"
        if not local_path.exists():
            logger.info(f"⏳ Downloading voice: {voice_id}")
            tmp_path = VOICE_DIR / f"{voice_id}.tmp.mp3"
            urllib.request.urlretrieve(voice_url, str(tmp_path))
            # تحويل إلى WAV
            subprocess.run([
                'ffmpeg', '-y', '-i', str(tmp_path),
                '-ar', '22050', '-ac', '1', str(local_path)
            ], capture_output=True, timeout=30)
            tmp_path.unlink(missing_ok=True)
        if local_path.exists():
            VOICE_CACHE[voice_id] = str(local_path)
            logger.info(f"✅ Voice cached: {local_path}")
            return str(local_path)
        return None
    except Exception as e:
        logger.error(f"Voice download error: {e}")
        return None

def synthesize_xtts(text, lang, voice_path, output_path):
    """توليد الصوت باستخدام XTTS"""
    global XTTS_MODEL
    try:
        if XTTS_MODEL is None:
            if not init_xtts():
                return None, "xtts_init_failed"
        if not voice_path or not Path(voice_path).exists():
            return None, "voice_not_found"
        
        XTTS_MODEL.tts_to_file(
            text=text,
            speaker_wav=voice_path,
            language=lang[:2],
            file_path=output_path
        )
        
        if Path(output_path).exists() and Path(output_path).stat().st_size > 0:
            return output_path, "xtts"
        return None, "xtts_empty_output"
    except Exception as e:
        logger.error(f"XTTS error: {e}")
        return None, f"xtts_error: {str(e)}"

def synthesize_gtts(text, lang, output_path):
    """توليد الصوت باستخدام gTTS"""
    try:
        from gtts import gTTS
        gTTS(text=text, lang=lang[:2]).save(output_path)
        if Path(output_path).exists() and Path(output_path).stat().st_size > 0:
            return output_path, "gtts"
        return None, "gtts_empty_output"
    except Exception as e:
        logger.error(f"gTTS error: {e}")
        return None, f"gtts_error: {str(e)}"

def synthesize_voice(text, lang, use_xtts=False, voice_url=None, voice_id=None):
    """
    توجيه التوليد لـ XTTS أو gTTS
    الإرجاع: (output_path أو None, method)
    """
    output_path = str(AUDIO_DIR / f"audio_{uuid.uuid4().hex[:8]}.wav")
    logger.info(f"🎤 synthesize_voice: use_xtts={use_xtts}, voice_id={voice_id}")
    
    if use_xtts and voice_url and voice_id:
        voice_path = fetch_voice_sample(voice_url, voice_id)
        if voice_path:
            result_path, method = synthesize_xtts(text, lang, voice_path, output_path)
            if result_path:
                return result_path, method
            logger.warning("XTTS failed, falling back to gTTS")
    
    result_path, method = synthesize_gtts(text, lang, output_path)
    return result_path, method

# ✅ دوال SRT المصححة
def srt_time(s):
    """تحويل وقت SRT إلى ثواني"""
    s = s.replace(",", ".")
    p = s.split(":")
    return int(p[0])*3600 + int(p[1])*60 + float(p[2])

def parse_srt(content):
    """تحليل ملف SRT"""
    blocks, cur = [], None
    for line in content.split("\n"):
        line = line.strip()
        if not line:
            if cur:
                blocks.append(cur)
            cur = None
        elif re.match(r"^\d+$", line):
            cur = {"i": int(line), "start": 0, "end": 0, "text": ""}
        elif "-->" in line and cur:
            p = line.split("-->")
            cur["start"] = srt_time(p[0].strip())
            cur["end"] = srt_time(p[1].strip())
        elif cur:
            cur["text"] += line + " "
    if cur:
        blocks.append(cur)
    return blocks

def assemble_srt(blocks, lang, use_xtts=False, voice_url=None, voice_id=None):
    """
    دمج مقاطع SRT مع الصوت مع التزامن الصحيح
    ✅ الإصلاح: حساب المدة الإجمالية أولاً (ليس silent duration=0)
    """
    from pydub import AudioSegment
    
    if not blocks:
        return None, "no_blocks"
    
    logger.info(f"[ASSEMBLE] Starting with {len(blocks)} blocks...")
    
    # ✅ حساب المدة الإجمالية من آخر جملة في SRT
    total_duration_ms = int(blocks[-1]["end"] * 1000) + 2000  # +2 ثانية أمان
    logger.info(f"[ASSEMBLE] Total duration: {total_duration_ms/1000:.1f}s")
    
    # ✅ إنشاء timeline بالمدة الصحيحة (ليس 0!)
    timeline = AudioSegment.silent(duration=total_duration_ms)
    current_time = 0.0
    
    for i, b in enumerate(blocks):
        text = b["text"].strip()
        if not text:
            continue
        
        start_time = b["start"]
        end_time = b["end"]
        duration = end_time - start_time
        
        logger.info(f"[ASSEMBLE] Block {i}: {start_time:.2f}s - {end_time:.2f}s ({duration:.2f}s)")
        
        # توليد الصوت
        res_path, method = synthesize_voice(text, lang, use_xtts, voice_url, voice_id)
        
        if not res_path or not Path(res_path).exists():
            logger.warning(f"Segment {b['i']} failed - file not found: {res_path}")
            continue
        
        try:
            seg = AudioSegment.from_file(res_path)
            seg_duration = len(seg) / 1000.0
            
            # ✅ قص الصوت إذا كان أطول من الفترة
            if seg_duration > duration:
                seg = seg[:int(duration * 1000)]
                logger.info(f"[ASSEMBLE] Trimmed from {seg_duration:.2f}s to {duration:.2f}s")
            
            # ✅ وضع الصوت في الموقع الصحيح في timeline
            position_ms = int(start_time * 1000)
            timeline = timeline.overlay(seg, position=position_ms)
            
            current_time = end_time
            logger.info(f"[ASSEMBLE] Block {i} done at {position_ms}ms")
            
        except Exception as e:
            logger.error(f"[ASSEMBLE] Block {i} error: {e}")
            continue
    
    # ✅ تصدير الملف النهائي
    out = str(AUDIO_DIR / f"dub_{uuid.uuid4().hex[:8]}.mp3")
    timeline.export(out, format="mp3", bitrate="128k")
    logger.info(f"[ASSEMBLE] ✅ Complete: {out}")
    return out, "xtts" if use_xtts else "gtts"

# ✅ Routes
@app.route('/api/health')
def health():
    return jsonify({
        'status': 'ok',
        'xtts_ready': XTTS_MODEL is not None,
        'engine': 'xtts' if XTTS_MODEL else 'gtts',
        'voice_cache': len(VOICE_CACHE)
    })

@app.route('/api/dub', methods=['POST', 'OPTIONS'])
def dub():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    
    try:
        data = request.get_json(force=True) or {}
        text = data.get('text', '').strip()
        lang = data.get('lang', 'ar')
        voice_url = data.get('voice_url', None)
        voice_id = data.get('voice_id', None)
        srt = data.get('srt', '')
        
        if not text and not srt:
            return jsonify({'error': 'النص فارغ'}), 400
        
        # ✅ الإصلاح: استخدام voice_url لتحديد XTTS
        use_xtts = bool(voice_url and voice_id)
        
        logger.info("=" * 60)
        logger.info("🎬 [DUB] Received request:")
        logger.info(f"   lang: {lang}")
        logger.info(f"   voice_id: {voice_id}")
        logger.info(f"   voice_url: {voice_url}")
        logger.info(f"   use_xtts: {use_xtts}")
        logger.info(f"   srt blocks: {len(parse_srt(srt)) if srt else 0}")
        logger.info("=" * 60)
        
        t0 = time.time()
        
        # ✅ معالجة SRT
        if srt.strip():
            blocks = parse_srt(srt)
            out, method = assemble_srt(blocks, lang, use_xtts, voice_url, voice_id)
            synced = True
        else:
            out, method = synthesize_voice(text, lang, use_xtts, voice_url, voice_id)
            synced = False
        
        if not out or not Path(out).exists():
            logger.error(f"[DUB] Output file not found: {out}")
            return jsonify({'success': False, 'error': 'فشل التوليد'}), 500
        
        filename = Path(out).name
        audio_url = f"https://{request.host}/api/file/{filename}"
        
        logger.info(f"✅ Dub OK – method={method} – time={time.time()-t0:.1f}s")
        
        return jsonify({
            'success': True,
            'audio_url': audio_url,
            'method': method,
            'voice_id': voice_id,
            'synced': synced,
            'time_sec': round(time.time() - t0, 1)
        })
    except Exception as e:
        logger.error(f"Dub error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/tts', methods=['POST', 'OPTIONS'])
def tts():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    
    try:
        data = request.get_json(force=True) or {}
        text = data.get('text', '').strip()
        lang = data.get('lang', 'ar')
        voice_url = data.get('voice_url', None)
        voice_id = data.get('voice_id', None)
        
        if not text:
            return jsonify({'error': 'النص فارغ'}), 400
        
        use_xtts = bool(voice_url and voice_id)
        out, method = synthesize_voice(text, lang, use_xtts, voice_url, voice_id)
        
        if not out or not Path(out).exists():
            return jsonify({'success': False, 'error': 'فشل التوليد'}), 500
        
        filename = Path(out).name
        audio_url = f"https://{request.host}/api/file/{filename}"
        
        return jsonify({
            'success': True,
            'audio_url': audio_url,
            'method': method,
            'voice_id': voice_id
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/file/<filename>')
def get_file(filename):
    p = AUDIO_DIR / filename
    if not p.exists():
        return jsonify({'error': 'غير موجود'}), 404
    
    mime = 'audio/wav' if str(p).endswith('.wav') else 'audio/mpeg'
    return send_file(str(p), mimetype=mime, as_attachment=False)

@app.route('/api/preload_voice', methods=['POST', 'OPTIONS'])
def preload_voice():
    if request.method == 'OPTIONS':
        return jsonify({'ok': True})
    
    data = request.get_json(force=True)
    voice_url = data.get('voice_url', '')
    voice_id = data.get('voice_id', '')
    
    if voice_url and voice_id:
        path = fetch_voice_sample(voice_url, voice_id)
        if path:
            return jsonify({'success': True, 'message': 'Voice ready', 'path': path})
    
    return jsonify({'success': False, 'message': 'Voice not found'}), 404

if __name__ == '__main__':
    logger.info("🚀 Starting server on port 5000")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
