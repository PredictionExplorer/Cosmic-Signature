// npx hardhat deploy-cosmic-signature --deployConfigFilePath tasks/default-config/deploy-local.json

"use strict";

const nodeFsModule = require("node:fs");
const { task } = require("hardhat/config.js");

// Comment-202409255 relates.
const { deployContracts } = require("../src/ContractDeploymentHelpers.js");

task("deploy-cosmic-signature", "Deploys contracts to a network", async (args, hre) => {
	const deployConfigFilePath = args.deployConfigFilePath;
	if (deployConfigFilePath === undefined || deployConfigFilePath.length === 0) {
		console.log("Please provide a config file: --deployConfigFilePath <file_path>");
		return;
	}
	const configJsonText = nodeFsModule.readFileSync(deployConfigFilePath, "utf8");
	let configObject;
	try {
		configObject = JSON.parse(configJsonText);
	} catch (err) {
		console.error("Error while parsing JSON data:", err);
		return;
	}
	// const configObjectToLog = JSON.parse(JSON.stringify(configObject));
	// configObjectToLog.privKey = "******";
	// console.log("Using configuration:");
	// console.log(configObjectToLog);
	{
		const privKey = configObject.privKey;
		configObject.privKey = "******";
		console.log("Using configuration:");
		console.log(configObject);
		configObject.privKey = privKey;
	}
	const deployerAcct = new hre.ethers.Wallet(configObject.privKey, hre.ethers.provider);

	// // I dislike this charity address logic. So I have commented it out.
	// // The charity address is really supposed to be provided in the config file. It should not be optional.
	// if (configObject.charityAddr.length === 0) {
	// 	const signers = await hre.ethers.getSigners();
	// 	configObject.charityAddr = signers[1].address;
	// }

	const contracts =
		await deployContracts(
			deployerAcct,
			configObject.randomWalkNftAddr,
			configObject.charityAddr,
			configObject.transferOwnershipToCosmicSignatureDao,
			configObject.roundActivationTime
		);
	console.log("Contracts deployed.");
	if (configObject.donateEthToGameContract) {
		const ethValue = "2";
		const ethDonationAmount = hre.ethers.parseEther(ethValue);
		await (await contracts.cosmicSignatureGameProxy.donateEth({value: ethDonationAmount})).wait();
		console.log("Donated " + ethValue + " ETH to the CosmicSignatureGame proxy contract.");
	}
	console.log("CosmicSignatureToken address:", contracts.cosmicSignatureTokenAddr);
	console.log("RandomWalkNFT address:", contracts.randomWalkNftAddr);
	console.log("CosmicSignatureNft address:", contracts.cosmicSignatureNftAddr);
	console.log("PrizesWallet address:", contracts.prizesWalletAddr);
	console.log("StakingWalletRandomWalkNft address:", contracts.stakingWalletRandomWalkNftAddr);
	console.log("StakingWalletCosmicSignatureNft address:", contracts.stakingWalletCosmicSignatureNftAddr);
	console.log("MarketingWallet address:", contracts.marketingWalletAddr);
	console.log("CharityWallet address:", contracts.charityWalletAddr);
	console.log("CosmicSignatureDao address:", contracts.cosmicSignatureDaoAddr);
	console.log("CosmicSignatureGame implementation address:", contracts.cosmicSignatureGameImplementationAddr);
	console.log("CosmicSignatureGame proxy address:", contracts.cosmicSignatureGameProxyAddr);
	console.log(
		"INSERT INTO cg_contracts VALUES('" +
		contracts.cosmicSignatureGameProxyAddr +
		"','" +
		contracts.cosmicSignatureNftAddr +
		"','" +
		contracts.cosmicSignatureTokenAddr +
		"','" +
		contracts.cosmicSignatureDaoAddr +
		"','" +
		contracts.charityWalletAddr +
		"','" +
		contracts.prizesWalletAddr +
		"','" +
		contracts.randomWalkNftAddr +
		"','" +
		contracts.stakingWalletCosmicSignatureNftAddr +
		"','" +
		contracts.stakingWalletRandomWalkNftAddr +
		"','" +
		contracts.marketingWalletAddr +
		"','" +
		contracts.cosmicSignatureGameImplementationAddr +
		"')",
	);
}).addParam("deployConfigFilePath", "Config file (JSON) path");
