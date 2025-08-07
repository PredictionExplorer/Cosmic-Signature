"use strict";

const nodeOsModule = require("node:os");
const nodePathModule = require("node:path");
const nodeFsModule = require("node:fs");
const { task } = require("hardhat/config.js");
const { waitForTransactionReceipt } = require("../src/Helpers.js");

// Comment-202409255 relates.
const { deployContractsAdvanced } = require("../src/ContractDeploymentHelpers.js");

// Invocation example:
// npx hardhat deploy-cosmic-signature-contracts --deployconfigfilepath tasks/config/deploy-cosmic-signature-contracts-config-hardhat.json --network hardhat
task("deploy-cosmic-signature-contracts", "Deploys Cosmic Signature contracts to a blockchain", async (args, hre) => {
	const deployConfigFilePath = args["deployconfigfilepath"];
	if (deployConfigFilePath == undefined || deployConfigFilePath.length <= 0) {
		// todo-1 Review all calls to `console` to make sure we specify a correct error severity.
		console.error(`${nodeOsModule.EOL}Please provide a deployment configuration file path: --deployconfigfilepath <file_path>`);
		return;
	}
	const deployConfigJsonString = await nodeFsModule.promises.readFile(deployConfigFilePath, "utf8");
	let deployConfigObject;
	try {
		deployConfigObject = JSON.parse(deployConfigJsonString);
	} catch (errorObject) {
		console.error(`${nodeOsModule.EOL}Error parsing "${deployConfigFilePath}":`);
		console.error(errorObject);
		return;
	}

	console.info();
	await hre.run("compile");

	{
		const deployerPrivateKey = deployConfigObject.deployerPrivateKey;
		deployConfigObject.deployerPrivateKey = "******";
		console.info(`${nodeOsModule.EOL}Using configuration:`);
		console.info(deployConfigObject);
		deployConfigObject.deployerPrivateKey = deployerPrivateKey;
	}

	const deployerSigner = new hre.ethers.Wallet(deployConfigObject.deployerPrivateKey, hre.ethers.provider);
	console.info(`${nodeOsModule.EOL}Deployer address:`, deployerSigner.address);
	const contracts =
		await deployContractsAdvanced(
			deployerSigner,
			deployConfigObject.cosmicSignatureGameContractName,
			deployConfigObject.randomWalkNftAddress,
			deployConfigObject.charityAddress,
			deployConfigObject.transferContractOwnershipToCosmicSignatureDao,
			BigInt(deployConfigObject.roundActivationTime)
		);

	console.info(`${nodeOsModule.EOL}Contracts deployed.`);
	console.info(`${nodeOsModule.EOL}CosmicSignatureToken address:`, contracts.cosmicSignatureTokenAddress);
	console.info("RandomWalkNFT address:", contracts.randomWalkNftAddress);
	console.info("CosmicSignatureNft address:", contracts.cosmicSignatureNftAddress);
	console.info("PrizesWallet address:", contracts.prizesWalletAddress);
	console.info("StakingWalletRandomWalkNft address:", contracts.stakingWalletRandomWalkNftAddress);
	console.info("StakingWalletCosmicSignatureNft address:", contracts.stakingWalletCosmicSignatureNftAddress);
	console.info("MarketingWallet address:", contracts.marketingWalletAddress);
	console.info("CharityWallet address:", contracts.charityWalletAddress);
	console.info("CosmicSignatureDao address:", contracts.cosmicSignatureDaoAddress);
	console.info(`${deployConfigObject.cosmicSignatureGameContractName} implementation address:`, contracts.cosmicSignatureGameImplementationAddress);
	console.info(`${deployConfigObject.cosmicSignatureGameContractName} proxy address:`, contracts.cosmicSignatureGameProxyAddress);
	console.info(
		`${nodeOsModule.EOL}INSERT INTO cg_contracts VALUES('` +
		contracts.cosmicSignatureGameProxyAddress +
		"','" +
		contracts.cosmicSignatureNftAddress +
		"','" +
		contracts.cosmicSignatureTokenAddress +
		"','" +
		contracts.cosmicSignatureDaoAddress +
		"','" +
		contracts.charityWalletAddress +
		"','" +
		contracts.prizesWalletAddress +
		"','" +
		contracts.randomWalkNftAddress +
		"','" +
		contracts.stakingWalletCosmicSignatureNftAddress +
		"','" +
		contracts.stakingWalletRandomWalkNftAddress +
		"','" +
		contracts.marketingWalletAddress +
		"','" +
		contracts.cosmicSignatureGameImplementationAddress +
		"')",
	);
	const reportObject = {
		cosmicSignatureTokenAddress: contracts.cosmicSignatureTokenAddress,
		randomWalkNftAddress: contracts.randomWalkNftAddress,
		cosmicSignatureNftAddress: contracts.cosmicSignatureNftAddress,
		prizesWalletAddress: contracts.prizesWalletAddress,
		stakingWalletRandomWalkNftAddress: contracts.stakingWalletRandomWalkNftAddress,
		stakingWalletCosmicSignatureNftAddress: contracts.stakingWalletCosmicSignatureNftAddress,
		marketingWalletAddress: contracts.marketingWalletAddress,
		charityWalletAddress: contracts.charityWalletAddress,
		cosmicSignatureDaoAddress: contracts.cosmicSignatureDaoAddress,
		cosmicSignatureGameImplementationAddress: contracts.cosmicSignatureGameImplementationAddress,
		cosmicSignatureGameProxyAddress: contracts.cosmicSignatureGameProxyAddress,
	};
	const reportJsonString = JSON.stringify(reportObject, null, 3);
	let reportSavedToFile = false;
	if (deployConfigObject.saveReportFile) {
		try {
			await nodeFsModule.promises.mkdir(nodePathModule.dirname(deployConfigObject.reportFilePath), {recursive: true,});
			await nodeFsModule.promises.writeFile(deployConfigObject.reportFilePath, reportJsonString);
			reportSavedToFile = true;
		} catch (errorObject) {
			console.error(`${nodeOsModule.EOL}Error saving report to "${deployConfigObject.reportFilePath}":`);
			console.error(errorObject);
		}
	}
	if (reportSavedToFile ) {
		console.info(`${nodeOsModule.EOL}Report saved to "${deployConfigObject.reportFilePath}".`);
	} else {
		console.info(`${nodeOsModule.EOL}Report:`);
		console.info(reportJsonString);
	}

	if (deployConfigObject.donateEthToCosmicSignatureGame) {
		const ethDonationAmountInEthAsString = deployConfigObject.ethDonationToCosmicSignatureGameAmountInEth.toString();
		const ethDonationAmountInWei = hre.ethers.parseEther(ethDonationAmountInEthAsString);
		await waitForTransactionReceipt(contracts.cosmicSignatureGameProxy.donateEth({value: ethDonationAmountInWei,}));
		console.info(`${nodeOsModule.EOL}Donated ${ethDonationAmountInEthAsString} ETH to the ${deployConfigObject.cosmicSignatureGameContractName} proxy contract.`);
	}
})
	.addParam("deployconfigfilepath", "Deployment configuration file (JSON) path");
