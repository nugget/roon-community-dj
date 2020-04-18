FROM node:12

WORKDIR /usr/src/djserver
COPY package*.json ./
RUN npm install
COPY server.js .
EXPOSE 8080
CMD [ "node", "server.js" ]
