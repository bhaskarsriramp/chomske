# The export, as a Cloud Run job: backend/renderJob.js. Built by
# deploy/render/build.mjs, which stages only what the export needs (never .env).
#
# Debian 13 like the VM. ffmpeg is the ffmpeg-static binary from
# backend/package-lock.json, and the canvas is @napi-rs/canvas's prebuilt
# linux-x64 one, so the pixels are made by the same programs as on the VM.
# Node 24 brings npm 11, which wrote backend/package-lock.json (npm 10 reads it
# as out of date and refuses `npm ci`).
FROM node:24-trixie-slim

# libass (captions) reads fontconfig's configuration; the caption fonts
# themselves ship in backend/assets/fonts.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates fontconfig \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY backend/ ./
# The modules the server shares with the editor (camera, cursor looks, blur
# follow, voices), at the path the backend imports them from.
COPY src/components/Studio/ /app/src/components/Studio/

ENV NODE_ENV=production REDIS_DISABLED=true
CMD ["node", "renderJob.js"]
