FROM node:20-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    ffmpeg \
    ffmpeg-dev \
    python3 \
    py3-pip \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp \
    && pip3 install --no-cache-dir --break-system-packages js2py

# Copy package files
COPY package*.json ./

# Install dependencies (all for development)
RUN npm install

# Copy source code
COPY . .

# Create storage and logs directories
RUN mkdir -p storage logs

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "src/index.js"]

