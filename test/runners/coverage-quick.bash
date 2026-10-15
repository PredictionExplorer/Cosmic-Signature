#!/usr/bin/bash

# Measures Solidity coverage using the quick smoke-test profile, which may miss paths exercised by longer runs.

LONG_TEST_MODE_CODE=1 exec ./coverage.bash "${@}"
