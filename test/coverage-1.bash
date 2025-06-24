#!/usr/bin/bash

# Comment-202505289 relates and/or applies.

'/usr/bin/clear'

(
	cd '--' '..'
	if [ $? -ne 0 ]; then
		read '-r' '-n' '1' '-s' '-p' 'Error 202505288. Press any key to finish.'
	else
		# [Comment-202505294]
		# Issue. We need this ugly environment variable to tell our logic that the Hardhat Coverage task is running.
		# There appears to be no other way to make our logic informed about that.
		# Why our logic needs to know that?
		# It used to assert that block base fee per gas is positive.
		# A problem is that when the Hardhat Coverage task is running, it's zero in both Solidity and JavaScript.
		# So the asserions failed.
		# So I have refactored the assertions to assert that in this special case the values are zeros.
		# There are assertions like that in Solidity code as well. They unconditionally assert that the value is positive,
		# which implies that for the coverage task we must compile Solidity code with assertions disabled.
		# [/Comment-202505294]
		export IS_HARDHAT_COVERAGE='true'

		# todo-0 Uncomment the command line with no arguments.
		# 'npx' 'hardhat' 'coverage' '--testfiles' 'test/MainPrize.js'
		# 'npx' 'hardhat' 'coverage' '--testfiles' 'test/{PrizesWallet-1.js,PrizesWallet-2.js}'
		'npx' 'hardhat' 'coverage' '--testfiles' 'test/{PrizesWallet-?.js,StakingWalletCosmicSignatureNft.js,SystemManagement.js,BidStatistics.js,Bidding.js,MainPrize.js,CosmicSignatureGame-?.js,BidderContract.js,BlockTimeStamps.js}'
		# 'npx' 'hardhat' 'coverage'

		if [ $? -ne 0 ]; then
			read '-r' '-n' '1' '-s' '-p' 'Error. Hardhat Coverage failed. Press any key to finish.'
		fi
	fi
)
