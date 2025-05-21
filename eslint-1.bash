#!/usr/bin/bash

# todo-1 Remember to run this script.

# 'npx' 'eslint' '**/*.js' '--ignore-pattern' 'node_modules/**'

# [Comment-202505307]
# This file name exists in multiple places.
# [/Comment-202505307]
'npx' 'eslint' '.' >'eslint-1-report.txt'

if [ $? -ge 2 ]; then
	read '-r' '-n' '1' '-s' '-p' 'Error. ESLint failed. Press any key to finish.'
fi
