FROM node:12

WORKDIR /usr/src/djserver
COPY package*.json server.js ./
RUN npm install
EXPOSE 4242
CMD [ "node", "server.js" ]
