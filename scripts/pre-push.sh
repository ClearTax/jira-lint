#/usr/bin/env bash

# npm ci
npm ci

# run build
echo "Running npm build.."
npm run build

git diff --exit-code --stat -- lib ':!node_modules' \
|| (echo "##[error] found changed files after build. please 'npm run build'" \
            "and check in all changes" \
    && exit 1)