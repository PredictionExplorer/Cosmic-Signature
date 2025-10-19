#!/usr/bin/bash

# todo-0 Slither is currently broken. Maybe report the bug.

'/usr/bin/clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		# [Comment-202409112]
		# This file name exists in multiple places.
		# [/Comment-202409112]
		SlitherOutputFileName='slither-1-output.md'

		'gio' 'trash' '--force' "${SlitherOutputFileName}"
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error 202409118. Press any key to finish.'
			OutcomeCode=2
		fi
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		export HARDHAT_MODE_CODE='1'

		# Comment-202503302 applies.
		'slither' '--filter-paths' '/contracts/tests/|/node_modules/' '--hardhat-artifacts-directory' 'artifacts/production' '--show-ignored-findings' '--checklist' '..' >> "${SlitherOutputFileName}"
		
		# echo $?

		# Even when there appear to be no errors, exit code is 255.
		# It's likely because Slither has found some issues in our contracts.
		# It appears that this behavior can be disabled with the `fail_on` parameter in Slither configuration file.
		# But currently we don't have the file.
		if [[ $? -ne 0 && $? -ne 255 ]]; then

			read '-r' '-n' '1' '-s' '-p' 'Error. Slither failed. Press any key to finish.'
			OutcomeCode=2
		fi
	fi

	# if [ ${OutcomeCode} -lt 2 ]; then
	# 	'sed' '-i' 's/\(](\)\(\w\+\/\)/\1..\/\2/g' "${SlitherOutputFileRelativePath}"
	# 	if [ $? -ne 0 ]; then
	# 		read '-r' '-n' '1' '-s' '-p' 'Error 202409117. Press any key to finish.'
	# 		OutcomeCode=2
	# 	fi
	# fi
)
