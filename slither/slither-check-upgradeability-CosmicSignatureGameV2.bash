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
		"${SlitherFolderPath}slither-check-upgradeability" '..' '--hardhat-artifacts-directory' 'artifacts/production' 'CosmicSignatureGame' '--new-contract-name' 'CosmicSignatureGameV2'
		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. slither-check-upgradeability failed. Press any key to finish.'
			OutcomeCode=2
		fi
	fi
)
