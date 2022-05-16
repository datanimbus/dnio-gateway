#!/bin/bash

set -e

TAG=`cat CURRENT_GW`

echo "****************************************************"
echo "data.stack:gw :: Pushing Image to Docker Hub :: appveen/data.stack.gw:$TAG"
echo "****************************************************"

docker tag data.stack.gw:$TAG appveen/data.stack.gw:$TAG
docker push appveen/data.stack.gw:$TAG

echo "****************************************************"
echo "data.stack:gw :: Image Pushed to Docker Hub AS appveen/data.stack.gw:$TAG"
echo "****************************************************"