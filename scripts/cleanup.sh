#!/bin/bash

set -e

TAG=`cat CURRENT_GW`

echo "****************************************************"
echo "datanimbus.io.gw :: Cleaning Up Local Images :: $TAG"
echo "****************************************************"


docker rmi datanimbus.io.gw:$TAG -f