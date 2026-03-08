// AI Dubbing Service
const AI_API_URL = 'https://dubbing-studio-ai.onrender.com';

// تسجيل صوت من الميكروفون
async function startVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        window.mediaRecorder = new MediaRecorder(stream);
        window.recordedChunks = [];
        
        window.mediaRecorder.ondataavailable = function(e) {
            if (e.data.size > 0) {
                window.recordedChunks.push(e.data);
            }
        };
        
        window.mediaRecorder.start();
        
        document.getElementById('recordBtn').style.animation = 'pulse 1s infinite';
        document.getElementById('recordStatus').innerText = 'جاري التسجيل...';
        
    } catch (err) {
        alert('لا يمكن الوصول للميكروفون: ' + err.message);
    }
}

// إيقاف التسجيل
function stopVoiceRecording() {
    if (!window.mediaRecorder) {
        alert('لم يبدأ التسجيل');
        return;
    }
    
    window.mediaRecorder.onstop = async function() {
        const blob = new Blob(window.recordedChunks, { type: 'audio/wav' });
        
        // إيقاف الميكروفون
        window.mediaRecorder.stream.getTracks().forEach(function(track) {
            track.stop();
        });
        
        document.getElementById('recordBtn').style.animation = 'none';
        document.getElementById('recordStatus').innerText = 'تم الإيقاف';
        
        // رفع الصوت
        const formData = new FormData();
        formData.append('audio', blob, 'voice.wav');
        formData.append('email', 'guest');
        formData.append('language', document.getElementById('targetLang').value || 'ar');
        
        try {
            document.getElementById('voiceStatus').innerText = 'جاري الرفع...';
            
            const response = await fetch(AI_API_URL + '/api/voices/upload', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                window.voiceSample = data.filename;
                document.getElementById('voiceStatus').innerText = 'تم حفظ الصوت بنجاح';
            } else {
                document.getElementById('voiceStatus').innerText = 'فشل: ' + data.error;
            }
        } catch (e) {
            document.getElementById('voiceStatus').innerText = 'خطأ في الاتصال';
        }
    };
    
    window.mediaRecorder.stop();
}

// دبلجة بالذكاء الاصطناعي
async function generateAIDubbing() {
    const srtContent = document.getElementById('srtInput').value;
    
    if (!srtContent) {
        alert('الرجاء إدخال SRT');
        return;
    }
    
    document.getElementById('aiProgress').style.display = 'block';
    document.getElementById('aiStatus').innerText = 'جاري المعالجة...';
    document.getElementById('progressFill').style.width = '10%';
    
    try {
        const response = await fetch(AI_API_URL + '/api/dubbing/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                srt_content: srtContent,
                voice_sample: window.voiceSample || null,
                target_language: document.getElementById('targetLang').value || 'ar',
                email: 'guest'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('progressFill').style.width = '100%';
            document.getElementById('aiStatus').innerText = 'تم بنجاح!';
            
            if (data.audio_url) {
                document.getElementById('downloadAI').href = AI_API_URL + data.audio_url;
                document.getElementById('downloadAI').style.display = 'block';
            }
        } else {
            document.getElementById('aiStatus').innerText = 'خطأ: ' + (data.error || 'غير معروف');
        }
        
    } catch (e) {
        document.getElementById('aiStatus').innerText = 'خطأ في الاتصال بالسيرفر';
    }
}

console.log('AI Dubbing JS loaded successfully');
