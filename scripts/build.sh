#!/bin/bash

set -e

TAG=`cat CURRENT_GW`

echo "****************************************************"
echo "datanimbus.io.gw :: Building GW using TAG :: $TAG"
echo "****************************************************"

sed -i.bak s#__image_tag__#$TAG# Dockerfile

if $cleanBuild ; then
    docker build --no-cache -t datanimbus.io.gw:$TAG .
else 
    docker build -t datanimbus.io.gw:$TAG .
fi


echo "****************************************************"
echo "datanimbus.io.gw :: GW Built using TAG :: $TAG"
echo "****************************************************"


echo $TAG > LATEST_GW