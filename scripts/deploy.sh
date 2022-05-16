#!/bin/bash

set -e

TAG=`cat CURRENT_GW`


echo "****************************************************"
echo "data.stack:gw :: Deploying Image in K8S :: $NAMESPACE"
echo "****************************************************"

kubectl set image deployment/gw gw=$ECR_URL/data.stack.gw:$TAG -n $NAMESPACE --record=true


echo "****************************************************"
echo "data.stack:gw :: Image Deployed in K8S AS $ECR_URL/data.stack.gw:$TAG"
echo "****************************************************"