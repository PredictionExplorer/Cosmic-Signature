// #region

"use strict";

// #endregion
// #region

const nodeOsModule = require("node:os");
const { configuration } = require("./live-blockchain-tests-configuration.js");

// #endregion
// #region

prepare1();

// #endregion
// #region

const nodeFsModule = require("node:fs");
const hre = require("hardhat");
const { vars } = require("hardhat/config");
const { generateRandomUInt256, generateAccountPrivateKeyFromSeed, uint256ToPaddedHexString, hackApplyGasMultiplierIfNeeded, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { runDeployCosmicSignatureContracts } = require("./cosmic-signature-contracts-deployment/helpers.js");
const { validateCosmicSignatureToken, configureCosmicSignatureToken } = require("./cosmic-signature-token/helpers.js");
const { configureRandomWalkNft, mintRandomWalkNft } = require("./random-walk-nft/helpers.js");
const { validateCosmicSignatureNft } = require("./cosmic-signature-nft/helpers.js");
const { validatePrizesWallet, configurePrizesWallet, withdrawEverything } = require("./prizes-wallet/helpers.js");
const { validateStakingWalletRandomWalkNft } = require("./staking-wallet-random-walk-nft/helpers.js");
const { validateStakingWalletCosmicSignatureNft } = require("./staking-wallet-cosmic-signature-nft/helpers.js");
const { validateMarketingWallet, configureMarketingWallet, payMarketingRewards } = require("./marketing-wallet/helpers.js");
const { validateCharityWallet } = require("./charity-wallet/helpers.js");
const { validateCosmicSignatureDao } = require("./cosmic-signature-dao/helpers.js");
const { validateCosmicSignatureGameState, configureCosmicSignatureGame } = require("./cosmic-signature-game/after-deployment-helpers.js");
const { donateEthToCosmicSignatureGame } = require("./cosmic-signature-game/eth-donations-helpers.js");
const { ensureDurationElapsedSinceRoundActivationIsAtLeast, waitUntilCstDutchAuctionElapsedDurationIsAtLeast, bidWithEth, bidWithEthPlusRandomWalkNft, bidWithEthAndDonateNft, bidWithEthPlusRandomWalkNftAndDonateNft, bidWithCstAndDonateToken } = require("./cosmic-signature-game/bidding-helpers.js");
const { waitUntilMainPrizeTime, claimMainPrize } = require("./cosmic-signature-game/main-prize-helpers.js");
const { finalizeTestingIfEthBalanceIsNonZero } = require("./selfdestructible-cosmic-signature-game/helpers.js");
const { State } = require("./live-blockchain-tests-state.js");

// #endregion
// #region

/** This is the hardcoded value mentioned in Comment-202508313. */
const defaultAccountPrivateKeySeed = 0xa1082f7e3fd074e7664059e29acf3adb2c5ee2dd33c2bb3f7d5a7cdff0dc6665n;

/** These are to be XOr-ed with `state.accountPrivateKeySeed`. */
const accountPrivateKeySeedSalts = {
	owner: 0xc09702ad1f6c687de525aa275debf9b72db9de68734c9250f7440e35171726efn,
	bidder1: 0x41412fc5a274fc146e3d60f10c1dfe1571ea30544ff2a66d31319bb8ed7cdc79n,
	bidder2: 0xc236c2f0d226e219570a1f79668a6f1bb30ad22bbd4b446affedbd9f69ae88fdn,
	bidder3: 0xd34f80f7e5dc79f927913501ed2a4f9e76c4bc3ff3138823372130eb82a67870n,
	treasurer: 0x8f77872975c967ed2792a745a7b5c00c7831fdb9bea7eb3d5ce6a685c2e74035n,
};

const state = new State();

// #endregion
// #region

prepare2();
main()
	.then(() => { process.exit(state.outcomeCode); })
	.catch((errorObject_) => {
		console.error(errorObject_);
		process.exit(1);
	});

// #endregion
// #region `prepare1`

function prepare1() {
	// process.on("unhandledRejection", (reason_, promise_) => {
	// 	console.error("Unhandled rejection from:", promise_, `${nodeOsModule.EOL}Reason:`, reason_);
	// });

	validateConfiguration();

	// Comment-202509132 relates and/or applies.
	// [Comment-202509244]
	// Does any of this logic belong to `validateConfiguration`?
	// Regardless, let's leave it alone.
	// [/Comment-202509244]
	{
		let hardhatModeCodeAsString_ = process.env.HARDHAT_MODE_CODE ?? "";
		if (hardhatModeCodeAsString_.length <= 0) {
			hardhatModeCodeAsString_ = "2";
			process.env.HARDHAT_MODE_CODE = hardhatModeCodeAsString_;
			console.info(`${nodeOsModule.EOL}HARDHAT_MODE_CODE = "${hardhatModeCodeAsString_}"`);
		} else {
			console.warn(`${nodeOsModule.EOL}Warning. The HARDHAT_MODE_CODE environment variable is already set to "${hardhatModeCodeAsString_}". Is it intentional?`);
		}
	}
	{
		const hardhatNetworkName_ = process.env.HARDHAT_NETWORK ?? "";
		if (hardhatNetworkName_.length > 0) {
			console.warn(`${nodeOsModule.EOL}Warning. The HARDHAT_NETWORK environment variable is already set to "${hardhatNetworkName_}". Is it intentional?`);
		}
		if (configuration.hardhat.networkName.length > 0) {
			if (hardhatNetworkName_.length > 0) {
				console.warn(`Warning. Overriding the HARDHAT_NETWORK environment variable with "${configuration.hardhat.networkName}".`);
			}
			process.env.HARDHAT_NETWORK = configuration.hardhat.networkName;
		}
	}

	console.info();
}

// #endregion
// #region `validateConfiguration`

/// Comment-202509244 relates.
function validateConfiguration() {
	// Comment-202509242 relates and/or applies.
	if ( configuration.finalizeTesting &&
	     configuration.cosmicSignatureContractsDeployment.cosmicSignatureGameContractName != "SelfDestructibleCosmicSignatureGame"
	) {
		console.error();
		throw new Error("In the configuration, finalizeTesting is true, but cosmicSignatureContractsDeployment.cosmicSignatureGameContractName is not \"SelfDestructibleCosmicSignatureGame\".");
	}
}

// #endregion
// #region `prepare2`

function prepare2() {
	console.info(`${nodeOsModule.EOL}hre.network.name = ${hre.network.name}`);
	hackApplyGasMultiplierIfNeeded();
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

	console.info(`${nodeOsModule.EOL}Accounts:`);
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
	// await hre.run("compile");
	await createCosmicSignatureContracts(await runDeployCosmicSignatureContractsIfNeeded());
	await validateCosmicSignatureContractStatesIfNeeded();
	await fundAccountsWithEthIfNeeded();
	await configureCosmicSignatureContractsIfNeeded();
	await donateEthToCosmicSignatureGameIfNeeded();
	await tryPlayCosmicSignatureGameIfNeeded();
	await tryWithdrawEverythingIfNeeded();
	await finalizeTestingIfNeeded();
	await payMarketingRewardsIfNeeded();
	console.info(
		(state.outcomeCode == 0) ?
		`${nodeOsModule.EOL}Live blockchain tests completed successfully.` :
		`${nodeOsModule.EOL}Live blockchain tests completed with errors.`
	);
}

// #endregion
// #region `runDeployCosmicSignatureContractsIfNeeded`

async function runDeployCosmicSignatureContractsIfNeeded() {
	const deployCosmicSignatureContractsReportFilePath_ =
		configuration.cosmicSignatureContractsDeployment.deployCosmicSignatureContractsReportFilePath
			.replaceAll("${networkName}", hre.network.name)
			.replaceAll("${cosmicSignatureGameContractName}", configuration.cosmicSignatureContractsDeployment.cosmicSignatureGameContractName);
	if (configuration.deployCosmicSignatureContracts) {
		const deployCosmicSignatureContractsReportFileStats_ = nodeFsModule.statSync(deployCosmicSignatureContractsReportFilePath_, {throwIfNoEntry: false,});
		if (deployCosmicSignatureContractsReportFileStats_ == undefined) {
			const deployCosmicSignatureContractsConfigurationFilePath_ =
				configuration.cosmicSignatureContractsDeployment.deployCosmicSignatureContractsConfigurationFilePath
					.replaceAll("${networkName}", hre.network.name)
					.replaceAll("${cosmicSignatureGameContractName}", configuration.cosmicSignatureContractsDeployment.cosmicSignatureGameContractName);
			await runDeployCosmicSignatureContracts(
				state.ownerSigner.privateKey,
				configuration.cosmicSignatureContractsDeployment.cosmicSignatureGameContractName,
				configuration.cosmicSignatureContractsDeployment.randomWalkNftAddress,
				deployCosmicSignatureContractsConfigurationFilePath_,
				deployCosmicSignatureContractsReportFilePath_
			);
			state.deployedCosmicSignatureContracts = true;
		} else {
			if ( ! deployCosmicSignatureContractsReportFileStats_.isFile() ) {
				console.error();
				throw new Error(`"${deployCosmicSignatureContractsReportFilePath_}" already exists, but it's not a file.`);
			}
			console.info(`${nodeOsModule.EOL}"${deployCosmicSignatureContractsReportFilePath_}" already exists. Reusing the already deployed Cosmic Signature contracts. Assuming their bytecodes have not changed.${nodeOsModule.EOL}`);
		}
	} else {
		console.info(`${nodeOsModule.EOL}We are configured to not deploy Cosmic Signature contracts.${nodeOsModule.EOL}`);
	}
	return deployCosmicSignatureContractsReportFilePath_;
}

// #endregion
// #region `createCosmicSignatureContracts`

/**
 * @param {string} deployCosmicSignatureContractsReportFilePath_
 */
async function createCosmicSignatureContracts(deployCosmicSignatureContractsReportFilePath_) {
	console.info(`Loading "${deployCosmicSignatureContractsReportFilePath_}".`);
	const deployCosmicSignatureContractsReportJsonString_ = await nodeFsModule.promises.readFile(deployCosmicSignatureContractsReportFilePath_, "utf8");
	state.contracts = JSON.parse(deployCosmicSignatureContractsReportJsonString_);
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
// #region `validateCosmicSignatureContractStatesIfNeeded`

async function validateCosmicSignatureContractStatesIfNeeded() {
	if (configuration.validateCosmicSignatureContractStates >= 2 || configuration.validateCosmicSignatureContractStates > 0 && state.deployedCosmicSignatureContracts) {
		// Doing nothing.
	} else {
		console.info(`${nodeOsModule.EOL}We are configured to not validate Cosmic Signature contract states.`);
		return;
	}
	console.info(`${nodeOsModule.EOL}Validating Cosmic Signature contract states.`);
	await validateCosmicSignatureToken(state.contracts.cosmicSignatureToken, /*state.ownerSigner.address,*/ state.contracts.cosmicSignatureGameProxyAddress);

	// It appears that there is nothing to validate in `RandomWalkNft`.
	// If we did validate it we would probably need to skip the validation if it was deployed long ago.

	await validateCosmicSignatureNft(state.contracts.cosmicSignatureNft, state.ownerSigner.address, state.contracts.cosmicSignatureGameProxyAddress);
	await validatePrizesWallet(state.contracts.prizesWallet, state.ownerSigner.address, state.contracts.cosmicSignatureGameProxyAddress);
	await validateStakingWalletRandomWalkNft(state.contracts.stakingWalletRandomWalkNft, /*state.ownerSigner.address,*/ state.contracts.randomWalkNftAddress);
	await validateStakingWalletCosmicSignatureNft(state.contracts.stakingWalletCosmicSignatureNft, state.ownerSigner.address, state.contracts.cosmicSignatureNftAddress, state.contracts.cosmicSignatureGameProxyAddress);
	await validateMarketingWallet(state.contracts.marketingWallet, state.ownerSigner.address, state.contracts.cosmicSignatureTokenAddress);
	await validateCharityWallet(state.contracts.charityWallet, state.ownerSigner.address, hre.ethers.ZeroAddress);
	await validateCosmicSignatureDao(state.contracts.cosmicSignatureDao, /*state.ownerSigner.address,*/ state.contracts.cosmicSignatureTokenAddress);
	await validateCosmicSignatureGameState(
		state.contracts.cosmicSignatureGameProxy,
		state.ownerSigner.address,
		state.contracts.cosmicSignatureTokenAddress,
		state.contracts.randomWalkNftAddress,
		state.contracts.cosmicSignatureNftAddress,
		state.contracts.prizesWalletAddress,
		state.contracts.stakingWalletRandomWalkNftAddress,
		state.contracts.stakingWalletCosmicSignatureNftAddress,
		state.contracts.marketingWalletAddress,
		state.contracts.charityWalletAddress
		// state.contracts.cosmicSignatureDaoAddress
	);
}

// #endregion
// #region `fundAccountsWithEthIfNeeded`

async function fundAccountsWithEthIfNeeded() {
	const ownerEthBalanceAmount_ = await hre.ethers.provider.getBalance(state.ownerSigner.address, "pending");
	const message_ = `${nodeOsModule.EOL}owner ETH balance is ${hre.ethers.formatEther(ownerEthBalanceAmount_)} ETH. `;
	if ( ! configuration.fundAccountsWithEth ) {
		console.info(message_ + "We are configured to not fund any accounts with ETH.");
		return;
	}
	console.info(message_ + "Checking if any accounts need funding with ETH.");
	await fundAccountWithEthIfNeeded("bidder1", state.bidder1Signer.address);
	await fundAccountWithEthIfNeeded("bidder2", state.bidder2Signer.address);
	await fundAccountWithEthIfNeeded("bidder3", state.bidder3Signer.address);
	await fundAccountWithEthIfNeeded("treasurer", state.treasurerSigner.address);
}

// #endregion
// #region `fundAccountWithEthIfNeeded`

/**
 * @param {string} accountName_ 
 * @param {string} accountAddress_
 */
async function fundAccountWithEthIfNeeded(accountName_, accountAddress_) {
	const accountEthBalanceAmountMinLimitInWei_ = hre.ethers.parseEther(configuration.accountFundingWithEth.accountEthBalanceAmountMinLimitInEth.toFixed(18));
	const accountEthBalanceAmount_ = await hre.ethers.provider.getBalance(accountAddress_, "pending");
	const message_ = `${accountName_} ETH balance is ${hre.ethers.formatEther(accountEthBalanceAmount_)} ETH.`;
	if (accountEthBalanceAmount_ >= accountEthBalanceAmountMinLimitInWei_) {
		console.info(message_);
		return;
	}
	if (accountName_ == "treasurer" && ( ! configuration.payMarketingRewards )) {
		console.info(`${message_} Not funding it because we are configured to not pay marketing rewards.`);
		return;
	}
	const ethAmountToTransferToAccount_ = accountEthBalanceAmountMinLimitInWei_ * 2n - accountEthBalanceAmount_;
	console.info(`${message_} Funding it with ${hre.ethers.formatEther(ethAmountToTransferToAccount_)} ETH.`);
	
	// Comment-202510018 relates.
	await waitForTransactionReceipt(state.ownerSigner.sendTransaction({to: accountAddress_, value: ethAmountToTransferToAccount_,}));
}

// #endregion
// #region `configureCosmicSignatureContractsIfNeeded`

async function configureCosmicSignatureContractsIfNeeded() {
	if (configuration.configureCosmicSignatureContracts >= 2 || configuration.configureCosmicSignatureContracts > 0 && state.deployedCosmicSignatureContracts) {
		// Doing nothing.
	} else {
		console.info(`${nodeOsModule.EOL}We are configured to not configure Cosmic Signature contracts.`);
		return;
	}
	console.info(`${nodeOsModule.EOL}Configuring Cosmic Signature contracts.`);
	await configureCosmicSignatureToken(state.contracts.cosmicSignatureToken, state.bidder2Signer, state.contracts.prizesWalletAddress);
	await configureRandomWalkNft(state.contracts.randomWalkNft, state.bidder2Signer, state.bidder3Signer, state.contracts.prizesWalletAddress);
	await configurePrizesWallet(state.contracts.prizesWallet, state.ownerSigner, configuration.cosmicSignatureContracts.prizesWallet.timeoutDurationToWithdrawPrizes);
	await configureMarketingWallet(state.contracts.marketingWallet, state.ownerSigner, state.treasurerSigner.address);
	await configureCosmicSignatureGame(
		state.contracts.cosmicSignatureGameProxy,
		state.ownerSigner,
		configuration.cosmicSignatureContracts.cosmicSignatureGame.delayDurationBeforeRoundActivation,
		configuration.cosmicSignatureContracts.cosmicSignatureGame.ethDutchAuctionDuration,
		configuration.cosmicSignatureContracts.cosmicSignatureGame.cstDutchAuctionDuration,
		configuration.cosmicSignatureContracts.cosmicSignatureGame.initialDurationUntilMainPrize,
		configuration.cosmicSignatureContracts.cosmicSignatureGame.mainPrizeTimeIncrement,
		configuration.cosmicSignatureContracts.cosmicSignatureGame.timeoutDurationToClaimMainPrize
	);
}

// #endregion
// #region `donateEthToCosmicSignatureGameIfNeeded`

async function donateEthToCosmicSignatureGameIfNeeded() {
	if ( ! configuration.donateEthToCosmicSignatureGame ) {
		console.info(`${nodeOsModule.EOL}We are configured to not donate ETH to ${configuration.cosmicSignatureContractsDeployment.cosmicSignatureGameContractName}.`);
		return;
	}
	console.info(`${nodeOsModule.EOL}Donating ETH to ${configuration.cosmicSignatureContractsDeployment.cosmicSignatureGameContractName}.`);
	await donateEthToCosmicSignatureGame(state.contracts.cosmicSignatureGameProxy, state.bidder1Signer, state.bidder3Signer, configuration.ethDonationToCosmicSignatureGame.amountInEth);
}

// #endregion
// #region `tryPlayCosmicSignatureGameIfNeeded`

async function tryPlayCosmicSignatureGameIfNeeded() {
	// console.info(`${nodeOsModule.EOL}Test 202510024.`);
	// await waitForTransactionReceipt(state.contracts.cosmicSignatureGameProxy.connect(state.ownerSigner).setRoundActivationTime(0n));
	// console.info(Date.now().toString());
	// await waitForTransactionReceipt(state.contracts.cosmicSignatureGameProxy.connect(state.ownerSigner).setRoundActivationTime(10n ** 11n));
	// console.info(Date.now().toString());
	// await waitForTransactionReceipt(state.contracts.cosmicSignatureGameProxy.connect(state.ownerSigner).setRoundActivationTime(0n));
	// console.info(Date.now().toString());
	// await waitForTransactionReceipt(state.contracts.cosmicSignatureGameProxy.connect(state.ownerSigner).setRoundActivationTime(10n ** 11n));
	// console.info(Date.now().toString());
	// console.info("End Test 202510024.");

	if ( ! configuration.playCosmicSignatureGame ) {
		console.info(`${nodeOsModule.EOL}We are configured to not play Cosmic Signature Game.`);
		return;
	}
	console.info(`${nodeOsModule.EOL}Playing Cosmic Signature Game.`);
	try {
		for ( let roundCounter_ = 0; roundCounter_ < configuration.cosmicSignatureGamePlaying.numRoundsToPlay; ++ roundCounter_ ) {
			// Reducing the bidding round's first ETH bid price.
			// This would do nothing in case we already did this, then we crashed, and then the user restarted us.
			await ensureDurationElapsedSinceRoundActivationIsAtLeast(state.contracts.cosmicSignatureGameProxy, state.ownerSigner, (configuration.cosmicSignatureContracts.cosmicSignatureGame.ethDutchAuctionDuration * 2n + 3n / 2n) / 3n);

			await bidWithEth(state.contracts.cosmicSignatureGameProxy, state.bidder1Signer);
			// await sleepForMilliSeconds(2000);
			// console.log(await state.contracts.cosmicSignatureGameProxy.tryGetCurrentChampions());
			const randomWalkNft1Id_ = await getRandomWalkNft(state.bidder2Signer);
			await bidWithEthPlusRandomWalkNft(state.contracts.cosmicSignatureGameProxy, state.bidder2Signer, randomWalkNft1Id_);
			await bidWithEthAndDonateNft(state.contracts.cosmicSignatureGameProxy, state.contracts.prizesWallet, state.bidder2Signer, state.contracts.randomWalkNftAddress, randomWalkNft1Id_, state.donatedNftIndexes);
			const randomWalkNft2Id_ = await getRandomWalkNft(state.bidder3Signer);
			await bidWithEthPlusRandomWalkNftAndDonateNft(state.contracts.cosmicSignatureGameProxy, state.contracts.prizesWallet, state.bidder3Signer, randomWalkNft2Id_, state.contracts.randomWalkNftAddress, randomWalkNft2Id_, state.donatedNftIndexes);

			// Reducing CST bid price.
			await waitUntilCstDutchAuctionElapsedDurationIsAtLeast(state.contracts.cosmicSignatureGameProxy, (configuration.cosmicSignatureContracts.cosmicSignatureGame.cstDutchAuctionDuration * 2n + 3n / 2n) / 3n);

			await bidWithCstAndDonateToken(state.contracts.cosmicSignatureGameProxy, state.contracts.prizesWallet, state.bidder2Signer, state.contracts.cosmicSignatureToken, 234567n, state.donatedTokensToClaim);
			await waitUntilMainPrizeTime(state.contracts.cosmicSignatureGameProxy);
			await claimMainPrize(state.contracts.cosmicSignatureGameProxy, state.bidder2Signer);
		}
	} catch(errorObject_) {
		// console.error(errorObject_.errorName, errorObject_.args);
		// console.error(errorObject_.shortMessage || errorObject_.reason);
		console.error(errorObject_);
		state.outcomeCode = 1;
	}
}

// #endregion
// #region `getRandomWalkNft`

async function getRandomWalkNft(minterSigner_) {
	/** @type {bigint} */
	let randomWalkNftId_;
	if (state.nextRandomWalkNftIndex < configuration.cosmicSignatureGamePlaying.randomWalkNftIds.length) {
		randomWalkNftId_ = configuration.cosmicSignatureGamePlaying.randomWalkNftIds[state.nextRandomWalkNftIndex];
		++ state.nextRandomWalkNftIndex;
		console.info(`Using a Random Walk NFT with id = ${randomWalkNftId_}.`);
	} else {
		randomWalkNftId_ = await mintRandomWalkNft(state.contracts.randomWalkNft, minterSigner_);
	}
	return randomWalkNftId_;
}

// #endregion
// #region `tryWithdrawEverythingIfNeeded`

async function tryWithdrawEverythingIfNeeded() {
	if ( ! configuration.withdrawEverything ) {
		console.info(`${nodeOsModule.EOL}We are configured to not withdraw everything.`);
		// return;
	} else {
		console.info(`${nodeOsModule.EOL}Withdrawing everything.`);
	}
	await tryWithdrawEverythingToAccountIfNeeded("bidder1", [], []);
	await tryWithdrawEverythingToAccountIfNeeded("bidder2", state.donatedTokensToClaim, state.donatedNftIndexes);
	await tryWithdrawEverythingToAccountIfNeeded("bidder3", [], []);
}

// #endregion
// #region `tryWithdrawEverythingToAccountIfNeeded`

async function tryWithdrawEverythingToAccountIfNeeded(accountName_, donatedTokensToClaim_, donatedNftIndexes_) {
	const accountSigner_ = state[accountName_ + "Signer"];
	const accountEthBalanceAmount_ = (await state.contracts.prizesWallet["getEthBalanceInfo(address)"](accountSigner_.address)).amount;
	const jsonStringifyHelper_ =
		(key_, value_) =>
		((typeof value_ == "bigint") ? ((key_ == "amount") ? hre.ethers.formatEther(value_) : Number(value_)) : value_);
	console.info(
		`${accountName_} assets held in PrizesWallet: ` +
		`ETH Balance: ${hre.ethers.formatEther(accountEthBalanceAmount_)} ETH, ` +
		`ERC-20 Tokens: ${JSON.stringify(donatedTokensToClaim_, jsonStringifyHelper_)}, ` +
		`NFT Indexes: ${JSON.stringify(donatedNftIndexes_, jsonStringifyHelper_)}`
	);
	if ( configuration.withdrawEverything &&
	     ( accountEthBalanceAmount_ > 0n ||

	       // Is it possible to combine some `donatedTokensToClaim_` items or filter out its items with zero amounts?
	       // Regardless, it's not important for this test.
	       donatedTokensToClaim_.length > 0 ||

	       donatedNftIndexes_.length > 0 
	     )
	) {
		try {
			await withdrawEverything(state.contracts.prizesWallet, accountSigner_, accountEthBalanceAmount_ > 0n, donatedTokensToClaim_, donatedNftIndexes_);
		} catch(errorObject_) {
			// [Comment-202509304]
			// Issue. On transaction reversal, you will have to manually withdraw ERC-20 tokens and ERC-721 NFTs that we logged.
			// ETH can still be withdrawn automatically if you run this test again.
			// [/Comment-202509304]

			console.error(errorObject_);
			state.outcomeCode = 1;
		}
	}
}

// #endregion
// #region `finalizeTestingIfNeeded`

async function finalizeTestingIfNeeded() {
	if ( ! configuration.finalizeTesting ) {
		console.info(`${nodeOsModule.EOL}We are configured to not finalize testing.`);
		return;
	}
	await finalizeTestingIfEthBalanceIsNonZero(state.contracts.cosmicSignatureGameProxy, state.contracts.cosmicSignatureGameProxyAddress, state.ownerSigner);
}

// #endregion
// #region `payMarketingRewardsIfNeeded`

async function payMarketingRewardsIfNeeded() {
	const marketingWalletCstBalanceAmount_ = await state.contracts.cosmicSignatureToken.balanceOf(state.contracts.marketingWalletAddress, {blockTag: "pending",});
	const message_ = `${nodeOsModule.EOL}Marketing Wallet CST balance is ${hre.ethers.formatEther(marketingWalletCstBalanceAmount_)}. `;
	if ( ! configuration.payMarketingRewards ) {
		console.info(message_ + "We are configured to not pay marketing rewards.");
		return;
	}
	console.info(message_ + "Paying marketing rewards.");
	const specs_ = [
		[state.bidder1Signer.address, marketingWalletCstBalanceAmount_ / 7n,],
		[state.bidder2Signer.address, marketingWalletCstBalanceAmount_ / 6n,],
		[state.bidder3Signer.address, marketingWalletCstBalanceAmount_ / 5n,],
	];
	await payMarketingRewards(state.contracts.marketingWallet, state.treasurerSigner, specs_);
}

// #endregion
