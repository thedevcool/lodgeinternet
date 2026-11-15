#!/usr/bin/env bash
# `npm run test:server`: the website's tests on the test server, not this Mac.
#
#   npm run test:server                 # types, lint, unit tests, then end-to-end
#   npm run test:server -- check        # types and lint only
#   npm run test:server -- unit         # unit tests (extra words go to vitest)
#   npm run test:server -- unit tests/unit/lib/pricing.test.ts
#   npm run test:server -- e2e          # end-to-end (extra words go to playwright)
#   npm run test:server -- e2e e2e/blog.spec.ts --project=phone-390
#
# Builds Dockerfile.test on the server's Docker over SSH (`docker --context
# devbox`, set up once on this Mac; the backend's `make test-server` uses the
# same server). The working tree is uploaded as the build context, uncommitted
# changes included; .dockerignore keeps node_modules, .next and .env files on
# the Mac. Nothing is committed, and the container is removed afterwards.
#
# When end-to-end tests fail, their report and traces are copied back into
# test-results-server/ so they can be opened here.
set -euo pipefail

cd "$(dirname "$0")/.."

CONTEXT=${LODGE_TEST_CONTEXT:-devbox}
IMAGE=lodge-website-tests
NAME="lodge-website-tests-$(date +%s)"
MODE=${1:-all}
[ $# -gt 0 ] && shift

case "$MODE" in
    check) RUN="npx tsc --noEmit && npm run lint" ;;
    unit)  RUN="npx vitest run $*" ;;
    e2e)   RUN="npx playwright test --reporter=list $*" ;;
    all)   RUN="npx tsc --noEmit && npm run lint && npx vitest run && npx playwright test --reporter=list" ;;
    *) echo "usage: test_server.sh [all|check|unit|e2e] [extra arguments]" >&2; exit 2 ;;
esac

cleanup() { docker --context "$CONTEXT" rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

START=$(date +%s)
echo "test-server: building on '$CONTEXT' ($MODE)"
docker --context "$CONTEXT" build --quiet -f Dockerfile.test -t "$IMAGE" . >/dev/null
set +e
# --ipc=host: Chromium needs more shared memory than a container's default.
docker --context "$CONTEXT" run --name "$NAME" --ipc=host "$IMAGE" sh -c "$RUN"
RC=$?
set -e
if [ "$RC" -ne 0 ] && { [ "$MODE" = e2e ] || [ "$MODE" = all ]; }; then
    rm -rf test-results-server && mkdir -p test-results-server
    docker --context "$CONTEXT" cp "$NAME:/site/playwright-report" test-results-server/ >/dev/null 2>&1 || true
    docker --context "$CONTEXT" cp "$NAME:/site/test-results" test-results-server/ >/dev/null 2>&1 || true
    echo "test-server: failure report copied to test-results-server/"
fi
echo "test-server: exit $RC after $(( $(date +%s) - START ))s"
exit "$RC"
