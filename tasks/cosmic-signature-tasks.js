// npx hardhat deploy-cosmic-signature --deployConfig tasks/default-config/deploy-local.json

"use strict";

const nodeFsModule = require("node:fs");

// Comment-202409255 relates.
const { basicDeployment } = require("../src/Deploy.js");

task("deploy-cosmic-signature", "Deploys contracts to a network", async (args, hre) => {
	const configFile = args.deployConfig;
	if (typeof configFile === "undefined" || configFile.length == 0) {
		console.log("Please provide a config file: --deployConfig [file_path]");
		return;
	}
	const config_params_file = nodeFsModule.readFileSync(configFile, "utf8");
	let config_params;
	try {
		config_params = JSON.parse(config_params_file);
	} catch (err) {
		console.error("Error while parsing JSON data:", err);
		return;
	}
	const param_copy = JSON.parse(JSON.stringify(config_params));
	param_copy.privKey = '*******';
	console.log("Using file:");
	console.log(param_copy);
	const deployerAcct = new hre.ethers.Wallet(config_params.privKey, hre.ethers.provider);
	if (config_params.charityAddr.length === 0 /* || config_params.marketingWalletAddr.length === 0 */) {
		const signers = await hre.ethers.getSigners();
		// if (config_params.charityAddr.length === 0) {
			config_params.charityAddr = signers[1].address;
		// }
		// if (config_params.marketingWalletAddr.length === 0) {
		// 	config_params.marketingWalletAddr = signers[7].address;
		// }
	}
	const contracts =
		await basicDeployment(
			deployerAcct,
			config_params.randomWalkNftAddr,
			// config_params.marketingWalletAddr,
			config_params.charityAddr,
			config_params.transferOwnershipToCosmicSignatureDao,
			config_params.roundActivationTime
		);
	console.log("Contracts deployed.");
	if (config_params.donateEthToGameContract) {
		const ethValue = "2";
		const donationAmount_ = hre.ethers.parseEther(ethValue);
		await contracts.cosmicSignatureGameProxy.connect(deployerAcct).donateEth({value: donationAmount_});
		console.log("Donated " + ethValue + " ETH to the CosmicSignatureGame proxy contract.");
	}
	console.log("CosmicSignatureGame proxy address:", await contracts.cosmicSignatureGameProxy.getAddress());
	console.log("CosmicSignatureNft address:", await contracts.cosmicSignatureNft.getAddress());
	console.log("CosmicSignatureToken address:", await contracts.cosmicSignatureToken.getAddress());
	console.log("CosmicSignatureDao address:", await contracts.cosmicSignatureDao.getAddress());
	console.log("CharityWallet address:", await contracts.charityWallet.getAddress());
	console.log("PrizesWallet address:", await contracts.prizesWallet.getAddress());
	console.log("RandomWalkNFT address:", await contracts.randomWalkNft.getAddress());
	console.log("StakingWalletCosmicSignatureNft address:", await contracts.stakingWalletCosmicSignatureNft.getAddress());
	console.log("StakingWalletRandomWalkNft address:", await contracts.stakingWalletRandomWalkNft.getAddress());
	console.log("MarketingWallet address:", await contracts.marketingWallet.getAddress());
	console.log("CosmicSignatureGame address:", await contracts.cosmicSignatureGame.getAddress());
	console.log(
		"INSERT INTO cg_contracts VALUES('" +
		await contracts.cosmicSignatureGameProxy.getAddress() +
		"','" +
		await contracts.cosmicSignatureNft.getAddress() +
		"','" +
		await contracts.cosmicSignatureToken.getAddress() +
		"','" +
		await contracts.cosmicSignatureDao.getAddress() +
		"','" +
		await contracts.charityWallet.getAddress() +
		"','" +
		await contracts.prizesWallet.getAddress() +
		"','" +
		await contracts.randomWalkNft.getAddress() +
		"','" +
		await contracts.stakingWalletCosmicSignatureNft.getAddress() +
		"','" +
		await contracts.stakingWalletRandomWalkNft.getAddress() +
		"','" +
		await contracts.marketingWallet.getAddress() +
		"','" +
		
		// Issue. According to Comment-202412059, this is the same as `cosmicSignatureGameProxy`.
		await contracts.cosmicSignatureGame.getAddress() +

		"')",
	);
}).addParam("deployConfig", "Config file (JSON) path");
