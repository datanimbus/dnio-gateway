FROM node:12-alpine

RUN set -ex; apk add --no-cache --virtual .fetch-deps curl tar git ;

WORKDIR /app

COPY package.json /app

RUN npm install --production

COPY app.js /app

COPY config /app/config

COPY util /app/util

COPY routes /app/routes

COPY auth /app/auth

COPY sockets /app/sockets

RUN mkdir /app/uploads

ENV IMAGE_TAG=__image_tag__

EXPOSE 9080

RUN chmod -R 777 /app/uploads

CMD node app.js