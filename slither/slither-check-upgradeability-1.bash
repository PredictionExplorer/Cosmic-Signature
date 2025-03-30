#!/usr/bin/bash

# todo-1 Refactor this to wait for a key press after an error.

# Comment-202412129 relates.

'clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		'slither-check-upgradeability' '..' 'CosmicSignatureGame' '--new-contract-name' 'CosmicSignatureGameOpenBid'
		if [ $? -ne 0 ]; then
			echo 'Error. slither-check-upgradeability failed.'
			OutcomeCode=2
		fi
	fi
)
