#!/usr/bin/bash

'/usr/bin/clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		'node' '../src/live-blockchain-tests.js'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. "live-blockchain-tests.js" failed. Press any key to finish.'
			OutcomeCode=2
		fi
	fi
)
