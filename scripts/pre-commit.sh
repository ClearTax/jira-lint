#/usr/bin/env bash

# lint
npm run lint:fix

# clean before build
rm -rf lib

# run build
npm run build

# commit the lib file(s)
git add lib
