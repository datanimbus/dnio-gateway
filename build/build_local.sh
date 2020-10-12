#!/bin/bash

pm2 stop 04-gw || true
pm2 start build/pm2_local.yaml
