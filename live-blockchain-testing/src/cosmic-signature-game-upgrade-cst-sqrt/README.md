# CST Sqrt Emission Upgrade Rehearsal

These scripts are intended for an Arbitrum Sepolia rehearsal of the `CosmicSignatureGameV2` UUPS upgrade.

Required environment variables:

- `COSMIC_SIGNATURE_GAME_PROXY_ADDRESS`: existing game proxy address.
- `PRIVKEY`: owner private key for `upgrade.js`; bidder key for `bid-and-verify.js`.

Suggested flow:

```bash
HARDHAT_MODE_CODE=2 COSMIC_SIGNATURE_GAME_PROXY_ADDRESS=0x... PRIVKEY=0x... npx hardhat run live-blockchain-testing/src/cosmic-signature-game-upgrade-cst-sqrt/upgrade.js --network arbitrumSepolia
HARDHAT_MODE_CODE=2 COSMIC_SIGNATURE_GAME_PROXY_ADDRESS=0x... PRIVKEY=0x... npx hardhat run live-blockchain-testing/src/cosmic-signature-game-upgrade-cst-sqrt/bid-and-verify.js --network arbitrumSepolia
```
