#!/bin/bash

set -e

TAG=`cat CURRENT_GW`

echo "****************************************************"
echo "datanimbus.io.gw :: Pushing Image to Docker Hub :: datanimbus/datanimbus.io.gw:$TAG"
echo "****************************************************"

docker tag datanimbus.io.gw:$TAG datanimbus/datanimbus.io.gw:$TAG
docker push datanimbus/datanimbus.io.gw:$TAG

echo "****************************************************"
echo "datanimbus.io.gw :: Image Pushed to Docker Hub AS datanimbus/datanimbus.io.gw:$TAG"
echo "****************************************************"