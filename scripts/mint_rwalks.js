// Confirms that deployed contracts are fully operational

// const { expect } = require("chai");
const hre = require("hardhat");
const { getCosmicSignatureGameContract } = require("./helper.js");

const numRWalkToMint = 4;

async function mint_random_walk_token(testingAcct, randomWalkNft_) {
	let tokenPrice = await randomWalkNft_.getMintPrice();
	let tx = await randomWalkNft_.connect(testingAcct).mint({ value: tokenPrice });
	let receipt = await tx.wait();
	let topic_sig = randomWalkNft_.interface.getEventTopic("MintEvent");
	let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = randomWalkNft_.interface.parseLog(event_logs[0]);
	let nftId = parsed_log.args.tokenId;
	return nftId;
}
async function mint_random_walks(testingAcct, cosmicSignatureGame) {
	let randomWalkNftAddr_ = await cosmicSignatureGame.randomWalkNft();
	let randomWalkNft_ = await hre.ethers.getContractAt("RandomWalkNFT", randomWalkNftAddr_);
	let output = "";
	for (let i = 0; i < numRWalkToMint; i++) {
		if (output.length > 0) {
			output = output + ",";
		}
		let nftId = await mint_random_walk_token(testingAcct, randomWalkNft_);
		output = output + nftId.toString();
	}
	return output;
}
async function main() {
	let privKey = process.env.PRIVKEY;
	if (typeof privKey === "undefined" || privKey.length == 0) {
		console.log(
			"Please provide private key on the command line as ENVIRONMENT variable 'PRIVKEY', example : PRIVKEY=\"0x21982349...\" npx hardhat run scripts/deploy.js",
		);
		process.exit(1);
	}
	let testingAcct = new hre.ethers.Wallet(privKey, hre.ethers.provider);
	let cosmicSignatureGame = await getCosmicSignatureGameContract();

	let token_list = await mint_random_walks(testingAcct, cosmicSignatureGame);
	console.log(token_list);
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
