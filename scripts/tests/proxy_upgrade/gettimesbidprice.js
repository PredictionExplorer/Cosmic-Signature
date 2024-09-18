const hre = require("hardhat");
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
	let cosmicGameProxy = await getCosmicGameProxyContract("CosmicGameOpenBid");
	let value = await cosmicGameProxy.timesBidPrice();
	console.log("timesBidPrice = "+value);

}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
