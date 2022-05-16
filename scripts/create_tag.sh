#!/bin/bash

set -e

cDate=`date +%Y.%m.%d.%H.%M`



TAG=$RELEASE"_"$cDate
if [ $tag == 'dev' ]; then

    echo "****************************************************"
    echo "data.stack:gw :: Default Tag Found, Creating new TAG :: $TAG"
    echo "****************************************************"

    echo $TAG > CURRENT_GW

else
    echo "****************************************************"
    echo "data.stack:gw :: User's Tag Found :: $tag"
    echo "****************************************************"

    echo $tag > CURRENT_GW
fi