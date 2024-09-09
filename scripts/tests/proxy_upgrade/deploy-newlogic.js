const hre = require("hardhat");

async function getCosmicGameProxyContract() {
	let cosmicGameProxyAddr = process.env.COSMIC_GAME_ADDRESS;
	if (typeof cosmicGameProxyAddr === "undefined" || cosmicGameProxyAddr.length != 42) {
		console.log("COSMIC_GAME_ADDRESS environment variable does not contain contract address");
		process.exit(1);
	}
	let cosmicGameProxy = await ethers.getContractAt("CosmicGame", cosmicGameProxyAddr);
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
	let CosmicGameOpenBid = await ethers.getContractFactory("CosmicGameOpenBid");
	cosmicGameProxy = await hre.upgrades.upgradeProxy(
		cosmicGameProxy,
		CosmicGameOpenBid,
		opts = {
			kind: "uups"
		}
	);

	// because there can't be an initialize() method for proxy upgrade (because contract is already live)
	// we need to do execute any initialization process manually (only for those variables that are added extra)
	await cosmicGameProxy.setTimesBidPrice(10n);	// initialize timesBidPrice to 10

	await cosmicGameProxy.setRuntimeMode();

	let implementationAddr = await cosmicGameProxy.runner.provider.getStorage(cosmicGameProxy,'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc');
	console.log("Implementation address : "+implementationAddr);
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
