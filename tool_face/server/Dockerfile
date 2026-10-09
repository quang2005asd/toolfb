# ========================================================
# Dockerfile for Tool FB Backend Server & Worker
# ========================================================
FROM node:20-slim

WORKDIR /app

# Install basic network utilities
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package descriptors first for Docker cache optimization
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source code
COPY . .

# Ensure storage directories exist
RUN mkdir -p /app/data /app/uploads

EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production

CMD ["node", "src/app.js"]
