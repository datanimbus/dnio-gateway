#!/bin/bash

set -e

TAG=`cat CURRENT_GW`


echo "****************************************************"
echo "datanimbus.io.gw :: Deploying Image in K8S :: $NAMESPACE"
echo "****************************************************"

kubectl set image deployment/gw gw=$ECR_URL/datanimbus.io.gw:$TAG -n $NAMESPACE --record=true


echo "****************************************************"
echo "datanimbus.io.gw :: Image Deployed in K8S AS $ECR_URL/datanimbus.io.gw:$TAG"
echo "****************************************************"