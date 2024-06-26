const hre = require("hardhat");
const bidParamsEncoding = { 
	type: 'tuple(string,int256,bool)',
	name: 'bidparams',
	components: [
		{name: 'msg', type: 'string'},
		{name: 'rwalk',type: 'int256'},
		{name: 'openbid',type: 'bool'},
	]
}; 
async function getCosmicGameContract() {
	let cosmicGameAddr = process.env.COSMIC_GAME_ADDRESS;
	if (typeof cosmicGameAddr === "undefined" || cosmicGameAddr.length != 42) {
		console.log("COSMIC_GAME_ADDRESS environment variable does not contain contract address");
		process.exit(1);
	}
	let cosmicGame = await ethers.getContractAt("CosmicGame", cosmicGameAddr);
	return cosmicGame;
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
	let cosmicGame = await getCosmicGameContract();

	let input = cosmicGame.interface.encodeFunctionData("proxyCall",['0xffc81d97',0]); // access to timesBidPrice public state variable
	let message = await cosmicGame.provider.call({
		to: cosmicGame.address,
		data: input

	});
	let res = cosmicGame.interface.decodeFunctionResult("proxyCall",message);
	let multiplier = ethers.utils.defaultAbiCoder.decode(["uint256"], res[0]);
	multiplier = ethers.BigNumber.from(multiplier + "");
	console.log("multiplier:");console.log(multiplier);
	let bidParams = {msg:'bid test',rwalk:-1,'openbid':true};
	let params = ethers.utils.defaultAbiCoder.encode([bidParamsEncoding],[bidParams]);
	let bidPrice = await cosmicGame.getBidPrice();
	await cosmicGame.connect(testingAcct).bid(params, { value: bidPrice.mul(multiplier), gasLimit: 30000000 });
}
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
