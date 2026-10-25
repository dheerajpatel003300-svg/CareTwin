FROM node:24-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openssl \
      ca-certificates \
      poppler-utils \
      tesseract-ocr \
      tesseract-ocr-eng \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

# Run as a non-root user. The storage folder is only used when STORAGE_PROVIDER=local.
RUN useradd --system --uid 10001 --no-create-home app \
 && mkdir -p /app/storage \
 && chown -R app /app/storage
USER app

EXPOSE 4000

# Apply pending migrations, then start. migrate deploy needs no shadow database.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]