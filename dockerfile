FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y ffmpeg git && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p outputs voices

EXPOSE 7860

CMD ["python", "app.py"]
```

---

### خطوات الرفع على Hugging Face:
```
1. اذهب إلى huggingface.co/spaces
2. New Space → اسمه: sl-dubbing-backend
3. SDK: Docker
4. ارفع الملفات الـ 4
5. ارفع ملف صوتك: voices/speaker.wav
6. Space يبني تلقائياً ← ينتهي في 5-10 دقائق
7. الرابط الثابت:
   https://abdulselam1996-sl-dubbing-backend.hf.space
