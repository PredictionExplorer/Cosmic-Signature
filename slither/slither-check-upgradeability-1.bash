#!/usr/bin/bash

# Comment-202412129 relates.

'/usr/bin/clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		'slither-check-upgradeability' '..' '--hardhat-artifacts-directory' 'artifacts/production' 'CosmicSignatureGame' '--new-contract-name' 'CosmicSignatureGameOpenBid'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. slither-check-upgradeability failed. Press any key to finish.'
			OutcomeCode=2
		fi
	fi
)
