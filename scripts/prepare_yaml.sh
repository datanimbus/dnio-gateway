#!/bin/bash

set -e

echo "****************************************************"
echo "datanimbus.io.gw :: Copying yaml file "
echo "****************************************************"
if [ ! -d yamlFiles ]; then
    mkdir yamlFiles
fi

TAG=`cat CURRENT_GW`

rm -rf yamlFiles/gw.*
cp gw.yaml yamlFiles/gw.$TAG.yaml
cd yamlFiles/
echo "****************************************************"
echo "datanimbus.io.gw :: Preparing yaml file "
echo "****************************************************"

sed -i.bak s/__release__/$TAG/ gw.$TAG.yaml

echo "****************************************************"
echo "datanimbus.io.gw :: yaml file saved"
echo "****************************************************"