#!/bin/bash

# '/usr/bin/clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		# Transferring from Hardhat Network's signer 0 to the owner address.
		# Assuming the owner private key was generated using the default (well known) seed.
		# See Comment-202508313 for more info.
		'node' 'transfer-eth.js' 'localhost' '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' '0xD0602D92478752773bFe22624959B3dF44E95D54' '0.2'

		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. "transfer-eth.js" failed. Press any key to finish.'
			OutcomeCode=2
		fi
	fi
)
