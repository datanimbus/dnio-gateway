#!/bin/bash

set -e

cDate=`date +%Y.%m.%d.%H.%M`



TAG=$RELEASE"_"$cDate
if [ $tag = 'dev' ] || [ $tag = 'main' ] || [ $tag = 'vNext' ]; then

    echo "****************************************************"
    echo "datanimbus.io.gw :: Default Tag Found, Creating new TAG :: $TAG"
    echo "****************************************************"

    echo $TAG > CURRENT_GW

else
    echo "****************************************************"
    echo "datanimbus.io.gw :: User's Tag Found :: $tag"
    echo "****************************************************"

    echo $tag > CURRENT_GW
fi