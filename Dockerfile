FROM node:fermium-alpine

RUN apk update
RUN apk upgrade
RUN set -ex; apk add --no-cache --virtual .fetch-deps curl tar git ;

WORKDIR /app

COPY package.json /app

RUN npm install -g npm
RUN npm install --production
RUN npm audit fix
RUN rm -rf /usr/local/lib/node_modules/npm/node_modules/node-gyp/test

COPY app.js /app

COPY config /app/config

COPY util /app/util

COPY routes /app/routes

COPY auth /app/auth

COPY sockets /app/sockets

RUN mkdir /app/uploads

ENV IMAGE_TAG=__image_tag__

EXPOSE 9080

RUN chmod 777 /app

RUN chmod 777 /app/uploads

CMD node app.js