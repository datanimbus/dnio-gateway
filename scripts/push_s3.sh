#!/bin/bash

set -e

TAG=`cat CURRENT_GW`

echo "****************************************************"
echo "datanimbus.io.gw :: Saving Image to AWS S3 :: $S3_BUCKET/stable-builds"
echo "****************************************************"

TODAY_FOLDER=`date ++%Y_%m_%d`

docker save -o datanimbus.io.gw_$TAG.tar datanimbus.io.gw:$TAG
bzip2 datanimbus.io.gw_$TAG.tar
aws s3 cp datanimbus.io.gw_$TAG.tar.bz2 s3://$S3_BUCKET/stable-builds/$TODAY_FOLDER/datanimbus.io.gw_$TAG.tar.bz2
rm datanimbus.io.gw_$TAG.tar.bz2

echo "****************************************************"
echo "datanimbus.io.gw :: Image Saved to AWS S3 AS datanimbus.io.gw_$TAG.tar.bz2"
echo "****************************************************"