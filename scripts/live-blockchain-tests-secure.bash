#!/bin/bash

# This script is to be executed from a different folder.
# See Comment-202508313 for more info.

# '/usr/bin/clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		cd '--' 'Cosmic-Signature/scripts'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Cannot CD to "Cosmic-Signature/scripts". Press any key to finish.'
			OutcomeCode=2
		fi
	fi

	if [ ${OutcomeCode} -lt 2 ]; then
		# Replace this with a hard to guess value.
		# See Comment-202508313 for more info.
		secretAccountPrivateKeySeed='0x1212121212121212121212121212121212121212121212121212121212121212'

		'./live-blockchain-tests.bash' "${secretAccountPrivateKeySeed}"
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. "live-blockchain-tests.bash" failed. Press any key to finish.'
			OutcomeCode=2
		fi
	fi
)
