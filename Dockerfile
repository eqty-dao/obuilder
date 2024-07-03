FROM node:18-alpine
WORKDIR /

COPY package.json ./
RUN npm install

EXPOSE 3000
CMD ["nest", "start"]