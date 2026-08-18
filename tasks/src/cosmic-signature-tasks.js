"use strict";

const nodeOsModule = require("node:os");
const nodePathModule = require("node:path");
const nodeFsModule = require("node:fs");
const { vars, task } = require("hardhat/config");

// Comment-202409255 relates.
const { waitForTransactionReceipt, safeErc1967GetChangedImplementationAddress } = require("../../src/Helpers.js");

// Comment-202409255 relates.
const { deployContractsAdvanced, deployCosmicSignatureGameV3Modules, /*setRoundActivationTimeIfNeeded,*/ } = require("../../src/ContractDeploymentHelpers.js");

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
	// Issue. But would it be better to perform it first?
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
	if (nodeFsModule.existsSync(upgradeConfigObject.reportFilePath)) {
		throw new Error(`"${upgradeConfigObject.reportFilePath}" already exists.`);
	}
	const deployConfigJsonString = await nodeFsModule.promises.readFile(upgradeConfigObject.deploymentConfigurationFilePath, "utf8");
	const deployConfigObject = JSON.parse(deployConfigJsonString);
	if (deployConfigObject.deployerPrivateKey.length <= 0) {
		deployConfigObject.deployerPrivateKey = vars.get(`deployerPrivateKey_${hre.network.name}`);
	}

	// [Comment-202608126]
	// The deployment report file is not committed to the repo, so it only exists on the machine that ran the deployment.
	// To make it possible to run an upgrade from any machine, the upgrade configuration file may provide
	// the game proxy address explicitly. Otherwise we take it from the deployment report, like we did before.
	// [/Comment-202608126]
	let cosmicSignatureGameProxyAddress_;
	if ((upgradeConfigObject.cosmicSignatureGameProxyAddress ?? "").length > 0) {
		cosmicSignatureGameProxyAddress_ = upgradeConfigObject.cosmicSignatureGameProxyAddress;
	} else {
		const deployCosmicSignatureContractsReportJsonString = await nodeFsModule.promises.readFile(deployConfigObject.reportFilePath, "utf8");
		const deployCosmicSignatureContractsReportObject = JSON.parse(deployCosmicSignatureContractsReportJsonString);
		cosmicSignatureGameProxyAddress_ = deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress;
	}
	console.info(/*"%s",*/ "Game proxy address:", cosmicSignatureGameProxyAddress_);
	const deployerSigner = new hre.ethers.Wallet(deployConfigObject.deployerPrivateKey, hre.ethers.provider);

	await hre.run("compile");
	console.info();

	// [Comment-202608127]
	// The OpenZeppelin Hardhat Upgrades network manifest (the ".openzeppelin" folder) is not committed to the repo,
	// so it only exists on the machine that ran the previous deployment or upgrade. Without it, `upgradeProxy` fails.
	// If the upgrade configuration file provides `existingCosmicSignatureGameContractName`
	// (the name of the currently deployed contract version, e.g. "CosmicSignatureGameV2"),
	// we (re)create the manifest entry for the proxy and its current implementation with `forceImport`.
	// Comment-202608126 relates.
	// [/Comment-202608127]
	if ((upgradeConfigObject.existingCosmicSignatureGameContractName ?? "").length > 0) {
		console.info("%s", `Force-importing the proxy and its current implementation, ${upgradeConfigObject.existingCosmicSignatureGameContractName}, into the OpenZeppelin network manifest.`);
		const existingCosmicSignatureGameFactory =
			await hre.ethers.getContractFactory(upgradeConfigObject.existingCosmicSignatureGameContractName, deployerSigner);
		await hre.upgrades.forceImport(cosmicSignatureGameProxyAddress_, existingCosmicSignatureGameFactory, {kind: "uups",});
	}

	// // Testing.
	// {
	// 	const cosmicSignatureGameFactory =
	// 		await hre.ethers.getContractFactory(deployConfigObject.cosmicSignatureGameContractName, deployerSigner);
	// 	const cosmicSignatureGameProxy = cosmicSignatureGameFactory.attach(deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress);
	// 	await setRoundActivationTimeIfNeeded(cosmicSignatureGameProxy, 60n);
	// }

	const newCosmicSignatureGameFactory =
		await hre.ethers.getContractFactory(upgradeConfigObject.newCosmicSignatureGameContractName, deployerSigner);
	const upgradeProxyOptions =
		{
			kind: "uups",
			unsafeAllowRenames: upgradeConfigObject.unsafeAllowRenames,
			unsafeSkipStorageCheck: upgradeConfigObject.unsafeSkipStorageCheck,
		};
	if (upgradeConfigObject.newInitializerMethodName.length > 0) {
		upgradeProxyOptions.call = upgradeConfigObject.newInitializerMethodName;
	}

	// [Comment-202608254]
	// In V3+, the Game consists of a UUPS implementation contract plus 2 delegatecall modules
	// (Comment-202608245). When the upgrade configuration file sets `deployCosmicSignatureGameV3Modules`,
	// we deploy the modules first, in the reverse of the fallback forwarding chain order (Comment-202608246),
	// and pass the admin and prizes module addresses to the implementation constructor as immutables.
	// The modules are plain non-upgradeable contracts, so they are deployed directly, not through
	// the OpenZeppelin Upgrades plugin; only the implementation is plugin-managed. Comment-202608253 applies.
	// [/Comment-202608254]
	let cosmicSignatureGameModuleAddresses_ = undefined;
	if (upgradeConfigObject.deployCosmicSignatureGameV3Modules) {
		console.info("%s", "Deploying the CosmicSignatureGame V3 delegatecall modules.");
		const modules_ = await deployCosmicSignatureGameV3Modules(deployerSigner);
		console.info(/*"%s",*/ "CosmicSignatureGamePrizesModuleV3 address:", modules_.cosmicSignatureGamePrizesModuleAddress);
		console.info(/*"%s",*/ "CosmicSignatureGameAdminModuleV3 address:", modules_.cosmicSignatureGameAdminModuleAddress);
		upgradeProxyOptions.constructorArgs = [modules_.cosmicSignatureGameAdminModuleAddress, modules_.cosmicSignatureGamePrizesModuleAddress,];
		cosmicSignatureGameModuleAddresses_ = {
			cosmicSignatureGameAdminModuleAddress: modules_.cosmicSignatureGameAdminModuleAddress,
			cosmicSignatureGamePrizesModuleAddress: modules_.cosmicSignatureGamePrizesModuleAddress,
		};
	}

	// [Comment-202606198]
	// This will be different from the deployment report's `cosmicSignatureGameImplementationAddress`
	// if we are upgrading to V3+. It's possible to get this from the previous version deployment or upgrade report,
	// but keeping it simple.
	// [/Comment-202606198]
	const existingCosmicSignatureGameImplementationAddress = await hre.upgrades.erc1967.getImplementationAddress(cosmicSignatureGameProxyAddress_);

	console.info("%s", `Upgrading to ${upgradeConfigObject.newCosmicSignatureGameContractName}.`);
	// const newCosmicSignatureGameProxy =
		await hre.upgrades.upgradeProxy(cosmicSignatureGameProxyAddress_, newCosmicSignatureGameFactory, upgradeProxyOptions);
	// await newCosmicSignatureGameProxy.waitForDeployment();

	// Issue. As per Comment-202510208, the transaction is still being mined.
	console.info("%s", "Submitted an upgrade transaction.");

	const reportObject = {
		newCosmicSignatureGameImplementationAddress: await safeErc1967GetChangedImplementationAddress(cosmicSignatureGameProxyAddress_, existingCosmicSignatureGameImplementationAddress),

		// Comment-202608254 applies.
		...(cosmicSignatureGameModuleAddresses_ ?? {}),
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

	// todo-0 I have reviewed this code. Now test it.
	// todo-0 Execute this code in the production.
	// // [Comment-202607153]
	// // Pairing the new game contract with a fresh `PrizesWallet`.
	// // The round must still be inactive for `setPrizesWallet` to succeed.
	// // Comment-202607156 relates.
	// // [/Comment-202607153]
	// {
	// 	console.info("%s", `${nodeOsModule.EOL}Deploying a new PrizesWallet.`);
	// 	const prizesWalletFactory = await hre.ethers.getContractFactory("PrizesWallet", deployerSigner);
	// 	const newPrizesWallet = await prizesWalletFactory.deploy(cosmicSignatureGameProxyAddress_);
	// 	await newPrizesWallet.waitForDeployment();
	// 	const newPrizesWalletAddress = await newPrizesWallet.getAddress();
	// 	console.info(/*"%s",*/ "New PrizesWallet address:", newPrizesWalletAddress);
	// 
	// 	console.info("%s", "Pointing the game proxy contract at the new PrizesWallet.");
	// 	const newCosmicSignatureGameProxy =
	// 		newCosmicSignatureGameFactory.attach(cosmicSignatureGameProxyAddress_);
	// 	await waitForTransactionReceipt(newCosmicSignatureGameProxy.setPrizesWallet(newPrizesWalletAddress));
	// 
	// 	console.info("%s", "Done.");
	// 	console.info(
	// 		"%s",
	// 		`${nodeOsModule.EOL}Reminder. Update the PrizesWallet address in "${deployConfigObject.reportFilePath}" and any its copies, as well as on the web site.`
	// 	);
	// }
})
	.addParam("upgradeconfigfilepath", "Upgrade configuration file (JSON) path");

task("register-upgraded-cosmic-signature-game", "Verifies and registers a newly upgraded CosmicSignatureGame contract", async (args, hre) => {
	const upgradeConfigFilePath = args.upgradeconfigfilepath;
	const upgradeConfigJsonString = await nodeFsModule.promises.readFile(upgradeConfigFilePath, "utf8");
	const upgradeConfigObject = JSON.parse(upgradeConfigJsonString);
	const upgradeCosmicSignatureGameReportJsonString = await nodeFsModule.promises.readFile(upgradeConfigObject.reportFilePath, "utf8");
	const upgradeCosmicSignatureGameReportObject = JSON.parse(upgradeCosmicSignatureGameReportJsonString);
	hre.config.etherscan.apiKey = vars.get(`etherScanApiKey_${hre.network.name}`);

	// Comment-202608254 applies.
	if ((upgradeCosmicSignatureGameReportObject.cosmicSignatureGamePrizesModuleAddress ?? "").length > 0) {
		console.info("%s", `${nodeOsModule.EOL}Registering CosmicSignatureGamePrizesModuleV3.`);
		await hre.run("verify:verify", {
			address: upgradeCosmicSignatureGameReportObject.cosmicSignatureGamePrizesModuleAddress,
			constructorArguments: [],
		});

		console.info("%s", `${nodeOsModule.EOL}Registering CosmicSignatureGameAdminModuleV3.`);
		await hre.run("verify:verify", {
			address: upgradeCosmicSignatureGameReportObject.cosmicSignatureGameAdminModuleAddress,
			constructorArguments: [upgradeCosmicSignatureGameReportObject.cosmicSignatureGamePrizesModuleAddress,],
		});
	}

	console.info("%s", `${nodeOsModule.EOL}Registering ${upgradeConfigObject.newCosmicSignatureGameContractName} implementation.`);
	await hre.run("verify:verify", {
		address: upgradeCosmicSignatureGameReportObject.newCosmicSignatureGameImplementationAddress,

		// Comment-202608254 applies.
		constructorArguments:
			((upgradeCosmicSignatureGameReportObject.cosmicSignatureGameAdminModuleAddress ?? "").length > 0) ?
			[
				upgradeCosmicSignatureGameReportObject.cosmicSignatureGameAdminModuleAddress,
				upgradeCosmicSignatureGameReportObject.cosmicSignatureGamePrizesModuleAddress,
			] :
			[],
	});

	// todo-0 I have reviewed this code. Now test it.
	// todo-0 Execute this code in the production.
	// // [Comment-202607156]
	// // Registering the new `PrizesWallet` deployed near Comment-202607153.
	// // Before running this, edit the hardcoded addresses.
	// // [/Comment-202607156]
	// {
	// 	// Remember to provide this value.
	// 	const cosmicSignatureGameProxyAddress = "0x0000000000000000000000000000000000000000";
	// 
	// 	// Remember to provide this value.
	// 	// Take it from the upgrade-cosmic-signature-game task console output.
	// 	const newPrizesWalletAddress = "0x0000000000000000000000000000000000000000";
	// 
	// 	console.info("%s", `${nodeOsModule.EOL}Registering PrizesWallet.`);
	// 	await hre.run("verify:verify", {
	// 		address: newPrizesWalletAddress,
	// 		constructorArguments: [cosmicSignatureGameProxyAddress,],
	// 	});
	// }

	console.info("%s", `${nodeOsModule.EOL}Done.`);
})
	.addParam("upgradeconfigfilepath", "Upgrade configuration file (JSON) path");
