# ========================================================
# Dockerfile for Tool FB Backend Server & Worker
# ========================================================
# trixie: sqlite3 prebuilt binary requires glibc >= 2.38 (bookworm ships 2.36)
FROM node:20-trixie-slim

WORKDIR /app

# Install basic network utilities
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package descriptors first for Docker cache optimization
COPY package*.json ./
# msnodesqlv8 is Windows-only (Linux uses mssql/tedious), so skip native install scripts
# and rebuild only sqlite3, which is needed at runtime
RUN npm install --omit=dev --ignore-scripts && npm rebuild sqlite3

# Copy application source code
COPY . .

# Ensure storage directories exist
RUN mkdir -p /app/data /app/uploads

EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production

CMD ["node", "src/app.js"]
