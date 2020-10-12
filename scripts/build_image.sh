#!/bin/bash
set -e
if [ -f $WORKSPACE/../TOGGLE ]; then
    echo "****************************************************"
    echo "odp:gw :: Toggle mode is on, terminating build"
    echo "odp:gw :: BUILD CANCLED"
    echo "****************************************************"
    exit 0
fi

cDate=`date +%Y.%m.%d.%H.%M` #Current date and time

if [ -f $WORKSPACE/../CICD ]; then
    CICD=`cat $WORKSPACE/../CICD`
fi
if [ -f $WORKSPACE/../ODP_RELEASE ]; then
    REL=`cat $WORKSPACE/../ODP_RELEASE`
fi
if [ -f $WORKSPACE/../DOCKER_REGISTRY ]; then
    DOCKER_REG=`cat $WORKSPACE/../DOCKER_REGISTRY`
fi
BRANCH='dev'
if [ -f $WORKSPACE/../BRANCH ]; then
    BRANCH=`cat $WORKSPACE/../BRANCH`
fi
if [ $1 ]; then
    REL=$1
fi
if [ ! $REL ]; then
    echo "****************************************************"
    echo "odp:gw :: Please Create file ODP_RELEASE with the releaese at $WORKSPACE or provide it as 1st argument of this script."
    echo "odp:gw :: BUILD FAILED"
    echo "****************************************************"
    exit 0
fi
TAG=$REL
if [ $2 ]; then
    TAG=$TAG"-"$2
fi
if [ $3 ]; then
    BRANCH=$3
fi
if [ $CICD ]; then
    echo "****************************************************"
    echo "odp:gw :: CICI env found"
    echo "****************************************************"
    TAG=$TAG"_"$cDate
    if [ ! -f $WORKSPACE/../ODP_NAMESPACE ]; then
        echo "****************************************************"
        echo "odp:gw :: Please Create file ODP_NAMESPACE with the namespace at $WORKSPACE"
        echo "odp:gw :: BUILD FAILED"
        echo "****************************************************"
        exit 0
    fi
    ODP_NS=`cat $WORKSPACE/../ODP_NAMESPACE`
fi

sh $WORKSPACE/scripts/prepare_yaml.sh $REL $2

echo "****************************************************"
echo "odp:gw :: Using build :: "$TAG
echo "****************************************************"

cd $WORKSPACE

echo "****************************************************"
echo "odp:gw :: Adding IMAGE_TAG in Dockerfile :: "$TAG
echo "****************************************************"
sed -i.bak s#__image_tag__#$TAG# Dockerfile

if [ -f $WORKSPACE/../CLEAN_BUILD_GW ]; then
    echo "****************************************************"
    echo "odp:gw :: Doing a clean build"
    echo "****************************************************"
    
    docker build --no-cache -t odp:gw.$TAG .
    rm $WORKSPACE/../CLEAN_BUILD_GW

    echo "****************************************************"
    echo "odp:gw :: Copying deployment files"
    echo "****************************************************"

    if [ $CICD ]; then
        sed -i.bak s#__docker_registry_server__#$DOCKER_REG# gw.yaml
        sed -i.bak s/__release_tag__/"'$REL'"/ gw.yaml
        sed -i.bak s#__release__#$TAG# gw.yaml
        sed -i.bak s#__namespace__#$ODP_NS# gw.yaml
        sed -i.bak '/imagePullSecrets/d' gw.yaml
        sed -i.bak '/- name: regsecret/d' gw.yaml

        kubectl delete deploy gw -n $ODP_NS || true # deleting old deployement
        kubectl delete service gw -n $ODP_NS || true # deleting old service
        #creating gww deployment
        kubectl create -f gw.yaml
    fi

else
    echo "****************************************************"
    echo "odp:gw :: Doing a normal build"
    echo "****************************************************"
    docker build -t odp:gw.$TAG .
    if [ $CICD ]; then
        kubectl set image deployment/gw gw=odp:gw.$TAG -n $ODP_NS --record=true
    fi
fi
if [ $DOCKER_REG ]; then
    echo "****************************************************"
    echo "odp:gw :: Docker Registry found, pushing image"
    echo "****************************************************"

    docker tag odp:gw.$TAG $DOCKER_REG/odp:gw.$TAG
    docker push $DOCKER_REG/odp:gw.$TAG
fi
echo "****************************************************"
echo "odp:gw :: BUILD SUCCESS :: odp:gw.$TAG"
echo "****************************************************"
echo $TAG > $WORKSPACE/../LATEST_GW
