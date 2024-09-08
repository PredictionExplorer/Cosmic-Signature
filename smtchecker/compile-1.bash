#!/usr/bin/bash

# 'clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		UniqueIdNumber=$( '/usr/bin/date' '+%Y%m%d%H%M%S' )

		if [ $? -ne 0 ]; then
			echo 'Error 202409016.'
			OutcomeCode=2
		fi
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		'cd' '--' '..'

		if [ $? -ne 0 ]; then
			echo 'Error 202409019.'
			OutcomeCode=2
		fi
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		export ENABLE_HARDHAT_PREPROCESSOR='true'
		export ENABLE_ASSERTS='true'
		export ENABLE_SMTCHECKER='true'

		# Comment-202409012 applies.
		'npx' 'hardhat' 'clean' && 'npx' 'hardhat' 'clean' '--global'

		if [ $? -ne 0 ]; then
			echo 'Error 202409015.'
			OutcomeCode=2
		fi
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		# [Comment-202409014]
		# This folder name exists in multiple places.
		# [/Comment-202409014]
		SMTCheckerOutputFolderName='smtchecker/compile-1-output'

		'mkdir' '-p' "${SMTCheckerOutputFolderName}"

		if [ $? -ne 0 ]; then
			echo 'Error 202409017.'
			OutcomeCode=2
		fi
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		time 'npx' 'hardhat' 'compile' &>> "${SMTCheckerOutputFolderName}/${UniqueIdNumber}.txt"

		if [ $? -ne 0 ]; then
			echo 'Error. Hardhat Compile failed.'
			OutcomeCode=2
		fi
	fi
)
