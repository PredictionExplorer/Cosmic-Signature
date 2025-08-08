#!/bin/bash

# '/usr/bin/clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		'node' 'generate-random-uint256.js' '10'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. "generate-random-uint256.js" failed. Press any key to finish.'
			OutcomeCode=2
		fi
	fi
)
