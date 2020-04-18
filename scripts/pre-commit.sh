#/usr/bin/env bash

# lint
npm run lint:fix

# run build
npm run build

# commit the lib file(s)
git add lib
