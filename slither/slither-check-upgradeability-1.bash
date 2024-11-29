#!/usr/bin/bash

'clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		'slither-check-upgradeability' '..' 'CosmicSignatureGame'
		if [ $? -ne 0 ]; then
			echo 'Error. Slither-Check-Upgradeability failed.'
			OutcomeCode=2
		fi
	fi
)
