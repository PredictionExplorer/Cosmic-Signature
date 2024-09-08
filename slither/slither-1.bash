#!/usr/bin/bash

'clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		# [Comment-202409112]
		# This file name exists in multiple places.
		# [/Comment-202409112]
		SlitherOutputFileName='slither-1-output.md'

		'gio' 'trash' '--force' "${SlitherOutputFileName}"

		if [ $? -ne 0 ]; then
			echo 'Error 202409118.'
			OutcomeCode=2
		fi
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		'slither' '--filter-paths' '\.\./contracts/tests/|\.\.node_modules/' '--show-ignored-findings' '--checklist' '..' > "${SlitherOutputFileName}"
		# echo $?

		# Even when there appear to be no errors, exit code is 255.
		# It's likely because Slither has found some issues in our contracts.
		# It appears that this behavior can be disabled with the `fail_on` parameter in Slither configuration file.
		# But we currently don't have the file.
		if [[ $? -ne 0 && $? -ne 255 ]]; then

			echo 'Error. Slither failed.'
			OutcomeCode=2
		fi
	fi

	# if [ ${OutcomeCode} -lt 2 ]; then
	# 	'sed' '-i' 's/\(](\)\(\w\+\/\)/\1..\/\2/g' "${SlitherOutputFileRelativePath}"
	# 
	# 	if [ $? -ne 0 ]; then
	# 		echo 'Error 202409117.'
	# 		OutcomeCode=2
	# 	fi
	# fi
)
