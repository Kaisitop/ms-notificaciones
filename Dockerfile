# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
# Cache de descargas de npm reutilizable entre builds (BuildKit)
RUN --mount=type=cache,target=/root/.npm \
    npm config set fetch-retries 5 && \
    npm config set fetch-timeout 600000 && \
    npm install

COPY . .

EXPOSE 3004

CMD ["npm", "run", "start:dev"]
