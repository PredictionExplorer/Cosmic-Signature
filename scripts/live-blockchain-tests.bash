#!/bin/bash

'/usr/bin/clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		if [ -n "$1" ]; then
			echo 'Using a (hopefully) secret account private key seed.'
			accountPrivateKeySeed="$1"
		else
			echo 'Warning. No secret account private key seed has been provided. Using a default well known value. Your money, fake or real, may be at risk.'

			# This value exists in the Git repo, so don't use it when running this script on a mainnet.
			# See Comment-202508313 for more info.
			accountPrivateKeySeed='0x1082f7e3fd074e76a64059e29acf3adb2c5ee2dd33c2bb3f7d5a7cdff0dc6665'
		fi
		echo
		'node' 'live-blockchain-tests.js' "${accountPrivateKeySeed}"
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. "live-blockchain-tests.js" failed. Press any key to finish.'
			OutcomeCode=2
		fi
	fi
)
