#/usr/bin/env bash

# lint
prettier --check **/*.ts
npm run lint

# clean before build
rm -rf dist

# run build
npm run build

# commit the dist file(s)
git add dist
