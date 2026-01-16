# Build Stage
FROM node:18-alpine as build

WORKDIR /app

COPY package.json ./
RUN npm install
RUN npm install react-router-dom

COPY index.html vite.config.js tailwind.config.js postcss.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

# Production Stage
FROM node:18-alpine

WORKDIR /app

RUN npm install -g serve

COPY --from=build /app/dist /app/dist
COPY serve.json /app/dist/serve.json

EXPOSE 80

CMD ["serve", "-s", "dist", "-l", "80"]
