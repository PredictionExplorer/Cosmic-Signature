const hre = require("hardhat");

const bidParamsEncoding = {
	type: "tuple(string,int256,bool)",
	name: "BidParams",
	components: [
		{ name: "message", type: "string" },
		{ name: "randomWalkNftId", type: "int256" },
		{ name: "openBid", type: "bool"},
	],
};
async function getCosmicSignatureGameContract() {
	let cosmicSignatureGameAddr = process.env.COSMIC_SIGNATURE_GAME_ADDRESS;
	if (typeof cosmicSignatureGameAddr === "undefined" || cosmicSignatureGameAddr.length != 42) {
		console.log("COSMIC_SIGNATURE_GAME_ADDRESS environment variable does not contain contract address");
		process.exit(1);
	}
	let cosmicSignatureGame = await hre.ethers.getContractAt("CosmicSignatureGame", cosmicSignatureGameAddr);
	return cosmicSignatureGame;
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
	let bidPrice = await cosmicSignatureGame.getBidPrice();
	let bidParams = { message: "bid test", randomWalkNftId: -1, openBid: false };
	let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding],[bidParams]);
	await cosmicSignatureGame.connect(testingAcct).bid(params, { value: bidPrice, gasLimit: 30000000 });
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
