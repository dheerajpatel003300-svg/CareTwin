FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
COPY assets ./assets
ENV PORT=8001
# Run as a non-root user
RUN useradd -m svc && chown -R svc /app
USER svc
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
