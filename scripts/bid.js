const hre = require("hardhat");
const bidParamsEncoding = {
	type: "tuple(string,int256)",
	name: "bidparams",
	components: [
		{ name: "msg", type: "string" },
		{ name: "rwalk", type: "int256" },
	],
};
async function getCosmicGameProxyContract() {
	let cosmicGameProxyAddr = process.env.COSMIC_GAME_PROXY_ADDRESS;
	if (typeof cosmicGameProxyAddr === "undefined" || cosmicGameProxyAddr.length != 42) {
		console.log("COSMIC_GAME_PROXY_ADDRESS environment variable does not contain contract address");
		process.exit(1);
	}
	let cosmicGameProxy = await ethers.getContractAt("CosmicGameProxy", cosmicGameProxyAddr);
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
	let cosmicGameProxy = await getCosmicGameProxyContract();
	let bidParams = { msg: "bid test", rwalk: -1 };
	let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding], [bidParams]);
	let bidPrice = await cosmicGameProxy.getBidPrice();
	await cosmicGameProxy.connect(testingAcct).bid(params, { value: bidPrice, gasLimit: 30000000 });
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
