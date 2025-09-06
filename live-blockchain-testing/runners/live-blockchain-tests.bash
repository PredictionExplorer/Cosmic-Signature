#!/usr/bin/bash

'/usr/bin/clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		export ENABLE_HARDHAT_PREPROCESSOR='true'
		export ENABLE_ASSERTS='true'
		export ENABLE_SMTCHECKER='1'
		'node' '../src/live-blockchain-tests.js'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. "live-blockchain-tests.js" failed. Press any key to finish.'
			OutcomeCode=2
		fi
	fi
)
