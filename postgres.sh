#!/bin/bash

set -o errexit
set -o errtrace
set -o pipefail
set -o nounset

function error_handler() {
  echo "Error occurred in ${3} executing line ${1} with status code ${2}"
}

trap 'error_handler ${LINENO} $? $(basename ${BASH_SOURCE[0]})' ERR

if [ -n "${DEBUG:-}" ]; then
  set -o xtrace
fi

if [ -n "${SYNTAX_CHECK:-}" ]; then
  set -o noexec
fi

BASE_DIRECTORY="$( cd "$(dirname $( dirname "${BASH_SOURCE[0]}" ))" && pwd )"

if docker ps -a | grep -q scout-postgresql &> /dev/null; then
  docker rm -fv scout-postgresql
fi

docker run -d -p 5432:5432 --name scout-postgresql \
  --env-file ${BASE_DIRECTORY}/.postgresql-params.env postgres:10.3-alpine
