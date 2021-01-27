#!/bin/bash

echo "****************************************************"
echo "data.stack:gw :: Copying yaml file "
echo "****************************************************"
if [ ! -d $WORKSPACE/../yamlFiles ]; then
    mkdir $WORKSPACE/../yamlFiles
fi

REL=$1
if [ $2 ]; then
    REL=$REL-$2
fi

rm -rf $WORKSPACE/../yamlFiles/gw.*
cp $WORKSPACE/gw.yaml $WORKSPACE/../yamlFiles/gw.$REL.yaml
cd $WORKSPACE/../yamlFiles/
echo "****************************************************"
echo "data.stack:gw :: Preparing yaml file "
echo "****************************************************"
sed -i.bak s/__release_tag__/"'$1'"/ gw.$REL.yaml
sed -i.bak s/__release__/$REL/ gw.$REL.yaml