#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: publish-assets.sh <source-dir> <branch> <file>..." >&2
  exit 2
fi

source_dir=$1
branch=$2
shift 2

remote=${STARFORGE_REMOTE:-"https://x-access-token:${GITHUB_TOKEN:?GITHUB_TOKEN is required}@github.com/${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}.git"}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

for file in "$@"; do
  cp "$source_dir/$file" "$work/"
done

cd "$work"
git init -q -b "$branch"
git config user.name "${GIT_AUTHOR_NAME:-github-actions[bot]}"
git config user.email "${GIT_AUTHOR_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}"
git add -A
git commit -q -m "chore: update Starforge assets"
git remote add origin "$remote"

if git fetch -q --depth 1 origin "$branch" 2>/dev/null; then
  if [ "$(git rev-parse 'HEAD^{tree}')" = "$(git rev-parse 'FETCH_HEAD^{tree}')" ]; then
    echo "Assets unchanged; nothing to publish."
    exit 0
  fi
fi

git push -q --force origin "$branch"
echo "Published $# files to branch $branch."
