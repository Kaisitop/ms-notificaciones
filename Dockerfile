FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm config set fetch-retries 5 && \
    npm config set fetch-timeout 600000 && \
    npm install

COPY . .

EXPOSE 3004

CMD ["npm", "run", "start:dev"]
