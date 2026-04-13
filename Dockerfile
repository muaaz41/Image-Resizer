FROM node:20-bookworm-slim

# Install ImageMagick (required by gm with { imageMagick: true })
RUN apt-get update \
  && apt-get install -y --no-install-recommends imagemagick ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy only what we need to run the demo
COPY lib ./lib
COPY demo ./demo

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "./demo/server.js"]

