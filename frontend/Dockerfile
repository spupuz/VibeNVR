# Build Stage
FROM --platform=$BUILDPLATFORM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
# hadolint ignore=SC2015
RUN npm config set fetch-retries 5 && \
    npm install --no-audit --no-fund --legacy-peer-deps || \
    (rm -rf node_modules package-lock.json && npm install --no-audit --no-fund)

# npm can omit Rolldown's ARM64/musl optional native binding when the lockfile
# was generated on another platform. Install the exact installed JS version.
RUN if [ "$(uname -m)" = "aarch64" ]; then \
      npm install --no-save --package-lock=false --no-audit --no-fund --legacy-peer-deps \
        "rolldown@$(node -p "require('rolldown/package.json').version")" \
        "@rolldown/binding-linux-arm64-musl@$(node -p "require('rolldown/package.json').version")"; \
    fi

COPY index.html vite.config.js tailwind.config.js postcss.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

# Production Stage
FROM nginx:alpine

# Create necessary directories and set permissions for unprivileged execution if needed
# hadolint ignore=DL3018
RUN mkdir -p /var/cache/nginx /var/run /var/log/nginx && \
    chmod -R 777 /var/cache/nginx /var/run /var/log/nginx && \
    apk add --no-cache netcat-openbsd

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy static assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

CMD ["/entrypoint.sh"]
