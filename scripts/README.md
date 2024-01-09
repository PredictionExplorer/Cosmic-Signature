These scripts are used to test the minimal functionality of the contracts after deploying them.
After running the tests you need to discard the contracts and deploy again because the tests will create dummy bid and claim-prize transactions. Use these scripts to check network compatibility and interaction with RandomWalk (bidWithRWLK() methods).

Note: for running on Arbitrum Sepolia you need to increase gasLimit (twice) by adding this to hardhat.config.js:

    gasMultiplier: 2

for example:

    sepolia: {
        url: `http://[ip_address]:[port]/`,
        accounts: process.env.SEPOLIA_PRIVATE_KEY !== undefined ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
        gasMultiplier: 2,
    }

because eth_estimateGas function produces very low gasLimit values and you won't be able to deploy or bid.

### Deployment

    Example config file is located at tasks/default-config (you should copy it and change values)

##### for local testnet:

    npx hardhat deploy-local --deployconfig ~/deploy-configs/deploy-local.json --network localhost

##### for Arbitrum Sepolia:

    npx hardhat deploy-arbitrum --deployconfig ~/deploy-configs/deploy-arbitrum-sepolia.json --network sepolia

Note: the main difference between localnet and Sepolia scripts is that for localnet a donation is made for 10 ETH

### Testing

After contracts were deployed, copy the CosmicGame contract address and run test scripts:

##### To mint Random Walk tokens

     RWALK_TOKENS=$(PRIVKEY=[private_key] COSMIC_GAME_ADDRESS=[addr] npx hardhat run scripts/mint_rwalks.js --network [network-name]

##### Display the tokens to make sure they were minted

    $ echo $RWALK_TOKENS
    24,25,26,27

##### Export RWALK_TOKENS variable (or provide it on the commandline)

    export RWALK_TOKENS

##### Set contract timing values to shorter interval for testing purposes

    PRIVKEY=[private_key] COSMIC_GAME_ADDRESS=[addr] npx hardhat run ./scripts/set-short-time-intervals.js --network [network-name])

##### Run the test set of bids

    RWALK_TOKENS="[comma_separated_list_of_tokens]" PRIVKEY=[private_key] COSMIC_GAME_ADDRESS=[addr] npx hardhat run ./scripts/test-deployment-part1.js --network[network-name]

##### Wait for time to advance to be able to claimPrize()

    PRIVKEY=[private_key] COSMIC_GAME_ADDRESS=[addr] npx hardhat run ./scripts/test-deployment-part2.js --network [network-name]
