const hre = require("hardhat");

const bidParamsEncoding = {
	type: "tuple(string,int256,bool)",
	name: "BidParams",
	components: [
		{ name: "message", type: "string" },
		{ name: "randomWalkNFTId", type: "int256" },
		{ name: "openBid", type: "bool"},
	],
};
async function getCosmicGameProxyContract(contractName) {
	let cosmicGameProxyAddr = process.env.COSMIC_GAME_ADDRESS;
	if (typeof cosmicGameProxyAddr === "undefined" || cosmicGameProxyAddr.length != 42) {
		console.log("COSMIC_GAME_ADDRESS environment variable does not contain contract address");
		process.exit(1);
	}
	let cosmicGameProxy = await hre.ethers.getContractAt(contractName, cosmicGameProxyAddr);
	return cosmicGameProxy;
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
	let cosmicGameProxy = await getCosmicGameProxyContract("CosmicGameOpenBid");

	let multiplier = await cosmicGameProxy.timesBidPrice()
	let bidParams = { message: "open bid", randomWalkNFTId: -1, openBid: true };
	let params = hre.ethers.AbiCoder.defaultAbiCoder().encode([bidParamsEncoding],[bidParams]);
	let bidPrice = await cosmicGameProxy.getBidPrice();
	console.log("bidPrice before: "+bidPrice);
	await cosmicGameProxy.connect(testingAcct).bid(params, { value: bidPrice * multiplier, gasLimit: 30000000 });
	bidPrice = await cosmicGameProxy.getBidPrice();
	console.log("bidPrice after: "+bidPrice);

}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
