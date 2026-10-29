# ========================================================
# Dockerfile for Tool FB Backend Server & Worker
# Chromium dùng cho đăng bài TikTok tự động (Puppeteer). Không cần TikTok thì build với:
#   docker build --build-arg INSTALL_CHROMIUM=false ./server
# ========================================================
# trixie: sqlite3 prebuilt binary requires glibc >= 2.38 (bookworm ships 2.36)
FROM node:20-trixie-slim

WORKDIR /app

# Network utilities (+ Chromium cho Puppeteer)
ARG INSTALL_CHROMIUM=true
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && if [ "$INSTALL_CHROMIUM" = "true" ]; then apt-get install -y --no-install-recommends chromium fonts-liberation; fi \
  && rm -rf /var/lib/apt/lists/*

# Dùng Chromium của hệ điều hành, không để Puppeteer tải thêm trình duyệt khi npm install
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts && npm rebuild sqlite3

COPY . .
RUN mkdir -p /app/data /app/uploads

EXPOSE 5000
ENV PORT=5000
ENV NODE_ENV=production

CMD ["node", "src/app.js"]
