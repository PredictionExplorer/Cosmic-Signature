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
const { generateRandomUInt256, generateAccountPrivateKeyFromSeed, uint256ToPaddedHexString, hackApplyGasMultiplierIfNeeded, waitForTransactionReceipt } = require("../src/Helpers.js");
const { runDeployCosmicSignatureContracts } = require("./cosmic-signature-contracts-deployment/run-deploy-cosmic-signature-contracts.js");
const { validateCosmicSignatureToken, configureCosmicSignatureToken } = require("./cosmic-signature-token/cosmic-signature-token-helpers.js");
const { configureRandomWalkNft, mintRandomWalkNft } = require("./random-walk-nft/random-walk-nft-helpers.js");
const { validateCosmicSignatureNft } = require("./cosmic-signature-nft/cosmic-signature-nft-helpers.js");
const { validatePrizesWallet, configurePrizesWallet, withdrawEverything } = require("./prizes-wallet/prizes-wallet-helpers.js");
const { validateStakingWalletRandomWalkNft } = require("./staking-wallet-random-walk-nft/staking-wallet-random-walk-nft-helpers.js");
const { validateStakingWalletCosmicSignatureNft } = require("./staking-wallet-cosmic-signature-nft/staking-wallet-cosmic-signature-nft-helpers.js");
const { validateMarketingWallet, configureMarketingWallet } = require("./marketing-wallet/marketing-wallet-helpers.js");
const { validateCharityWallet } = require("./charity-wallet/charity-wallet-helpers.js");
const { validateCosmicSignatureDao } = require("./cosmic-signature-dao/cosmic-signature-dao-helpers.js");
const { validateCosmicSignatureGameState, configureCosmicSignatureGame } = require("./cosmic-signature-game-after-deployment/cosmic-signature-game-after-deployment-helpers.js");
const { donateEthToCosmicSignatureGame } = require("./cosmic-signature-game-eth-donations/helpers.js");
const { ensureDurationElapsedSinceRoundActivationIsAtLeast, waitUntilCstDutchAuctionElapsedDurationIsAtLeast, bidWithEth, bidWithEthPlusRandomWalkNft, bidWithEthAndDonateNft, bidWithEthPlusRandomWalkNftAndDonateNft, bidWithCstAndDonateToken } = require("./cosmic-signature-game-bidding/cosmic-signature-game-bidding-helpers.js");
const { finalizeTesting } = require("./selfdestructible-cosmic-signature-game/selfdestructible-cosmic-signature-game-helpers.js");
const { waitUntilMainPrizeTime, claimMainPrize } = require("./cosmic-signature-game-main-prize/cosmic-signature-game-main-prize-helpers.js");
const { State } = require("./live-blockchain-tests-state.js");

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
	.catch((errorObject_) => {
		console.error(errorObject_);
		process.exit(1);
	});

// #endregion
// #region `prepare1`

function prepare1() {
	validateConfiguration();

	// Comment-202509132 relates and/or applies.
	// [Comment-202509244]
	// Does any of this logic belong to `validateConfiguration`? Regardless, let's leave it alone.
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
	await createCosmicSignatureContracts(await runDeployCosmicSignatureContractsIfNeeded());
	await fundAccountsWithEthIfNeeded();
	await validateCosmicSignatureContractStatesIfNeeded();
	await configureCosmicSignatureContractsIfNeeded();
	await donateEthToCosmicSignatureGameIfNeeded();
	await playCosmicSignatureGameIfNeeded();
	await finalizeTestingIfNeeded();


	// todo-0 Write more code.

	console.info(`${nodeOsModule.EOL}Done.`);
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
				state.charitySigner.address,
				deployCosmicSignatureContractsConfigurationFilePath_,
				deployCosmicSignatureContractsReportFilePath_
			);
			state.deployedCosmicSignatureContracts = true;
		} else {
			if ( ! deployCosmicSignatureContractsReportFileStats_.isFile() ) {
				throw new Error(`"${deployCosmicSignatureContractsReportFilePath_}" already exists, but it's not a file.`);
			}
			console.info(`${nodeOsModule.EOL}"${deployCosmicSignatureContractsReportFilePath_}" already exists. Reusing the already deployed Cosmic Signature contracts. Assuming their bytecodes have not changed.`);
		}
	} else {
		console.info(`${nodeOsModule.EOL}We are configured to not deploy Cosmic Signature contracts.`);
	}
	return deployCosmicSignatureContractsReportFilePath_;
}

// #endregion
// #region `createCosmicSignatureContracts`

/**
 * @param {string} deployCosmicSignatureContractsReportFilePath_
 */
async function createCosmicSignatureContracts(deployCosmicSignatureContractsReportFilePath_) {
	console.info(`${nodeOsModule.EOL}Loading "${deployCosmicSignatureContractsReportFilePath_}".`);
	const deployCosmicSignatureContractsTaskReportJsonString_ = await nodeFsModule.promises.readFile(deployCosmicSignatureContractsReportFilePath_, "utf8");
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
	if ( ! configuration.fundAccountsWithEth ) {
		console.info(`${nodeOsModule.EOL}We are configured to not fund any accounts with ETH.`);
		return;
	}
	console.info(`${nodeOsModule.EOL}Checking if any accounts need funding with ETH.`);
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
	const accountEthBalanceAmountMinLimitInWei_ = hre.ethers.parseEther(configuration.accountFundingWithEth.accountEthBalanceAmountMinLimitInEth.toFixed(18));
	const accountEthBalanceAmount_ = await hre.ethers.provider.getBalance(accountAddress_);
	if (accountEthBalanceAmount_ >= accountEthBalanceAmountMinLimitInWei_) {
		return;
	}
	const ethAmountToTransferToAccount_ = accountEthBalanceAmountMinLimitInWei_ * 2n - accountEthBalanceAmount_;
	console.info(`Funding ${accountName_} with ${hre.ethers.formatEther(ethAmountToTransferToAccount_)} ETH.`);
	await waitForTransactionReceipt(state.ownerSigner.sendTransaction({to: accountAddress_, value: ethAmountToTransferToAccount_,}));
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
	// If we did validate it we would need to skip the validation if it was deployed long ago.

	await validateCosmicSignatureNft(state.contracts.cosmicSignatureNft, state.ownerSigner.address, state.contracts.cosmicSignatureGameProxyAddress);
	await validatePrizesWallet(state.contracts.prizesWallet, state.ownerSigner.address, state.contracts.cosmicSignatureGameProxyAddress);
	await validateStakingWalletRandomWalkNft(state.contracts.stakingWalletRandomWalkNft, /*state.ownerSigner.address,*/ state.contracts.randomWalkNftAddress);
	await validateStakingWalletCosmicSignatureNft(state.contracts.stakingWalletCosmicSignatureNft, state.ownerSigner.address, state.contracts.cosmicSignatureNftAddress, state.contracts.cosmicSignatureGameProxyAddress);
	await validateMarketingWallet(state.contracts.marketingWallet, state.ownerSigner.address, state.contracts.cosmicSignatureTokenAddress);
	await validateCharityWallet(state.contracts.charityWallet, state.ownerSigner.address, state.charitySigner.address);
	await validateCosmicSignatureDao(state.contracts.cosmicSignatureDao, /*state.ownerSigner.address,*/ state.contracts.cosmicSignatureTokenAddress);
	await validateCosmicSignatureGameState(
		state.contracts.cosmicSignatureGameProxy,
		state.ownerSigner,
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
// #region `configureCosmicSignatureContractsIfNeeded`

async function configureCosmicSignatureContractsIfNeeded() {
	if (configuration.configureCosmicSignatureContracts >= 2 || configuration.configureCosmicSignatureContracts > 0 && state.deployedCosmicSignatureContracts) {
		// Doing nothing.
	} else {
		console.info(`${nodeOsModule.EOL}We are configured to not configure Cosmic Signature contracts.`);
		return;
	}
	console.info(`${nodeOsModule.EOL}Configuring Cosmic Signature contracts.`);
	await configureCosmicSignatureToken(state.contracts.cosmicSignatureToken, state.bidder1Signer, state.bidder2Signer, state.bidder3Signer, state.contracts.prizesWalletAddress);
	await configureRandomWalkNft(state.contracts.randomWalkNft, state.bidder1Signer, state.bidder2Signer, state.bidder3Signer, state.contracts.prizesWalletAddress);
	await configurePrizesWallet(state.contracts.prizesWallet, state.ownerSigner, configuration.prizesWallet.timeoutDurationToWithdrawPrizes);
	await configureMarketingWallet(state.contracts.marketingWallet, state.ownerSigner, state.treasurerSigner.address);
	await configureCosmicSignatureGame(
		state.contracts.cosmicSignatureGameProxy,
		state.ownerSigner,
		configuration.cosmicSignatureGame.delayDurationBeforeRoundActivation,
		configuration.cosmicSignatureGame.ethDutchAuctionDuration,
		configuration.cosmicSignatureGame.cstDutchAuctionDuration,
		configuration.cosmicSignatureGame.initialDurationUntilMainPrize,
		configuration.cosmicSignatureGame.mainPrizeTimeIncrement,
		configuration.cosmicSignatureGame.timeoutDurationToClaimMainPrize
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
	await donateEthToCosmicSignatureGame(state.contracts.cosmicSignatureGameProxy, state.bidder2Signer, state.bidder3Signer, configuration.ethDonationToCosmicSignatureGame.amountInEth);
}

// #endregion
// #region `playCosmicSignatureGameIfNeeded`

async function playCosmicSignatureGameIfNeeded() {
	// console.info(`${nodeOsModule.EOL}Test 1.`);
	// await waitForTransactionReceipt(state.contracts.cosmicSignatureGameProxy.connect(state.ownerSigner).setRoundActivationTime(0n));
	// await waitForTransactionReceipt(state.contracts.cosmicSignatureGameProxy.connect(state.ownerSigner).setRoundActivationTime(10n ** 11n));
	// await waitForTransactionReceipt(state.contracts.cosmicSignatureGameProxy.connect(state.ownerSigner).setRoundActivationTime(0n));
	// await waitForTransactionReceipt(state.contracts.cosmicSignatureGameProxy.connect(state.ownerSigner).setRoundActivationTime(10n ** 11n));
	// console.info("End Test 1.");

	if ( ! configuration.playCosmicSignatureGame ) {
		console.info(`${nodeOsModule.EOL}We are configured to not play Cosmic Signature Game.`);
		return;
	}
	console.info(`${nodeOsModule.EOL}Playing Cosmic Signature Game.`);
	const donatedTokensToClaim_ = [];
	const donatedNftIndexes_ = [];
	try {
		for ( let roundCounter_ = 0; roundCounter_ < configuration.cosmicSignatureGamePlaying.numRoundsToPlay; ++ roundCounter_ ) {
			// Reducing the bidding round's first ETH bid price.
			// This would do nothing in case we already did this, then we crashed, and then the user restarted us.
			await ensureDurationElapsedSinceRoundActivationIsAtLeast(state.contracts.cosmicSignatureGameProxy, state.ownerSigner, configuration.cosmicSignatureGame.ethDutchAuctionDuration * 2n / 3n);

			await bidWithEth(state.contracts.cosmicSignatureGameProxy, state.bidder1Signer);
			const randomWalkNft1Id_ = await mintRandomWalkNft(state.contracts.randomWalkNft, state.bidder2Signer);
			await bidWithEthPlusRandomWalkNft(state.contracts.cosmicSignatureGameProxy, state.bidder2Signer, randomWalkNft1Id_);
			await bidWithEthAndDonateNft(state.contracts.cosmicSignatureGameProxy, state.contracts.prizesWallet, state.bidder2Signer, state.contracts.randomWalkNftAddress, randomWalkNft1Id_, donatedNftIndexes_);
			const randomWalkNft2Id_ = await mintRandomWalkNft(state.contracts.randomWalkNft, state.bidder3Signer);
			await bidWithEthPlusRandomWalkNftAndDonateNft(state.contracts.cosmicSignatureGameProxy, state.contracts.prizesWallet, state.bidder3Signer, randomWalkNft2Id_, state.contracts.randomWalkNftAddress, randomWalkNft2Id_);

			// Reducing CST bid price.
			await waitUntilCstDutchAuctionElapsedDurationIsAtLeast(state.contracts.cosmicSignatureGameProxy, configuration.cosmicSignatureGame.cstDutchAuctionDuration * 2n / 3n);

			await bidWithCstAndDonateToken(state.contracts.cosmicSignatureGameProxy, state.contracts.prizesWallet, state.bidder2Signer, state.contracts.cosmicSignatureToken, 123, donatedTokensToClaim_);
			await waitUntilMainPrizeTime(state.contracts.cosmicSignatureGameProxy);
			await claimMainPrize(state.contracts.cosmicSignatureGameProxy, state.bidder2Signer);
		}
	} finally {
		try {
			await withdrawEverything(state.contracts.prizesWallet, state.bidder1Signer, true, [], []);
		} finally {
			try {
				await withdrawEverything(state.contracts.prizesWallet, state.bidder2Signer, true, donatedTokensToClaim_, donatedNftIndexes_);
			} finally {
				await withdrawEverything(state.contracts.prizesWallet, state.bidder3Signer, true, [], []);
			}
		}
	}
}

// #endregion
// #region `finalizeTestingIfNeeded`

async function finalizeTestingIfNeeded() {
	if ( ! configuration.finalizeTesting ) {
		return;
	}
	await finalizeTesting(state.contracts.cosmicSignatureGameProxy, state.ownerSigner);
}

// #endregion
