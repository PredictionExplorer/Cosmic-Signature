// #region

"use strict";

// #endregion
// #region

const { configuration } = require("./live-blockchain-tests-configuration.js");

// #endregion
// #region

prepare1();

// #endregion
// #region

const nodeOsModule = require("node:os");
const nodeFsModule = require("node:fs");
const hre = require("hardhat");
const { vars } = require("hardhat/config");
const { generateRandomUInt256, generateAccountPrivateKeyFromSeed, uint256ToPaddedHexString, waitForTransactionReceipt } = require("../src/Helpers.js");
const { State } = require("./live-blockchain-tests-state.js");
const { runDeployCosmicSignatureContractsTask } = require("./cosmic-signature-contracts-deployment/run-deploy-cosmic-signature-contracts-task.js");

// #endregion
// #region

/// This is the hardcoded value mentioned in Comment-202508313.
const defaultAccountPrivateKeySeed = 0xa1082f7e3fd074e7664059e29acf3adb2c5ee2dd33c2bb3f7d5a7cdff0dc6665n;

const accountPrivateKeySeedSalts = {
	owner: 0xc09702ad1f6c687de525aa275debf9b72db9de68734c9250f7440e35171726efn,
	bidder1: 0x41412fc5a274fc146e3d60f10c1dfe1571ea30544ff2a66d31319bb8ed7cdc79n,
	bidder2: 0xc236c2f0d226e219570a1f79668a6f1bb30ad22bbd4b446affedbd9f69ae88fdn,
	bidder3: 0xd34f80f7e5dc79f927913501ed2a4f9e76c4bc3ff3138823372130eb82a67870n,
	charity: 0xd5fcb76fea40bc2b696ed7dfff0c1912973933322d468515c10f30819e458cabn,
	treasurer: 0x8f77872975c967ed2792a745a7b5c00c7831fdb9bea7eb3d5ce6a685c2e74035n,
};
const state = new State();

// #endregion
// #region

prepare2();
main()
	.then(() => (process.exit(0)))
	.catch((errorObject) => {
		console.error(errorObject);
		process.exit(1);
	});

// #endregion
// #region `prepare1`

function prepare1() {
	if (configuration.networkName.length > 0) {
		process.env.HARDHAT_NETWORK = configuration.networkName;
	}
}

// #endregion
// #region `prepare2`

function prepare2() {
	console.info(`${nodeOsModule.EOL}hre.network.name = ${hre.network.name}`);
	createAccountSigners();
}

// #endregion
// #region `createAccountSigners`

function createAccountSigners() {
	state.dummySigner = new hre.ethers.Wallet(uint256ToPaddedHexString(generateRandomUInt256()), hre.ethers.provider);

	{
		const accountPrivateKeySeedAsString_ = vars.get("accountPrivateKeySeed", "");
		const accountPrivateKeySeed_ = (accountPrivateKeySeedAsString_.length > 0) ? BigInt(accountPrivateKeySeedAsString_) : defaultAccountPrivateKeySeed;
		state.accountPrivateKeySeed = accountPrivateKeySeed_;
		console.info(`${nodeOsModule.EOL}accountPrivateKeySeed = ${uint256ToPaddedHexString(accountPrivateKeySeed_)}`);
		if (accountPrivateKeySeed_ == defaultAccountPrivateKeySeed) {
			console.warn("Warning. That's the default hardcoded value. Your money, fake or real, may be at risk!");
		}
	}

	console.info();
	Object.entries(accountPrivateKeySeedSalts).forEach(createAccountSigner);
}

// #endregion
// #region `createAccountSigner`

/**
 * @param {[string, bigint,]} accountPrivateKeySeedSaltEntry_
 */
function createAccountSigner(accountPrivateKeySeedSaltEntry_) {
	const [accountName_, accountPrivateKeySeedSalt_,] = accountPrivateKeySeedSaltEntry_;
	// console.info(accountName_, accountPrivateKeySeedSalt_);
	const accountPrivateKeySeed_ = state.accountPrivateKeySeed ^ accountPrivateKeySeedSalt_;
	const accountPrivateKey_ = generateAccountPrivateKeyFromSeed(accountPrivateKeySeed_);
	const accountSigner_ = new hre.ethers.Wallet(accountPrivateKey_, hre.ethers.provider);
	console.info(`${accountName_}: privateKey = ${accountPrivateKey_}, address = ${accountSigner_.address}`);
	state[`${accountName_}Signer`] = accountSigner_;
}

// #endregion
// #region `main`

async function main() {
	// todo-0 print new lines as needed
	// await hre.run("compile");
	await tryCreateCosmicSignatureContracts(await runDeployCosmicSignatureContractsTaskIfNeeded());
	await fundAccountsWithEthIfNeeded();
	await configurePrizesWalletIfNeeded();
	await configureCosmicSignatureGameIfNeeded();


	// todo-0 Write more code.

	console.info(`${nodeOsModule.EOL}Done.`);
}

// #endregion
// #region `runDeployCosmicSignatureContractsTaskIfNeeded`

async function runDeployCosmicSignatureContractsTaskIfNeeded() {
	const deployCosmicSignatureContractsTaskReportFilePath_ =
		configuration.cosmicSignatureContractsDeployment.deployCosmicSignatureContractsTaskReportFilePath
			.replaceAll("${networkName}", hre.network.name)
			.replaceAll("${cosmicSignatureGameContractName}", configuration.cosmicSignatureContractsDeployment.cosmicSignatureGameContractName);
	if (configuration.cosmicSignatureContractsDeployment.enabled) {
		const deployCosmicSignatureContractsTaskReportFileStats_ = nodeFsModule.statSync(deployCosmicSignatureContractsTaskReportFilePath_, {throwIfNoEntry: false,});
		if (deployCosmicSignatureContractsTaskReportFileStats_ == undefined) {
			const deployCosmicSignatureContractsTaskConfigurationFilePath_ =
				configuration.cosmicSignatureContractsDeployment.deployCosmicSignatureContractsTaskConfigurationFilePath
					.replaceAll("${networkName}", hre.network.name)
					.replaceAll("${cosmicSignatureGameContractName}", configuration.cosmicSignatureContractsDeployment.cosmicSignatureGameContractName);
			await runDeployCosmicSignatureContractsTask(
				state.ownerSigner.privateKey,
				configuration.cosmicSignatureContractsDeployment.cosmicSignatureGameContractName,
				configuration.cosmicSignatureContractsDeployment.randomWalkNftAddress,
				state.charitySigner.address,
				deployCosmicSignatureContractsTaskConfigurationFilePath_,
				deployCosmicSignatureContractsTaskReportFilePath_
			);
		} else {
			if ( ! deployCosmicSignatureContractsTaskReportFileStats_.isFile() ) {
				throw new Error(`"${deployCosmicSignatureContractsTaskReportFilePath_}" already exists, but it's not a file.`);
			}
			console.info(`${nodeOsModule.EOL}"${deployCosmicSignatureContractsTaskReportFilePath_}" already exists. Reusing the already deployed Cosmic Signature contracts. Assuming their bytecodes have not changed.`);
		}
	} else {
		console.info(`${nodeOsModule.EOL}We are configured to not deploy Cosmic Signature contracts.`);
	}
	return deployCosmicSignatureContractsTaskReportFilePath_;
}

// #endregion
// #region `tryCreateCosmicSignatureContracts`

/**
 * @param {string} deployCosmicSignatureContractsTaskReportFilePath_
 */
async function tryCreateCosmicSignatureContracts(deployCosmicSignatureContractsTaskReportFilePath_) {
	let deployCosmicSignatureContractsTaskReportJsonString_;
	let fileLoadFailed_ = false;
	try {
		deployCosmicSignatureContractsTaskReportJsonString_ = await nodeFsModule.promises.readFile(deployCosmicSignatureContractsTaskReportFilePath_, "utf8");
	} catch (errorObject_) {
		if (errorObject_.code != "ENOENT") {
			throw errorObject_;
		}
		fileLoadFailed_ = true;
	}
	if (fileLoadFailed_) {
		console.info(`${nodeOsModule.EOL}"${deployCosmicSignatureContractsTaskReportFilePath_}" does not exist.`);
		state.contracts = {};
	} else {
		console.info(`${nodeOsModule.EOL}Loading "${deployCosmicSignatureContractsTaskReportFilePath_}".`);
		state.contracts = JSON.parse(deployCosmicSignatureContractsTaskReportJsonString_);
		await createContract("CosmicSignatureToken", "cosmicSignatureToken");
		await createContract("RandomWalkNFT", "randomWalkNft");
		await createContract("CosmicSignatureNft", "cosmicSignatureNft");
		await createContract("PrizesWallet", "prizesWallet");
		await createContract("StakingWalletRandomWalkNft", "stakingWalletRandomWalkNft");
		await createContract("StakingWalletCosmicSignatureNft", "stakingWalletCosmicSignatureNft");
		await createContract("MarketingWallet", "marketingWallet");
		await createContract("CharityWallet", "charityWallet");
		await createContract("CosmicSignatureDao", "cosmicSignatureDao");
		await createContract(configuration.cosmicSignatureContractsDeployment.cosmicSignatureGameContractName, "cosmicSignatureGameImplementation");
		await createContract(configuration.cosmicSignatureContractsDeployment.cosmicSignatureGameContractName, "cosmicSignatureGameProxy");
	}
}

// #endregion
// #region `createContract`

/**
 * @param {string} contractName_
 * @param {string} contractVariableName_
 */
async function createContract(contractName_, contractVariableName_) {
	state.contracts[contractVariableName_] = await hre.ethers.getContractAt(contractName_, state.contracts[contractVariableName_ + "Address"], state.dummySigner);
}

// #endregion
// #region `fundAccountsWithEthIfNeeded`

async function fundAccountsWithEthIfNeeded() {
	if ( ! configuration.accountFundingWithEth.enabled ) {
		console.info(`${nodeOsModule.EOL}We are configured to not fund any accounts.`);
		return;
	}
	console.info();
	await fundAccountWithEthIfNeeded("bidder1", state.bidder1Signer.address);
	await fundAccountWithEthIfNeeded("bidder2", state.bidder2Signer.address);
	await fundAccountWithEthIfNeeded("bidder3", state.bidder3Signer.address);
	// await fundAccountWithEthIfNeeded("charity", state.charitySigner.address);
	await fundAccountWithEthIfNeeded("treasurer", state.treasurerSigner.address);
}

// #endregion
// #region `fundAccountWithEthIfNeeded`

/**
 * @param {string} accountName_ 
 * @param {string} accountAddress_
 */
async function fundAccountWithEthIfNeeded(accountName_, accountAddress_) {
	const accountEthBalanceAmountMinLimitInWei_ = hre.ethers.parseEther(configuration.accountFundingWithEth.accountEthBalanceAmountMinLimitInEth.toString());
	const accountEthBalanceAmount_ = await hre.ethers.provider.getBalance(accountAddress_);
	if (accountEthBalanceAmount_ >= accountEthBalanceAmountMinLimitInWei_) {
		return;
	}
	const ethAmountToTransferToAccount_ = accountEthBalanceAmountMinLimitInWei_ * 2n - accountEthBalanceAmount_;
	console.info(`Funding ${accountName_} with ${hre.ethers.formatEther(ethAmountToTransferToAccount_)} ETH.`);
	await waitForTransactionReceipt(state.ownerSigner.sendTransaction({to: accountAddress_, value: ethAmountToTransferToAccount_,}));
}

// #endregion
// #region `configurePrizesWalletIfNeeded`

async function configurePrizesWalletIfNeeded() {
	if ( ! configuration.prizesWalletConfiguration.enabled ) {
		console.info(`${nodeOsModule.EOL}We are configured to not configure PrizesWallet.`);
		return;
	}
	console.info(`${nodeOsModule.EOL}Configuring PrizesWallet.`);
	await waitForTransactionReceipt(state.contracts.prizesWallet.connect(state.ownerSigner).setTimeoutDurationToWithdrawPrizes(configuration.prizesWalletConfiguration.timeoutDurationToWithdrawPrizes));
}

// #endregion
// #region `configureCosmicSignatureGameIfNeeded`

/// Comment-202509065 applies.
async function configureCosmicSignatureGameIfNeeded() {
	if ( ! configuration.cosmicSignatureGameConfiguration.enabled ) {
		console.info(`${nodeOsModule.EOL}We are configured to not configure CosmicSignatureGame.`);
		return;
	}
	console.info(`${nodeOsModule.EOL}Configuring CosmicSignatureGame.`);

	// todo-0 Should we move round activation time to the future?
	// todo-0 At least comment.

	await waitForTransactionReceipt(state.contracts.cosmicSignatureGameProxy.connect(state.ownerSigner).setDelayDurationBeforeRoundActivation(configuration.cosmicSignatureGameConfiguration.delayDurationBeforeRoundActivation));
	const mainPrizeTimeIncrementInMicroSeconds_ = configuration.cosmicSignatureGameConfiguration.mainPrizeTimeIncrement * 10n ** 6n;
	await waitForTransactionReceipt(state.contracts.cosmicSignatureGameProxy.connect(state.ownerSigner).setMainPrizeTimeIncrementInMicroSeconds(mainPrizeTimeIncrementInMicroSeconds_));
	{
		const ethDutchAuctionDurationDivisor_ = (mainPrizeTimeIncrementInMicroSeconds_ + configuration.cosmicSignatureGameConfiguration.ethDutchAuctionDuration / 2n) / configuration.cosmicSignatureGameConfiguration.ethDutchAuctionDuration;
		console.info(`ethDutchAuctionDurationDivisor = ${ethDutchAuctionDurationDivisor_}`);
		await waitForTransactionReceipt(state.contracts.cosmicSignatureGameProxy.connect(state.ownerSigner).setEthDutchAuctionDurationDivisor(ethDutchAuctionDurationDivisor_));
	}
	{
		const cstDutchAuctionDurationDivisor_ = (mainPrizeTimeIncrementInMicroSeconds_ + configuration.cosmicSignatureGameConfiguration.cstDutchAuctionDuration / 2n) / configuration.cosmicSignatureGameConfiguration.cstDutchAuctionDuration;
		console.info(`cstDutchAuctionDurationDivisor = ${cstDutchAuctionDurationDivisor_}`);
		await waitForTransactionReceipt(state.contracts.cosmicSignatureGameProxy.connect(state.ownerSigner).setCstDutchAuctionDurationDivisor(cstDutchAuctionDurationDivisor_));
	}
	{
		const initialDurationUntilMainPrizeDivisor_ = (mainPrizeTimeIncrementInMicroSeconds_ + configuration.cosmicSignatureGameConfiguration.initialDurationUntilMainPrize / 2n) / configuration.cosmicSignatureGameConfiguration.initialDurationUntilMainPrize;
		console.info(`initialDurationUntilMainPrizeDivisor = ${initialDurationUntilMainPrizeDivisor_}`);
		await waitForTransactionReceipt(state.contracts.cosmicSignatureGameProxy.connect(state.ownerSigner).setInitialDurationUntilMainPrizeDivisor(initialDurationUntilMainPrizeDivisor_));
	}
	await waitForTransactionReceipt(state.contracts.cosmicSignatureGameProxy.connect(state.ownerSigner).setTimeoutDurationToClaimMainPrize(configuration.cosmicSignatureGameConfiguration.timeoutDurationToClaimMainPrize));
}

// #endregion
