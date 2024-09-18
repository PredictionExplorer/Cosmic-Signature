// Confirms that deployed contracts are fully operational

const hre = require("hardhat");
const { expect } = require("chai");
const { getCosmicGameProxyContract } = require("./helper.js");
const numRWalkToMint = 4;

async function mint_random_walk_token(testingAcct, randomWalk) {
	let tokenPrice = await randomWalk.getMintPrice();
	let tx = await randomWalk.connect(testingAcct).mint({ value: tokenPrice });
	let receipt = await tx.wait();
	let topic_sig = randomWalk.interface.getEventTopic("MintEvent");
	let event_logs = receipt.logs.filter(x => x.topics.indexOf(topic_sig) >= 0);
	let parsed_log = randomWalk.interface.parseLog(event_logs[0]);
	let tokenId = parsed_log.args.tokenId;
	return tokenId;
}
async function mint_random_walks(testingAcct, cosmicGameProxy) {
	let rwalkAddr = await cosmicGameProxy.randomWalk();
	let randomWalk = await hre.ethers.getContractAt("RandomWalkNFT", rwalkAddr);
	let output = "";
	for (let i = 0; i < numRWalkToMint; i++) {
		if (output.length > 0) {
			output = output + ",";
		}
		let tokenId = await mint_random_walk_token(testingAcct, randomWalk);
		output = output + tokenId.toString();
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
	let cosmicGameProxy = await getCosmicGameProxyContract();

	let token_list = await mint_random_walks(testingAcct, cosmicGameProxy);
	console.log(token_list);
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
