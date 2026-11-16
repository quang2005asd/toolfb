FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY config ./config
COPY src ./src

ENV NODE_ENV=production
ENV APP_DATA_DIR=/app/data
EXPOSE 5000
CMD ["npm", "start"]
