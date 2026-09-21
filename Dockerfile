FROM node:22-alpine AS builder
WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine AS runtime
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/dist /srv
EXPOSE 80 443 443/udp
