// #region

"use strict";

// #endregion
// #region

// [Comment-202608242]
// Behavior-parity gate for the modular delegatecall restructuring of `CosmicSignatureGameV3`.
//
// This test executes a fixed, fully deterministic gameplay scenario against the V3 Game
// and compares every emitted event, every revert, and every state snapshot against a committed
// baseline that was recorded while `CosmicSignatureGameV3` was still the audited monolith
// (see `test/baselines/cosmic-signature-game-v3-behavior-baseline.json`, which contains
// the source commit hash).
//
// The only values that are masked, rather than compared exactly, are those derived from the
// on-chain random number seed (raffle winner identities and NFT seeds), because the seed
// incorporates the previous block hash and the block base fee, which unavoidably differ between
// compiled builds. Masked winner addresses are still verified to be members of the round's
// bidder set. Everything else, including event order, amounts, timestamps, and revert data,
// must match byte for byte.
//
// To re-record the baseline (only valid on a commit whose behavior is known-good):
//    RECORD_GAME_BEHAVIOR_BASELINE=true npx hardhat test test/tests-src/CosmicSignatureGameV3-BehaviorParity.js
// [/Comment-202608242]

// #endregion
// #region

const nodeFsModule = require("node:fs");
const nodePathModule = require("node:path");
const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { ENABLE_ASSERTS, waitForTransactionReceipt, parseBooleanEnvironmentVariable } = require("../../src/Helpers.js");
const { getLatestBlockTimestamp } = require("../src/V2UpgradeTestHelpers.js");
const { deployV1CompleteRoundZeroAndUpgradeToV2AndV3 } = require("../src/V3UpgradeTestHelpers.js");

// #endregion
// #region Constants.

const baselineFilePath = nodePathModule.join(__dirname, "..", "baselines", "cosmic-signature-game-v3-behavior-baseline.json");
const recordBaseline = parseBooleanEnvironmentVariable("RECORD_GAME_BEHAVIOR_BASELINE", false);

// A far-future anchor timestamp from which every scenario block timestamp is derived,
// which makes the whole scenario absolute-deterministic across compiled builds,
// even though different builds mine a different number of deployment blocks before the anchor.
// 2040-01-01T00:00:00Z.
const anchorTimeStamp = 2_208_988_800n;

// Comment-202608242 applies. A pinned gas price makes `tx.gasprice`-dependent logic
// (the ETH bid refund swallowing threshold) deterministic regardless of the block base fee.
// It must be small enough for the fixed 30M transaction gas limit to be affordable
// to the 1-ETH-funded owner wallet, and above the (decaying) block base fee.
const pinnedGasPrice = 2n * (10n ** 9n);

// Events whose address arguments may identify random raffle winners within the main prize claim transaction.
const raffleSensitiveEventNames =
	new Set(["RaffleWinnerBidderEthPrizeAllocated", "RaffleWinnerPrizePaid", "EthReceived", "Transfer", "NftMinted",]);

// Probes whose revert data legitimately differs between the production build and the assert-enabled build.
// The only known case: the `reinitialize` replay reverts with `InvalidInitialization` in the production,
// but with `Panic(0x01)` in the assert-enabled build (the `#enable_asserts` previous-version check fires first).
const assertProfileSensitiveProbeLabels = new Set(["reinitialize replay rejected",]);

// #endregion
// #region `ScenarioRecorder`

class ScenarioRecorder {
	constructor() {
		this.steps = [];
		this.addressToRoleMapping = new Map();
		this.numUnknownAddresses = 0;
		this.claimTransactionIsBeingRecorded = false;
		this.bidderAddresses = new Set();
		this.eventParsingInterfaces = [];
	}

	registerAddressRole(address_, roleName_) {
		this.addressToRoleMapping.set(address_.toLowerCase(), roleName_);
	}

	normalizeAddress(address_) {
		const addressAsLowerCase_ = address_.toLowerCase();
		if (addressAsLowerCase_ == "0x0000000000000000000000000000000000000000") {
			return "zero-address";
		}
		let roleName_ = this.addressToRoleMapping.get(addressAsLowerCase_);
		if (roleName_ === undefined) {
			roleName_ = `unknown-${this.numUnknownAddresses}`;
			++ this.numUnknownAddresses;
			this.addressToRoleMapping.set(addressAsLowerCase_, roleName_);
		}
		return roleName_;
	}

	normalizeValue(value_) {
		if (typeof value_ == "bigint") {
			return value_.toString();
		}
		if (typeof value_ == "string" && /^0x[0-9a-fA-F]{40}$/.test(value_)) {
			return this.normalizeAddress(value_);
		}
		if (Array.isArray(value_)) {
			return value_.map((item_) => (this.normalizeValue(item_)));
		}
		return value_;
	}

	normalizeEventArgument(eventName_, argumentName_, value_) {
		if (this.claimTransactionIsBeingRecorded) {
			// Masking the random number seed derivatives. Comment-202608242 applies.
			if (argumentName_.toLowerCase().includes("seed")) {
				return "MASKED_RANDOM";
			}
			// Any bidder address is masked in these events, because the same event position can be occupied
			// by a random raffle winner in one compiled build and by a deterministic participant in another
			// (a deterministic participant can also win a raffle slot). The deterministic prize assignments
			// are still compared exactly through the Game's own typed events (`MainPrizeClaimed`,
			// `LastCstBidderPrizePaid`, `EnduranceChampionPrizePaid`, `ChronoWarriorPrizePaid`),
			// which are not masked. A raffle win by a non-bidder would stay unmasked and fail the comparison,
			// which doubles as the winner-set membership check.
			if (
				raffleSensitiveEventNames.has(eventName_) &&
				typeof value_ == "string" &&
				/^0x[0-9a-fA-F]{40}$/.test(value_) &&
				this.bidderAddresses.has(value_.toLowerCase())
			) {
				return "MASKED_RAFFLE_WINNER";
			}
		}
		return this.normalizeValue(value_);
	}

	parseAndNormalizeLog(log_) {
		for (const eventParsingInterface_ of this.eventParsingInterfaces) {
			let parsedLog_;
			try {
				parsedLog_ = eventParsingInterface_.parseLog(log_);
			} catch {
				continue;
			}
			if (parsedLog_ == null) {
				continue;
			}
			const normalizedArguments_ = [];
			for ( let argumentIndex_ = 0; argumentIndex_ < parsedLog_.args.length; ++ argumentIndex_ ) {
				const argumentName_ = parsedLog_.fragment.inputs[argumentIndex_]?.name ?? argumentIndex_.toString();
				normalizedArguments_.push([argumentName_, this.normalizeEventArgument(parsedLog_.name, argumentName_, parsedLog_.args[argumentIndex_]),]);
			}
			return {emitter: this.normalizeAddress(log_.address), event: parsedLog_.name, arguments: normalizedArguments_,};
		}
		return {emitter: this.normalizeAddress(log_.address), event: "«unparsed»", topic0: log_.topics[0],};
	}

	async recordTransaction(label_, transactionResponsePromise_, transactionIsClaim_ = false) {
		this.claimTransactionIsBeingRecorded = transactionIsClaim_;
		const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
		const block_ = await transactionReceipt_.getBlock();
		const events_ = transactionReceipt_.logs.map((log_) => (this.parseAndNormalizeLog(log_)));
		this.claimTransactionIsBeingRecorded = false;
		this.steps.push({kind: "transaction", label: label_, blockTimeStamp: block_.timestamp.toString(), events: events_,});
		return transactionReceipt_;
	}

	async recordProbe(label_, probeCallPromise_) {
		let outcome_;
		try {
			const result_ = await probeCallPromise_;
			outcome_ = {succeeded: true, result: this.normalizeValue(result_),};
		} catch (error_) {
			// Revert data includes the error selector and all ABI-encoded error arguments.
			// Error messages are not recorded because they can embed build-dependent contract addresses.
			outcome_ = {succeeded: false, revertData: error_.data ?? null,};
		}
		this.steps.push({kind: "probe", label: label_, outcome: outcome_,});
	}

	recordSnapshot(label_, values_) {
		const normalizedValues_ = {};
		for (const [key_, value_] of Object.entries(values_)) {
			normalizedValues_[key_] = this.normalizeValue(value_);
		}
		this.steps.push({kind: "snapshot", label: label_, values: normalizedValues_,});
	}
}

// #endregion
// #region `runScenario`

async function runScenario() {
	// #region Deployment, upgrades, address roles.

	const recorder_ = new ScenarioRecorder();
	const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3(2n);
	const game_ = contracts_.cosmicSignatureGameV3Proxy;
	const ownerSigner_ = contracts_.ownerSigner;

	recorder_.registerAddressRole(contracts_.cosmicSignatureGameProxyAddress, "game-proxy");
	recorder_.registerAddressRole(contracts_.cosmicSignatureTokenAddress, "token");
	recorder_.registerAddressRole(contracts_.cosmicSignatureNftAddress, "nft");
	recorder_.registerAddressRole(contracts_.randomWalkNftAddress, "random-walk-nft");
	recorder_.registerAddressRole(contracts_.prizesWalletAddress, "prizes-wallet");
	recorder_.registerAddressRole(contracts_.stakingWalletRandomWalkNftAddress, "staking-wallet-random-walk-nft");
	recorder_.registerAddressRole(contracts_.stakingWalletCosmicSignatureNftAddress, "staking-wallet-cosmic-signature-nft");
	recorder_.registerAddressRole(contracts_.marketingWalletAddress, "marketing-wallet");
	recorder_.registerAddressRole(contracts_.charityWalletAddress, "charity-wallet");
	recorder_.registerAddressRole(contracts_.cosmicSignatureDaoAddress, "dao");
	recorder_.registerAddressRole(ownerSigner_.address, "owner");
	recorder_.registerAddressRole(contracts_.deployerSigner.address, "deployer");
	recorder_.registerAddressRole(contracts_.charitySigner.address, "charity-signer");
	recorder_.registerAddressRole(contracts_.treasurerSigner.address, "treasurer");
	for ( let signerIndex_ = 0; signerIndex_ < contracts_.signers.length; ++ signerIndex_ ) {
		recorder_.registerAddressRole(contracts_.signers[signerIndex_].address, `signer-${signerIndex_}`);
	}

	recorder_.eventParsingInterfaces = [
		game_.interface,
		contracts_.cosmicSignatureToken.interface,
		contracts_.cosmicSignatureNft.interface,
		contracts_.randomWalkNft.interface,
		contracts_.prizesWallet.interface,
		contracts_.stakingWalletRandomWalkNft.interface,
		contracts_.stakingWalletCosmicSignatureNft.interface,
		contracts_.charityWallet.interface,
	];

	// #endregion
	// #region Auxiliary contracts and the deterministic time anchor.

	const mockErc20Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc20", contracts_.deployerSigner);
	const mockErc20_ = await mockErc20Factory_.deploy();
	await mockErc20_.waitForDeployment();
	recorder_.registerAddressRole(await mockErc20_.getAddress(), "mock-erc20");
	const mockErc721Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc721", contracts_.deployerSigner);
	const mockErc721_ = await mockErc721Factory_.deploy();
	await mockErc721_.waitForDeployment();
	recorder_.registerAddressRole(await mockErc721_.getAddress(), "mock-erc721");
	recorder_.eventParsingInterfaces.push(mockErc20_.interface, mockErc721_.interface);

	const signer1_ = contracts_.signers[1];
	const signer2_ = contracts_.signers[2];
	const signer3_ = contracts_.signers[3];
	const signer4_ = contracts_.signers[4];
	const signer5_ = contracts_.signers[5];

	await waitForTransactionReceipt(mockErc20_.connect(signer3_).mint(signer3_.address, 10n ** 21n));
	await waitForTransactionReceipt(mockErc20_.connect(signer3_).approve(contracts_.prizesWalletAddress, 10n ** 21n));
	await waitForTransactionReceipt(mockErc20_.connect(signer4_).mint(signer4_.address, 10n ** 21n));
	await waitForTransactionReceipt(mockErc20_.connect(signer4_).approve(contracts_.prizesWalletAddress, 10n ** 21n));
	const mockNftId_ = await mockErc721_.connect(signer4_).mint.staticCall(signer4_.address);
	await waitForTransactionReceipt(mockErc721_.connect(signer4_).mint(signer4_.address));
	await waitForTransactionReceipt(mockErc721_.connect(signer4_).setApprovalForAll(contracts_.prizesWalletAddress, true));

	// Comment-202608242 applies. From this point on, every block timestamp is an absolute constant.
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(anchorTimeStamp),]);
	await hre.ethers.provider.send("evm_mine");

	// #endregion
	// #region A helper that executes a transaction at a pinned absolute timestamp.

	let nextTimeStampOffset_ = 10n;

	const executeAt_ = async (timeStampOffset_, label_, transactionResponsePromiseFactory_, transactionIsClaim_ = false) => {
		expect(timeStampOffset_).greaterThanOrEqual(nextTimeStampOffset_);
		nextTimeStampOffset_ = timeStampOffset_ + 1n;
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(anchorTimeStamp + timeStampOffset_),]);
		return await recorder_.recordTransaction(label_, transactionResponsePromiseFactory_(), transactionIsClaim_);
	};

	// #endregion
	// #region Post-upgrade guard probes.

	await recorder_.recordProbe(
		"retired setter reverts NotImplemented",
		game_.connect(ownerSigner_).setCstDutchAuctionDuration.staticCall(123n)
	);
	await recorder_.recordProbe(
		"zero value rejected by V3 setter",
		game_.connect(ownerSigner_).setMainPrizeNumCosmicSignatureNfts.staticCall(0n)
	);
	await recorder_.recordProbe(
		"reinitialize replay rejected",
		game_.connect(ownerSigner_).reinitialize.staticCall()
	);
	await recorder_.recordProbe(
		"non-owner cannot upgrade",
		game_.connect(signer1_).upgradeToAndCall.staticCall(signer1_.address, "0x")
	);
	await recorder_.recordProbe(
		"non-owner cannot set parameters",
		game_.connect(signer1_).setCharityAddress.staticCall(signer1_.address)
	);
	await recorder_.recordProbe(
		"unknown selector reverts without data",
		hre.ethers.provider.call({to: contracts_.cosmicSignatureGameProxyAddress, data: "0xdeadbeef",})
	);

	// #endregion
	// #region Configuring the round start at an absolute time.

	// The V3 default `delayDurationBeforeRoundActivation` has long passed at the anchor,
	// so the round is currently active with no bids. These two setters are allowed in this state.
	await executeAt_(10n, "owner sets delayDurationBeforeRoundActivation", () => (game_.connect(ownerSigner_).setDelayDurationBeforeRoundActivation(1800n, {gasPrice: pinnedGasPrice,})));
	await executeAt_(11n, "owner sets roundActivationTime", () => (game_.connect(ownerSigner_).setRoundActivationTime(anchorTimeStamp + 20n, {gasPrice: pinnedGasPrice,})));

	await recorder_.recordProbe(
		"bid before round activation rejected",
		game_.connect(signer1_).bidWithEth.staticCall(-1n, "", 0n, {value: 10n ** 18n,})
	);

	// #endregion
	// #region Pre-bid state snapshot.

	await snapshotGameState_(recorder_, "pre-bids", contracts_, game_);

	// #endregion
	// #region The bidding sequence.

	const ethBidPriceAt20_ = await game_.getNextEthBidPriceAdvanced(anchorTimeStamp + 20n - (await getLatestBlockTimestamp()));
	await executeAt_(20n, "signer-1 places the first ETH bid", () => (game_.connect(signer1_).bidWithEth(-1n, "hello world", 0n, {value: ethBidPriceAt20_, gasPrice: pinnedGasPrice,})));
	recorder_.bidderAddresses.add(signer1_.address.toLowerCase());

	await recorder_.recordProbe(
		"same-second bid rejected",
		game_.connect(signer2_).bidWithEth.staticCall(-1n, "", 0n, {value: 10n ** 18n,})
	);
	await recorder_.recordProbe(
		"CST bid rejected while it is not the first bid... but with a bid placed it is allowed to fail on price only; probing max limit 0",
		game_.connect(signer2_).bidWithCst.staticCall(0n, "", 0n)
	);

	await executeAt_(50n, "signer-2 places an ETH bid with a generous overpayment", () => (game_.connect(signer2_).bidWithEth(-1n, "", 0n, {value: 10n ** 18n, gasPrice: pinnedGasPrice,})));
	recorder_.bidderAddresses.add(signer2_.address.toLowerCase());

	// A Random Walk NFT bid.
	const randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
	await executeAt_(80n, "signer-2 mints a Random Walk NFT", () => (contracts_.randomWalkNft.connect(signer2_).mint({value: randomWalkNftMintPrice_, gasPrice: pinnedGasPrice,})));
	const randomWalkNftId_ = (await contracts_.randomWalkNft.totalSupply()) - 1n;
	await executeAt_(81n, "signer-2 places an ETH bid with a Random Walk NFT", () => (game_.connect(signer2_).bidWithEth(randomWalkNftId_, "rw bid", 0n, {value: 10n ** 18n, gasPrice: pinnedGasPrice,})));

	await recorder_.recordProbe(
		"reusing the Random Walk NFT is rejected",
		game_.connect(signer2_).bidWithEth.staticCall(randomWalkNftId_, "", 0n, {value: 10n ** 18n,})
	);
	await recorder_.recordProbe(
		"bidding with a foreign Random Walk NFT is rejected",
		game_.connect(signer3_).bidWithEth.staticCall(randomWalkNftId_, "", 0n, {value: 10n ** 18n,})
	);

	await executeAt_(120n, "signer-3 places an ETH bid and donates an ERC-20 token", () => (game_.connect(signer3_).bidWithEthAndDonateToken(-1n, "with token", 0n, mockErc20_, 1000n, {value: 10n ** 18n, gasPrice: pinnedGasPrice,})));
	recorder_.bidderAddresses.add(signer3_.address.toLowerCase());
	await executeAt_(150n, "signer-4 places an ETH bid and donates an NFT", () => (game_.connect(signer4_).bidWithEthAndDonateNft(-1n, "with nft", 0n, mockErc721_, mockNftId_, {value: 10n ** 18n, gasPrice: pinnedGasPrice,})));
	recorder_.bidderAddresses.add(signer4_.address.toLowerCase());

	await executeAt_(160n, "signer-5 donates ETH", () => (game_.connect(signer5_).donateEth({value: 10n ** 17n, gasPrice: pinnedGasPrice,})));
	await executeAt_(161n, "signer-5 donates ETH with info", () => (game_.connect(signer5_).donateEthWithInfo("{\"message\":\"parity\"}", {value: 10n ** 16n, gasPrice: pinnedGasPrice,})));

	await snapshotGameState_(recorder_, "mid-round", contracts_, game_);

	// #endregion
	// #region CST bids.

	// A long pause lets the previous bidder accrue a large CST reward on the next ETH bid,
	// and lets the CST bid price decline into an affordable range.
	await executeAt_(11500n, "signer-1 places an ETH bid after a long pause", () => (game_.connect(signer1_).bidWithEth(-1n, "big reward incoming", 0n, {value: 10n ** 18n, gasPrice: pinnedGasPrice,})));

	// `signer-4` (outbid above) just received a large accrued CST reward, so it places all three CST bids.
	// A consecutive CST bid by the same bidder also mints the accrued reward to that same bidder.
	await executeAt_(11560n, "signer-4 places a CST bid", () => (game_.connect(signer4_).bidWithCst(10n ** 30n, "cst bid 1", 0n, {gasPrice: pinnedGasPrice,})));
	await executeAt_(11620n, "signer-4 places a CST bid and donates an ERC-20 token", () => (game_.connect(signer4_).bidWithCstAndDonateToken(10n ** 30n, "cst bid 2", 0n, mockErc20_, 500n, {gasPrice: pinnedGasPrice,})));
	await executeAt_(11680n, "signer-4 places a CST bid and donates an NFT", async () => {
		const mockNftId2_ = await mockErc721_.connect(signer4_).mint.staticCall(signer4_.address);
		await waitForTransactionReceipt(mockErc721_.connect(signer4_).mint(signer4_.address, {gasPrice: pinnedGasPrice,}));
		return game_.connect(signer4_).bidWithCstAndDonateNft(10n ** 30n, "cst bid 3", 0n, mockErc721_, mockNftId2_, {gasPrice: pinnedGasPrice,});
	});

	await recorder_.recordProbe(
		"bid CST reward min limit not reached",
		game_.connect(signer1_).bidWithCst.staticCall(10n ** 30n, "", 10n ** 30n)
	);
	await recorder_.recordProbe(
		"halving the ETH Dutch auction ending bid price is rejected mid-round",
		game_.connect(ownerSigner_).halveEthDutchAuctionEndingBidPrice.staticCall()
	);
	await recorder_.recordProbe(
		"setter requiring an inactive round is rejected mid-round",
		game_.connect(ownerSigner_).setMainEthPrizeAmountPercentage.staticCall(20n)
	);

	await snapshotGameState_(recorder_, "after-cst-bids", contracts_, game_);

	// #endregion
	// #region The main prize claim.

	{
		const mainPrizeTime_ = await game_.mainPrizeTime();
		expect(mainPrizeTime_).greaterThan(anchorTimeStamp + 11680n);

		await recorder_.recordProbe(
			"early claim by the last bidder is rejected",
			game_.connect(signer4_).claimMainPrize.staticCall()
		);
		await recorder_.recordProbe(
			"claim by a non-last-bidder before the timeout is rejected",
			game_.connect(signer1_).claimMainPrize.staticCall()
		);

		const claimTimeStampOffset_ = mainPrizeTime_ - anchorTimeStamp + 100n;
		await executeAt_(claimTimeStampOffset_, "signer-4 claims the main prize", () => (game_.connect(signer4_).claimMainPrize({gasPrice: pinnedGasPrice,})), true);

		await snapshotGameState_(recorder_, "post-claim", contracts_, game_);

		// #endregion
		// #region The next round smoke test.

		const nextRoundActivationTimeStampOffset_ = claimTimeStampOffset_ + 310n;
		await executeAt_(claimTimeStampOffset_ + 300n, "owner restarts the round at an absolute time", () => (game_.connect(ownerSigner_).setRoundActivationTime(anchorTimeStamp + nextRoundActivationTimeStampOffset_, {gasPrice: pinnedGasPrice,})));
		const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(anchorTimeStamp + nextRoundActivationTimeStampOffset_ - (await getLatestBlockTimestamp()));
		await executeAt_(nextRoundActivationTimeStampOffset_, "signer-5 places the first ETH bid of the next round", () => (game_.connect(signer5_).bidWithEth(-1n, "round 3", 0n, {value: ethBidPrice_, gasPrice: pinnedGasPrice,})));
	}
	await snapshotGameState_(recorder_, "next-round", contracts_, game_);

	// #endregion

	return recorder_;
}

// #endregion
// #region `snapshotGameState_`

async function snapshotGameState_(recorder_, label_, contracts_, game_) {
	const values_ = {};

	// Plain state variable getters.
	for (const getterName_ of [
		"roundNum", "lastBidderAddress", "lastCstBidderAddress",
		"enduranceChampionAddress", "enduranceChampionStartTimeStamp", "enduranceChampionDuration", "prevEnduranceChampionDuration",
		"chronoWarriorAddress", "chronoWarriorDuration",
		"delayDurationBeforeRoundActivation", "roundActivationTime",
		"ethDutchAuctionDurationDivisor", "ethDutchAuctionBeginningBidPrice", "ethDutchAuctionEndingBidPriceDivisor",
		"nextEthBidPrice", "ethBidPriceIncreaseDivisor", "ethBidRefundAmountInGasToSwallowMaxLimit",
		"cstDutchAuctionBeginningTimeStamp", "cstDutchAuctionDuration", "cstDutchAuctionBeginningBidPrice",
		"nextRoundFirstCstDutchAuctionBeginningBidPrice", "cstDutchAuctionBeginningBidPriceMinLimit",
		"bidMessageLengthMaxLimit", "bidCstRewardAmountMultiplier",
		"cstPrizeAmount", "chronoWarriorEthPrizeAmountPercentage", "raffleTotalEthPrizeAmountForBiddersPercentage",
		"numRaffleEthPrizesForBidders", "numRaffleCosmicSignatureNftsForBidders", "numRaffleCosmicSignatureNftsForRandomWalkNftStakers",
		"cosmicSignatureNftStakingTotalEthRewardAmountPercentage",
		"initialDurationUntilMainPrizeDivisor", "mainPrizeTime", "mainPrizeTimeIncrementInMicroSeconds",
		"mainPrizeTimeIncrementIncreaseDivisor", "timeoutDurationToClaimMainPrize", "mainEthPrizeAmountPercentage",
		"token", "randomWalkNft", "nft", "prizesWallet", "stakingWalletRandomWalkNft", "stakingWalletCosmicSignatureNft",
		"marketingWallet", "marketingWalletCstContributionAmount", "charityAddress", "charityEthDonationAmountPercentage",
		"cstDutchAuctionDurationChangeDivisor",
		"cstBidPriceDeclineMultiplier", "cstBidPriceDeclineMultiplierChangeDivisor",
		"roundLateBidDurationDivisor", "roundLateBidPricePremiumAmountBaseMultiplier", "roundLateBidPricePremiumAmountExponent",
		"mainPrizeNumCosmicSignatureNfts",
		"numEthDonationWithInfoRecords",
		"owner", "UPGRADE_INTERFACE_VERSION",
	]) {
		values_[getterName_] = await game_[getterName_]();
	}

	// Computed views.
	values_["getNextEthBidPrice"] = await game_.getNextEthBidPrice();
	values_["getNextCstBidPrice"] = await game_.getNextCstBidPrice();
	values_["getBidCstRewardAmount"] = await game_.getBidCstRewardAmount();
	values_["getEthDutchAuctionDurations"] = await game_.getEthDutchAuctionDurations();
	values_["getCstDutchAuctionDurations"] = await game_.getCstDutchAuctionDurations();
	values_["getMainEthPrizeAmount"] = await game_.getMainEthPrizeAmount();
	values_["getCharityEthDonationAmount"] = await game_.getCharityEthDonationAmount();
	values_["getChronoWarriorEthPrizeAmount"] = await game_.getChronoWarriorEthPrizeAmount();
	values_["getRaffleTotalEthPrizeAmountForBidders"] = await game_.getRaffleTotalEthPrizeAmountForBidders();
	values_["getCosmicSignatureNftStakingTotalEthRewardAmount"] = await game_.getCosmicSignatureNftStakingTotalEthRewardAmount();
	values_["getMainPrizeTimeIncrement"] = await game_.getMainPrizeTimeIncrement();
	values_["getInitialDurationUntilMainPrize"] = await game_.getInitialDurationUntilMainPrize();
	values_["getDurationUntilMainPrize"] = await game_.getDurationUntilMainPrize();
	values_["getDurationUntilMainPrizeRaw"] = await game_.getDurationUntilMainPrizeRaw();
	values_["getDurationUntilRoundActivation"] = await game_.getDurationUntilRoundActivation();
	values_["getDurationElapsedSinceRoundActivation"] = await game_.getDurationElapsedSinceRoundActivation();
	values_["getRoundLateBidDuration"] = await game_.getRoundLateBidDuration();
	values_["getEthPlusRandomWalkNftBidPrice"] = await game_.getEthPlusRandomWalkNftBidPrice(10n ** 18n);
	values_["tryGetCurrentChampions"] = await game_.tryGetCurrentChampions();
	{
		const currentRoundNum_ = await game_.roundNum();
		values_["getTotalNumBids(currentRound)"] = await game_.getTotalNumBids(currentRoundNum_);
		values_["championDurations(1)"] = await game_.championDurations(1n);
		values_["championDurations(2)"] = await game_.championDurations(2n);
	}

	// Balances of the protocol contracts. These do not depend on gas spending.
	values_["balance:game"] = await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddress);
	values_["balance:prizes-wallet"] = await hre.ethers.provider.getBalance(contracts_.prizesWalletAddress);
	values_["balance:charity-wallet"] = await hre.ethers.provider.getBalance(contracts_.charityWalletAddress);
	values_["balance:staking-wallet-cosmic-signature-nft"] = await hre.ethers.provider.getBalance(contracts_.stakingWalletCosmicSignatureNftAddress);
	values_["totalSupply:token"] = await contracts_.cosmicSignatureToken.totalSupply();
	values_["totalSupply:nft"] = await contracts_.cosmicSignatureNft.totalSupply();
	values_["balanceOf:token:marketing-wallet"] = await contracts_.cosmicSignatureToken.balanceOf(contracts_.marketingWalletAddress);

	recorder_.recordSnapshot(label_, values_);
}

// #endregion
// #region The test.

describe("CosmicSignatureGameV3-BehaviorParity", function () {
	it("The deterministic gameplay scenario matches the recorded monolith baseline", async function () {
		const recorder_ = await runScenario();
		const trace_ = {steps: recorder_.steps,};

		{
			// A debugging aid: dump the recorded trace to the given file without affecting the comparison.
			const traceDumpFilePath_ = process.env["DUMP_GAME_BEHAVIOR_TRACE"];
			if (traceDumpFilePath_ != undefined && traceDumpFilePath_.length > 0) {
				nodeFsModule.writeFileSync(traceDumpFilePath_, JSON.stringify(trace_, null, "\t") + "\n");
			}
		}

		if (recordBaseline) {
			const { execSync } = require("node:child_process");
			let commit_ = "unknown";
			try {
				commit_ = execSync("git rev-parse HEAD", {cwd: nodePathModule.join(__dirname, "..", ".."),}).toString().trim();
			} catch {
				// Git being unavailable only degrades the baseline metadata.
			}
			const baseline_ = {
				note:
					"Behavior baseline of the CosmicSignatureGameV3 monolith, recorded by " +
					"test/tests-src/CosmicSignatureGameV3-BehaviorParity.js. Comment-202608242 applies.",
				commit: commit_,
				generatedAt: new Date().toISOString(),
				...trace_,
			};
			nodeFsModule.mkdirSync(nodePathModule.dirname(baselineFilePath), {recursive: true,});
			nodeFsModule.writeFileSync(baselineFilePath, JSON.stringify(baseline_, null, "\t") + "\n");
			console.info("%s", `Recorded the behavior baseline at ${baselineFilePath}. Steps: ${trace_.steps.length}.`);
			return;
		}

		expect(nodeFsModule.existsSync(baselineFilePath), `The behavior baseline file is missing: ${baselineFilePath}. Re-record it only on a known-good commit. Comment-202608242 applies.`).equal(true);
		const baseline_ = JSON.parse(nodeFsModule.readFileSync(baselineFilePath, "utf8"));
		expect(trace_.steps.length, "The number of scenario steps diverged from the baseline.").equal(baseline_.steps.length);
		for ( let stepIndex_ = 0; stepIndex_ < trace_.steps.length; ++ stepIndex_ ) {
			const recordedStep_ = trace_.steps[stepIndex_];
			const baselineStep_ = baseline_.steps[stepIndex_];
			if (ENABLE_ASSERTS && recordedStep_.kind == "probe" && assertProfileSensitiveProbeLabels.has(recordedStep_.label)) {
				expect(recordedStep_.outcome.succeeded, `Scenario step ${stepIndex_} ("${baselineStep_.label}") diverged from the baseline.`).equal(baselineStep_.outcome.succeeded);
				continue;
			}
			expect(recordedStep_, `Scenario step ${stepIndex_} ("${baselineStep_.label}") diverged from the baseline.`).deep.equal(baselineStep_);
		}
	});
});

// #endregion
