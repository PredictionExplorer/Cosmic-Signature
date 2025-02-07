These scripts are used to test the minimal functionality of the contracts after deploying them.
After running the tests you need to discard the contracts and deploy again because the tests will create dummy bid and claim-prize transactions. Use these scripts to do minimal checking before deploying productive contracts).

Note: for running on Arbitrum Sepolia you need to increase gasLimit (twice) by adding this to hardhat.config.js:

    gasMultiplier: 2

for example:

    sepolia: {
        url: `http://[ip_address]:[port]/`,
        accounts: process.env.SEPOLIA_PRIVATE_KEY !== undefined ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
        gasMultiplier: 2,
    }

because eth_estimateGas function produces very low gasLimit values and because Arbitrum gas can change from block to block you will have difficulties transactiong without this option.

### Deployment

    Example config file is located at tasks/default-config (you should copy it and change values)
	Note: the deployment must be executed with `switchToRuntimeMode` flag set to 'false' (because
	(we will set time intervals for bidding and claiming prize to lower values)
    <!-- todo-1 There is no such thing as runtime and maintenance modes any more. Now `roundActivationTime` plays that role. -->

##### for local testnet:

    npx hardhat deploy-cosmic-signature --deployConfig ~/deploy-configs/deploy-local.json --network localhost

##### for Arbitrum Sepolia:

    npx hardhat deploy-cosmic-signature --deployConfig ~/deploy-configs/deploy-arbitrum-sepolia.json --network sepolia

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
