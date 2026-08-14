#!/usr/bin/bash

'/usr/bin/clear'

(
	OutcomeCode=0

	if [ ${OutcomeCode} -lt 2 ]; then
		SlitherFolderPath=~/My-Documents/Computers/Software/Development/202511/Technologies/Blockchains/Ethereum/Tools/Hardhat/Prototyping/Hardhat-3-Ethers-Mocha-Template-Project/.venv/bin/
		if [ ! -d "${SlitherFolderPath}" ]; then
			SlitherFolderPath=''
		fi
		export HARDHAT_MODE_CODE='1'

		# Since the modular delegatecall restructuring (Comment-202608248), all contracts compile
		# in a single compilation unit with uniform settings, so the former `SLITHER_UNIFORM_BUILD`
		# workaround (former Comment-202608134) is gone, and the regular production artifacts work here.
		"${SlitherFolderPath}slither-check-upgradeability" '..' '--hardhat-artifacts-directory' 'artifacts/production' 'CosmicSignatureGameV2' '--new-contract-name' 'CosmicSignatureGameV3'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. slither-check-upgradeability failed. Press any key to finish.'
			OutcomeCode=2
		fi
	fi
)
