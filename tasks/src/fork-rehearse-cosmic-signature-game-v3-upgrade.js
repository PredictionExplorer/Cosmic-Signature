// #region
//
// A rehearsal of the CosmicSignatureGame V2 -> V3 upgrade on an in-process fork of a live blockchain (Arbitrum One by default).
//
// [Comment-202608128]
// This script:
//    1. Validates V2 -> V3 storage layout compatibility with the OpenZeppelin Upgrades machinery
//       (the V3 implementation and additionally each of the 3 delegatecall modules, Comment-202608245).
//    2. Forks the live blockchain in the in-process Hardhat Network.
//    3. Snapshots the game proxy state (every storage-backed no-argument getter).
//    4. Impersonates the contract owner, deploys the 3 delegatecall modules and a fresh `CosmicSignatureGameV3`
//       implementation wired to them, and performs `upgradeToAndCall` with `reinitialize` as the call payload --
//       the same effect the "upgrade-cosmic-signature-game" Hardhat task produces in the production.
//    5. Verifies: the implementation address changed; the initialized version is 3; every carried-over storage
//       variable is unchanged, except the values that `reinitialize` intentionally overwrites; the new V3 parameters
//       have the expected defaults; the retired setters revert; `reinitialize` cannot run twice;
//       the new setters validate zero values; an unknown selector reverts with empty data;
//       calling a module directly is harmless (Comment-202608247).
//    6. Smoke-tests gameplay: an ETH bid, the same-second bid throttle, the bid CST reward minted to the previous
//       bidder, and, when possible, a CST bid and a main prize claim with `mainPrizeNumCosmicSignatureNfts` NFTs.
//
// Usage:
//    HARDHAT_MODE_CODE=1 FORK_RPC_URL='https://arb1.arbitrum.io/rpc' npx hardhat run tasks/src/fork-rehearse-cosmic-signature-game-v3-upgrade.js
// Environment variables:
//    FORK_RPC_URL (required; consumed by the Hardhat Network forking configuration near Comment-202608131)
//    FORK_BLOCK_NUMBER (optional; default: none, meaning near-latest)
//    COSMIC_SIGNATURE_GAME_PROXY_ADDRESS (optional; default: the Arbitrum One production proxy)
//
// This script never touches a live blockchain; it only reads from the fork RPC.
// [/Comment-202608128]
//
// #endregion
// #region

"use strict";

const hre = require("hardhat");
const { deployCosmicSignatureGameV3Modules, getCosmicSignatureGameV3CombinedAbiContract } = require("../../src/ContractDeploymentHelpers.js");

// #endregion
// #region Constants.

const DEFAULT_PROXY_ADDRESS = "0x6a714Ae7B5b6eA520F6BCA23d2E609C4Fd5863F2";

// Comment-202608129 relates.
// These mirror `CosmicSignatureConstants`.
const MICROSECONDS_PER_SECOND = 1_000_000n;
const INITIAL_MAIN_PRIZE_TIME_INCREMENT = 3_600n;
const INITIAL_BID_CST_REWARD_AMOUNT_PER_MINUTE = 10n ** 18n;
const DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER =
	(INITIAL_BID_CST_REWARD_AMOUNT_PER_MINUTE * INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND + 60n / 2n) / 60n;
const DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_V3 = INITIAL_BID_CST_REWARD_AMOUNT_PER_MINUTE;
const INITIAL_CST_BID_PRICE_DECLINE_MULTIPLIER =
	(DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER + INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND / 2n) /
	(INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND);
const DEFAULT_CST_BID_PRICE_DECLINE_MULTIPLIER_CHANGE_DIVISOR = 100n;
const INITIAL_ROUND_LATE_BID_DURATION = 20n * 60n;
const DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR =
	(INITIAL_MAIN_PRIZE_TIME_INCREMENT * MICROSECONDS_PER_SECOND + INITIAL_ROUND_LATE_BID_DURATION / 2n) / INITIAL_ROUND_LATE_BID_DURATION;
const ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT = 13n;
const DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER = 3567993n << ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_RESOLUTION_EXPONENT;
const DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT = 8n;
const DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS = 3n;
const DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE_V3 = 20n;
const DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE_V3 = 5n;
const DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE_V3 = 5n;
const DEFAULT_NUM_RAFFLE_ETH_PRIZES_FOR_BIDDERS = 3n;
const DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE_V3 = 5n;
const DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE_V3 = 15n;

// OpenZeppelin `Initializable` ERC-7201 namespaced slot.
const INITIALIZABLE_STORAGE_SLOT = "0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00";

// `roundActivationTime` sequential storage slot. Verified against the respective getter before use.
const ROUND_ACTIVATION_TIME_SLOT = 269n;

// Storage-backed no-argument getters shared by V2 and V3 whose values must not change across the upgrade.
const CARRIED_OVER_GETTER_NAMES = [
	"lastBidderAddress", "lastCstBidderAddress",
	"enduranceChampionAddress", "enduranceChampionStartTimeStamp", "enduranceChampionDuration",
	"prevEnduranceChampionDuration", "chronoWarriorAddress", "chronoWarriorDuration",
	"roundNum", "delayDurationBeforeRoundActivation", "roundActivationTime",
	"ethDutchAuctionDurationDivisor", "ethDutchAuctionBeginningBidPrice", "ethDutchAuctionEndingBidPriceDivisor",
	"nextEthBidPrice", "ethBidPriceIncreaseDivisor", "ethBidRefundAmountInGasToSwallowMaxLimit",
	"cstDutchAuctionBeginningTimeStamp", "cstDutchAuctionDuration", "cstDutchAuctionBeginningBidPrice",
	"nextRoundFirstCstDutchAuctionBeginningBidPrice",
	"bidMessageLengthMaxLimit",
	"cstPrizeAmount",
	"numRaffleEthPrizesForBidders", "numRaffleCosmicSignatureNftsForBidders",
	"numRaffleCosmicSignatureNftsForRandomWalkNftStakers",
	"initialDurationUntilMainPrizeDivisor", "mainPrizeTime", "mainPrizeTimeIncrementInMicroSeconds",
	"mainPrizeTimeIncrementIncreaseDivisor", "timeoutDurationToClaimMainPrize",
	"token", "randomWalkNft", "nft", "prizesWallet", "stakingWalletRandomWalkNft", "stakingWalletCosmicSignatureNft",
	"marketingWallet", "marketingWalletCstContributionAmount", "charityAddress",
	"cstDutchAuctionDurationChangeDivisor",
	"owner",
];

// Getters whose values `reinitialize` intentionally overwrites, with the expected new values.
const OVERWRITTEN_GETTER_EXPECTED_NEW_VALUES = {
	cstDutchAuctionBeginningBidPriceMinLimit: DEFAULT_CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MIN_LIMIT_V3,
	bidCstRewardAmountMultiplier: DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	mainEthPrizeAmountPercentage: DEFAULT_MAIN_ETH_PRIZE_AMOUNT_PERCENTAGE_V3,
	charityEthDonationAmountPercentage: DEFAULT_CHARITY_ETH_DONATION_AMOUNT_PERCENTAGE_V3,
	raffleTotalEthPrizeAmountForBiddersPercentage: DEFAULT_RAFFLE_TOTAL_ETH_PRIZE_AMOUNT_FOR_BIDDERS_PERCENTAGE_V3,
	cosmicSignatureNftStakingTotalEthRewardAmountPercentage: DEFAULT_COSMIC_SIGNATURE_NFT_STAKING_TOTAL_ETH_REWARD_AMOUNT_PERCENTAGE_V3,
	chronoWarriorEthPrizeAmountPercentage: DEFAULT_CHRONO_WARRIOR_ETH_PRIZE_AMOUNT_PERCENTAGE_V3,
};

// New V3 getters with the expected `reinitialize` defaults.
const NEW_GETTER_EXPECTED_VALUES = {
	cstBidPriceDeclineMultiplier: INITIAL_CST_BID_PRICE_DECLINE_MULTIPLIER,
	cstBidPriceDeclineMultiplierChangeDivisor: DEFAULT_CST_BID_PRICE_DECLINE_MULTIPLIER_CHANGE_DIVISOR,
	roundLateBidDurationDivisor: DEFAULT_ROUND_LATE_BID_DURATION_DIVISOR,
	roundLateBidPricePremiumAmountBaseMultiplier: DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_BASE_MULTIPLIER,
	roundLateBidPricePremiumAmountExponent: DEFAULT_ROUND_LATE_BID_PRICE_PREMIUM_AMOUNT_EXPONENT,
	mainPrizeNumCosmicSignatureNfts: DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS,
};

// #endregion
// #region Check bookkeeping.

let numChecksFailed = 0;

/**
@param {boolean} isSuccess_
@param {string} description_
@param {any} details_
*/
function check(isSuccess_, description_, details_ = undefined) {
	if (isSuccess_) {
		console.info("%s", `PASS: ${description_}`);
	} else {
		++ numChecksFailed;
		console.error("%s", `FAIL: ${description_}${(details_ === undefined) ? "" : ` (${details_})`}`);
	}
}

/**
@param {Promise} promise_
@param {string} expectedErrorText_ A text the error is expected to contain. Pass an empty string to accept any error.
@param {string} description_
*/
async function checkReverts(promise_, expectedErrorText_, description_) {
	try {
		await promise_;
		check(false, description_, "the transaction did not revert");
	} catch (errorObject_) {
		const errorText_ = (errorObject_ instanceof Error) ? errorObject_.toString() : "Unknown non-Error rejection.";
		check(expectedErrorText_.length <= 0 || errorText_.includes(expectedErrorText_), description_, errorText_.slice(0, 300));
	}
}

// #endregion
// #region `main`

async function main() {
	// #region Configuration.

	const proxyAddress_ = process.env["COSMIC_SIGNATURE_GAME_PROXY_ADDRESS"] || DEFAULT_PROXY_ADDRESS;
	if (hre.network.name != "hardhat") {
		throw new Error(`This script must run on the in-process "hardhat" network, not on "${hre.network.name}".`);
	}

	// Comment-202608131 applies.
	if ((process.env["FORK_RPC_URL"] ?? "").length <= 0) {
		throw new Error("Set the FORK_RPC_URL environment variable to the live blockchain RPC URL to fork, e.g. https://arb1.arbitrum.io/rpc .");
	}
	console.info("%s", `Running on a fork of ${process.env["FORK_RPC_URL"]}.`);

	// [Comment-202608132]
	// Mining a local block, so that subsequent calls execute on it under the locally configured hardfork rules.
	// Otherwise `eth_call` would execute on the fork block itself, for which this Hardhat/EDR version demands
	// a hardfork activation history of the forked chain and, even when the `chains` configuration provides one,
	// fails to recognize it.
	// [/Comment-202608132]
	await hre.network.provider.request({method: "evm_mine", params: [],});

	// #endregion
	// #region Validating storage layout compatibility.

	console.info("%s", "Validating V2 -> V3 storage layout compatibility with the OpenZeppelin Upgrades machinery.");
	{
		// The plugin's `validateUpgrade(factory1, factory2, options)` passes a single `constructorArgs` to both
		// factories, which cannot work here, because the V3 implementation constructor takes 2 arguments
		// while the V2 one takes none. So this uses the same machinery one level lower, with per-factory
		// deploy data, which is exactly what `validateUpgrade` does internally.
		const { getDeployData } = require("@openzeppelin/hardhat-upgrades/dist/utils/deploy-impl.js");
		const { assertUpgradeSafe, assertStorageUpgradeSafe } = require("@openzeppelin/upgrades-core");
		const zeroAddress_ = hre.ethers.ZeroAddress;
		const cosmicSignatureGameV2DeployData_ =
			await getDeployData(hre, await hre.ethers.getContractFactory("CosmicSignatureGameV2"), {kind: "uups",});
		const newContractDescriptors_ = [
			// The implementation is the OpenZeppelin-managed contract, so it gets the full upgrade safety
			// assertion (its constructor and immutables carry the `@custom:oz-upgrades-unsafe-allow` annotations)
			// plus the storage layout assertion.
			{contractName: "CosmicSignatureGameV3", constructorArgs: [zeroAddress_, zeroAddress_,], isPluginManaged: true,},

			// The modules are plain non-upgradeable contracts (Comment-202608253), so the upgrade-pattern
			// hygiene assertion does not apply to them; but they see the same proxy storage under `delegatecall`,
			// so each of them must be storage-compatible with the live V2 layout.
			// `CosmicSignatureGameV3-ModularEquality.js` additionally asserts that their layouts are identical
			// to the implementation's.
			{contractName: "CosmicSignatureGameViewsModuleV3", constructorArgs: [zeroAddress_,], isPluginManaged: false,},
			{contractName: "CosmicSignatureGameAdminModuleV3", constructorArgs: [zeroAddress_,], isPluginManaged: false,},
			{contractName: "CosmicSignatureGamePrizesModuleV3", constructorArgs: [], isPluginManaged: false,},
		];
		for (const newContractDescriptor_ of newContractDescriptors_) {
			const newContractDeployData_ =
				await getDeployData(
					hre,
					await hre.ethers.getContractFactory(newContractDescriptor_.contractName),
					{kind: "uups", constructorArgs: newContractDescriptor_.constructorArgs, unsafeAllow: ["missing-initializer",],}
				);
			if (newContractDescriptor_.isPluginManaged) {
				assertUpgradeSafe(newContractDeployData_.validations, newContractDeployData_.version, newContractDeployData_.fullOpts);
			}
			assertStorageUpgradeSafe(cosmicSignatureGameV2DeployData_.layout, newContractDeployData_.layout, newContractDeployData_.fullOpts);
			check(true, `OpenZeppelin storage layout validation: CosmicSignatureGameV2 -> ${newContractDescriptor_.contractName} is storage-compatible.`);
		}
	}

	// #endregion
	// #region Snapshotting the pre-upgrade state.

	const cosmicSignatureGameV2Proxy_ = await hre.ethers.getContractAt("CosmicSignatureGameV2", proxyAddress_);

	// The full combined ABI of the modular V3 Game (Comment-202608245), bound to the proxy.
	const cosmicSignatureGameV3Proxy_ = await getCosmicSignatureGameV3CombinedAbiContract(proxyAddress_, hre.ethers.provider);

	const oldImplementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(proxyAddress_);
	console.info(/*"%s",*/ "Current implementation address:", oldImplementationAddress_);
	{
		const initializedVersion_ = BigInt(await hre.ethers.provider.getStorage(proxyAddress_, INITIALIZABLE_STORAGE_SLOT)) & ((1n << 64n) - 1n);
		check(initializedVersion_ == 2n, "The proxy is at initialized version 2 before the upgrade.", initializedVersion_);
	}

	const preUpgradeValues_ = {};
	for (const getterName_ of CARRIED_OVER_GETTER_NAMES.concat(Object.keys(OVERWRITTEN_GETTER_EXPECTED_NEW_VALUES))) {
		preUpgradeValues_[getterName_] = await cosmicSignatureGameV2Proxy_[getterName_]();
	}
	const ownerAddress_ = preUpgradeValues_["owner"];
	console.info(/*"%s",*/ "Owner address:", ownerAddress_);

	// #endregion
	// #region Making the current bidding round inactive if it isn't.

	// `_authorizeUpgrade` requires an inactive bidding round. In the production, the upgrade is to be executed
	// between bidding rounds. On the fork, if the round is active, we temporarily force it inactive
	// by writing a future `roundActivationTime` directly to storage, and restore the original value afterwards.
	const latestBlock_ = await hre.ethers.provider.getBlock("latest");
	const originalRoundActivationTime_ = preUpgradeValues_["roundActivationTime"];
	const roundWasActive_ = BigInt(latestBlock_.timestamp) >= originalRoundActivationTime_;
	if (roundWasActive_) {
		console.info("%s", "The current bidding round is active on the fork; temporarily forcing it inactive for the upgrade.");
		{
			const roundActivationTimeFromSlot_ = BigInt(await hre.ethers.provider.getStorage(proxyAddress_, ROUND_ACTIVATION_TIME_SLOT));
			if (roundActivationTimeFromSlot_ != originalRoundActivationTime_) {
				throw new Error(`Storage slot ${ROUND_ACTIVATION_TIME_SLOT} does not contain roundActivationTime. Recheck the storage layout.`);
			}
		}
		await hre.network.provider.request({
			method: "hardhat_setStorageAt",
			params: [proxyAddress_, "0x" + ROUND_ACTIVATION_TIME_SLOT.toString(16), hre.ethers.toBeHex(BigInt(latestBlock_.timestamp) + (1n << 32n), 32),],
		});
	} else {
		console.info("%s", "The current bidding round is inactive on the fork; upgrading without any state manipulation.");
	}

	// #endregion
	// #region Upgrading to V3.

	await hre.network.provider.request({method: "hardhat_impersonateAccount", params: [ownerAddress_,],});
	await hre.network.provider.request({method: "hardhat_setBalance", params: [ownerAddress_, hre.ethers.toBeHex(10n * 10n ** 18n),],});
	const ownerSigner_ = await hre.ethers.getSigner(ownerAddress_);

	console.info("%s", "Deploying the CosmicSignatureGame V3 delegatecall modules.");
	const modules_ = await deployCosmicSignatureGameV3Modules(ownerSigner_);
	console.info(/*"%s",*/ "CosmicSignatureGamePrizesModuleV3 address:", modules_.cosmicSignatureGamePrizesModuleAddress);
	console.info(/*"%s",*/ "CosmicSignatureGameAdminModuleV3 address:", modules_.cosmicSignatureGameAdminModuleAddress);
	console.info(/*"%s",*/ "CosmicSignatureGameViewsModuleV3 address:", modules_.cosmicSignatureGameViewsModuleAddress);

	console.info("%s", "Deploying the CosmicSignatureGameV3 implementation.");
	const cosmicSignatureGameV3Factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV3", ownerSigner_);
	const newCosmicSignatureGameImplementation_ =
		await cosmicSignatureGameV3Factory_.deploy(modules_.cosmicSignatureGameViewsModuleAddress, modules_.cosmicSignatureGamePrizesModuleAddress);
	await newCosmicSignatureGameImplementation_.waitForDeployment();
	const newImplementationAddress_ = await newCosmicSignatureGameImplementation_.getAddress();
	console.info(/*"%s",*/ "New implementation address:", newImplementationAddress_);

	console.info("%s", "Executing upgradeToAndCall(newImplementation, reinitialize()).");
	await (
		await cosmicSignatureGameV2Proxy_
			.connect(ownerSigner_)
			.upgradeToAndCall(newImplementationAddress_, cosmicSignatureGameV3Factory_.interface.encodeFunctionData("reinitialize"))
	).wait();

	// #endregion
	// #region Verifying the post-upgrade state.

	{
		const implementationAddress_ = await hre.upgrades.erc1967.getImplementationAddress(proxyAddress_);
		check(implementationAddress_ == newImplementationAddress_, "The proxy implementation address changed to the V3 implementation.", implementationAddress_);
	}
	{
		const initializedVersion_ = BigInt(await hre.ethers.provider.getStorage(proxyAddress_, INITIALIZABLE_STORAGE_SLOT)) & ((1n << 64n) - 1n);
		check(initializedVersion_ == 3n, "The proxy is at initialized version 3 after the upgrade.", initializedVersion_);
	}
	{
		let numGettersChanged_ = 0;
		for (const getterName_ of CARRIED_OVER_GETTER_NAMES) {
			if (getterName_ == "roundActivationTime" && roundWasActive_) {
				// We modified this one ourselves.
				continue;
			}
			const postUpgradeValue_ = await cosmicSignatureGameV3Proxy_[getterName_]();
			if (postUpgradeValue_ != preUpgradeValues_[getterName_]) {
				++ numGettersChanged_;
				check(false, `Carried-over "${getterName_}" is unchanged across the upgrade.`, `${preUpgradeValues_[getterName_]} -> ${postUpgradeValue_}`);
			}
		}
		check(numGettersChanged_ <= 0, `All ${CARRIED_OVER_GETTER_NAMES.length} carried-over storage values are unchanged across the upgrade.`);
	}
	for (const [getterName_, expectedValue_] of Object.entries(OVERWRITTEN_GETTER_EXPECTED_NEW_VALUES)) {
		const postUpgradeValue_ = await cosmicSignatureGameV3Proxy_[getterName_]();
		check(postUpgradeValue_ == expectedValue_, `"${getterName_}" was overwritten by reinitialize to the expected value.`, `expected ${expectedValue_}, got ${postUpgradeValue_}`);
	}
	{
		const paidEthPrizeAmountPercentage_ =
			(await cosmicSignatureGameV3Proxy_.mainEthPrizeAmountPercentage()) +
			(await cosmicSignatureGameV3Proxy_.charityEthDonationAmountPercentage()) +
			(await cosmicSignatureGameV3Proxy_.raffleTotalEthPrizeAmountForBiddersPercentage()) +
			(await cosmicSignatureGameV3Proxy_.cosmicSignatureNftStakingTotalEthRewardAmountPercentage()) +
			(await cosmicSignatureGameV3Proxy_.chronoWarriorEthPrizeAmountPercentage());
		check(
			paidEthPrizeAmountPercentage_ == 50n,
			"The V3 ETH prize percentages pay 50%, leaving 50% to roll over.",
			paidEthPrizeAmountPercentage_
		);
		const numRaffleEthPrizesForBidders_ = await cosmicSignatureGameV3Proxy_.numRaffleEthPrizesForBidders();
		check(
			numRaffleEthPrizesForBidders_ == DEFAULT_NUM_RAFFLE_ETH_PRIZES_FOR_BIDDERS,
			"V3 keeps 3 bidder-raffle draws.",
			numRaffleEthPrizesForBidders_
		);
	}
	for (const [getterName_, expectedValue_] of Object.entries(NEW_GETTER_EXPECTED_VALUES)) {
		const postUpgradeValue_ = await cosmicSignatureGameV3Proxy_[getterName_]();
		check(postUpgradeValue_ == expectedValue_, `New V3 parameter "${getterName_}" has the expected default.`, `expected ${expectedValue_}, got ${postUpgradeValue_}`);
	}

	await checkReverts(
		cosmicSignatureGameV3Proxy_.connect(ownerSigner_).reinitialize(),
		"InvalidInitialization",
		"A second reinitialize call reverts with InvalidInitialization."
	);
	await checkReverts(
		cosmicSignatureGameV3Proxy_.connect(ownerSigner_).setCstDutchAuctionDuration(123n),
		"NotImplemented",
		"setCstDutchAuctionDuration reverts with NotImplemented."
	);
	await checkReverts(
		cosmicSignatureGameV3Proxy_.connect(ownerSigner_).setCstDutchAuctionDurationChangeDivisor(123n),
		"NotImplemented",
		"setCstDutchAuctionDurationChangeDivisor reverts with NotImplemented."
	);
	await checkReverts(
		cosmicSignatureGameV3Proxy_.connect(ownerSigner_).setMainPrizeNumCosmicSignatureNfts(0n),
		"ZeroValue",
		"setMainPrizeNumCosmicSignatureNfts(0) reverts with ZeroValue."
	);
	{
		await (await cosmicSignatureGameV3Proxy_.connect(ownerSigner_).setMainPrizeNumCosmicSignatureNfts(DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS)).wait();
		check(
			await cosmicSignatureGameV3Proxy_.mainPrizeNumCosmicSignatureNfts() == DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS,
			"setMainPrizeNumCosmicSignatureNfts works for the owner while the round is inactive."
		);
	}

	// The modular architecture specifics. Comment-202608245 applies.
	await checkReverts(
		hre.ethers.provider.call({to: proxyAddress_, data: "0xdeadbeef",}),
		"",
		"An unknown selector reverts, exactly like on the monolith."
	);
	await checkReverts(
		modules_.cosmicSignatureGameAdminModule.connect(ownerSigner_).setMainPrizeNumCosmicSignatureNfts(1n),
		"OwnableUnauthorizedAccount",
		"A configuration setter called directly on the admin module (not through the proxy) reverts. Comment-202608247 applies."
	);
	await checkReverts(
		modules_.cosmicSignatureGamePrizesModule.connect(ownerSigner_).claimMainPrize(),
		"NoBidsPlacedInCurrentRound",
		"claimMainPrize called directly on the prizes module (not through the proxy) reverts. Comment-202608247 applies."
	);

	// #endregion
	// #region Restoring `roundActivationTime` if we modified it.

	if (roundWasActive_) {
		console.info("%s", "Restoring the original roundActivationTime.");
		await hre.network.provider.request({
			method: "hardhat_setStorageAt",
			params: [proxyAddress_, "0x" + ROUND_ACTIVATION_TIME_SLOT.toString(16), hre.ethers.toBeHex(originalRoundActivationTime_, 32),],
		});
	}

	// #endregion
	// #region Smoke-testing gameplay.

	console.info("%s", "Smoke-testing gameplay on the upgraded fork.");

	// [Comment-202608133]
	// On a fork, the Arbitrum precompiles are not executable: the fork sees their placeholder code, which is
	// a single invalid instruction that consumes all forwarded gas. `RandomNumberHelpers.generateRandomNumberSeed`
	// makes 4 sequential precompile try-calls, so on a fork it would run the transaction out of gas.
	// On the live blockchain the precompiles execute natively.
	// So we inject the test fakes at the precompile addresses to replicate the live behavior.
	// [/Comment-202608133]
	{
		const fakeArbSysArtifact_ = await hre.artifacts.readArtifact("FakeArbSys");
		await hre.network.provider.request({method: "hardhat_setCode", params: ["0x0000000000000000000000000000000000000064", fakeArbSysArtifact_.deployedBytecode,],});
		const fakeArbGasInfoArtifact_ = await hre.artifacts.readArtifact("FakeArbGasInfo");
		await hre.network.provider.request({method: "hardhat_setCode", params: ["0x000000000000000000000000000000000000006C", fakeArbGasInfoArtifact_.deployedBytecode,],});
	}

	const signers_ = await hre.ethers.getSigners();
	const bidder1Signer_ = signers_[0];
	const bidder2Signer_ = signers_[1];
	{
		// Making sure the round is active, whether it originally was or not.
		const latestBlock2_ = await hre.ethers.provider.getBlock("latest");
		const roundActivationTime2_ = await cosmicSignatureGameV3Proxy_.roundActivationTime();
		if (BigInt(latestBlock2_.timestamp) < roundActivationTime2_) {
			console.info("%s", "Warping to the round activation time.");
			await hre.network.provider.request({method: "evm_setNextBlockTimestamp", params: ["0x" + roundActivationTime2_.toString(16),],});
			await hre.network.provider.request({method: "evm_mine", params: [],});
		}
	}
	const cosmicSignatureTokenAddress_ = preUpgradeValues_["token"];
	const cosmicSignatureToken_ = await hre.ethers.getContractAt("CosmicSignatureToken", cosmicSignatureTokenAddress_);

	// ETH bid 1.
	const previousLastBidderAddress_ = await cosmicSignatureGameV3Proxy_.lastBidderAddress();
	{
		// Paying double the quoted price, because near `mainPrizeTime` the late bid price premium
		// can grow faster than a small buffer between the quote and the bid transaction. The excess is refunded.
		const nextEthBidPrice_ = await cosmicSignatureGameV3Proxy_.getNextEthBidPrice();
		const transactionResponse_ =
			await cosmicSignatureGameV3Proxy_
				.connect(bidder1Signer_)
				.bidWithEth((-1n), "V3 upgrade rehearsal bid 1", 0n, {value: nextEthBidPrice_ * 2n,});
		const transactionReceipt_ = await transactionResponse_.wait();
		check(transactionReceipt_.status == 1, "An ETH bid succeeds after the upgrade.");
		const bidPlacedLog_ =
			transactionReceipt_.logs
				.map((log_) => { try { return cosmicSignatureGameV3Proxy_.interface.parseLog(log_); } catch { return null; } })
				.find((parsedLog_) => (parsedLog_ != null && parsedLog_.name == "BidPlaced"));
		check(bidPlacedLog_ != null && bidPlacedLog_.args.length == 9, "The V3 BidPlaced event (9 parameters) was emitted.", bidPlacedLog_?.args?.length);
		if (previousLastBidderAddress_ == hre.ethers.ZeroAddress) {
			check(bidPlacedLog_ != null && bidPlacedLog_.args.bidCstRewardAmount == 0n, "No bid CST reward on the first bid in a bidding round.");
		}
	}

	// The same-second bid throttle. An `eth_call` executes against the latest block, whose timestamp equals the last bid's.
	await checkReverts(
		cosmicSignatureGameV3Proxy_.connect(bidder2Signer_).bidWithEth.staticCall((-1n), "same second bid", 0n, {value: 10n ** 18n,}),
		"BidPlacedWithinCurrentSecond",
		"A bid within the same second reverts with BidPlacedWithinCurrentSecond."
	);

	// ETH bid 2, 60 seconds later. The whole bid CST reward is minted to bidder 1 (the previous bidder).
	{
		const latestBlock3_ = await hre.ethers.provider.getBlock("latest");
		const bid2TimeStamp_ = BigInt(latestBlock3_.timestamp) + 60n;
		await hre.network.provider.request({method: "evm_setNextBlockTimestamp", params: ["0x" + bid2TimeStamp_.toString(16),],});
		const bidder1CstBalanceBeforeBid2_ = await cosmicSignatureToken_.balanceOf(bidder1Signer_.address);
		const bidCstRewardAmountMultiplier_ = await cosmicSignatureGameV3Proxy_.bidCstRewardAmountMultiplier();
		const mainPrizeTimeIncrementInMicroSeconds_ = await cosmicSignatureGameV3Proxy_.mainPrizeTimeIncrementInMicroSeconds();
		const expectedBidCstRewardAmount_ = 60n * bidCstRewardAmountMultiplier_ / mainPrizeTimeIncrementInMicroSeconds_;
		const nextEthBidPrice_ = await cosmicSignatureGameV3Proxy_.getNextEthBidPriceAdvanced(60n);
		await (
			await cosmicSignatureGameV3Proxy_
				.connect(bidder2Signer_)
				.bidWithEth((-1n), "V3 upgrade rehearsal bid 2", 0n, {value: nextEthBidPrice_ * 2n,})
		).wait();
		const bidder1CstBalanceAfterBid2_ = await cosmicSignatureToken_.balanceOf(bidder1Signer_.address);
		check(
			bidder1CstBalanceAfterBid2_ - bidder1CstBalanceBeforeBid2_ == expectedBidCstRewardAmount_,
			"The whole bid CST reward was minted to the previous bidder.",
			`expected +${expectedBidCstRewardAmount_}, got +${bidder1CstBalanceAfterBid2_ - bidder1CstBalanceBeforeBid2_}`
		);
	}

	// A CST bid, if bidder 1 can afford it.
	{
		const latestBlock4_ = await hre.ethers.provider.getBlock("latest");
		await hre.network.provider.request({method: "evm_setNextBlockTimestamp", params: ["0x" + (BigInt(latestBlock4_.timestamp) + 60n).toString(16),],});
		await hre.network.provider.request({method: "evm_mine", params: [],});
		const nextCstBidPrice_ = await cosmicSignatureGameV3Proxy_.getNextCstBidPrice();
		const bidder1CstBalance_ = await cosmicSignatureToken_.balanceOf(bidder1Signer_.address);
		if (bidder1CstBalance_ >= nextCstBidPrice_) {
			await (
				await cosmicSignatureGameV3Proxy_
					.connect(bidder1Signer_)
					.bidWithCst(nextCstBidPrice_ * 2n + 10n ** 18n, "V3 upgrade rehearsal CST bid", 0n)
			).wait();
			check(true, "A CST bid succeeds after the upgrade.");
		} else {
			console.info("%s", `Skipping the CST bid smoke test: bidder 1 has ${bidder1CstBalance_} CST Wei, the price is ${nextCstBidPrice_}.`);
		}
	}

	// Claiming the main prize: `mainPrizeNumCosmicSignatureNfts` CS NFTs are minted to the beneficiary,
	// and champion durations are persisted.
	{
		const mainPrizeTime_ = await cosmicSignatureGameV3Proxy_.mainPrizeTime();
		{
			// `mainPrizeTime` can be in the past on the fork (an overdue round). Only warp forward.
			const latestBlock5_ = await hre.ethers.provider.getBlock("latest");
			if (BigInt(latestBlock5_.timestamp) < mainPrizeTime_ + 1n) {
				await hre.network.provider.request({method: "evm_setNextBlockTimestamp", params: ["0x" + (mainPrizeTime_ + 1n).toString(16),],});
			}
		}

		// The last bidder is guaranteed to be one of our smoke-test signers at this point.
		const lastBidderAddress_ = await cosmicSignatureGameV3Proxy_.lastBidderAddress();
		const lastBidderSigner_ = (lastBidderAddress_ == bidder1Signer_.address) ? bidder1Signer_ : bidder2Signer_;
		const roundNumBeforeClaim_ = await cosmicSignatureGameV3Proxy_.roundNum();
		const cosmicSignatureNftAddress_ = preUpgradeValues_["nft"];
		const cosmicSignatureNft_ = await hre.ethers.getContractAt("CosmicSignatureNft", cosmicSignatureNftAddress_);
		const beneficiaryNftBalanceBeforeClaim_ = await cosmicSignatureNft_.balanceOf(lastBidderAddress_);
		const transactionReceipt_ = await (await cosmicSignatureGameV3Proxy_.connect(lastBidderSigner_).claimMainPrize()).wait();
		check(transactionReceipt_.status == 1, "claimMainPrize succeeds after the upgrade.");
		const mainPrizeClaimedLog_ =
			transactionReceipt_.logs
				.map((log_) => { try { return cosmicSignatureGameV3Proxy_.interface.parseLog(log_); } catch { return null; } })
				.find((parsedLog_) => (parsedLog_ != null && parsedLog_.name == "MainPrizeClaimed"));
		check(
			mainPrizeClaimedLog_ != null && mainPrizeClaimedLog_.args.prizeNumCosmicSignatureNfts == DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS,
			"MainPrizeClaimed reports the expected number of beneficiary CS NFTs.",
			mainPrizeClaimedLog_?.args?.prizeNumCosmicSignatureNfts
		);
		{
			const beneficiaryNftBalanceAfterClaim_ = await cosmicSignatureNft_.balanceOf(lastBidderAddress_);
			const beneficiaryNumNftsMinted_ = beneficiaryNftBalanceAfterClaim_ - beneficiaryNftBalanceBeforeClaim_;
			check(
				beneficiaryNumNftsMinted_ >= DEFAULT_MAIN_PRIZE_NUM_COSMIC_SIGNATURE_NFTS,
				"The main prize beneficiary received at least mainPrizeNumCosmicSignatureNfts CS NFTs.",
				beneficiaryNumNftsMinted_
			);
		}
		{
			const championDurations_ = await cosmicSignatureGameV3Proxy_.championDurations(roundNumBeforeClaim_);
			check(championDurations_[0] > 0n, "championDurations.enduranceChampion was persisted at claim time.", championDurations_[0]);
		}
		{
			const roundNumAfterClaim_ = await cosmicSignatureGameV3Proxy_.roundNum();
			check(roundNumAfterClaim_ == roundNumBeforeClaim_ + 1n, "roundNum incremented after the claim.");
		}
	}

	// #endregion
	// #region Summary.

	console.info();
	if (numChecksFailed <= 0) {
		console.info("%s", "SUCCESS. All rehearsal checks passed.");
	} else {
		console.error("%s", `FAILURE. ${numChecksFailed} rehearsal check(s) failed.`);
		process.exitCode = 1;
	}

	// #endregion
}

// #endregion
// #region

main().catch((errorObject_) => {
	console.error(errorObject_);
	process.exitCode = 1;
});

// #endregion
