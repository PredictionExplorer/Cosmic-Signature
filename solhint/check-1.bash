#!/usr/bin/bash

# 'clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		'cd' '--' '..'

		if [ $? -ne 0 ]; then
			echo 'Error 202409123.'
			OutcomeCode=2
		fi
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		# [Comment-202409124]
		# This file name exists in multiple places.
		# [/Comment-202409124]
		SolHintOutputFileName='solhint/check-1-output.txt'

		'gio' 'trash' '--force' "${SolHintOutputFileName}"

		if [ $? -ne 0 ]; then
			echo 'Error 202409125.'
			OutcomeCode=2
		fi
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		'npx' 'hardhat' 'check' >> "${SolHintOutputFileName}"

		if [ $? -ne 0 ]; then
			echo 'Error. Hardhat Check failed.'
			OutcomeCode=2
		fi
	fi
)