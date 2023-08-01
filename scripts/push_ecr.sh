#!/bin/bash

set -e

TAG=`cat CURRENT_GW`


echo "****************************************************"
echo "datanimbus.io.gw :: Pushing Image to ECR :: $ECR_URL/datanimbus.io.gw:$TAG"
echo "****************************************************"

$(aws ecr get-login --no-include-email)
docker tag datanimbus.io.gw:$TAG $ECR_URL/datanimbus.io.gw:$TAG
docker push $ECR_URL/datanimbus.io.gw:$TAG


echo "****************************************************"
echo "datanimbus.io.gw :: Image pushed to ECR AS $ECR_URL/datanimbus.io.gw:$TAG"
echo "****************************************************"