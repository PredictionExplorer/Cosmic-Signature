const {basicDeployment} = require("../src/Deploy.js");
const fs = require('fs');
task("deploy-local","Deploys contracts to local network",async (args,hre) => {
	let configFile = args.deployconfig;
	if ((typeof configFile === 'undefined') || (configFile.length == 0 )) {
		console.log("Please provide config file : --deployconfig [file_path]");
		return;
	}
    const config_params_file = fs.readFileSync(configFile, 'utf8');
	let config_params;
	try {
		config_params = JSON.parse(config_params_file)
    	console.log(config_params)
	} catch (err) {
		console.error('Error while parsing JSON data:', err)
		return;
	}
	console.log("Using file: "+configFile);
	let deployerAcct = new hre.ethers.Wallet(config_params.privKey,hre.ethers.provider);
	const {
		cosmicGame,
		cosmicToken,
		cosmicSignature,
		charityWallet,
		cosmicDAO,
		raffleWallet,
		randomWalkNFT,
	} = await basicDeployment(
		deployerAcct,
		config_params.randomWalkAddr,
		config_params.activationTime,
		config_params.charityAddr,
		config_params.transferOwnership,
	);
	let etherStr = "10";
	let donationAmount = hre.ethers.utils.parseEther(etherStr);
	await cosmicGame.connect(deployerAcct).donate({value: donationAmount});
	console.log("CosmicGame address:", cosmicGame.address);
	console.log("CosmicToken address:", cosmicToken.address);
	console.log("CosmicSignature address:", cosmicSignature.address);
	console.log("CharityWallet address:", charityWallet.address);
	console.log("CosmicDAO address", cosmicDAO.address);
	console.log("RaffleWallet address:", raffleWallet.address);
	console.log("randomWalkNFT address:", randomWalkNFT.address);
	console.log("Donation of "+etherStr+" ETH complete");

}).addParam("deployconfig","Config file (JSON)");
task("deploy-arbitrum-prod","Deploys contracts Arbitrum network",async (args,hre) => {
	// same script as for local, but without donate() step
	let configFile = args.deployconfig;
	if ((typeof configFile === 'undefined') || (configFile.length == 0 )) {
		console.log("Please provide config file : --deployconfig [file_path]");
		return;
	}
    const config_params_file = fs.readFileSync(configFile, 'utf8');
	let config_params;
	try {
		config_params = JSON.parse(config_params_file)
    	console.log(config_params)
	} catch (err) {
		console.error('Error while parsing JSON data:', err)
		return;
	}
	console.log("Using file: "+configFile);
	let deployerAcct = new hre.ethers.Wallet(config_params.privKey,hre.ethers.provider);
	const {
		cosmicGame,
		cosmicToken,
		cosmicSignature,
		charityWallet,
		cosmicDAO,
		raffleWallet,
		randomWalkNFT,
	} = await basicDeployment(
		deployerAcct,
		config_params.randomWalkAddr,
		config_params.activationTime,
		config_params.charityAddr,
		config_params.transferOwnership,
	);
	console.log("CosmicGame address:", cosmicGame.address);
	console.log("CosmicToken address:", cosmicToken.address);
	console.log("CosmicSignature address:", cosmicSignature.address);
	console.log("CharityWallet address:", charityWallet.address);
	console.log("CosmicDAO address", cosmicDAO.address);
	console.log("RaffleWallet address:", raffleWallet.address);
	console.log("randomWalkNFT address:", randomWalkNFT.address);
}).addParam("deployconfig","Config file (JSON)");
