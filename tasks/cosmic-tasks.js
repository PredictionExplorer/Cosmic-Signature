// Comment-202409255 relates.
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
	} catch (err) {
		console.error("Error while parsing JSON data:", err);
		return;
	}
	let param_copy = JSON.parse(JSON.stringify(config_params));
	param_copy.privKey = '*******';
	console.log("Using file:");
	console.log(param_copy);
	let deployerAcct = new hre.ethers.Wallet(config_params.privKey, hre.ethers.provider);
	const {
		cosmicGameProxy,
		cosmicToken,
		cosmicSignature,
		charityWallet,
		cosmicDAO,
		raffleWallet,
		randomWalkNFT,
		stakingWalletCosmicSignatureNft,
		stakingWalletRWalk,
		marketingWallet,
		cosmicGame,
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
		let donationAmount = hre.ethers.parseEther(ethValue);
		await cosmicGameProxy.connect(deployerAcct).donate({value:donationAmount});
		console.log("Donated "+ethValue+" ETH to contract");
	}
	console.log("CosmicGameProxy address:", await cosmicGameProxy.getAddress());
	console.log("CosmicToken address:", await cosmicToken.getAddress());
	console.log("CosmicSignature address:",await cosmicSignature.getAddress());
	console.log("CharityWallet address:",await charityWallet.getAddress());
	console.log("CosmicDAO address", await cosmicDAO.getAddress());
	console.log("RaffleWallet address:", await raffleWallet.getAddress());
	console.log("Proxy implementation address:", await cosmicGame.getAddress());
	console.log("randomWalkNFT address:", await randomWalkNFT.getAddress());
	console.log("StakingWalletCosmicSignatureNft address:", await stakingWalletCosmicSignatureNft.getAddress());
	console.log("StakingWalletRWalk address:", await stakingWalletRWalk.getAddress());
	console.log("MarketingWallet address:", await marketingWallet.getAddress());
	console.log(
		"INSERT INTO cg_contracts VALUES('" +
			await cosmicGameProxy.getAddress()+
			"','" +
			await cosmicSignature.getAddress()+
			"','" +
			await cosmicToken.getAddress()+
			"','" +
			await cosmicDAO.getAddress() +
			"','" +
			await charityWallet.getAddress() +
			"','" +
			await raffleWallet.getAddress() +
			"','" +
			await randomWalkNFT.getAddress() +
			"','" +
			await stakingWalletCosmicSignatureNft.getAddress() +
			"','" +
			await stakingWalletRWalk.getAddress() +
			"','" +
			await marketingWallet.getAddress() +
			"','" +
			await cosmicGame.getAddress() +
			"')",
	);
}).addParam("deployconfig", "Config file (JSON)");
