// إدارة الصفحات
function showPage(page) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    event.target.closest('.nav-link').classList.add('active');
    console.log('الانتقال إلى:', page);
}

// التحكم في الفيديو
let isPlaying = false;

function togglePlay() {
    isPlaying = !isPlaying;
    document.getElementById('playBtn').textContent = isPlaying ? '⏸️' : '▶️';
}

// النماذج
function openUploadModal() {
    document.getElementById('uploadModal').classList.add('active');
}

function closeUploadModal() {
    document.getElementById('uploadModal').classList.remove('active');
}

// سحب وإفلات
const uploadZone = document.querySelector('.upload-zone');

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'var(--primary)';
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
        openUploadModal();
    }
});
