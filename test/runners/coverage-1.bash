#!/usr/bin/bash

# Comment-202505289 relates and/or applies.

'/usr/bin/clear'

(
	cd '--' '../..'
	if [ $? -ne 0 ]; then
		read '-r' '-n' '1' '-s' '-p' 'Error 202505288. Press any key to finish.'
	else
		# todo-1 Comment this out.
		# export SKIP_LONG_TESTS='true'

		# # Hardhat docs recommends setting this environment variable.
		# # Although it doesn't necessarily make a difference for our setup, so let's not set it until something starts failing.
		# export SOLIDITY_COVERAGE='true'

		export HARDHAT_MODE_CODE='1'

		# export ENABLE_HARDHAT_PREPROCESSOR='???'
		# export ENABLE_ASSERTS='???'
		# export ENABLE_SMTCHECKER='???'

		# todo-1 Uncomment the command line with no arguments.
		# 'npx' 'hardhat' 'coverage' '--testfiles' 'test/tests-src/MainPrize.js'
		# 'npx' 'hardhat' 'coverage' '--testfiles' 'test/tests-src/{PrizesWallet-?.js,StakingWalletCosmicSignatureNft.js,SystemManagement.js,BidStatistics.js,Bidding.js,MainPrize.js,CosmicSignatureGame-?.js,BidderContract.js,BlockTimeStamps.js}'
		'npx' 'hardhat' 'coverage'

		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. Hardhat Coverage failed. Press any key to finish.'
		fi
	fi
)
