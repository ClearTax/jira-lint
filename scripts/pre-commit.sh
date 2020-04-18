#/usr/bin/env bash

# clean before build
rm -rf dist

# run build
npm run build

# commit the dist file(s)
git add dist
