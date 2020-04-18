#/usr/bin/env bash

# lint
prettier --write **/*.ts
npm run lint -- --fix

# clean before build
rm -rf dist

# run build
echo "Running npm build.."
npm run build

git diff --exit-code --stat -- lib ':!node_modules' \
|| (echo "##[error] found changed files after build. please 'npm run build'" \
            "and check in all changes" \
    && exit 1)
