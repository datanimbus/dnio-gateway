#!/bin/bash

set -e

TAG=`cat CURRENT_GW`


echo "****************************************************"
echo "data.stack:gw :: Pushing Image to ECR :: $ECR_URL/data.stack.gw:$TAG"
echo "****************************************************"

$(aws ecr get-login --no-include-email)
docker tag data.stack.gw:$TAG $ECR_URL/data.stack.gw:$TAG
docker push $ECR_URL/data.stack.gw:$TAG


echo "****************************************************"
echo "data.stack:gw :: Image pushed to ECR AS $ECR_URL/data.stack.gw:$TAG"
echo "****************************************************"