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
	Note: the deployment must be executed with `switchToRuntime` flag set to 'false' (because
	(we will set time intervals for bidding and claiming prize to lower values)
    todo-0 There is no such thing as runtime and maintenance modes any more. Now activation time plays that role.

##### for local testnet:

    npx hardhat deploy-cosmicgame --deployconfig ~/deploy-configs/deploy-local.json --network localhost

##### for Arbitrum Sepolia:

    npx hardhat deploy-cosmicgame --deployconfig ~/deploy-configs/deploy-arbitrum-sepolia.json --network sepolia

Note: the main difference between localnet and Sepolia deployment is that for localnet a donation is made for 2 ETH (this is set in the config file, but the deployment process is the same)

### Testing


##### Set contract timing values to shorter interval for testing purposes

    PRIVKEY=[private_key] COSMIC_GAME_ADDRESS=[addr] npx hardhat run ./scripts/set-short-time-intervals.js --network [network-name]

##### Enable game-mode

    # todo-0 There is no such thing as runtime and maintenance modes any more. Now activation time plays that role.
    PRIVKEY=[private_key] COSMIC_GAME_ADDRESS=[addr] npx hardhat run ./scripts/set-runtime.js --network [network-name])

Copy the CosmicGameProxy contract address and run test scripts:

##### To mint Random Walk tokens

	 RWALK_TOKENS=$(PRIVKEY=[private_key] COSMIC_GAME_ADDRESS=[addr] npx hardhat run scripts/mint_rwalks.js --network [network-name])

	(note: this command will set RWALK_TOKENS shell variable to tokens minted)

##### Display the tokens to make sure they were minted

    $ echo $RWALK_TOKENS
    24,25,26,27

##### Export RWALK_TOKENS variable (or provide it on the commandline)

    export RWALK_TOKENS

##### Run the test set of bids

    RWALK_TOKENS="[comma_separated_list_of_tokens]" PRIVKEY=[private_key] COSMIC_GAME_ADDRESS=[addr] npx hardhat run ./scripts/test-deployment-part1.js --network [network-name]

##### Wait for time to advance to be able to claimPrize() and execute second set of tests

    PRIVKEY=[private_key] COSMIC_GAME_ADDRESS=[addr] npx hardhat run ./scripts/test-deployment-part2.js --network [network-name]
