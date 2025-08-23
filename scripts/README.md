### About this document.

This stuff is old.

Nick wrote on Slack:
> Basically , the idea was to test that the integration with RandomWalk works correctly, because this can't be tested with hardhat (no productive contract available). Though you can download the original contract source from Arbitrum MainNet, and deploy it on hardhat localhost and test it, but it is still not the real test. So I wrote these scripts to test that bidding with RandomWalk NFT works. The idea was that Taras would use some of his tokens, and claim all the resources back after confirming contracts work correctly. Then we would drop the test contracts, and deploy the second time, but this time we won't run the tests, so the contracts will be available to play from round 0. Because there will be a launch and advertisement in the media, it is better to make deployment verification on the MainNet before the launch.

**Yuriy's comment:**\
I have rewritten live blockchain tests, but what's described above is still doable. Although there is no logic that explicitly returns resources to the owner. The logic used to be in the `SelfDestructibleCosmicSignatureGame.finalizeTesting` method. I commented out most of the logic in it, including `selfdestruct`. The owner can get all the resources, most importantly, donated Random Walk NFTs, back from `PrizesWallet`, assuming the owner controls bidder accounts. Besides, bidding with a Random Walk NFT would really not spoil the NFT if the game contract is not to be used in the production.\
Provided the testing script doesn't crash, it's not even necessary for the owner to make calls to `PrizesWallet`. The testing script itself would do so on behalf of bidder accounts. Then the owner will need to only make calls to `RandomWalkNFT` on behalf of bidder accounts to transfer NFTs back to themselves.

### ???

These scripts are used to test the minimal functionality of the contracts after deploying them.
After running the tests you need to discard the contracts and deploy again because the tests will create dummy bid and claim-prize transactions. Use these scripts to do minimal checking before deploying productive contracts).

Note: for running on Arbitrum Sepolia you need to increase gasLimit (twice) by adding this to hardhat.config.js:

    gasMultiplier: 2

for example:

    sepolia: {
        url: `http://[ip_address]:[port]/`,
<!-- todo-1 I have commented out the use of this environment variable. -->
        accounts: ((process.env.SEPOLIA_PRIVATE_KEY ?? "").length > 0) ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
<!-- todo-1 Do we really need this `gasMultiplier` thing? -->
        gasMultiplier: 2,
    }

because eth_estimateGas function produces very low gasLimit values and because Arbitrum gas can change from block to block you will have difficulties transactiong without this option.

### Deployment

    Example config file is located at tasks/default-config (you should copy it and change values)
	Note: the deployment must be executed with `switchToRuntimeMode` flag set to 'false' (because
	(we will set time intervals for bidding and claiming prize to lower values)
    <!-- todo-1 There is no such thing as runtime and maintenance modes any more. Now `roundActivationTime` plays that role. -->

##### for local testnet:

    npx hardhat deploy-cosmic-signature-contracts --deployconfigfilepath ~/deploy-configs/deploy-local.json --network localhost

##### for Arbitrum Sepolia:

    npx hardhat deploy-cosmic-signature-contracts --deployconfigfilepath ~/deploy-configs/deploy-arbitrum-sepolia.json --network sepolia

Note: the main difference between localnet and Sepolia deployment is that for localnet a donation is made for 2 ETH (this is set in the config file, but the deployment process is the same)

### Testing


##### Set contract timing values to shorter interval for testing purposes

    PRIVKEY=[private_key] COSMIC_SIGNATURE_GAME_ADDRESS=[addr] npx hardhat run ./scripts/set-short-durations.js --network [network-name]

##### Enable game-mode

    <!-- todo-1 There is no such thing as runtime and maintenance modes any more. Now `roundActivationTime` plays that role. -->
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
