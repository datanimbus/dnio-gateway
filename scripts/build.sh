#!/bin/bash

set -e

TAG=`cat CURRENT_GW`

echo "****************************************************"
echo "data.stack:gw :: Building GW using TAG :: $TAG"
echo "****************************************************"


docker build -t data.stack.gw:$TAG .


echo "****************************************************"
echo "data.stack:gw :: GW Built using TAG :: $TAG"
echo "****************************************************"


echo $TAG > LATEST_GW