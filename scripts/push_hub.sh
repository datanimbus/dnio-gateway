#!/bin/bash

set -e

TAG=`cat CURRENT_GW`

echo "****************************************************"
echo "datanimbus.io.gw :: Pushing Image to Docker Hub :: appveen/datanimbus.io.gw:$TAG"
echo "****************************************************"

docker tag datanimbus.io.gw:$TAG appveen/datanimbus.io.gw:$TAG
docker push appveen/datanimbus.io.gw:$TAG

echo "****************************************************"
echo "datanimbus.io.gw :: Image Pushed to Docker Hub AS appveen/datanimbus.io.gw:$TAG"
echo "****************************************************"