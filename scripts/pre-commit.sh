#/usr/bin/env bash

# lint
prettier --write **/*.ts
npm run lint -- --fix

# clean before build
rm -rf dist

# run build
npm run build

# commit the dist file(s)
git add dist
