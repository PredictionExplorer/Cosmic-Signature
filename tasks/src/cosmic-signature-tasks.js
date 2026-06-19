"use strict";

const nodeOsModule = require("node:os");
const nodePathModule = require("node:path");
const nodeFsModule = require("node:fs");
const nodeCryptoModule = require("node:crypto");
const { vars, task } = require("hardhat/config");

// Comment-202409255 relates.
const { waitForTransactionReceipt, safeErc1967GetChangedImplementationAddress } = require("../../src/Helpers.js");

// Comment-202409255 relates.
const { deployContractsAdvanced } = require("../../src/ContractDeploymentHelpers.js");

const repoRoot = nodePathModule.resolve(__dirname, "../..");
const V2_EXPECTED_CST_DUTCH_AUCTION_DURATION = 12n * 60n * 60n;
const V2_EXPECTED_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR = 250n;
const V2_EXPECTED_BID_CST_REWARD_AMOUNT_MULTIPLIER = 10800000000000000000000000000000000000000000000n;
const V2_EXPECTED_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE = 2n * 24n * 60n * 60n;
const EXPECTED_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES = 5n * 7n * 24n * 60n * 60n;

function resolveRelativeToConfig(configFilePath_, referencedPath_) {
	return nodePathModule.resolve(nodePathModule.dirname(configFilePath_), referencedPath_);
}

function sha256File(filePath_) {
	return nodeCryptoModule.createHash("sha256").update(nodeFsModule.readFileSync(filePath_)).digest("hex");
}

function sha256String(value_) {
	return nodeCryptoModule.createHash("sha256").update(value_).digest("hex");
}

function assertEqualStrings(actual_, expected_, message_) {
	if (String(actual_).toLowerCase() != String(expected_).toLowerCase()) {
		throw new Error(`${message_}: expected ${expected_}, got ${actual_}.`);
	}
}

function assertBigIntEqual(actual_, expected_, message_) {
	if (BigInt(actual_) != BigInt(expected_)) {
		throw new Error(`${message_}: expected ${expected_}, got ${actual_}.`);
	}
}

function normalizePreparedImplementationAddress(preparedImplementation_) {
	return (typeof preparedImplementation_ == "string") ? preparedImplementation_ : preparedImplementation_.getAddress();
}

async function expectSelectorToRevert(hre, proxyAddress_, selector_, label_) {
	try {
		await hre.ethers.provider.call({to: proxyAddress_, data: selector_});
	} catch {
		return;
	}
	throw new Error(`Unexpectedly successful call to removed V1 selector ${label_}.`);
}

async function expectCallToRevert(hre, txRequest_, label_) {
	try {
		await hre.ethers.provider.call(txRequest_);
	} catch {
		return;
	}
	throw new Error(`Unexpectedly successful call: ${label_}.`);
}

async function readV1BidRewardAmount(hre, gameV1_, proxyAddress_) {
	const deployedV1Interface = new hre.ethers.Interface(["function cstRewardAmountForBidding() view returns (uint256)"]);
	try {
		return deployedV1Interface.decodeFunctionResult(
			"cstRewardAmountForBidding",
			await hre.ethers.provider.call({
				to: proxyAddress_,
				data: deployedV1Interface.encodeFunctionData("cstRewardAmountForBidding", []),
			})
		)[0];
	} catch {
		return await gameV1_.bidCstRewardAmount();
	}
}

function loadAndValidateStorageProof(upgradeConfigFilePath_, upgradeConfigObject_, upgradeConfigJsonString_) {
	if ( ! (upgradeConfigObject_.unsafeAllowRenames || upgradeConfigObject_.unsafeSkipStorageCheck) ) {
		return undefined;
	}
	if ((upgradeConfigObject_.storageLayoutProofFilePath ?? "").length <= 0) {
		throw new Error("Unsafe storage options require `storageLayoutProofFilePath`.");
	}
	const proofFilePath_ = resolveRelativeToConfig(upgradeConfigFilePath_, upgradeConfigObject_.storageLayoutProofFilePath);
	const proofJsonString_ = nodeFsModule.readFileSync(proofFilePath_, "utf8");
	const proofObject_ = JSON.parse(proofJsonString_);
	if (proofObject_.format != "cosmic-signature-v1-v2-storage-layout-proof-v1") {
		throw new Error("Unexpected storage-layout proof format.");
	}
	if (proofObject_.result != "STORAGE_LAYOUT_VERIFICATION_OK") {
		throw new Error("Storage-layout proof is not successful.");
	}
	if ( ! proofObject_.deployedV1Compared ) {
		throw new Error("Storage-layout proof did not compare deployed V1.");
	}
	if (proofObject_.sources?.v2Game?.sha256 != sha256File(nodePathModule.join(repoRoot, "contracts/production/CosmicSignatureGameV2.sol"))) {
		throw new Error("Storage-layout proof is stale for CosmicSignatureGameV2.sol.");
	}
	if (proofObject_.sources?.v2Storage?.sha256 != sha256File(nodePathModule.join(repoRoot, "contracts/production/CosmicSignatureGameStorageV2.sol"))) {
		throw new Error("Storage-layout proof is stale for CosmicSignatureGameStorageV2.sol.");
	}
	if (proofObject_.sources?.refactoredV1Game?.sha256 != sha256File(nodePathModule.join(repoRoot, "contracts/production/CosmicSignatureGame.sol"))) {
		throw new Error("Storage-layout proof is stale for CosmicSignatureGame.sol.");
	}
	if (proofObject_.repurposedVariables?.cstDutchAuctionDuration?.slot === undefined ||
	    proofObject_.repurposedVariables?.bidCstRewardAmountMultiplier?.slot === undefined ||
	    proofObject_.v2NewVariable?.slot === undefined) {
		throw new Error("Storage-layout proof is missing required V2 slot records.");
	}
	return {
		filePath: proofFilePath_,
		sha256: sha256String(proofJsonString_),
		object: proofObject_,
		upgradeConfigSha256: sha256String(upgradeConfigJsonString_),
	};
}

async function snapshotAndValidateV2UpgradePreflight(hre, deployerSigner_, proxyAddress_, deployReportObject_, storageProof_) {
	const gameV1_ = await hre.ethers.getContractAt("CosmicSignatureGame", proxyAddress_, deployerSigner_);
	const ownerAddress_ = await gameV1_.owner();
	assertEqualStrings(deployerSigner_.address, ownerAddress_, "Deployer signer is not the game owner");
	assertEqualStrings(await gameV1_.token(), deployReportObject_.cosmicSignatureTokenAddress, "Deploy report token address mismatch");
	assertEqualStrings(await gameV1_.randomWalkNft(), deployReportObject_.randomWalkNftAddress, "Deploy report RandomWalkNFT address mismatch");
	assertEqualStrings(await gameV1_.nft(), deployReportObject_.cosmicSignatureNftAddress, "Deploy report CosmicSignatureNft address mismatch");
	assertEqualStrings(await gameV1_.prizesWallet(), deployReportObject_.prizesWalletAddress, "Deploy report PrizesWallet address mismatch");
	assertEqualStrings(await gameV1_.stakingWalletRandomWalkNft(), deployReportObject_.stakingWalletRandomWalkNftAddress, "Deploy report staking wallet RandomWalkNFT address mismatch");
	assertEqualStrings(await gameV1_.stakingWalletCosmicSignatureNft(), deployReportObject_.stakingWalletCosmicSignatureNftAddress, "Deploy report staking wallet CosmicSignatureNft address mismatch");
	assertEqualStrings(await gameV1_.marketingWallet(), deployReportObject_.marketingWalletAddress, "Deploy report marketing wallet address mismatch");
	assertEqualStrings(await gameV1_.charityAddress(), deployReportObject_.charityWalletAddress, "Deploy report charity wallet address mismatch");

	const existingImplementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(proxyAddress_);
	assertEqualStrings(existingImplementationAddress_, deployReportObject_.cosmicSignatureGameImplementationAddress, "Deploy report implementation address mismatch");

	const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	const roundNum_ = await gameV1_.roundNum();
	const lastBidderAddress_ = await gameV1_.lastBidderAddress();
	const roundActivationTime_ = await gameV1_.roundActivationTime();
	const ethDutchAuctionBeginningBidPrice_ = await gameV1_.ethDutchAuctionBeginningBidPrice();
	const cstDutchAuctionBeginningBidPriceMinLimit_ = await gameV1_.cstDutchAuctionBeginningBidPriceMinLimit();
	const nextRoundFirstCstDutchAuctionBeginningBidPrice_ = await gameV1_.nextRoundFirstCstDutchAuctionBeginningBidPrice();
	const cstDutchAuctionDurationDivisor_ = await gameV1_.cstDutchAuctionDurationDivisor();
	const cstRewardAmountForBidding_ = await readV1BidRewardAmount(hre, gameV1_, proxyAddress_);

	if ( ! (roundNum_ > 0n) ) throw new Error("Cannot upgrade to V2 before round 0 has completed.");
	assertEqualStrings(lastBidderAddress_, hre.ethers.ZeroAddress, "Cannot upgrade to V2 after a bid has been placed in the current round");
	if ( ! (BigInt(latestBlock_.timestamp) < roundActivationTime_) ) throw new Error("Cannot upgrade while the current round is active.");
	if ( ! (ethDutchAuctionBeginningBidPrice_ > 0n) ) throw new Error("Cannot upgrade to V2 with zero ETH Dutch auction beginning bid price.");
	if ( ! (cstDutchAuctionBeginningBidPriceMinLimit_ <= nextRoundFirstCstDutchAuctionBeginningBidPrice_) ) {
		throw new Error("CST beginning bid price minimum exceeds the cached next-round first CST price.");
	}

	const prizesWallet_ = await hre.ethers.getContractAt("PrizesWallet", deployReportObject_.prizesWalletAddress, deployerSigner_);
	assertBigIntEqual(await prizesWallet_.timeoutDurationToWithdrawPrizes(), EXPECTED_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES, "Unexpected PrizesWallet timeoutDurationToWithdrawPrizes");

	const cstDurationSlot_ = BigInt(storageProof_.object.repurposedVariables.cstDutchAuctionDuration.slot);
	const rewardSlot_ = BigInt(storageProof_.object.repurposedVariables.bidCstRewardAmountMultiplier.slot);
	const changeDivisorSlot_ = BigInt(storageProof_.object.v2NewVariable.slot);
	assertBigIntEqual(await hre.ethers.provider.getStorage(proxyAddress_, cstDurationSlot_), cstDutchAuctionDurationDivisor_, "Raw CST duration slot does not match V1 getter");
	assertBigIntEqual(await hre.ethers.provider.getStorage(proxyAddress_, rewardSlot_), cstRewardAmountForBidding_, "Raw CST reward slot does not match V1 getter");
	assertBigIntEqual(await hre.ethers.provider.getStorage(proxyAddress_, changeDivisorSlot_), 0n, "V2 new storage slot is not empty before upgrade");

	return {
		blockNumber: latestBlock_.number,
		blockTimestamp: latestBlock_.timestamp,
		ownerAddress: ownerAddress_,
		existingImplementationAddress: existingImplementationAddress_,
		roundNum: roundNum_.toString(),
		roundActivationTime: roundActivationTime_.toString(),
		ethDutchAuctionBeginningBidPrice: ethDutchAuctionBeginningBidPrice_.toString(),
		cstDutchAuctionDurationDivisor: cstDutchAuctionDurationDivisor_.toString(),
		cstRewardAmountForBidding: cstRewardAmountForBidding_.toString(),
		cstDutchAuctionBeginningBidPriceMinLimit: cstDutchAuctionBeginningBidPriceMinLimit_.toString(),
		nextRoundFirstCstDutchAuctionBeginningBidPrice: nextRoundFirstCstDutchAuctionBeginningBidPrice_.toString(),
		prizesWalletTimeoutDurationToWithdrawPrizes: EXPECTED_TIMEOUT_DURATION_TO_WITHDRAW_PRIZES.toString(),
		rawSlots: {
			cstDutchAuctionDurationSlot: cstDurationSlot_.toString(),
			bidCstRewardAmountMultiplierSlot: rewardSlot_.toString(),
			cstDutchAuctionDurationChangeDivisorSlot: changeDivisorSlot_.toString(),
		},
	};
}

async function verifyV2UpgradePostState(hre, deployerSigner_, proxyAddress_, deployReportObject_, newImplementationAddress_, storageProof_) {
	const gameV2_ = await hre.ethers.getContractAt("CosmicSignatureGameV2", proxyAddress_, deployerSigner_);
	assertEqualStrings(await hre.upgrades.erc1967.getImplementationAddress(proxyAddress_), newImplementationAddress_, "Proxy implementation after upgrade mismatch");
	assertEqualStrings(await gameV2_.owner(), deployerSigner_.address, "Owner changed during upgrade");
	assertEqualStrings(await gameV2_.token(), deployReportObject_.cosmicSignatureTokenAddress, "Token address changed during upgrade");
	assertEqualStrings(await gameV2_.randomWalkNft(), deployReportObject_.randomWalkNftAddress, "RandomWalkNFT address changed during upgrade");
	assertEqualStrings(await gameV2_.nft(), deployReportObject_.cosmicSignatureNftAddress, "CosmicSignatureNft address changed during upgrade");
	assertEqualStrings(await gameV2_.prizesWallet(), deployReportObject_.prizesWalletAddress, "PrizesWallet address changed during upgrade");
	assertEqualStrings(await gameV2_.stakingWalletRandomWalkNft(), deployReportObject_.stakingWalletRandomWalkNftAddress, "StakingWalletRandomWalkNft address changed during upgrade");
	assertEqualStrings(await gameV2_.stakingWalletCosmicSignatureNft(), deployReportObject_.stakingWalletCosmicSignatureNftAddress, "StakingWalletCosmicSignatureNft address changed during upgrade");
	assertEqualStrings(await gameV2_.marketingWallet(), deployReportObject_.marketingWalletAddress, "Marketing wallet address changed during upgrade");
	assertEqualStrings(await gameV2_.charityAddress(), deployReportObject_.charityWalletAddress, "Charity address changed during upgrade");

	assertBigIntEqual(await gameV2_.cstDutchAuctionDuration(), V2_EXPECTED_CST_DUTCH_AUCTION_DURATION, "Bad V2 cstDutchAuctionDuration");
	assertBigIntEqual(await gameV2_.cstDutchAuctionDurationChangeDivisor(), V2_EXPECTED_CST_DUTCH_AUCTION_DURATION_CHANGE_DIVISOR, "Bad V2 cstDutchAuctionDurationChangeDivisor");
	assertBigIntEqual(await gameV2_.bidCstRewardAmountMultiplier(), V2_EXPECTED_BID_CST_REWARD_AMOUNT_MULTIPLIER, "Bad V2 bidCstRewardAmountMultiplier");
	assertBigIntEqual(await gameV2_.timeoutDurationToClaimMainPrize(), V2_EXPECTED_TIMEOUT_DURATION_TO_CLAIM_MAIN_PRIZE, "Bad V2 timeoutDurationToClaimMainPrize");
	if ( ! ((await gameV2_.getNextEthBidPrice()) > 0n) ) throw new Error("V2 getNextEthBidPrice returned zero.");

	await expectSelectorToRevert(hre, proxyAddress_, hre.ethers.id("cstDutchAuctionDurationDivisor()").slice(0, 10), "cstDutchAuctionDurationDivisor()");
	await expectSelectorToRevert(hre, proxyAddress_, hre.ethers.id("cstRewardAmountForBidding()").slice(0, 10), "cstRewardAmountForBidding()");
	await expectSelectorToRevert(hre, proxyAddress_, hre.ethers.id("bidCstRewardAmount()").slice(0, 10), "bidCstRewardAmount()");
	await expectSelectorToRevert(hre, proxyAddress_, hre.ethers.id("bidWithEth(int256,string)").slice(0, 10), "bidWithEth(int256,string)");
	await expectCallToRevert(
		hre,
		{
			to: proxyAddress_,
			from: deployerSigner_.address,
			data: gameV2_.interface.encodeFunctionData("initializeV2", []),
		},
		"second initializeV2"
	);

	const cstDurationSlot_ = BigInt(storageProof_.object.repurposedVariables.cstDutchAuctionDuration.slot);
	const rewardSlot_ = BigInt(storageProof_.object.repurposedVariables.bidCstRewardAmountMultiplier.slot);
	const changeDivisorSlot_ = BigInt(storageProof_.object.v2NewVariable.slot);
	assertBigIntEqual(await hre.ethers.provider.getStorage(proxyAddress_, cstDurationSlot_), await gameV2_.cstDutchAuctionDuration(), "Raw CST duration slot does not match V2 getter");
	assertBigIntEqual(await hre.ethers.provider.getStorage(proxyAddress_, rewardSlot_), await gameV2_.bidCstRewardAmountMultiplier(), "Raw CST reward multiplier slot does not match V2 getter");
	assertBigIntEqual(await hre.ethers.provider.getStorage(proxyAddress_, changeDivisorSlot_), await gameV2_.cstDutchAuctionDurationChangeDivisor(), "Raw CST duration change divisor slot does not match V2 getter");

	const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	return {
		blockNumber: latestBlock_.number,
		blockTimestamp: latestBlock_.timestamp,
		cstDutchAuctionDuration: (await gameV2_.cstDutchAuctionDuration()).toString(),
		cstDutchAuctionDurationChangeDivisor: (await gameV2_.cstDutchAuctionDurationChangeDivisor()).toString(),
		bidCstRewardAmountMultiplier: (await gameV2_.bidCstRewardAmountMultiplier()).toString(),
		timeoutDurationToClaimMainPrize: (await gameV2_.timeoutDurationToClaimMainPrize()).toString(),
		nextEthBidPrice: (await gameV2_.getNextEthBidPrice()).toString(),
	};
}

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
	const deployCosmicSignatureContractsReportJsonString = await nodeFsModule.promises.readFile(deployConfigObject.reportFilePath, "utf8");
	const deployCosmicSignatureContractsReportObject = JSON.parse(deployCosmicSignatureContractsReportJsonString);
	const deployerSigner = new hre.ethers.Wallet(deployConfigObject.deployerPrivateKey, hre.ethers.provider);
	const isCosmicSignatureGameV2Upgrade = upgradeConfigObject.newCosmicSignatureGameContractName == "CosmicSignatureGameV2";
	if (isCosmicSignatureGameV2Upgrade) {
		if (upgradeConfigObject.newInitializerMethodName != "initializeV2") {
			throw new Error("CosmicSignatureGameV2 upgrades must call initializeV2.");
		}
		if (upgradeConfigObject.unsafeAllowRenames != upgradeConfigObject.unsafeSkipStorageCheck) {
			throw new Error("CosmicSignatureGameV2 unsafeAllowRenames and unsafeSkipStorageCheck must be enabled or disabled together.");
		}
	}
	const storageProof =
		(isCosmicSignatureGameV2Upgrade && (upgradeConfigObject.unsafeAllowRenames || upgradeConfigObject.unsafeSkipStorageCheck)) ?
		loadAndValidateStorageProof(upgradeConfigFilePath, upgradeConfigObject, upgradeConfigJsonString) :
		undefined;

	await hre.run("compile");
	console.info();

	// // Testing.
	// {
	// 	const cosmicSignatureGameFactory =
	// 		await hre.ethers.getContractFactory(deployConfigObject.cosmicSignatureGameContractName, deployerSigner);
	// 	const cosmicSignatureGameProxy = cosmicSignatureGameFactory.attach(deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress);
	// 	await setRoundActivationTimeIfNeeded(cosmicSignatureGameProxy, 10n);
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

	// [Comment-202606198]
	// This will be different from `deployCosmicSignatureContractsReportObject.cosmicSignatureGameImplementationAddress`
	// if we are upgrading to V3+. It's possible to get this from the previous version deployment or upgrade report,
	// but keeping it simple.
	// [/Comment-202606198]
	const existingCosmicSignatureGameImplementationAddress = await hre.upgrades.erc1967.getImplementationAddress(deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress);

	console.info("%s", `Upgrading to ${upgradeConfigObject.newCosmicSignatureGameContractName}.`);
	if (isCosmicSignatureGameV2Upgrade && storageProof) {
		const preflightSnapshot =
			await snapshotAndValidateV2UpgradePreflight(
				hre,
				deployerSigner,
				deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress,
				deployCosmicSignatureContractsReportObject,
				storageProof
			);
		console.info("%s", "V2 preflight checks passed.");
		const prepareUpgradeOptions = {
			kind: "uups",
			unsafeAllowRenames: upgradeConfigObject.unsafeAllowRenames,
			unsafeSkipStorageCheck: upgradeConfigObject.unsafeSkipStorageCheck,
		};
		const preparedImplementationAddress =
			await normalizePreparedImplementationAddress(
				await hre.upgrades.prepareUpgrade(
					deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress,
					newCosmicSignatureGameFactory,
					prepareUpgradeOptions
				)
			);
		assertEqualStrings(
			await hre.ethers.provider.getCode(preparedImplementationAddress) != "0x",
			true,
			"Prepared V2 implementation has no bytecode"
		);
		const initializeV2CallData = newCosmicSignatureGameFactory.interface.encodeFunctionData("initializeV2", []);
		const upgradeInterface = new hre.ethers.Interface(["function upgradeToAndCall(address newImplementation, bytes data) payable"]);
		const upgradeTransactionResponse =
			await deployerSigner.sendTransaction({
				to: deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress,
				data: upgradeInterface.encodeFunctionData("upgradeToAndCall", [preparedImplementationAddress, initializeV2CallData]),
			});
		console.info("%s", `Submitted upgradeToAndCall transaction ${upgradeTransactionResponse.hash}.`);
		const upgradeTransactionReceipt = await waitForTransactionReceipt(upgradeTransactionResponse);
		const postUpgradeVerification =
			await verifyV2UpgradePostState(
				hre,
				deployerSigner,
				deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress,
				deployCosmicSignatureContractsReportObject,
				preparedImplementationAddress,
				storageProof
			);
		const reportObject = {
			networkName: hre.network.name,
			chainId: hre.network.config.chainId,
			proxyAddress: deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress,
			oldCosmicSignatureGameImplementationAddress: existingCosmicSignatureGameImplementationAddress,
			newCosmicSignatureGameImplementationAddress: preparedImplementationAddress,
			upgradeTransactionHash: upgradeTransactionResponse.hash,
			upgradeTransactionBlockNumber: upgradeTransactionReceipt.blockNumber,
			upgradeTransactionGasUsed: upgradeTransactionReceipt.gasUsed.toString(),
			upgradeConfigFilePath,
			upgradeConfigSha256: sha256String(upgradeConfigJsonString),
			deployReportSha256: sha256String(deployCosmicSignatureContractsReportJsonString),
			storageLayoutProofFilePath: storageProof.filePath,
			storageLayoutProofSha256: storageProof.sha256,
			preflightSnapshot,
			postUpgradeVerification,
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
		return;
	}
	// const newCosmicSignatureGameProxy =
		await hre.upgrades.upgradeProxy(deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress, newCosmicSignatureGameFactory, upgradeProxyOptions);
	// await newCosmicSignatureGameProxy.waitForDeployment();

	// Issue. As per Comment-202510208, the transaction is still being mined.
	console.info("%s", "Submitted an upgrade transaction.");

	const reportObject = {
		newCosmicSignatureGameImplementationAddress: await safeErc1967GetChangedImplementationAddress(deployCosmicSignatureContractsReportObject.cosmicSignatureGameProxyAddress, existingCosmicSignatureGameImplementationAddress),
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
