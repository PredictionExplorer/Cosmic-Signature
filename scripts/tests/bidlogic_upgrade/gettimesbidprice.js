const hre = require("hardhat");
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
	let input = cosmicGameProxy.interface.encodeFunctionData("proxyCall",['0xffc81d97',0]);
	let message = await cosmicGameProxy.provider.call({
		to: cosmicGameProxy.address,
		data: input
	});
	let res = cosmicGameProxy.interface.decodeFunctionResult("proxyCall",message);
	let value = ethers.utils.defaultAbiCoder.decode(["uint256"], res[0]);
	console.log("timesBidPrice = "+value);

}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
