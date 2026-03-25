# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: Production
FROM node:18-alpine
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]