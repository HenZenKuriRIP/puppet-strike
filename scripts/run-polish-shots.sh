#!/bin/bash
# usage: scripts/run-polish-shots.sh [tag]   -> builds dist-e2e and runs shots-polish.mjs (logs/polish-shots.log)
cd /workspace/puppet-strike
pkill -f chrome-headless-shell; pkill -f "vite preview"; sleep 1
mkdir -p logs
npx vite build --mode e2e --outDir dist-e2e > logs/polish-build.log 2>&1 || { echo BUILD FAIL; exit 1; }
PHASE_TAG=$1 node scripts/shots-polish.mjs > logs/polish-shots.log 2>&1
echo DONE >> logs/polish-shots.log
