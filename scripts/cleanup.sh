#!/bin/bash

set -e

TAG=`cat CURRENT_GW`

echo "****************************************************"
echo "data.stack:gw :: Cleaning Up Local Images :: $TAG"
echo "****************************************************"


docker rmi data.stack.gw:$TAG -f