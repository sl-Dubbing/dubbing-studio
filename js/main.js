// ============================================
// sl-Dubbing - الدوال المشتركة
// ============================================

const API_BASE_URL = 'https://dubbing-api-v2.onrender.com';

// ============================================
// Toast Notifications
// ============================================
function showToast(message){
    const toast = document.getElementById('toast');
    if(!toast) return;
    
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ============================================
// Server Status
// ============================================
async function checkServerStatus(){
    const statusEl = document.getElementById('serverStatus');
    const statusText = document.getElementById('serverStatusText');
    
    if(!statusEl || !statusText) return;
    
    try{
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${API_BASE_URL}/api/health`, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if(response.ok){
            statusEl.classList.add('online');
            statusText.textContent = '✅ سيرفر الدبلجة متصل';
        }else{
            throw new Error('Server error');
        }
    }catch(e){
        statusEl.classList.remove('online');
        statusText.textContent = '⚠️ سيرفر الدبلجة غير متصل - انقر للمحاولة';
    }
}

// ============================================
// Language Names
// ============================================
function getLanguageName(code){
    const names = {
        'ar': 'العربية',
        'en': 'English',
        'es': 'Español',
        'fr': 'Français',
        'de': 'Deutsch',
        'it': 'Italiano',
        'ru': 'Русский',
        'tr': 'Türkçe',
        'zh': '中文',
        'hi': 'हिन्दी',
        'fa': 'فارسی',
        'sv': 'Svenska',
        'nl': 'Nederlands'
    };
    return names[code] || code;
}

// ============================================
// Format Time
// ============================================
function formatTime(ms){
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    return `${hours.toString().padStart(2,'0')}:${(minutes%60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
}

// ============================================
// Export for modules
// ============================================
if(typeof module !== 'undefined' && module.exports){
    module.exports = { showToast, checkServerStatus, getLanguageName, formatTime };
}