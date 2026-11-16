FROM node:18-slim

# Intel iHD VAAPI driver for scraper hardware encoding (N100/iHD/ADL GPUs).
ENV LIBVA_DRIVER_NAME=iHD

# Install FFmpeg, VAAPI drivers, and required dependencies.
# intel-media-va-driver (iHD) and libmfx1 are amd64-only in bookworm, so
# install them conditionally; va-driver-all exists on all architectures.
RUN apt-get update && apt-get install -y \
    ffmpeg \
    va-driver-all \
    python3 \
    make \
    g++ \
    && if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
         apt-get install -y intel-media-va-driver libmfx1; \
       fi \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir /mnt/photo_import

WORKDIR /app

# Version stamped into the image by the release workflow
ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}

# Copy package files
COPY package*.json ./

# Install dependencies and rebuild native modules
RUN npm ci --omit=dev && \
    npm rebuild better-sqlite3 sharp

# Copy application files
COPY . .

# Create directories for snapshots and videos
RUN mkdir -p snapshots videos

# Expose ports
EXPOSE 3001 3002

# Start the server
CMD ["node", "server.js"]
