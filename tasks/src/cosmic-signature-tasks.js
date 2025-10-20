"use strict";

const nodeOsModule = require("node:os");
const nodePathModule = require("node:path");
const nodeFsModule = require("node:fs");
const { vars, task } = require("hardhat/config");

// Comment-202409255 relates.
const { waitForTransactionReceipt, safeErc1967GetChangedImplementationAddress } = require("../../src/Helpers.js");

// Comment-202409255 relates.
const { deployContractsAdvanced } = require("../../src/ContractDeploymentHelpers.js");

task("deploy-cosmic-signature-contracts", "Deploys Cosmic Signature contracts to a blockchain", async (args, hre) => {
	console.info("%s", `${nodeOsModule.EOL}deploy-cosmic-signature-contracts task is running.${nodeOsModule.EOL}`);
	const deployConfigFilePath = args.deployconfigfilepath;
	const deployConfigJsonString = await nodeFsModule.promises.readFile(deployConfigFilePath, "utf8");
	const deployConfigObject = JSON.parse(deployConfigJsonString);
	if (deployConfigObject.deployerPrivateKey.length <= 0) {
		deployConfigObject.deployerPrivateKey = vars.get(`deployerPrivateKey_${hre.network.name}`);
	}
	{
		console.info("%s", "Using configuration:");
		// const deployerPrivateKey = deployConfigObject.deployerPrivateKey;
		// deployConfigObject.deployerPrivateKey = "******";
		console.info("%o", deployConfigObject);
		console.info();
		// deployConfigObject.deployerPrivateKey = deployerPrivateKey;
	}
	if (nodeFsModule.existsSync(deployConfigObject.reportFilePath)) {
		throw new Error(`"${deployConfigObject.reportFilePath}" already exists.`);
	}
	const deployerSigner = new hre.ethers.Wallet(deployConfigObject.deployerPrivateKey, hre.ethers.provider);

	await hre.run("compile");

	console.info("%s", `${nodeOsModule.EOL}Deploying contracts.`);
	const contracts =
		await deployContractsAdvanced(
			deployerSigner,
			deployConfigObject.cosmicSignatureGameContractName,
			deployConfigObject.randomWalkNftAddress,
			deployConfigObject.charityAddress,
			deployConfigObject.transferContractOwnershipToCosmicSignatureDao,
			BigInt(deployConfigObject.roundActivationTime)
		);

	console.info(/*"%s",*/ `${nodeOsModule.EOL}CosmicSignatureToken address:`, contracts.cosmicSignatureTokenAddress);
	console.info(/*"%s",*/ "RandomWalkNFT address:", contracts.randomWalkNftAddress);
	console.info(/*"%s",*/ "CosmicSignatureNft address:", contracts.cosmicSignatureNftAddress);
	console.info(/*"%s",*/ "PrizesWallet address:", contracts.prizesWalletAddress);
	console.info(/*"%s",*/ "StakingWalletRandomWalkNft address:", contracts.stakingWalletRandomWalkNftAddress);
	console.info(/*"%s",*/ "StakingWalletCosmicSignatureNft address:", contracts.stakingWalletCosmicSignatureNftAddress);
	console.info(/*"%s",*/ "MarketingWallet address:", contracts.marketingWalletAddress);
	console.info(/*"%s",*/ "CharityWallet address:", contracts.charityWalletAddress);
	console.info(/*"%s",*/ "CosmicSignatureDao address:", contracts.cosmicSignatureDaoAddress);
	console.info(/*"%s",*/ `${deployConfigObject.cosmicSignatureGameContractName} implementation address:`, contracts.cosmicSignatureGameImplementationAddress);
	console.info(/*"%s",*/ `${deployConfigObject.cosmicSignatureGameContractName} proxy address:`, contracts.cosmicSignatureGameProxyAddress);
	console.info(
		"%s",
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
		"')" +
		nodeOsModule.EOL
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
	try {
		await nodeFsModule.promises.mkdir(nodePathModule.dirname(deployConfigObject.reportFilePath), {recursive: true,});
		await nodeFsModule.promises.writeFile(deployConfigObject.reportFilePath, reportJsonString);
	} catch (errorObject) {
		console.info("%s", "Report:");
		console.info("%s", reportJsonString);
		console.error();
		throw errorObject;
	}
	console.info("%s", `Report saved to "${deployConfigObject.reportFilePath}".${nodeOsModule.EOL}`);

	if (deployConfigObject.donateEthToCosmicSignatureGame) {
		const ethDonationAmountInEthAsString = deployConfigObject.ethDonationToCosmicSignatureGameAmountInEth.toFixed(18);
		const ethDonationAmountInWei = hre.ethers.parseEther(ethDonationAmountInEthAsString);
		await waitForTransactionReceipt(contracts.cosmicSignatureGameProxy.donateEth({value: ethDonationAmountInWei,}));
		console.info("%s", `Donated ${ethDonationAmountInEthAsString} ETH to the ${deployConfigObject.cosmicSignatureGameContractName} proxy contract.${nodeOsModule.EOL}`);
	}

	console.info("%s", `deploy-cosmic-signature-contracts task is done.${nodeOsModule.EOL}`);
})
	.addParam("deployconfigfilepath", "Deployment configuration file (JSON) path");

task("register-cosmic-signature-contracts", "Verifies and registers deployed Cosmic Signature contracts", async (args, hre) => {
	const deployConfigFilePath = args.deployconfigfilepath;
	const deployConfigJsonString = await nodeFsModule.promises.readFile(deployConfigFilePath, "utf8");
	const deployConfigObject = JSON.parse(deployConfigJsonString);
	const deployCosmicSignatureContractsReportJsonString = await nodeFsModule.promises.readFile(deployConfigObject.reportFilePath, "utf8");
	const deployCosmicSignatureContractsReportObject = JSON.parse(deployCosmicSignatureContractsReportJsonString);
	hre.config.etherscan.apiKey = vars.get(`etherScanApiKey_${hre.network.name}`);

	console.info("%s", `${nodeOsModule.EOL}Registering CosmicSignatureToken.`);
	await hre.run("verify:verify", {
		address: deployCosmicSignatureContractsReportObject.cosmicSignatureTokenAddress,
		constructorArguments: [deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress,],
	});

	// console.info("%s", `${nodeOsModule.EOL}Registering RandomWalkNFT.`);
	// await hre.run("verify:verify", {
	// 	address: deployCosmicSignatureContractsReportObject.randomWalkNftAddress,
	// 	constructorArguments: [???],
	// });

	console.info("%s", `${nodeOsModule.EOL}Registering CosmicSignatureNft.`);
	await hre.run("verify:verify", {
		address: deployCosmicSignatureContractsReportObject.cosmicSignatureNftAddress,
		constructorArguments: [deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress,],
	});

	console.info("%s", `${nodeOsModule.EOL}Registering PrizesWallet.`);
	await hre.run("verify:verify", {
		address: deployCosmicSignatureContractsReportObject.prizesWalletAddress,
		constructorArguments: [deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress,],
	});

	console.info("%s", `${nodeOsModule.EOL}Registering StakingWalletRandomWalkNft.`);
	await hre.run("verify:verify", {
		address: deployCosmicSignatureContractsReportObject.stakingWalletRandomWalkNftAddress,
		constructorArguments: [deployCosmicSignatureContractsReportObject.randomWalkNftAddress,],
	});

	console.info("%s", `${nodeOsModule.EOL}Registering StakingWalletCosmicSignatureNft.`);
	await hre.run("verify:verify", {
		address: deployCosmicSignatureContractsReportObject.stakingWalletCosmicSignatureNftAddress,
		constructorArguments: [deployCosmicSignatureContractsReportObject.cosmicSignatureNftAddress, deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress,],
	});

	console.info("%s", `${nodeOsModule.EOL}Registering MarketingWallet.`);
	await hre.run("verify:verify", {
		address: deployCosmicSignatureContractsReportObject.marketingWalletAddress,
		constructorArguments: [deployCosmicSignatureContractsReportObject.cosmicSignatureTokenAddress,],
	});

	console.info("%s", `${nodeOsModule.EOL}Registering CharityWallet.`);
	await hre.run("verify:verify", {
		address: deployCosmicSignatureContractsReportObject.charityWalletAddress,
		// constructorArguments: [],
	});

	console.info("%s", `${nodeOsModule.EOL}Registering CosmicSignatureDao.`);
	await hre.run("verify:verify", {
		address: deployCosmicSignatureContractsReportObject.cosmicSignatureDaoAddress,
		constructorArguments: [deployCosmicSignatureContractsReportObject.cosmicSignatureTokenAddress,],
	});

	// console.info("%s", `${nodeOsModule.EOL}Registering ${deployConfigObject.cosmicSignatureGameContractName} implementation.`);
	// await hre.run("verify:verify", {
	// 	address: deployCosmicSignatureContractsReportObject.cosmicSignatureGameImplementationAddress,
	// 	// constructorArguments: [],
	// });

	// Performing the more likely to fail registration the last.
	console.info("%s", `${nodeOsModule.EOL}Registering ${deployConfigObject.cosmicSignatureGameContractName} proxy and implementation.`);
	try {
		await hre.run("verify:verify", {
			address: deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress,
			// constructorArguments: [],
		});
	} catch (errorObject) {
		// [Comment-202509125/]
		{
			const regExpPattern =
				"^\\s*Verification completed with the following errors\\.\\s*" +
				"Error 1\\: Failed to verify ERC1967Proxy contract at " +
				deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress +
				"\\: Already Verified\\s*$";
			const regExp = new RegExp(regExpPattern, "s");
			if ( ! regExp.test(errorObject.message) ) {
				throw errorObject;
			}
			console.warn("%s", "Warning. Ignored the following error:");
			console.warn("%o", errorObject);
		}
	}

	console.info("%s", `${nodeOsModule.EOL}Done.`);
})
	.addParam("deployconfigfilepath", "Deployment configuration file (JSON) path");

task("upgrade-cosmic-signature-game", "Upgrades the CosmicSignatureGame contract to a new version", async (args, hre) => {
	console.info();
	const upgradeConfigFilePath = args.upgradeconfigfilepath;
	const upgradeConfigJsonString = await nodeFsModule.promises.readFile(upgradeConfigFilePath, "utf8");
	const upgradeConfigObject = JSON.parse(upgradeConfigJsonString);

	// Issue. This logic will work correct only when upgrading from the initially deployed version.
	// To support subsequent upgrades, this logic will need revisiting.
	if (upgradeConfigObject.newCosmicSignatureGameContractVersionNumber != 2) {
		throw new Error("We do not support subsequent contract upgrades.");
	}

	if (nodeFsModule.existsSync(upgradeConfigObject.reportFilePath)) {
		throw new Error(`"${upgradeConfigObject.reportFilePath}" already exists.`);
	}
	const deployConfigJsonString = await nodeFsModule.promises.readFile(upgradeConfigObject.deploymentConfigurationFilePath, "utf8");
	const deployConfigObject = JSON.parse(deployConfigJsonString);
	if (deployConfigObject.deployerPrivateKey.length <= 0) {
		deployConfigObject.deployerPrivateKey = vars.get(`deployerPrivateKey_${hre.network.name}`);
	}
	const deployCosmicSignatureContractsReportJsonString = await nodeFsModule.promises.readFile(deployConfigObject.reportFilePath, "utf8");
	const deployCosmicSignatureContractsReportObject = JSON.parse(deployCosmicSignatureContractsReportJsonString);
	const deployerSigner = new hre.ethers.Wallet(deployConfigObject.deployerPrivateKey, hre.ethers.provider);

	await hre.run("compile");
	console.info();

	const cosmicSignatureGameFactory =
		await hre.ethers.getContractFactory(deployConfigObject.cosmicSignatureGameContractName, deployerSigner);
	const cosmicSignatureGameProxy = cosmicSignatureGameFactory.attach(deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress);
	const newCosmicSignatureGameFactory =
		await hre.ethers.getContractFactory(upgradeConfigObject.newCosmicSignatureGameContractName, deployerSigner);
	const upgradeProxyOptions = {kind: "uups",};
	if (upgradeConfigObject.newInitializerMethodName.length > 0) {
		upgradeProxyOptions.call = upgradeConfigObject.newInitializerMethodName;
	}
	console.info("%s", `Upgrading ${deployConfigObject.cosmicSignatureGameContractName} to ${upgradeConfigObject.newCosmicSignatureGameContractName}.`);
	const newCosmicSignatureGameProxy =
		await hre.upgrades.upgradeProxy(cosmicSignatureGameProxy, newCosmicSignatureGameFactory, upgradeProxyOptions);
	// await newCosmicSignatureGameProxy.waitForDeployment();

	// Issue. As per Comment-202510208, the transaction is still being mined.
	// Therefore "probably".
	console.info("%s", "Probably upgraded.");

	const reportObject = {
		newCosmicSignatureGameImplementationAddress: await safeErc1967GetChangedImplementationAddress(deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress, deployCosmicSignatureContractsReportObject.cosmicSignatureGameImplementationAddress),
	};
	console.info();
	const reportJsonString = JSON.stringify(reportObject, null, 3);
	try {
		await nodeFsModule.promises.mkdir(nodePathModule.dirname(upgradeConfigObject.reportFilePath), {recursive: true,});
		await nodeFsModule.promises.writeFile(upgradeConfigObject.reportFilePath, reportJsonString);
	} catch (errorObject) {
		console.info("%s", "Report:");
		console.info("%s", reportJsonString);
		console.error();
		throw errorObject;
	}
	console.info("%s", `Done. Report saved to "${upgradeConfigObject.reportFilePath}".${nodeOsModule.EOL}`);
})
	.addParam("upgradeconfigfilepath", "Upgrade configuration file (JSON) path");

task("register-upgraded-cosmic-signature-game", "Verifies and registers a newly upgraded CosmicSignatureGame contract", async (args, hre) => {
	const upgradeConfigFilePath = args.upgradeconfigfilepath;
	const upgradeConfigJsonString = await nodeFsModule.promises.readFile(upgradeConfigFilePath, "utf8");
	const upgradeConfigObject = JSON.parse(upgradeConfigJsonString);
	const upgradeCosmicSignatureGameReportJsonString = await nodeFsModule.promises.readFile(upgradeConfigObject.reportFilePath, "utf8");
	const upgradeCosmicSignatureGameReportObject = JSON.parse(upgradeCosmicSignatureGameReportJsonString);
	hre.config.etherscan.apiKey = vars.get(`etherScanApiKey_${hre.network.name}`);

	console.info("%s", `${nodeOsModule.EOL}Registering ${upgradeConfigObject.newCosmicSignatureGameContractName} implementation.`);
	await hre.run("verify:verify", {
		address: upgradeCosmicSignatureGameReportObject.newCosmicSignatureGameImplementationAddress,
		// constructorArguments: [],
	});

	console.info("%s", `${nodeOsModule.EOL}Done.`);
})
	.addParam("upgradeconfigfilepath", "Upgrade configuration file (JSON) path");
