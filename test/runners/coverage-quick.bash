#!/usr/bin/bash

# This is just a quick smoke-test. The actual Solidity code coverage will not happen.

LONG_TEST_MODE_CODE=1 ./coverage.bash "${@}"
