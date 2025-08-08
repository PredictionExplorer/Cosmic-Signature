"use strict";

const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helpers.js");

async function main() {
	let privKey = process.env.PRIVKEY;
	if (privKey == undefined || privKey.length <= 0) {
		console.info(
			// todo-1 "scripts/deploy.js" no longer exists.
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGame = await getCosmicSignatureGameContract();
	let nextEthBidPrice = await cosmicSignatureGame.getNextEthBidPrice(0n);
	// todo-1 Think about `gasLimit`. Maybe add it in some other places. Is there a default value when sending to a testnet or mainnet?
	await cosmicSignatureGame.connect(testingAcct).bidWithEth((-1), "bid test", {value: nextEthBidPrice, gasLimit: 30000000});
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
