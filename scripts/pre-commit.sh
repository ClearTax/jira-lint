#/usr/bin/env bash

# install
npm ci

# run build
npm run build

# commit the lib file(s)
git add lib
