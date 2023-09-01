#!/bin/bash
#### before using this script set CosmicGame contract address in bash, for example:  export CG_ADDR=0x0198D1d2385f7808caEC700743e197921e8D75b5
#### set private key: CG_PRIVKEY="0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897" 

CONTRACT_ADDR=$CG_ADDR
PRIVKEY=$CG_PRIVKEY COSMIC_GAME_ADDRESS=$CONTRACT_ADDR npx hardhat run scripts/test-deployment-part1.js --network localhost
PRIVKEY=$CG_PRIVKEY COSMIC_GAME_ADDRESS=$CONTRACT_ADDR npx hardhat run scripts/forward-time-past-claim-prize.ts --network localhost
PRIVKEY=$CG_PRIVKEY COSMIC_GAME_ADDRESS=$CONTRACT_ADDR npx hardhat run scripts/test-deployment-part2.js --network localhost
