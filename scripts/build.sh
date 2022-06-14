#!/bin/bash

set -e

TAG=`cat CURRENT_GW`

echo "****************************************************"
echo "data.stack:gw :: Building GW using TAG :: $TAG"
echo "****************************************************"

sed -i.bak s#__image_tag__#$TAG# Dockerfile

if [ $cleanBuild ]; then
    docker build --no-cache -t data.stack.gw:$TAG .
else 
    docker build -t data.stack.gw:$TAG .
fi


echo "****************************************************"
echo "data.stack:gw :: GW Built using TAG :: $TAG"
echo "****************************************************"


echo $TAG > LATEST_GW