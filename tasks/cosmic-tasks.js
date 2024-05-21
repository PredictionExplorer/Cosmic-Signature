const { basicDeployment } = require("../src/Deploy.js");
const fs = require("fs");
task("deploy-cosmicgame", "Deploys contracts to a  network", async (args, hre) => {
	let configFile = args.deployconfig;
	if (typeof configFile === "undefined" || configFile.length == 0) {
		console.log("Please provide config file : --deployconfig [file_path]");
		return;
	}
	const config_params_file = fs.readFileSync(configFile, "utf8");
	let config_params;
	try {
		config_params = JSON.parse(config_params_file);
		console.log(config_params);
	} catch (err) {
		console.error("Error while parsing JSON data:", err);
		return;
	}
	console.log("Using file: " + configFile);
	let deployerAcct = new hre.ethers.Wallet(config_params.privKey, hre.ethers.provider);
	const {
		cosmicGame,
		cosmicToken,
		cosmicSignature,
		charityWallet,
		cosmicDAO,
		raffleWallet,
		randomWalkNFT,
		stakingWalletCST,
		stakingWalletRWalk,
		marketingWallet,
		bLogic,
	} = await basicDeployment(
		deployerAcct,
		config_params.randomWalkAddr,
		config_params.activationTime,
		config_params.charityAddr,
		config_params.transferOwnership,
		config_params.switchToRuntime,
	);
	console.log("contracts deployed");
	if (config_params.donateToContract == true) {
		let ethValue = "2";
		let donationAmount = ethers.utils.parseEther(ethValue);
		await cosmicGame.connect(deployerAcct).donate({value:donationAmount});
		console.log("Donated "+ethValue+" ETH to contract");
	}
	console.log("CosmicGame address:", cosmicGame.address);
	console.log("CosmicToken address:", cosmicToken.address);
	console.log("CosmicSignature address:", cosmicSignature.address);
	console.log("CharityWallet address:", charityWallet.address);
	console.log("CosmicDAO address", cosmicDAO.address);
	console.log("RaffleWallet address:", raffleWallet.address);
	console.log("BidLogic address:", bLogic.address);
	console.log("randomWalkNFT address:", randomWalkNFT.address);
	console.log("StakingWalletCST address:", stakingWalletCST.address);
	console.log("StakingWalletRWalk address:", stakingWalletRWalk.address);
	console.log("MarketingWallet address:", marketingWallet.address);
	console.log(
		"INSERT INTO cg_contracts VALUES('" +
			cosmicGame.address +
			"','" +
			cosmicSignature.address +
			"','" +
			cosmicToken.address +
			"','" +
			cosmicDAO.address +
			"','" +
			charityWallet.address +
			"','" +
			raffleWallet.address +
			"','" +
			randomWalkNFT.address +
			"','" +
			stakingWalletCST.address +
			"','" +
			stakingWalletRWalk.address +
			"','" +
			marketingWallet.address +
			"','" +
			bLogic.address +
			"')",
	);
}).addParam("deployconfig", "Config file (JSON)");
