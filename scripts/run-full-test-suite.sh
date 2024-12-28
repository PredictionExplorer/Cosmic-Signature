#!/bin/bash

# todo-1 Some day, someone should implement better error handling in this script.

#### This script should be used for testing, prior that you have to run hardhat task to deploy the contracts
#### before using this script set CosmicSignatureGame contract address in bash, for example:  export CG_ADDR=0x0198D1d2385f7808caEC700743e197921e8D75b5
#### set private key: CG_PRIVKEY="0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897" 
#### set CG_NETWORK variable

if test -z "$CG_ADDR" ; then
	echo set CG_ADDR variable
	exit 1
fi
if test -z "$CG_PRIVKEY" ;  then
	echo set CG_PRIVKEY variable
	exit 1
fi
if test -z "$CG_NETWORK" ; then
	echo set CG_NETWORK variable
	exit 1
fi

CONTRACT_ADDR=$CG_ADDR
RW_TOKENS=$(PRIVKEY=$CG_PRIVKEY COSMIC_SIGNATURE_GAME_ADDRESS=$CONTRACT_ADDR npx hardhat run scripts/mint_rwalks.js --network $CG_NETWORK)
echo Random walk NFTs: $RW_TOKENS
RWALK_TOKENS=$RW_TOKENS PRIVKEY=$CG_PRIVKEY COSMIC_SIGNATURE_GAME_ADDRESS=$CONTRACT_ADDR npx hardhat run scripts/test-deployment-part1.js --network $CG_NETWORK
PRIVKEY=$CG_PRIVKEY COSMIC_SIGNATURE_GAME_ADDRESS=$CONTRACT_ADDR npx hardhat run scripts/forward-time-past-claim-prize.js --network $CG_NETWORK
PRIVKEY=$CG_PRIVKEY COSMIC_SIGNATURE_GAME_ADDRESS=$CONTRACT_ADDR npx hardhat run scripts/test-deployment-part2.js --network $CG_NETWORK
