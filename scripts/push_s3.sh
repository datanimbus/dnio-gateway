#!/bin/bash

set -e

TAG=`cat CURRENT_GW`

echo "****************************************************"
echo "data.stack:gw :: Saving Image to AWS S3 :: $S3_BUCKET/stable-builds"
echo "****************************************************"

TODAY_FOLDER=`date ++%Y_%m_%d`

docker save -o data.stack.gw_$TAG.tar data.stack.gw:$TAG
bzip2 data.stack.gw_$TAG.tar
aws s3 cp data.stack.gw_$TAG.tar.bz2 s3://$S3_BUCKET/stable-builds/$TODAY_FOLDER/data.stack.gw_$TAG.tar.bz2
rm data.stack.gw_$TAG.tar.bz2

echo "****************************************************"
echo "data.stack:gw :: Image Saved to AWS S3 AS data.stack.gw_$TAG.tar.bz2"
echo "****************************************************"