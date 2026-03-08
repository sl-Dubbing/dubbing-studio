// =============================================================
// AI Dubbing Service - Voice Cloning Integration
// رابط السيرفر: https://dubbing-studio-ai.onrender.com
// =============================================================

const AI_API_URL = 'https://dubbing-studio-ai.onrender.com';

class AIDubbingService {
    constructor() {
        this.currentVoiceSample = null;
        this.currentJobId = null;
    }

    // رفع عينة صوتية
    async uploadVoice(audioBlob, language = 'ar') {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice.wav');
        formData.append('email', currentUser?.email || 'guest');
        formData.append('language', language);

        const response = await fetch(`${AI_API_URL}/api/voices/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.success) {
            this.currentVoiceSample = data.filename;
            return data;
        }
        throw new Error(data.error);
    }

    // دبلجة SRT بالذكاء الاصطناعي
    async dubWithAI(srtContent, options = {}) {
        const {
            language = 'ar',
            onProgress = () => {}
        } = options;

        const response = await fetch(`${AI_API_URL}/api/dubbing/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                srt_content: srtContent,
                voice_sample: this.currentVoiceSample,
                target_language: language,
                email: currentUser?.email || 'guest'
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            if (data.upgrade) throw new Error('UPGRADE_REQUIRED');
            throw new Error(data.error);
        }

        if (data.status === 'processing') {
            return await this.pollProgress(data.job_id, onProgress);
        }

        return data;
    }

    async pollProgress(jobId, onProgress) {
        return new Promise((resolve, reject) => {
            const check = async () => {
                const res = await fetch(`${AI_API_URL}/api/dubbing/status/${jobId}`);
                const data = await res.json();

                onProgress(data.progress, data.status);

                if (data.status === 'completed') {
                    resolve({
                        ...data,
                        downloadUrl: `${AI_API_URL}/api/dubbing/download/${jobId}`
                    });
                } else if (data.status === 'failed') {
                    reject(new Error(data.error));
                } else {
                    setTimeout(check, 2000);
                }
            };
            check();
        });
    }

    // نطق بنفس النبرة
    async speakWithVoice(text, language = 'ar') {
        const response = await fetch(`${AI_API_URL}/api/tts/clone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                voice_sample: this.currentVoiceSample,
                language
            })
        });

        const data = await response.json();
        if (data.success && data.audio_base64) {
            const audio = new Audio(`data:audio/wav;base64,${data.audio_base64}`);
            await audio.play();
            return audio;
        }
        throw new Error(data.error);
    }
}

// =============================================================
// دوال الواجهة الأمامية
// =============================================================

const aiService = new AIDubbingService();

// تسجيل صوت من الميكروفون
async function startVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        window.mediaRecorder = new MediaRecorder(stream);
        window.recordedChunks = [];

        window.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) window.recordedChunks.push(e.data);
        };

        window.mediaRecorder.start();
        
        document.getElementById('recordBtn').classList.add('recording');
        document.getElementById('recordStatus').textContent = '🔴 جاري التسجيل...';
        
    } catch (err) {
        alert('لا يمكن الوصول إلى الميكروفون: ' + err.message);
    }
}

function stopVoiceRecording() {
    return new Promise((resolve) => {
        window.mediaRecorder.onstop = async () => {
            const blob = new Blob(window.recordedChunks, { type: 'audio/wav' });
            window.mediaRecorder.stream.getTracks().forEach(t => t.stop());
            
            document.getElementById('recordBtn').classList.remove('recording');
            document.getElementById('recordStatus').textContent = '⏹ تم الإيقاف';
            
            try {
                const lang = document.getElementById('targetLang')?.value || 'ar';
                const result = await aiService.uploadVoice(blob, lang);
                document.getElementById('voiceStatus').textContent = `✅ تم حفظ الصوت (${result.duration.toFixed(1)}s)`;
            } catch (e) {
                document.getElementById('voiceStatus').textContent = `❌ فشل الرفع: ${e.message}`;
            }
            
            resolve(blob);
        };
        window.mediaRecorder.stop();
    });
}

// دبلجة بالذكاء الاصطناعي
async function generateAIDubbing() {
    const srtContent = document.getElementById('srtInput').value;
    if (!srtContent) {
        alert('الرجاء إدخال SRT أولاً');
        return;
    }

    const progressBar = document.getElementById('aiProgress');
    const statusText = document.getElementById('aiStatus');
    const downloadBtn = document.getElementById('downloadAI');
    
    progressBar.style.display = 'block';
    downloadBtn.style.display = 'none';
    statusText.textContent = '🎬 جاري توليد الدبلجة...';

    try {
        const result = await aiService.dubWithAI(srtContent, {
            language: document.getElementById('targetLang')?.value || 'ar',
            onProgress: (progress, status) => {
                document.getElementById('progressFill').style.width = progress + '%';
                statusText.textContent = `⏳ ${progress}% - ${status === 'processing' ? 'جاري المعالجة' : status}`;
            }
        });

        if (result.downloadUrl) {
            downloadBtn.href = result.downloadUrl;
            downloadBtn.style.display = 'block';
            statusText.textContent = '✅ اكتملت الدبلجة!';
        }

    } catch (error) {
        if (error.message === 'UPGRADE_REQUIRED') {
            statusText.textContent = '⚠️ انتهى الحد المجاني (3 دبلجات)';
            document.getElementById('upgradeBanner').style.display = 'block';
        } else {
            statusText.textContent = '❌ خطأ: ' + error.message;
        }
    }
}

// تصدير للاستخدام
if (typeof module !== 'undefined') module.exports = AIDubbingService;
