#!/usr/bin/bash

# [Comment-202511024]
# Multiple similar scripts exist.
# Issue. The other now deleted script used to be under `../../live-blockchain-testing/`.
# Comment-202612114 relates.
# [/Comment-202511024]

'/usr/bin/clear'

(
	export HARDHAT_MODE_CODE='2'
	export ENABLE_HARDHAT_PREPROCESSOR='true'
	export ENABLE_ASSERTS='true'
	export ENABLE_SMTCHECKER='1'
	'npx' 'hardhat' 'register-cosmic-signature-contracts' '--deployconfigfilepath' '../config/deploy-cosmic-signature-contracts-config-arbitrumSepolia.json' '--network' 'arbitrumSepolia'
	if [ $? -ne 0 ]; then
		read '-r' '-n' '1' '-s' '-p' 'Error. The register-cosmic-signature-contracts task failed. Press any key to finish.'
	fi
)
