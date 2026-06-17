#!/usr/bin/bash

# Comment-202506016 relates.
# todo-1 Remember to run this script.

# '/usr/bin/clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		# This is said to return 1 if the file to rename does not exist.
		# Comment-202505307 applies.
		'/usr/bin/mv' '-f' 'eslint-1-report.txt' 'eslint-1-report.bak.txt'

		if [ $? -ge 2 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error 202505319. Press any key to finish.'
			OutcomeCode=2
		fi
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		cd '--' '..'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error 202506011. Press any key to finish.'
			OutcomeCode=2
		fi
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		# 'npx' 'eslint' '../**/*.js' '--ignore-pattern' 'node_modules/**'

		# [Comment-202505307]
		# This file name exists in multiple places.
		# [/Comment-202505307]
		'npx' 'eslint' '.' >'eslint/eslint-1-report.txt'

		if [ $? -ge 2 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. ESLint failed. Press any key to finish.'
			OutcomeCode=2
		fi
	fi
)
