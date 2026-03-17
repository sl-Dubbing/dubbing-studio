FROM python:3.10-slim

WORKDIR /app

# متغيرات البيئة — قبل أي شيء
ENV COQUI_TOS_AGREED=1
ENV PYTHONUNBUFFERED=1

# تثبيت الأدوات
RUN apt-get update && \
    apt-get install -y ffmpeg git gcc g++ && \
    rm -rf /var/lib/apt/lists/*

# تثبيت المكتبات
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# نسخ الملفات
COPY . .

# إنشاء المجلدات
RUN mkdir -p outputs voices_cache latents_cache

EXPOSE 7860

CMD ["python", "app.py"]
