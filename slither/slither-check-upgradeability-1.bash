#!/usr/bin/bash

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
