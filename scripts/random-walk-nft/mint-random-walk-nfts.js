// Confirms that deployed contracts are fully operational

"use strict";

// const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../src/Helpers.js");
const { getCosmicSignatureGameContract } = require("./helpers.js");

const numRWalkToMint = 4;

async function mint_random_walk_token(testingAcct, randomWalkNft) {
	let randomWalkNftMintPrice = await randomWalkNft.getMintPrice();
	/** @type {Promise<import("ethers").TransactionResponse>} */
	let transactionResponsePromise = randomWalkNft.connect(testingAcct).mint({value: randomWalkNftMintPrice,});
	let transactionReceipt = await waitForTransactionReceipt(transactionResponsePromise);
	let topic_sig = randomWalkNft.interface.getEventTopic("MintEvent");
	let event_logs = transactionReceipt.logs.filter((log_) => (log_.topics.indexOf(topic_sig) >= 0));
	let parsed_log = randomWalkNft.interface.parseLog(event_logs[0]);
	let nftId = parsed_log.args.tokenId;
	return nftId;
}

async function mint_random_walks(testingAcct, cosmicSignatureGame) {
	let randomWalkNftAddress = await cosmicSignatureGame.randomWalkNft();

	// Comment-202502096 applies.
	let randomWalkNft = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddress);

	let output = "";
	for (let i = 0; i < numRWalkToMint; i++) {
		if (output.length > 0) {
			output = output + ",";
		}
		let nftId = await mint_random_walk_token(testingAcct, randomWalkNft);
		output = output + nftId.toString();
	}
	return output;
}

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

	let token_list = await mint_random_walks(testingAcct, cosmicSignatureGame);
	console.info(token_list);
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
