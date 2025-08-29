#### About This Document

This stuff is old and, for the most part, no longer relevant. Although the general idea remains mostly the same.
The rewritten version of this document is named "live-blockchain-tests.md".

**Nick wrote:**
> Basically , the idea was to test that the integration with RandomWalk works correctly, because this can't be tested with hardhat (no productive contract available). Though you can download the original contract source from Arbitrum MainNet, and deploy it on hardhat localhost and test it, but it is still not the real test. So I wrote these scripts to test that bidding with RandomWalk NFT works. The idea was that Taras would use some of his tokens, and claim all the resources back after confirming contracts work correctly. Then we would drop the test contracts, and deploy the second time, but this time we won't run the tests, so the contracts will be available to play from round 0. Because there will be a launch and advertisement in the media, it is better to make deployment verification on the MainNet before the launch.

**Yuriy's comment:**\
I have rewritten this test. The new version does support the above, in spite of the fact hat I have eliminated most of the logic that returns resources to the owner. That logic used to be in the `SelfDestructibleCosmicSignatureGame.finalizeTesting` method. I have commented out most of it, including `selfdestruct`, which I replaced with a transfer of the whole ETH balance to the owner. You can get other assets, most importantly, donated Random Walk NFTs, back from bidder accounts used by the test or, if somethibg went wrong while the test was running, from `PrizesWallet`. Besides, bidding with a Random Walk NFT would really not spoil the NFT if the game contract is not to be used in the production.

#### Introduction

These scripts are used to test the minimal functionality of the contracts after deploying them.
After running the tests you need to discard the contracts and deploy again because the tests will create dummy bid and claim-prize transactions. Use these scripts to do minimal checking before deploying productive contracts.

#### Configuration

Note: for running on Arbitrum Sepolia you need to increase gasLimit (twice) by adding this to hardhat.config.js:

    gasMultiplier: 2

for example:

    arbitrumSepolia: {
        url: `http://[ip_address]:[port]/`,
        <!-- todo-3 I have now commented out the use of this environment variable. -->
        accounts: ((process.env.ARBITRUM_SEPOLIA_PRIVATE_KEY ?? "").length > 0) ? [process.env.ARBITRUM_SEPOLIA_PRIVATE_KEY] : [],
        <!-- todo-3 A smaller value like 1.5 could be enough. -->
        gasMultiplier: 2,
    }

because eth_estimateGas function produces very low gasLimit values and because Arbitrum gas can change from block to block you will have difficulties transactiong without this option.

#### Deployment

    Example config file is located at tasks/default-config (you should copy it and change values)
	Note: the deployment must be executed with `switchToRuntimeMode` flag set to 'false' (because
	(we will set time intervals for bidding and claiming prize to lower values)
    <!-- todo-3 There is no such thing as runtime and maintenance modes any more. Now `roundActivationTime` plays that role. -->

##### for local testnet:

    npx hardhat deploy-cosmic-signature-contracts --deployconfigfilepath ~/deploy-configs/deploy-local.json --network localhost

##### for Arbitrum Sepolia:

    npx hardhat deploy-cosmic-signature-contracts --deployconfigfilepath ~/deploy-configs/deploy-arbitrum-sepolia.json --network arbitrumSepolia

Note: the main difference between localnet and Arbitrum Sepolia deployment is that for localnet a donation is made for 2 ETH (this is set in the config file, but the deployment process is the same)

#### Testing

##### Set contract timing values to shorter interval for testing purposes

    PRIVKEY=[private_key] COSMIC_SIGNATURE_GAME_ADDRESS=[addr] npx hardhat run ./scripts/set-short-durations.js --network [network-name]

##### Enable game-mode

    <!-- todo-3 There is no such thing as runtime and maintenance modes any more. Now `roundActivationTime` plays that role. -->
    PRIVKEY=[private_key] COSMIC_SIGNATURE_GAME_ADDRESS=[addr] npx hardhat run ./scripts/set-runtime-mode.js --network [network-name])

Copy the CosmicSignatureGameProxy contract address and run test scripts:

##### To mint Random Walk NFTs

	 RWALK_TOKENS=$(PRIVKEY=[private_key] COSMIC_SIGNATURE_GAME_ADDRESS=[addr] npx hardhat run scripts/mint-random-walk-nfts.js --network [network-name])

	(note: this command will set RWALK_TOKENS shell variable to NFTs minted)

##### Display the NFTs to make sure they were minted

    $ echo $RWALK_TOKENS
    24,25,26,27

##### Export RWALK_TOKENS variable (or provide it on the commandline)

    export RWALK_TOKENS

##### Run the test set of bids

    RWALK_TOKENS="[comma_separated_list_of_NFTs]" PRIVKEY=[private_key] COSMIC_SIGNATURE_GAME_ADDRESS=[addr] npx hardhat run ./scripts/test-deployment-part-1.js --network [network-name]

##### Wait for time to advance to be able to claimMainPrize() and execute second set of tests

    PRIVKEY=[private_key] COSMIC_SIGNATURE_GAME_ADDRESS=[addr] npx hardhat run ./scripts/test-deployment-part-2.js --network [network-name]
