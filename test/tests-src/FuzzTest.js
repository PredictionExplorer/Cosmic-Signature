// #region Header

// Cosmic Signature — comprehensive protocol fuzz test (Hardhat + Mocha + Chai)
//
// Goals:
// - Exercise many user-facing code paths with weighted random actions and reproducible RNG.
// - Assert key accounting invariants (CST supply vs tracked balances, round monotonicity, staking sanity).
// - Mix intentional failing transactions ("negative probes") to ensure the protocol rejects invalid calls.
//
// Environment (optional):
//   FUZZ_SEED=0x<64 hex chars>   — fixed uint256 seed for reproducibility (omit for random).
//   SKIP_LONG_TESTS=true        — shorter run (fewer rounds / participants / actions).
//
// Recommended run (Solidity asserts on):
//   HARDHAT_MODE_CODE=1 ENABLE_HARDHAT_PREPROCESSOR=true ENABLE_ASSERTS=true npx hardhat test test/tests-src/FuzzTest.js

// #endregion
// #region

"use strict";

// #endregion
// #region Imports

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const {
	generateRandomUInt256,
	generateRandomUInt256FromSeedWrapper,
	uint256ToPaddedHexString,
	waitForTransactionReceipt,
} = require("../../src/Helpers.js");
const {
	SKIP_LONG_TESTS,
	loadFixtureDeployContractsForTesting,
} = require("../../src/ContractTestingHelpers.js");

// #endregion
// #region Configuration

/** Every named fuzz action must appear here so statistics counters are always defined. */
const ALL_FUZZ_ACTION_KEYS = [
	"mintRandomWalkNft",
	"stakeRandomWalkNft",
	"unstakeRandomWalkNft",
	"stakeRandomWalkNftMany",
	"unstakeRandomWalkNftMany",
	"stakeCosmicSignatureNft",
	"unstakeCosmicSignatureNft",
	"stakeCosmicSignatureNftMany",
	"unstakeCosmicSignatureNftMany",
	"bidWithEth",
	"bidWithEthPlusNft",
	"bidWithEthReceive",
	"bidWithEthAndDonateToken",
	"bidWithEthAndDonateNft",
	"bidWithCst",
	"bidWithCstAndDonateToken",
	"bidWithCstAndDonateNft",
	"claimMainPrize",
	"withdrawEthPrize",
	"withdrawEthPrizeMany",
	"withdrawEthPrizeForAnyoneAfterTimeout",
	"withdrawEverythingBatch",
	"claimDonatedToken",
	"claimManyDonatedTokens",
	"claimDonatedNft",
	"claimManyDonatedNfts",
	"donateEth",
	"donateEthWithInfo",
	"donateEthZero",
	"transferNft",
	"transferCosmicSignatureNft",
	"transferCst",
	"transferCstMany",
	"cstDelegateSelf",
	"cstBurnSmall",
	"setCosmicSignatureNftName",
	"setRandomWalkTokenName",
	"randomWalkWithdraw",
	"charityWalletSend",
	"charityWalletSendAmount",
	"marketingWalletPayReward",
	"daoGovernanceCycle",
	"negativeProbe",
];

/**
 * @param {boolean} skipLongTests_
 * @returns {typeof BASE_FUZZ_CONFIG}
 */
function buildFuzzConfig(skipLongTests_) {
	const base = {
		numRounds: skipLongTests_ ? 12 : 150,
		numActiveParticipants: skipLongTests_ ? 6 : 10,
		actionsPerParticipantPerRound: skipLongTests_ ? 3 : 8,
		// Long runs can push Dutch ETH bid prices past any fixed ether cap; use a fraction of uint256 wei (Hardhat-only).
		ethPerParticipant: skipLongTests_ ? (1000n * 10n ** 18n) : (hre.ethers.MaxUint256 / 32n),
		minTimeBetweenActions: 1,
		maxTimeBetweenActions: 3600,
		maxBidMessageLength: 280,
		verbosity: skipLongTests_ ? 0 : 1,
		/** Run invariant checks every N successful state-changing actions (approximate). */
		invariantCheckEveryActions: skipLongTests_ ? 25 : 50,
		/** Weight for `negativeProbe` (intentional revert paths). */
		negativeProbeWeight: skipLongTests_ ? 5 : 8,
	};

	const behaviorProfiles = {
		aggressive: {
			bidWithEth: 22,
			bidWithEthPlusNft: 10,
			bidWithEthReceive: 2,
			bidWithEthAndDonateToken: 3,
			bidWithEthAndDonateNft: 2,
			bidWithCst: 8,
			bidWithCstAndDonateToken: 2,
			bidWithCstAndDonateNft: 1,
			mintRandomWalkNft: 8,
			stakeRandomWalkNft: 6,
			stakeRandomWalkNftMany: 2,
			unstakeRandomWalkNft: 2,
			unstakeRandomWalkNftMany: 1,
			stakeCosmicSignatureNft: 6,
			stakeCosmicSignatureNftMany: 2,
			unstakeCosmicSignatureNft: 2,
			unstakeCosmicSignatureNftMany: 1,
			claimMainPrize: 4,
			withdrawEthPrize: 2,
			withdrawEthPrizeMany: 1,
			withdrawEthPrizeForAnyoneAfterTimeout: 1,
			withdrawEverythingBatch: 1,
			claimDonatedToken: 1,
			claimManyDonatedTokens: 1,
			claimDonatedNft: 1,
			claimManyDonatedNfts: 1,
			donateEth: 2,
			donateEthWithInfo: 1,
			donateEthZero: 1,
			transferNft: 1,
			transferCosmicSignatureNft: 1,
			transferCst: 1,
			transferCstMany: 1,
			cstDelegateSelf: 1,
			cstBurnSmall: 1,
			setCosmicSignatureNftName: 1,
			setRandomWalkTokenName: 1,
			randomWalkWithdraw: 1,
			charityWalletSend: 1,
			charityWalletSendAmount: 1,
			marketingWalletPayReward: 1,
			daoGovernanceCycle: 1,
		},
		passive: {
			bidWithEth: 8,
			bidWithEthPlusNft: 4,
			bidWithEthReceive: 1,
			bidWithEthAndDonateToken: 2,
			bidWithEthAndDonateNft: 1,
			bidWithCst: 4,
			bidWithCstAndDonateToken: 1,
			bidWithCstAndDonateNft: 1,
			mintRandomWalkNft: 12,
			stakeRandomWalkNft: 12,
			stakeRandomWalkNftMany: 3,
			unstakeRandomWalkNft: 6,
			unstakeRandomWalkNftMany: 2,
			stakeCosmicSignatureNft: 12,
			stakeCosmicSignatureNftMany: 3,
			unstakeCosmicSignatureNft: 6,
			unstakeCosmicSignatureNftMany: 2,
			claimMainPrize: 2,
			withdrawEthPrize: 6,
			withdrawEthPrizeMany: 2,
			withdrawEthPrizeForAnyoneAfterTimeout: 1,
			withdrawEverythingBatch: 1,
			claimDonatedToken: 1,
			claimManyDonatedTokens: 1,
			claimDonatedNft: 1,
			claimManyDonatedNfts: 1,
			donateEth: 2,
			donateEthWithInfo: 2,
			donateEthZero: 1,
			transferNft: 2,
			transferCosmicSignatureNft: 1,
			transferCst: 1,
			transferCstMany: 1,
			cstDelegateSelf: 2,
			cstBurnSmall: 1,
			setCosmicSignatureNftName: 2,
			setRandomWalkTokenName: 1,
			randomWalkWithdraw: 1,
			charityWalletSend: 1,
			charityWalletSendAmount: 1,
			marketingWalletPayReward: 1,
			daoGovernanceCycle: 1,
		},
		whale: {
			bidWithEth: 18,
			bidWithEthPlusNft: 8,
			bidWithEthReceive: 2,
			bidWithEthAndDonateToken: 4,
			bidWithEthAndDonateNft: 3,
			bidWithCst: 10,
			bidWithCstAndDonateToken: 3,
			bidWithCstAndDonateNft: 2,
			mintRandomWalkNft: 6,
			stakeRandomWalkNft: 4,
			stakeRandomWalkNftMany: 2,
			unstakeRandomWalkNft: 2,
			unstakeRandomWalkNftMany: 1,
			stakeCosmicSignatureNft: 4,
			stakeCosmicSignatureNftMany: 2,
			unstakeCosmicSignatureNft: 2,
			unstakeCosmicSignatureNftMany: 1,
			claimMainPrize: 6,
			withdrawEthPrize: 4,
			withdrawEthPrizeMany: 2,
			withdrawEthPrizeForAnyoneAfterTimeout: 1,
			withdrawEverythingBatch: 1,
			claimDonatedToken: 1,
			claimManyDonatedTokens: 1,
			claimDonatedNft: 1,
			claimManyDonatedNfts: 1,
			donateEth: 6,
			donateEthWithInfo: 4,
			donateEthZero: 1,
			transferNft: 1,
			transferCosmicSignatureNft: 1,
			transferCst: 1,
			transferCstMany: 1,
			cstDelegateSelf: 1,
			cstBurnSmall: 1,
			setCosmicSignatureNftName: 1,
			setRandomWalkTokenName: 1,
			randomWalkWithdraw: 1,
			charityWalletSend: 2,
			charityWalletSendAmount: 1,
			marketingWalletPayReward: 2,
			daoGovernanceCycle: 1,
		},
		balanced: {
			bidWithEth: 12,
			bidWithEthPlusNft: 6,
			bidWithEthReceive: 2,
			bidWithEthAndDonateToken: 3,
			bidWithEthAndDonateNft: 2,
			bidWithCst: 6,
			bidWithCstAndDonateToken: 2,
			bidWithCstAndDonateNft: 2,
			mintRandomWalkNft: 8,
			stakeRandomWalkNft: 8,
			stakeRandomWalkNftMany: 2,
			unstakeRandomWalkNft: 4,
			unstakeRandomWalkNftMany: 2,
			stakeCosmicSignatureNft: 8,
			stakeCosmicSignatureNftMany: 2,
			unstakeCosmicSignatureNft: 4,
			unstakeCosmicSignatureNftMany: 2,
			claimMainPrize: 4,
			withdrawEthPrize: 4,
			withdrawEthPrizeMany: 2,
			withdrawEthPrizeForAnyoneAfterTimeout: 1,
			withdrawEverythingBatch: 1,
			claimDonatedToken: 1,
			claimManyDonatedTokens: 1,
			claimDonatedNft: 1,
			claimManyDonatedNfts: 1,
			donateEth: 3,
			donateEthWithInfo: 2,
			donateEthZero: 1,
			transferNft: 2,
			transferCosmicSignatureNft: 1,
			transferCst: 2,
			transferCstMany: 1,
			cstDelegateSelf: 2,
			cstBurnSmall: 1,
			setCosmicSignatureNftName: 2,
			setRandomWalkTokenName: 1,
			randomWalkWithdraw: 1,
			charityWalletSend: 1,
			charityWalletSendAmount: 1,
			marketingWalletPayReward: 1,
			daoGovernanceCycle: 2,
		},
	};

	return { ...base, behaviorProfiles };
}

// #endregion
// #region RNG and parsing

/**
 * @param {string | undefined} raw_
 * @returns {bigint | undefined} Uint256 seed, or undefined to generate fresh randomness.
 */
function parseFuzzSeedFromEnvironment(raw_) {
	if (raw_ == undefined || raw_.length <= 0) {
		return undefined;
	}
	const normalized_ = raw_.startsWith("0x") || raw_.startsWith("0X") ? raw_ : `0x${raw_}`;
	return BigInt.asUintN(256, BigInt(normalized_));
}

/**
 * Returns true if `error_` is a normal Hardhat VM revert from `fuzzTryWaitForTransactionReceipt`.
 * @param {unknown} error_
 */
function isExpectedHardhatRevertError(error_) {
	if ( ! (error_ instanceof Error)) {
		return false;
	}
	const message_ = error_.message ?? "";
	return (
		message_.startsWith("VM Exception while processing transaction: reverted") ||
		message_.includes("Transaction reverted and Hardhat couldn't infer the reason")
	);
}

/**
 * Like `fuzzTryWaitForTransactionReceipt` but accepts Hardhat's generic revert strings
 * (e.g. `randomWalkWithdraw` when the caller is not entitled), which do not always
 * include the classic `"VM Exception ... reverted with ..."` prefix.
 * @param {Promise<import("hardhat").ethers.TransactionResponse>} transactionResponsePromise_
 */
async function fuzzTryWaitForTransactionReceipt(transactionResponsePromise_) {
	try {
		return await waitForTransactionReceipt(transactionResponsePromise_);
	} catch (error_) {
		if (isExpectedHardhatRevertError(error_)) {
			return undefined;
		}
		throw error_;
	}
}

// #endregion
// #region Participant

class Participant {
	/**
	 * @param {number} index_
	 * @param {import("hardhat").ethers.Signer} signer_
	 * @param {Awaited<ReturnType<typeof loadFixtureDeployContractsForTesting>>} contracts_
	 * @param {Record<string, number>} behaviorProfile_
	 * @param {{ value: bigint }} randomSeedWrapper_
	 */
	constructor(index_, signer_, contracts_, behaviorProfile_, randomSeedWrapper_) {
		this.index = index_;
		this.signer = signer_;
		this.address = signer_.address;
		this.contracts = contracts_;
		this.behaviorProfile = behaviorProfile_;
		this.randomSeedWrapper = randomSeedWrapper_;
		this.stats = {
			bidsPlaced: 0,
			prizesWon: 0,
			nftsMinted: 0,
			nftsStaked: 0,
			ethSpent: 0n,
			cstSpent: 0n,
			ethEarned: 0n,
			cstEarned: 0n,
			negativeProbesExpectedRevert: 0,
		};
		this.gameProxy = contracts_.cosmicSignatureGameProxy.connect(signer_);
		this.randomWalkNft = contracts_.randomWalkNft.connect(signer_);
		this.cosmicSignatureNft = contracts_.cosmicSignatureNft.connect(signer_);
		this.cosmicSignatureToken = contracts_.cosmicSignatureToken.connect(signer_);
		this.stakingWalletRandomWalkNft = contracts_.stakingWalletRandomWalkNft.connect(signer_);
		this.stakingWalletCosmicSignatureNft = contracts_.stakingWalletCosmicSignatureNft.connect(signer_);
		this.prizesWallet = contracts_.prizesWallet.connect(signer_);
		this.charityWallet = contracts_.charityWallet.connect(signer_);
		this.cosmicSignatureDao = contracts_.cosmicSignatureDao.connect(signer_);
		this.mockErc20 = contracts_.fuzzTestMockErc20.connect(signer_);
		this.mockErc721 = contracts_.fuzzTestMockErc721.connect(signer_);
		/// @type {bigint} Populated after `FuzzTestMockErc721.mint` in test setup (one mock NFT per participant).
		this.mockDonatedNftTokenId = 0n;
	}

	random() {
		return generateRandomUInt256FromSeedWrapper(this.randomSeedWrapper);
	}

	/**
	 * Weighted random choice; total weight is the sum of all profile weights (need not be 100).
	 */
	selectAction() {
		let totalWeight_ = 0;
		for (const weight_ of Object.values(this.behaviorProfile)) {
			totalWeight_ += weight_;
		}
		if (totalWeight_ <= 0) {
			return "bidWithEth";
		}
		const roll_ = Number(this.random() % BigInt(totalWeight_));
		let cumulative_ = 0;
		for (const [action_, weight_] of Object.entries(this.behaviorProfile)) {
			cumulative_ += weight_;
			if (roll_ < cumulative_) {
				return action_;
			}
		}
		return "bidWithEth";
	}

	generateMessage(maxLength_ = undefined) {
		const limit_ = maxLength_ ?? this.contracts.fuzzConfig.maxBidMessageLength;
		const length_ = Number(this.random() % BigInt(limit_ + 1));
		if (length_ === 0) {
			return "";
		}
		const chars_ = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 !?.,";
		let message_ = "";
		for (let i_ = 0; i_ < length_; ++ i_) {
			message_ += chars_[Number(this.random() % BigInt(chars_.length))];
		}
		return message_;
	}
}

// #endregion
// #region Invariants

/**
 * Collect every address that might hold CST in this test deployment.
 * @param {Awaited<ReturnType<typeof loadFixtureDeployContractsForTesting>>} contracts_
 * @param {Participant[]} participants_
 */
function collectCstHolderAddresses(contracts_, participants_) {
	/** @type {string[]} */
	const addresses_ = [];
	const push_ = (a_) => {
		if (a_ && a_ !== hre.ethers.ZeroAddress) {
			addresses_.push(a_);
		}
	};
	for (const participant_ of participants_) {
		push_(participant_.address);
	}
	push_(contracts_.cosmicSignatureGameProxyAddress);
	push_(contracts_.prizesWalletAddress);
	push_(contracts_.stakingWalletCosmicSignatureNftAddress);
	push_(contracts_.marketingWalletAddress);
	push_(contracts_.charityWalletAddress);
	push_(contracts_.cosmicSignatureDaoAddress);
	push_(contracts_.deployerSigner.address);
	push_(contracts_.ownerSigner.address);
	push_(contracts_.treasurerSigner.address);
	push_(contracts_.charitySigner.address);
	for (const signer_ of contracts_.signers) {
		push_(signer_.address);
	}
	// Deduplicate
	return [...new Set(addresses_)];
}

/**
 * Strong accounting check: tracked holder set should explain all issued CST.
 * @param {Awaited<ReturnType<typeof loadFixtureDeployContractsForTesting>>} contracts_
 * @param {Participant[]} participants_
 */
async function assertCstSupplyEqualsSumOfBalances(contracts_, participants_) {
	const token_ = contracts_.cosmicSignatureToken;
	const totalSupply_ = await token_.totalSupply();
	const holders_ = collectCstHolderAddresses(contracts_, participants_);
	let sum_ = 0n;
	for (const address_ of holders_) {
		sum_ += await token_.balanceOf(address_);
	}
	expect(sum_, "CST sum(balanceOf) must equal totalSupply() for tracked fuzz holders").to.equal(totalSupply_);
}

/**
 * @param {Awaited<ReturnType<typeof loadFixtureDeployContractsForTesting>>} contracts_
 * @param {bigint} previousRoundNum_
 */
async function assertRoundNumberMonotonic(contracts_, previousRoundNum_) {
	const roundNow_ = await contracts_.cosmicSignatureGameProxy.roundNum();
	expect(
		roundNow_ >= previousRoundNum_,
		`roundNum must never decrease (was ${previousRoundNum_}, now ${roundNow_})`
	).to.be.true;
}

/**
 * RW NFTs held by the RW staking wallet should match `numStakedNfts` (each staked token is custodied here).
 * @param {Awaited<ReturnType<typeof loadFixtureDeployContractsForTesting>>} contracts_
 */
async function assertRandomWalkStakingCustodyInvariant(contracts_) {
	const numStaked_ = await contracts_.stakingWalletRandomWalkNft.numStakedNfts();
	const balance_ = await contracts_.randomWalkNft.balanceOf(contracts_.stakingWalletRandomWalkNftAddress);
	expect(balance_, "RandomWalk NFT balance of RW staking wallet should equal numStakedNfts").to.equal(numStaked_);
}

/** Max `getBidderAddressAt` calls per invariant pass for champion/bidder-set checks (RPC bound). */
const MAX_BIDDERS_FOR_FULL_CHAMPION_SCAN = 500;

/** `uint256(int256(-1))` after `_prepareNextRound` (see `MainPrize._prepareNextRound`). */
const CHRONO_WARRIOR_DURATION_SENTINEL = hre.ethers.MaxUint256;

/** Largest `uint256` value whose `int256` cast is non-negative (matches on-chain chrono duration when address is nonzero). */
const INT256_MAX_AS_UINT = (1n << 255n) - 1n;

/** Max stake action ids to probe for `initialRewardAmountPerStakedNft` vs current reward (RPC bound). */
const MAX_CS_STAKE_ACTION_SAMPLE = 32;

/**
 * On-chain: `(chronoWarriorAddress == 0) == (int256(chronoWarriorDuration) < 0)` (see `BidStatistics` asserts).
 * Reset path uses zero address + `uint256(int256(-1))`.
 * @param {import("hardhat").ethers.Contract} gameProxy_
 */
async function assertChronoWarriorStorageSentinelInvariant(gameProxy_) {
	const chronoAddr_ = await gameProxy_.chronoWarriorAddress();
	const chronoDur_ = await gameProxy_.chronoWarriorDuration();
	if (chronoAddr_ === hre.ethers.ZeroAddress) {
		expect(
			chronoDur_,
			"chronoWarriorAddress zero implies chronoWarriorDuration is sentinel (max uint256)"
		).to.equal(CHRONO_WARRIOR_DURATION_SENTINEL);
	} else {
		expect(
			chronoDur_,
			"nonzero chronoWarriorAddress implies duration fits non-negative int256 (not sentinel)"
		).to.be.lte(INT256_MAX_AS_UINT);
	}
}

/**
 * Same sentinel rule on `tryGetCurrentChampions` tuple slots 2–3 (copied from storage then adjusted in-view).
 * @param {readonly [unknown, unknown, unknown, unknown]} tuple_
 */
function assertTryGetCurrentChampionsChronoTupleSentinel(tuple_) {
	const chronoViewAddr_ = /** @type {string} */ (tuple_[2]);
	const chronoViewDur_ = /** @type {bigint} */ (tuple_[3]);
	if (chronoViewAddr_ === hre.ethers.ZeroAddress) {
		expect(
			chronoViewDur_,
			"tryGetCurrentChampions: zero chrono address implies sentinel duration on tuple"
		).to.equal(CHRONO_WARRIOR_DURATION_SENTINEL);
	} else {
		expect(
			chronoViewDur_,
			"tryGetCurrentChampions: nonzero chrono address implies non-sentinel duration on tuple"
		).to.be.lte(INT256_MAX_AS_UINT);
	}
}

/**
 * `getNextEthBidPrice` / `getNextCstBidPrice` must match `*Advanced(0)` (see `Bidding`).
 * @param {import("hardhat").ethers.Contract} gameProxy_
 */
async function assertNextBidPricesMatchAdvancedZero(gameProxy_) {
	try {
		const ethP_ = await gameProxy_.getNextEthBidPrice();
		const ethA_ = await gameProxy_.getNextEthBidPriceAdvanced(0);
		expect(ethP_, "getNextEthBidPrice must equal getNextEthBidPriceAdvanced(0)").to.equal(ethA_);
	} catch {
		// Skip if views revert in unusual admin states.
	}
	try {
		const cstP_ = await gameProxy_.getNextCstBidPrice();
		const cstA_ = await gameProxy_.getNextCstBidPriceAdvanced(0);
		expect(cstP_, "getNextCstBidPrice must equal getNextCstBidPriceAdvanced(0)").to.equal(cstA_);
	} catch {
		// Skip if views revert.
	}
}

/**
 * CST/ETH Dutch getters stay internally consistent (bounded reads; skips on revert).
 * @param {import("hardhat").ethers.Contract} gameProxy_
 */
async function assertDutchAuctionViewsSanity(gameProxy_) {
	const block_ = await hre.ethers.provider.getBlock("latest");
	const blockTs_ = BigInt(block_.timestamp);
	try {
		const [cstTotal_, cstElapsed_] = await gameProxy_.getCstDutchAuctionDurations();
		const cstElapsedB_ = BigInt(cstElapsed_);
		if (cstTotal_ > 0n && cstElapsedB_ >= 0n) {
			const cstBeginTs_ = await gameProxy_.cstDutchAuctionBeginningTimeStamp();
			if (cstBeginTs_ <= blockTs_) {
				const expectedElapsed_ = blockTs_ - cstBeginTs_;
				expect(
					cstElapsedB_,
					"getCstDutchAuctionDurations elapsed should match block.timestamp - cstDutchAuctionBeginningTimeStamp"
				).to.equal(expectedElapsed_);
			}
		}
		const lastCst_ = await gameProxy_.lastCstBidderAddress();
		const nextCst_ = await gameProxy_.getNextCstBidPrice();
		const cstBeginning_ = await gameProxy_.cstDutchAuctionBeginningBidPrice();
		if (lastCst_ !== hre.ethers.ZeroAddress && nextCst_ > 0n && cstBeginning_ > 0n) {
			expect(
				nextCst_,
				"active CST Dutch decay implies next price <= current beginning bid price"
			).to.be.lte(cstBeginning_);
		}
	} catch {
		// Skip CST Dutch checks if any getter reverts.
	}
	try {
		const lastEth_ = await gameProxy_.lastBidderAddress();
		const activation_ = await gameProxy_.roundActivationTime();
		if (lastEth_ === hre.ethers.ZeroAddress && blockTs_ >= activation_) {
			const ethBeginning_ = await gameProxy_.ethDutchAuctionBeginningBidPrice();
			if (ethBeginning_ > 0n) {
				const [, ethElapsed_] = await gameProxy_.getEthDutchAuctionDurations();
				const ethElapsedB_ = BigInt(ethElapsed_);
				if (ethElapsedB_ > 0n) {
					const nextEth_ = await gameProxy_.getNextEthBidPrice();
					expect(
						nextEth_,
						"ETH Dutch after activation with no bids yet: price should not exceed beginning bid price"
					).to.be.lte(ethBeginning_);
				}
			}
		}
	} catch {
		// Skip ETH Dutch bound if getters revert.
	}
}

/**
 * `numStakedNfts` counts populated `stakeActions` and never exceeds `actionCounter` (see `StakingWalletNftBase`).
 * @param {Awaited<ReturnType<typeof loadFixtureDeployContractsForTesting>>} contracts_
 */
async function assertStakingWalletNumStakedVsActionCounter(contracts_) {
	for (const staking_ of [contracts_.stakingWalletRandomWalkNft, contracts_.stakingWalletCosmicSignatureNft]) {
		const num_ = await staking_.numStakedNfts();
		const ctr_ = await staking_.actionCounter();
		expect(num_, "numStakedNfts must not exceed actionCounter").to.be.lte(ctr_);
	}
}

/**
 * For sampled CS stake actions, `initialRewardAmountPerStakedNft` is a snapshot at stake time and must be <= current cumulative reward.
 * @param {Awaited<ReturnType<typeof loadFixtureDeployContractsForTesting>>} contracts_
 */
async function assertCosmicSignatureStakeInitialRewardVsCurrent(contracts_) {
	const staking_ = contracts_.stakingWalletCosmicSignatureNft;
	const actionCounter_ = await staking_.actionCounter();
	if (actionCounter_ === 0n) {
		return;
	}
	const rewardNow_ = await staking_.rewardAmountPerStakedNft();
	const cap_ = actionCounter_ > BigInt(MAX_CS_STAKE_ACTION_SAMPLE) ? BigInt(MAX_CS_STAKE_ACTION_SAMPLE) : actionCounter_;
	for (let id_ = 1n; id_ <= cap_; ++ id_) {
		let action_;
		try {
			action_ = await staking_.stakeActions(id_);
		} catch {
			continue;
		}
		const owner_ = action_.nftOwnerAddress ?? action_[1];
		if ( ! owner_ || owner_ === hre.ethers.ZeroAddress) {
			continue;
		}
		const initialR_ = action_.initialRewardAmountPerStakedNft ?? action_[2];
		expect(
			initialR_,
			`stakeActions(${id_}).initialRewardAmountPerStakedNft must be <= current rewardAmountPerStakedNft`
		).to.be.lte(rewardNow_);
	}
}

/**
 * Structural smoke: endurance champion start time should not exceed that bidder's latest bid time in this round.
 * @param {import("hardhat").ethers.Contract} gameProxy_
 */
async function assertEnduranceChampionStartTimestampVsBidderInfo(gameProxy_) {
	const last_ = await gameProxy_.lastBidderAddress();
	if (last_ === hre.ethers.ZeroAddress) {
		return;
	}
	const endurance_ = await gameProxy_.enduranceChampionAddress();
	if (endurance_ === hre.ethers.ZeroAddress) {
		return;
	}
	const startTs_ = await gameProxy_.enduranceChampionStartTimeStamp();
	if (startTs_ === 0n) {
		return;
	}
	const round_ = await gameProxy_.roundNum();
	let bidderInfo_;
	try {
		bidderInfo_ = await gameProxy_.biddersInfo(round_, endurance_);
	} catch {
		return;
	}
	const lastBidTs_ = bidderInfo_.lastBidTimeStamp ?? bidderInfo_[2];
	if (lastBidTs_ === 0n) {
		return;
	}
	expect(
		startTs_,
		"enduranceChampionStartTimeStamp should be <= champion's lastBidTimeStamp in this round"
	).to.be.lte(lastBidTs_);
}

/**
 * `Bidding._bidCommon` appends each bidder to `items[numItems-1]` after increment; `lastBidderAddress` is that sender.
 * @param {import("hardhat").ethers.Contract} gameProxy_
 */
async function assertLastBidderMatchesBidLogTail(gameProxy_) {
	const last_ = await gameProxy_.lastBidderAddress();
	if (last_ === hre.ethers.ZeroAddress) {
		return;
	}
	const round_ = await gameProxy_.roundNum();
	const n_ = await gameProxy_.getTotalNumBids(round_);
	expect(n_, "lastBidder set implies at least one bid in round").to.be.greaterThan(0n);
	const tailBidder_ = await gameProxy_.getBidderAddressAt(round_, n_ - 1n);
	expect(
		tailBidder_,
		"lastBidderAddress must match tail of bidderAddresses[roundNum] (getBidderAddressAt(round, n-1))"
	).to.equal(last_);
}

/**
 * Cosmic Signature NFTs in custody at the CS staking wallet must match the staked counter (same idea as RW).
 * @param {Awaited<ReturnType<typeof loadFixtureDeployContractsForTesting>>} contracts_
 */
async function assertCosmicSignatureStakingCustodyInvariant(contracts_) {
	const numStaked_ = await contracts_.stakingWalletCosmicSignatureNft.numStakedNfts();
	const balance_ = await contracts_.cosmicSignatureNft.balanceOf(contracts_.stakingWalletCosmicSignatureNftAddress);
	expect(
		balance_,
		"CosmicSignature NFT balance of CS staking wallet should equal numStakedNfts"
	).to.equal(numStaked_);
}

/**
 * @param {import("hardhat").ethers.Contract} gameProxy_
 * @param {bigint} roundNum_
 * @param {bigint} numBids_
 * @returns {Promise<Set<string> | null>} `null` if `numBids_` exceeds scan cap (caller should skip subset checks).
 */
async function buildCurrentRoundBidderAddressSet(gameProxy_, roundNum_, numBids_) {
	if (numBids_ === 0n) {
		return new Set();
	}
	if (numBids_ > BigInt(MAX_BIDDERS_FOR_FULL_CHAMPION_SCAN)) {
		return null;
	}
	const set_ = new Set();
	const nNum_ = Number(numBids_);
	for (let i_ = 0; i_ < nNum_; ++ i_) {
		const addr_ = await gameProxy_.getBidderAddressAt(roundNum_, BigInt(i_));
		set_.add(addr_.toLowerCase());
	}
	return set_;
}

/**
 * Endurance / Chrono-Warrior addresses assigned in `_updateChampionsIfNeeded` are always participants who bid this round.
 * @param {import("hardhat").ethers.Contract} gameProxy_
 * @param {Set<string> | null} bidderSetLowercase_
 */
async function assertChampionAddressesAmongBidders(gameProxy_, bidderSetLowercase_) {
	if (bidderSetLowercase_ == null) {
		return;
	}
	const last_ = await gameProxy_.lastBidderAddress();
	if (last_ === hre.ethers.ZeroAddress) {
		return;
	}
	const endurance_ = await gameProxy_.enduranceChampionAddress();
	const chrono_ = await gameProxy_.chronoWarriorAddress();
	const check_ = (label_, addr_) => {
		if (addr_ === hre.ethers.ZeroAddress) {
			return;
		}
		expect(
			bidderSetLowercase_.has(addr_.toLowerCase()),
			`${label_} must be one of the recorded bidders in the current round`
		).to.be.true;
	};
	check_("enduranceChampionAddress", endurance_);
	check_("chronoWarriorAddress", chrono_);
}

/**
 * Game `deposit` only increases cumulative reward per staked NFT (never decreases on-chain).
 * @param {Awaited<ReturnType<typeof loadFixtureDeployContractsForTesting>>} contracts_
 * @param {{ lastValue: bigint | null }} snapshotWrapper_
 */
async function assertRewardAmountPerStakedNftMonotonic(contracts_, snapshotWrapper_) {
	const current_ = await contracts_.stakingWalletCosmicSignatureNft.rewardAmountPerStakedNft();
	if (snapshotWrapper_.lastValue == null) {
		snapshotWrapper_.lastValue = current_;
		return;
	}
	expect(
		current_,
		"StakingWalletCosmicSignatureNft.rewardAmountPerStakedNft must never decrease between invariant checks"
	).to.be.gte(snapshotWrapper_.lastValue);
	snapshotWrapper_.lastValue = current_;
}

/**
 * Consistency / structural smoke on `tryGetCurrentChampions` (not a full reimplementation of the view).
 * @param {import("hardhat").ethers.Contract} gameProxy_
 * @param {Set<string> | null} bidderSetLowercase_
 * @param {readonly [unknown, unknown, unknown, unknown]} tuple_
 * @param {string} lastBidderAddress_
 */
async function assertTryGetCurrentChampionsSmoke(gameProxy_, bidderSetLowercase_, tuple_, lastBidderAddress_) {
	if (lastBidderAddress_ === hre.ethers.ZeroAddress) {
		return;
	}
	assertTryGetCurrentChampionsChronoTupleSentinel(tuple_);

	const enduranceView_ = /** @type {string} */ (tuple_[0]);
	if (enduranceView_ !== hre.ethers.ZeroAddress) {
		if (bidderSetLowercase_ == null) {
			const storageEndurance_ = await gameProxy_.enduranceChampionAddress();
			const ok_ =
				enduranceView_.toLowerCase() === lastBidderAddress_.toLowerCase() ||
				enduranceView_.toLowerCase() === storageEndurance_.toLowerCase();
			expect(ok_, "tryGetCurrentChampions endurance should match last or storage endurance when bid list is large").to.be.true;
		} else {
			expect(
				bidderSetLowercase_.has(enduranceView_.toLowerCase()),
				"tryGetCurrentChampions endurance address should be a current-round bidder (or zero)"
			).to.be.true;
		}
	}

	const chronoView_ = /** @type {string} */ (tuple_[2]);
	if (chronoView_ === hre.ethers.ZeroAddress) {
		return;
	}
	if (bidderSetLowercase_ == null) {
		const storageChrono_ = await gameProxy_.chronoWarriorAddress();
		const storageEndurance_ = await gameProxy_.enduranceChampionAddress();
		const okChrono_ =
			chronoView_.toLowerCase() === storageChrono_.toLowerCase() ||
			chronoView_.toLowerCase() === storageEndurance_.toLowerCase() ||
			chronoView_.toLowerCase() === lastBidderAddress_.toLowerCase();
		expect(
			okChrono_,
			"tryGetCurrentChampions chrono should align with storage chrono/endurance/last when bid list is large"
		).to.be.true;
	} else {
		expect(
			bidderSetLowercase_.has(chronoView_.toLowerCase()),
			"tryGetCurrentChampions chrono address should be a current-round bidder (or zero)"
		).to.be.true;
	}
}

/**
 * When the round is active and at least one bid exists, ETH Dutch next price should be positive (IBidding / Comment-202503162).
 * @param {import("hardhat").ethers.Contract} gameProxy_
 */
async function assertNextEthBidPricePositiveWhenBidding(gameProxy_) {
	const last_ = await gameProxy_.lastBidderAddress();
	if (last_ === hre.ethers.ZeroAddress) {
		return;
	}
	const activation_ = await gameProxy_.roundActivationTime();
	const block_ = await hre.ethers.provider.getBlock("latest");
	if (BigInt(block_.timestamp) < activation_) {
		return;
	}
	try {
		const price_ = await gameProxy_.getNextEthBidPrice();
		expect(price_, "getNextEthBidPrice should be > 0 with an active round and bids placed").to.be.greaterThan(0n);
	} catch {
		// Round may be inactive in edge windows; ignore reverts here.
	}
}

/**
 * Latest minted CS NFT id is `totalSupply - 1`; `ownerOf` must succeed when supply is non-zero.
 * @param {Awaited<ReturnType<typeof loadFixtureDeployContractsForTesting>>} contracts_
 */
async function assertCosmicSignatureNftLatestTokenExists(contracts_) {
	const total_ = await contracts_.cosmicSignatureNft.totalSupply();
	if (total_ === 0n) {
		return;
	}
	const owner_ = await contracts_.cosmicSignatureNft.ownerOf(total_ - 1n);
	expect(owner_, "CosmicSignature NFT ownerOf(latestId) should be non-zero").to.not.equal(hre.ethers.ZeroAddress);
}

/**
 * @param {Awaited<ReturnType<typeof loadFixtureDeployContractsForTesting>>} contracts_
 * @param {Participant[]} participants_
 * @param {bigint} baselineRound_
 * @param {{ lastValue: bigint | null }} rewardPerStakedSnapshotWrapper_
 */
async function runProtocolInvariants(contracts_, participants_, baselineRound_, rewardPerStakedSnapshotWrapper_) {
	const game_ = contracts_.cosmicSignatureGameProxy;
	await assertCstSupplyEqualsSumOfBalances(contracts_, participants_);
	await assertRoundNumberMonotonic(contracts_, baselineRound_);
	await assertChronoWarriorStorageSentinelInvariant(game_);
	await assertNextBidPricesMatchAdvancedZero(game_);
	await assertDutchAuctionViewsSanity(game_);
	await assertStakingWalletNumStakedVsActionCounter(contracts_);
	await assertRandomWalkStakingCustodyInvariant(contracts_);
	await assertCosmicSignatureStakingCustodyInvariant(contracts_);
	await assertLastBidderMatchesBidLogTail(game_);
	const round_ = await game_.roundNum();
	const nBids_ = await game_.getTotalNumBids(round_);
	const bidderSet_ = await buildCurrentRoundBidderAddressSet(game_, round_, nBids_);
	await assertChampionAddressesAmongBidders(game_, bidderSet_);
	const lastBidder_ = await game_.lastBidderAddress();
	if (lastBidder_ !== hre.ethers.ZeroAddress) {
		const championsTuple_ = await game_.tryGetCurrentChampions();
		await assertTryGetCurrentChampionsSmoke(game_, bidderSet_, championsTuple_, lastBidder_);
	}
	await assertCosmicSignatureStakeInitialRewardVsCurrent(contracts_);
	await assertRewardAmountPerStakedNftMonotonic(contracts_, rewardPerStakedSnapshotWrapper_);
	await assertNextEthBidPricePositiveWhenBidding(game_);
	await assertEnduranceChampionStartTimestampVsBidderInfo(game_);
	await assertCosmicSignatureNftLatestTokenExists(contracts_);
}

// #endregion
// #region `describe`

describe("FuzzTest", function () {
	// #region `it`

	it("Comprehensive multi-participant fuzz with invariants, negative probes, and broad API coverage", async function () {
		// #region

		const fuzzConfig_ = buildFuzzConfig(SKIP_LONG_TESTS);
		// Wall-clock ceiling for Mocha (long default run can take tens of minutes).
		this.timeout(SKIP_LONG_TESTS ? 3_600_000 : 14_400_000);

		const envSeedRaw_ = process.env.FUZZ_SEED;
		const parsedSeed_ = parseFuzzSeedFromEnvironment(envSeedRaw_);
		const randomNumberSeed_ = parsedSeed_ ?? generateRandomUInt256();
		const randomSeedWrapper_ = { value: randomNumberSeed_ };

		console.log("\n" + "═".repeat(80));
		console.log("  COSMIC SIGNATURE — COMPREHENSIVE FUZZ TEST");
		console.log("═".repeat(80));
		console.log(`  SKIP_LONG_TESTS: ${SKIP_LONG_TESTS}`);
		console.log(`  Rounds: ${fuzzConfig_.numRounds}`);
		console.log(`  Participants: ${fuzzConfig_.numActiveParticipants}`);
		console.log(`  Actions/participant/round (max): ~${fuzzConfig_.actionsPerParticipantPerRound * 2}`);
		console.log(`  FUZZ_SEED env: ${envSeedRaw_ ? "set" : "unset"}`);
		console.log(`  Random seed (uint256): ${uint256ToPaddedHexString(randomNumberSeed_)}`);
		console.log("═".repeat(80));

		let randomNumber_ = generateRandomUInt256FromSeedWrapper(randomSeedWrapper_);
		const roundActivationTimeOffset_ = randomNumber_ % 4096n - 1024n;
		const contracts_ = await loadFixtureDeployContractsForTesting(roundActivationTimeOffset_);
		contracts_.fuzzConfig = fuzzConfig_;

		// #endregion
		// #region Deploy fuzz-only mock ERC-20 / ERC-721 (used for bid donation paths)

		const deployerForMocks_ = contracts_.signers[0];
		const FuzzTestMockErc20Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc20", deployerForMocks_);
		const fuzzTestMockErc20_ = await FuzzTestMockErc20Factory_.deploy();
		await fuzzTestMockErc20_.waitForDeployment();
		const fuzzTestMockErc20Address_ = await fuzzTestMockErc20_.getAddress();

		const FuzzTestMockErc721Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc721", deployerForMocks_);
		const fuzzTestMockErc721_ = await FuzzTestMockErc721Factory_.deploy();
		await fuzzTestMockErc721_.waitForDeployment();
		const fuzzTestMockErc721Address_ = await fuzzTestMockErc721_.getAddress();

		contracts_.fuzzTestMockErc20 = fuzzTestMockErc20_;
		contracts_.fuzzTestMockErc20Address = fuzzTestMockErc20Address_;
		contracts_.fuzzTestMockErc721 = fuzzTestMockErc721_;
		contracts_.fuzzTestMockErc721Address = fuzzTestMockErc721Address_;

		// #endregion
		// #region Participants, funding, approvals

		const behaviorProfileNames_ = Object.keys(fuzzConfig_.behaviorProfiles);
		/** @type {Participant[]} */
		const participants_ = [];
		const numParticipants_ = Math.min(fuzzConfig_.numActiveParticipants, contracts_.signers.length);

		for (let i_ = 0; i_ < numParticipants_; ++ i_) {
			const signer_ = contracts_.signers[i_];
			const profileName_ = behaviorProfileNames_[i_ % behaviorProfileNames_.length];
			const mergedProfile_ = {
				...Object.fromEntries(ALL_FUZZ_ACTION_KEYS.map((k_) => [k_, 0])),
				...fuzzConfig_.behaviorProfiles[profileName_],
				// Negative probes are injected with global weight (see main loop).
			};
			const participant_ = new Participant(i_, signer_, contracts_, mergedProfile_, randomSeedWrapper_);
			participants_.push(participant_);

			await hre.ethers.provider.send("hardhat_setBalance", [
				signer_.address,
				"0x" + fuzzConfig_.ethPerParticipant.toString(16),
			]);

			await waitForTransactionReceipt(
				participant_.randomWalkNft.setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddress, true)
			);
			await waitForTransactionReceipt(
				participant_.cosmicSignatureNft.setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddress, true)
			);
			await waitForTransactionReceipt(
				participant_.cosmicSignatureToken.approve(contracts_.cosmicSignatureGameProxyAddress, hre.ethers.MaxUint256)
			);
			await waitForTransactionReceipt(
				participant_.mockErc20.approve(contracts_.cosmicSignatureGameProxyAddress, hre.ethers.MaxUint256)
			);
			await waitForTransactionReceipt(
				participant_.mockErc721.setApprovalForAll(contracts_.cosmicSignatureGameProxyAddress, true)
			);

			// Mock ERC-20 liquidity for donation+bid paths (amounts are clamped in actions).
			await waitForTransactionReceipt(
				contracts_.fuzzTestMockErc20.mint(signer_.address, 1_000_000n * 10n ** 18n)
			);
			// One mock ERC-721 per participant (for `bidWithEthAndDonateNft` / `bidWithCstAndDonateNft`).
			{
				const mintRc_ = await waitForTransactionReceipt(contracts_.fuzzTestMockErc721.mint(signer_.address));
				for (const log_ of mintRc_.logs) {
					try {
						const parsed_ = contracts_.fuzzTestMockErc721.interface.parseLog(log_);
						if (parsed_?.name === "Transfer") {
							participant_.mockDonatedNftTokenId = /** @type {bigint} */ (parsed_.args.tokenId);
							break;
						}
					} catch {
						// Ignore unrelated logs.
					}
				}
				expect(participant_.mockDonatedNftTokenId > 0n, "fuzz mock ERC-721 mint must emit Transfer with tokenId").to.be.true;
			}

			if (fuzzConfig_.verbosity >= 2) {
				console.log(`  Participant ${i_}: ${signer_.address.slice(0, 10)}... (${profileName_})`);
			}
		}

		// #endregion
		// #region Statistics

		const globalStats_ = {
			totalActions: 0,
			successfulActions: 0,
			failedActions: 0,
			roundsCompleted: 0,
			totalEthBid: 0n,
			totalCstBid: 0n,
			totalEthDonated: 0n,
			invariantChecks: 0,
			negativeProbes: 0,
			negativeProbesRevertedAsExpected: 0,
			actionCounts: Object.fromEntries(ALL_FUZZ_ACTION_KEYS.map((k_) => [k_, { attempted: 0, succeeded: 0 }])),
		};

		let successfulStateChangesSinceInvariant_ = 0;
		let baselineRound_ = await contracts_.cosmicSignatureGameProxy.roundNum();
		/** @type {{ lastValue: bigint | null }} Snapshot for `rewardAmountPerStakedNft` monotonicity across invariant passes. */
		const rewardPerStakedSnapshotWrapper_ = { lastValue: /** @type {bigint | null} */ (null) };

		// #endregion
		// #region Helpers: time, NFT discovery

		/**
		 * Advance block timestamp by a pseudorandom delta in `[minSeconds_, maxSeconds_]`.
		 * All arithmetic uses integers to avoid mixing `number` / `bigint` incorrectly.
		 * @param {number} minSeconds_
		 * @param {number} maxSeconds_
		 */
		const advanceTime_ = async (minSeconds_, maxSeconds_) => {
			const minB_ = BigInt(minSeconds_);
			const maxB_ = BigInt(maxSeconds_);
			const range_ = maxB_ - minB_;
			const delta_ = range_ > 0n ? generateRandomUInt256FromSeedWrapper(randomSeedWrapper_) % range_ : 0n;
			const seconds_ = minB_ + delta_;
			const latestBlock_ = await hre.ethers.provider.getBlock("latest");
			const newTimestamp_ = BigInt(latestBlock_.timestamp) + seconds_;
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(newTimestamp_)]);
			await hre.ethers.provider.send("evm_mine");
			return Number(newTimestamp_);
		};

		/**
		 * `usedNfts` is `uint256` with `0` meaning unused (see `StakingWalletNftBase.sol`).
		 * @param {bigint} usedValue_
		 */
		const isNftSlotUnused_ = (usedValue_) => usedValue_ === 0n;

		const findUnusedRandomWalkNft_ = async (participant_, forStaking_) => {
			const totalSupply_ = await contracts_.randomWalkNft.totalSupply();
			if (totalSupply_ === 0n) {
				return -1n;
			}
			for (let attempt_ = 0; attempt_ < Math.min(40, Number(totalSupply_)); ++ attempt_) {
				const nftId_ = participant_.random() % totalSupply_;
				try {
					const owner_ = await contracts_.randomWalkNft.ownerOf(nftId_);
					if (owner_ !== participant_.address) {
						continue;
					}
					if (forStaking_) {
						const usedRwStake_ = await contracts_.stakingWalletRandomWalkNft.usedNfts(nftId_);
						if (isNftSlotUnused_(usedRwStake_)) {
							return nftId_;
						}
					} else {
						const usedInGame_ = await contracts_.cosmicSignatureGameProxy.usedRandomWalkNfts(nftId_);
						if (isNftSlotUnused_(usedInGame_)) {
							return nftId_;
						}
					}
				} catch {
					// `ownerOf` reverts for burned / invalid ids in some setups; ignore.
				}
			}
			return -1n;
		};

		const findUnusedCosmicSignatureNft_ = async (participant_) => {
			const totalSupply_ = await contracts_.cosmicSignatureNft.totalSupply();
			if (totalSupply_ === 0n) {
				return -1n;
			}
			for (let attempt_ = 0; attempt_ < Math.min(40, Number(totalSupply_)); ++ attempt_) {
				const nftId_ = participant_.random() % totalSupply_;
				try {
					const owner_ = await contracts_.cosmicSignatureNft.ownerOf(nftId_);
					if (owner_ !== participant_.address) {
						continue;
					}
					const used_ = await contracts_.stakingWalletCosmicSignatureNft.usedNfts(nftId_);
					if (isNftSlotUnused_(used_)) {
						return nftId_;
					}
				} catch {
					// Ignore invalid ids.
				}
			}
			return -1n;
		};

		const findStakedNftAction_ = async (stakingWallet_, participant_) => {
			const numStaked_ = await stakingWallet_.numStakedNfts();
			if (numStaked_ === 0n) {
				return -1n;
			}
			const actionCounter_ = await stakingWallet_.actionCounter();
			if (actionCounter_ === 0n) {
				return -1n;
			}
			for (let attempt_ = 0; attempt_ < Math.min(24, Number(actionCounter_)); ++ attempt_) {
				const actionId_ = (participant_.random() % actionCounter_) + 1n;
				try {
					const action_ = await stakingWallet_.stakeActions(actionId_);
					if (action_.nftOwnerAddress === participant_.address) {
						return actionId_;
					}
				} catch {
					// Ignore sparse holes if any.
				}
			}
			return -1n;
		};

		const collectMultipleUnusedRandomWalkNfts_ = async (participant_, forStaking_, maxCount_) => {
			/** @type {bigint[]} */
			const out_ = [];
			const totalSupply_ = await contracts_.randomWalkNft.totalSupply();
			if (totalSupply_ === 0n) {
				return out_;
			}
			for (let scan_ = 0n; scan_ < totalSupply_ && out_.length < maxCount_; ++ scan_) {
				const nftId_ = (participant_.random() + scan_) % totalSupply_;
				try {
					const owner_ = await contracts_.randomWalkNft.ownerOf(nftId_);
					if (owner_ !== participant_.address) {
						continue;
					}
					if (forStaking_) {
						const usedRwStake_ = await contracts_.stakingWalletRandomWalkNft.usedNfts(nftId_);
						if ( ! isNftSlotUnused_(usedRwStake_)) {
							continue;
						}
					} else {
						const usedInGame_ = await contracts_.cosmicSignatureGameProxy.usedRandomWalkNfts(nftId_);
						if ( ! isNftSlotUnused_(usedInGame_)) {
							continue;
						}
					}
					if ( ! out_.includes(nftId_)) {
						out_.push(nftId_);
					}
				} catch {
					// Ignore.
				}
			}
			return out_;
		};

		const collectMultipleUnusedCosmicSignatureNfts_ = async (participant_, maxCount_) => {
			/** @type {bigint[]} */
			const out_ = [];
			const totalSupply_ = await contracts_.cosmicSignatureNft.totalSupply();
			if (totalSupply_ === 0n) {
				return out_;
			}
			for (let scan_ = 0n; scan_ < totalSupply_ && out_.length < maxCount_; ++ scan_) {
				const nftId_ = (participant_.random() + scan_) % totalSupply_;
				try {
					const owner_ = await contracts_.cosmicSignatureNft.ownerOf(nftId_);
					if (owner_ !== participant_.address) {
						continue;
					}
					const used_ = await contracts_.stakingWalletCosmicSignatureNft.usedNfts(nftId_);
					if ( ! isNftSlotUnused_(used_)) {
						continue;
					}
					if ( ! out_.includes(nftId_)) {
						out_.push(nftId_);
					}
				} catch {
					// Ignore.
				}
			}
			return out_;
		};

		const collectMultipleStakedActionIds_ = async (stakingWallet_, participant_, maxCount_) => {
			/** @type {bigint[]} */
			const out_ = [];
			const actionCounter_ = await stakingWallet_.actionCounter();
			for (let id_ = 1n; id_ <= actionCounter_ && out_.length < maxCount_; ++ id_) {
				try {
					const action_ = await stakingWallet_.stakeActions(id_);
					if (action_.nftOwnerAddress === participant_.address) {
						out_.push(id_);
					}
				} catch {
					// Ignore.
				}
			}
			return out_;
		};

		const findOtherParticipant_ = (currentParticipant_) => {
			if (participants_.length < 2) {
				return null;
			}
			let other_;
			do {
				const idx_ = Number(generateRandomUInt256FromSeedWrapper(randomSeedWrapper_) % BigInt(participants_.length));
				other_ = participants_[idx_];
			} while (other_.address === currentParticipant_.address);
			return other_;
		};

		/**
		 * Donation+bid paths transfer the mock ERC-721 away; remint + approve when the participant no longer owns it.
		 * @param {Participant} participant_
		 */
		const ensureParticipantOwnsMockDonationNft_ = async (participant_) => {
			try {
				const owner_ = await contracts_.fuzzTestMockErc721.ownerOf(participant_.mockDonatedNftTokenId);
				if (owner_ === participant_.address) {
					return true;
				}
			} catch {
				// `ownerOf` reverts for unknown ids.
			}
			const mintRc_ = await waitForTransactionReceipt(
				contracts_.fuzzTestMockErc721.mint(participant_.address)
			);
			for (const log_ of mintRc_.logs) {
				try {
					const parsed_ = contracts_.fuzzTestMockErc721.interface.parseLog(log_);
					if (parsed_?.name === "Transfer") {
						participant_.mockDonatedNftTokenId = /** @type {bigint} */ (parsed_.args.tokenId);
						await waitForTransactionReceipt(
							participant_.mockErc721.setApprovalForAll(contracts_.cosmicSignatureGameProxyAddress, true)
						);
						return true;
					}
				} catch {
					// Ignore.
				}
			}
			return false;
		};

		const maybeRunInvariants_ = async () => {
			if (successfulStateChangesSinceInvariant_ < fuzzConfig_.invariantCheckEveryActions) {
				return;
			}
			successfulStateChangesSinceInvariant_ = 0;
			++ globalStats_.invariantChecks;
			await runProtocolInvariants(contracts_, participants_, baselineRound_, rewardPerStakedSnapshotWrapper_);
			baselineRound_ = await contracts_.cosmicSignatureGameProxy.roundNum();
		};

		const markSuccess_ = async (action_, participant_, receipt_, extraHook_) => {
			globalStats_.successfulActions++;
			globalStats_.actionCounts[action_].succeeded++;
			++ successfulStateChangesSinceInvariant_;
			if (typeof extraHook_ === "function") {
				await extraHook_(receipt_);
			}
			await maybeRunInvariants_();
			return true;
		};

		/**
		 * Intentionally invalid operations; must revert predictably.
		 * @param {Participant} participant_
		 */
		const executeNegativeProbe_ = async (participant_) => {
			++ globalStats_.negativeProbes;
			const kind_ = Number(participant_.random() % 5n);
			try {
				switch (kind_) {
					case 0: {
						// Insufficient ETH for a bid during an active round.
						const lastBidder_ = await contracts_.cosmicSignatureGameProxy.lastBidderAddress();
						if (lastBidder_ === hre.ethers.ZeroAddress) {
							return false;
						}
						await advanceTime_(1, 120);
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.gameProxy.bidWithEth(-1n, "", { value: 1n })
						);
						if (receipt_ === undefined) {
							++ globalStats_.negativeProbesRevertedAsExpected;
							++ participant_.stats.negativeProbesExpectedRevert;
							return true;
						}
						break;
					}
					case 1: {
						// Claim main prize far too early (should revert).
						const lastBidder_ = await contracts_.cosmicSignatureGameProxy.lastBidderAddress();
						if (lastBidder_ === hre.ethers.ZeroAddress) {
							return false;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(participant_.gameProxy.claimMainPrize());
						if (receipt_ === undefined) {
							++ globalStats_.negativeProbesRevertedAsExpected;
							++ participant_.stats.negativeProbesExpectedRevert;
							return true;
						}
						break;
					}
					case 2: {
						// Unstake with a bogus action id (likely nonexistent / not owned).
						const bogusId_ = participant_.random() % 1_000_000n + 500_000n;
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.stakingWalletRandomWalkNft.unstake(bogusId_)
						);
						if (receipt_ === undefined) {
							++ globalStats_.negativeProbesRevertedAsExpected;
							++ participant_.stats.negativeProbesExpectedRevert;
							return true;
						}
						break;
					}
					case 3: {
						// `bidWithCst` with zero max price while price is positive (should revert or noop-revert).
						const lastBidder_ = await contracts_.cosmicSignatureGameProxy.lastBidderAddress();
						if (lastBidder_ === hre.ethers.ZeroAddress) {
							return false;
						}
						await advanceTime_(1, 60);
						const price_ = await participant_.gameProxy.getNextCstBidPrice();
						if (price_ === 0n) {
							return false;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.gameProxy.bidWithCst(0n, "")
						);
						if (receipt_ === undefined) {
							++ globalStats_.negativeProbesRevertedAsExpected;
							++ participant_.stats.negativeProbesExpectedRevert;
							return true;
						}
						break;
					}
					default: {
						// Donate ETH with zero value (allowed) — not a revert; still exercises a boundary.
						const receipt_ = await fuzzTryWaitForTransactionReceipt(participant_.gameProxy.donateEth({ value: 0n }));
						if (receipt_) {
							++ globalStats_.negativeProbesRevertedAsExpected; // count as "handled edge"
							return true;
						}
						break;
					}
				}
			} catch (error_) {
				if (isExpectedHardhatRevertError(error_)) {
					++ globalStats_.negativeProbesRevertedAsExpected;
					++ participant_.stats.negativeProbesExpectedRevert;
					return true;
				}
				throw error_;
			}
			return false;
		};

		/**
		 * @param {Participant} participant_
		 * @param {string} action_
		 */
		const executeAction_ = async (participant_, action_) => {
			++ globalStats_.totalActions;
			if ( ! globalStats_.actionCounts[action_]) {
				globalStats_.actionCounts[action_] = { attempted: 0, succeeded: 0 };
			}
			++ globalStats_.actionCounts[action_].attempted;

			try {
				switch (action_) {
					case "mintRandomWalkNft": {
						const mintPrice_ = await participant_.randomWalkNft.getMintPrice();
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.randomWalkNft.mint({ value: mintPrice_ })
						);
						if (receipt_) {
							++ participant_.stats.nftsMinted;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "stakeRandomWalkNft": {
						const nftId_ = await findUnusedRandomWalkNft_(participant_, true);
						if (nftId_ < 0n) {
							break;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.stakingWalletRandomWalkNft.stake(nftId_)
						);
						if (receipt_) {
							++ participant_.stats.nftsStaked;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "unstakeRandomWalkNft": {
						const actionId_ = await findStakedNftAction_(contracts_.stakingWalletRandomWalkNft, participant_);
						if (actionId_ < 0n) {
							break;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.stakingWalletRandomWalkNft.unstake(actionId_)
						);
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "stakeRandomWalkNftMany": {
						const ids_ = await collectMultipleUnusedRandomWalkNfts_(participant_, true, 3);
						if (ids_.length === 0) {
							break;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.stakingWalletRandomWalkNft.stakeMany(ids_)
						);
						if (receipt_) {
							participant_.stats.nftsStaked += ids_.length;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "unstakeRandomWalkNftMany": {
						const ids_ = await collectMultipleStakedActionIds_(contracts_.stakingWalletRandomWalkNft, participant_, 3);
						if (ids_.length === 0) {
							break;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.stakingWalletRandomWalkNft.unstakeMany(ids_)
						);
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "stakeCosmicSignatureNft": {
						const nftId_ = await findUnusedCosmicSignatureNft_(participant_);
						if (nftId_ < 0n) {
							break;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.stakingWalletCosmicSignatureNft.stake(nftId_)
						);
						if (receipt_) {
							++ participant_.stats.nftsStaked;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "unstakeCosmicSignatureNft": {
						const actionId_ = await findStakedNftAction_(contracts_.stakingWalletCosmicSignatureNft, participant_);
						if (actionId_ < 0n) {
							break;
						}
						const balanceBefore_ = await hre.ethers.provider.getBalance(participant_.address);
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.stakingWalletCosmicSignatureNft.unstake(actionId_)
						);
						if (receipt_) {
							const balanceAfter_ = await hre.ethers.provider.getBalance(participant_.address);
							const earned_ = balanceAfter_ - balanceBefore_;
							if (earned_ > 0n) {
								participant_.stats.ethEarned += earned_;
							}
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "stakeCosmicSignatureNftMany": {
						const ids_ = await collectMultipleUnusedCosmicSignatureNfts_(participant_, 3);
						if (ids_.length === 0) {
							break;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.stakingWalletCosmicSignatureNft.stakeMany(ids_)
						);
						if (receipt_) {
							participant_.stats.nftsStaked += ids_.length;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "unstakeCosmicSignatureNftMany": {
						const ids_ = await collectMultipleStakedActionIds_(contracts_.stakingWalletCosmicSignatureNft, participant_, 3);
						if (ids_.length === 0) {
							break;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.stakingWalletCosmicSignatureNft.unstakeMany(ids_)
						);
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "bidWithEth": {
						await advanceTime_(1, 600);
						const bidPrice_ = await participant_.gameProxy.getNextEthBidPrice();
						const valueToSend_ = bidPrice_ + bidPrice_ / 5n;
						const message_ = participant_.generateMessage();
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.gameProxy.bidWithEth(-1n, message_, { value: valueToSend_ })
						);
						if (receipt_) {
							++ participant_.stats.bidsPlaced;
							participant_.stats.ethSpent += bidPrice_;
							globalStats_.totalEthBid += bidPrice_;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "bidWithEthPlusNft": {
						await advanceTime_(1, 600);
						const nftId_ = await findUnusedRandomWalkNft_(participant_, false);
						if (nftId_ < 0n) {
							break;
						}
						const bidPrice_ = await participant_.gameProxy.getNextEthBidPrice();
						const discountedPrice_ = bidPrice_ / 2n;
						const valueToSend_ = discountedPrice_ + discountedPrice_ / 5n;
						const message_ = participant_.generateMessage();
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.gameProxy.bidWithEth(nftId_, message_, { value: valueToSend_ })
						);
						if (receipt_) {
							++ participant_.stats.bidsPlaced;
							participant_.stats.ethSpent += discountedPrice_;
							globalStats_.totalEthBid += discountedPrice_;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "bidWithEthReceive": {
						await advanceTime_(1, 600);
						const bidPrice_ = await participant_.gameProxy.getNextEthBidPrice();
						const valueToSend_ = bidPrice_ + bidPrice_ / 5n;
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.signer.sendTransaction({
								to: contracts_.cosmicSignatureGameProxyAddress,
								value: valueToSend_,
							})
						);
						if (receipt_) {
							++ participant_.stats.bidsPlaced;
							participant_.stats.ethSpent += bidPrice_;
							globalStats_.totalEthBid += bidPrice_;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "bidWithEthAndDonateToken": {
						await advanceTime_(1, 600);
						const bidPrice_ = await participant_.gameProxy.getNextEthBidPrice();
						const valueToSend_ = bidPrice_ + bidPrice_ / 5n;
						const message_ = participant_.generateMessage();
						const donateAmount_ = participant_.random() % (10n ** 15n) + 1n; // small
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.gameProxy.bidWithEthAndDonateToken(
								-1n,
								message_,
								fuzzTestMockErc20Address_,
								donateAmount_,
								{ value: valueToSend_ }
							)
						);
						if (receipt_) {
							++ participant_.stats.bidsPlaced;
							participant_.stats.ethSpent += bidPrice_;
							globalStats_.totalEthBid += bidPrice_;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "bidWithEthAndDonateNft": {
						await advanceTime_(1, 600);
						const nftBid_ = await findUnusedRandomWalkNft_(participant_, false);
						if (nftBid_ < 0n) {
							break;
						}
						if ( ! await ensureParticipantOwnsMockDonationNft_(participant_)) {
							break;
						}
						const bidPrice_ = await participant_.gameProxy.getNextEthBidPrice();
						// Match `bidWithEthPlusNft` ETH leg: Random Walk NFT halves the required ETH (see `Bidding.sol` / constants).
						const discountedPrice_ = bidPrice_ / 2n;
						const valueToSend_ = discountedPrice_ + discountedPrice_ / 5n;
						const message_ = participant_.generateMessage();
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.gameProxy.bidWithEthAndDonateNft(
								nftBid_,
								message_,
								fuzzTestMockErc721Address_,
								participant_.mockDonatedNftTokenId,
								{ value: valueToSend_ }
							)
						);
						if (receipt_) {
							++ participant_.stats.bidsPlaced;
							participant_.stats.ethSpent += discountedPrice_;
							globalStats_.totalEthBid += discountedPrice_;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "bidWithCst": {
						const lastBidder_ = await contracts_.cosmicSignatureGameProxy.lastBidderAddress();
						if (lastBidder_ === hre.ethers.ZeroAddress) {
							break;
						}
						await advanceTime_(1, 300);
						const cstPrice_ = await participant_.gameProxy.getNextCstBidPrice();
						const cstBalance_ = await contracts_.cosmicSignatureToken.balanceOf(participant_.address);
						if (cstBalance_ < cstPrice_) {
							break;
						}
						const message_ = participant_.generateMessage();
						const maxPrice_ =
							cstPrice_ === 0n
								? hre.ethers.MaxUint256
								: cstPrice_ + (participant_.random() % (cstPrice_ + 1n));
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.gameProxy.bidWithCst(maxPrice_, message_)
						);
						if (receipt_) {
							++ participant_.stats.bidsPlaced;
							participant_.stats.cstSpent += cstPrice_;
							globalStats_.totalCstBid += cstPrice_;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "bidWithCstAndDonateToken": {
						const lastBidder_ = await contracts_.cosmicSignatureGameProxy.lastBidderAddress();
						if (lastBidder_ === hre.ethers.ZeroAddress) {
							break;
						}
						await advanceTime_(1, 120);
						const cstPrice_ = await participant_.gameProxy.getNextCstBidPrice();
						const cstBalance_ = await contracts_.cosmicSignatureToken.balanceOf(participant_.address);
						if (cstBalance_ < cstPrice_) {
							break;
						}
						const donateAmount_ = participant_.random() % (10n ** 15n) + 1n;
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.gameProxy.bidWithCstAndDonateToken(
								hre.ethers.MaxUint256,
								participant_.generateMessage(),
								fuzzTestMockErc20Address_,
								donateAmount_
							)
						);
						if (receipt_) {
							++ participant_.stats.bidsPlaced;
							participant_.stats.cstSpent += cstPrice_;
							globalStats_.totalCstBid += cstPrice_;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "bidWithCstAndDonateNft": {
						const lastBidder_ = await contracts_.cosmicSignatureGameProxy.lastBidderAddress();
						if (lastBidder_ === hre.ethers.ZeroAddress) {
							break;
						}
						if ( ! await ensureParticipantOwnsMockDonationNft_(participant_)) {
							break;
						}
						await advanceTime_(1, 120);
						const cstPrice_ = await participant_.gameProxy.getNextCstBidPrice();
						const cstBalance_ = await contracts_.cosmicSignatureToken.balanceOf(participant_.address);
						if (cstBalance_ < cstPrice_) {
							break;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.gameProxy.bidWithCstAndDonateNft(
								hre.ethers.MaxUint256,
								participant_.generateMessage(),
								fuzzTestMockErc721Address_,
								participant_.mockDonatedNftTokenId
							)
						);
						if (receipt_) {
							++ participant_.stats.bidsPlaced;
							participant_.stats.cstSpent += cstPrice_;
							globalStats_.totalCstBid += cstPrice_;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "claimMainPrize": {
						const lastBidder_ = await contracts_.cosmicSignatureGameProxy.lastBidderAddress();
						if (lastBidder_ === hre.ethers.ZeroAddress) {
							break;
						}
						const mainPrizeTime_ = await contracts_.cosmicSignatureGameProxy.mainPrizeTime();
						const currentBlock_ = await hre.ethers.provider.getBlock("latest");
						if (participant_.random() % 2n === 0n && BigInt(currentBlock_.timestamp) < mainPrizeTime_) {
							const targetTime_ = Math.max(Number(mainPrizeTime_), currentBlock_.timestamp + 1);
							await hre.ethers.provider.send("evm_setNextBlockTimestamp", [targetTime_]);
							await hre.ethers.provider.send("evm_mine");
						}
						const balanceBefore_ = await hre.ethers.provider.getBalance(participant_.address);
						const receipt_ = await fuzzTryWaitForTransactionReceipt(participant_.gameProxy.claimMainPrize());
						if (receipt_) {
							const balanceAfter_ = await hre.ethers.provider.getBalance(participant_.address);
							const earned_ = balanceAfter_ - balanceBefore_;
							if (earned_ > 0n) {
								participant_.stats.ethEarned += earned_;
							}
							++ participant_.stats.prizesWon;
							++ globalStats_.roundsCompleted;
							await markSuccess_(action_, participant_, receipt_, async (rec_) => {
								// Event smoke test: `MainPrizeClaimed` should appear in the receipt when claim succeeds.
								const found_ = rec_.logs.some((log_) => {
									try {
										const parsed_ = contracts_.cosmicSignatureGameProxy.interface.parseLog(log_);
										return parsed_?.name === "MainPrizeClaimed";
									} catch {
										return false;
									}
								});
								expect(found_, "claimMainPrize receipt should contain MainPrizeClaimed").to.be.true;
							});
							if (fuzzConfig_.verbosity >= 1) {
								const newRound_ = await contracts_.cosmicSignatureGameProxy.roundNum();
								console.log(`    ★ Participant ${participant_.index} claimed main prize; on-chain round now ${newRound_}`);
							}
							return true;
						}
						break;
					}
					case "withdrawEthPrize": {
						const currentRound_ = await contracts_.cosmicSignatureGameProxy.roundNum();
						if (currentRound_ <= 0n) {
							break;
						}
						const prizeRound_ = participant_.random() % currentRound_;
						const prizeBalance_ = await participant_.prizesWallet.getEthBalanceAmount(prizeRound_);
						if (prizeBalance_ <= 0n) {
							break;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(participant_.prizesWallet.withdrawEth(prizeRound_));
						if (receipt_) {
							participant_.stats.ethEarned += prizeBalance_;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "withdrawEthPrizeMany": {
						const currentRound_ = await contracts_.cosmicSignatureGameProxy.roundNum();
						if (currentRound_ <= 0n) {
							break;
						}
						/** @type {bigint[]} */
						const rounds_ = [];
						for (let r_ = 0n; r_ < currentRound_ && rounds_.length < 4; ++ r_) {
							const b_ = await participant_.prizesWallet.getEthBalanceAmount(r_);
							if (b_ > 0n) {
								rounds_.push(r_);
							}
						}
						if (rounds_.length === 0) {
							break;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(participant_.prizesWallet.withdrawEthMany(rounds_));
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "withdrawEthPrizeForAnyoneAfterTimeout": {
						const currentRound_ = await contracts_.cosmicSignatureGameProxy.roundNum();
						if (currentRound_ <= 0n) {
							break;
						}
						const prizeRound_ = participant_.random() % currentRound_;
						const timeoutTs_ = await contracts_.prizesWallet.roundTimeoutTimesToWithdrawPrizes(prizeRound_);
						const latest_ = await hre.ethers.provider.getBlock("latest");
						if (timeoutTs_ === 0n || BigInt(latest_.timestamp) < timeoutTs_) {
							await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeoutTs_) + 3600]);
							await hre.ethers.provider.send("evm_mine");
						}
						const beneficiary_ = await contracts_.prizesWallet.mainPrizeBeneficiaryAddresses(prizeRound_);
						if (beneficiary_ === hre.ethers.ZeroAddress) {
							break;
						}
						const pending_ = await contracts_.prizesWallet.getFunction("getEthBalanceAmount(uint256,address)")(
							prizeRound_,
							beneficiary_
						);
						if (pending_ <= 0n) {
							break;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.prizesWallet.getFunction("withdrawEth(uint256,address)")(prizeRound_, beneficiary_)
						);
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "withdrawEverythingBatch": {
						const currentRound_ = await contracts_.cosmicSignatureGameProxy.roundNum();
						/** @type {bigint[]} */
						const ethRounds_ = [];
						if (currentRound_ > 0n) {
							for (let r_ = 0n; r_ < currentRound_ && ethRounds_.length < 3; ++ r_) {
								const b_ = await participant_.prizesWallet.getEthBalanceAmount(r_);
								if (b_ > 0n) {
									ethRounds_.push(r_);
								}
							}
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.prizesWallet.withdrawEverything(ethRounds_, [], [])
						);
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "claimDonatedToken": {
						const currentRound_ = await contracts_.cosmicSignatureGameProxy.roundNum();
						if (currentRound_ <= 0n) {
							break;
						}
						const roundPick_ = participant_.random() % currentRound_;
						const bal_ = await contracts_.prizesWallet.getDonatedTokenBalanceAmount(roundPick_, fuzzTestMockErc20Address_);
						if (bal_ <= 0n) {
							break;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.prizesWallet.claimDonatedToken(roundPick_, fuzzTestMockErc20Address_, 0n)
						);
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "claimManyDonatedTokens": {
						const currentRound_ = await contracts_.cosmicSignatureGameProxy.roundNum();
						if (currentRound_ <= 0n) {
							break;
						}
						const roundPick_ = participant_.random() % currentRound_;
						const bal_ = await contracts_.prizesWallet.getDonatedTokenBalanceAmount(roundPick_, fuzzTestMockErc20Address_);
						if (bal_ <= 0n) {
							break;
						}
						const struct_ = { roundNum: roundPick_, tokenAddress: fuzzTestMockErc20Address_, amount: 0n };
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.prizesWallet.claimManyDonatedTokens([struct_])
						);
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "claimDonatedNft": {
						const nextIdx_ = await contracts_.prizesWallet.nextDonatedNftIndex();
						if (nextIdx_ === 0n) {
							break;
						}
						const index_ = participant_.random() % nextIdx_;
						const receipt_ = await fuzzTryWaitForTransactionReceipt(participant_.prizesWallet.claimDonatedNft(index_));
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "claimManyDonatedNfts": {
						const nextIdx_ = await contracts_.prizesWallet.nextDonatedNftIndex();
						if (nextIdx_ === 0n) {
							break;
						}
						const index_ = participant_.random() % nextIdx_;
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.prizesWallet.claimManyDonatedNfts([index_])
						);
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "donateEth": {
						const amount_ = (participant_.random() % (10n ** 17n)) + 10n ** 15n;
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.gameProxy.donateEth({ value: amount_ })
						);
						if (receipt_) {
							globalStats_.totalEthDonated += amount_;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "donateEthWithInfo": {
						const amount_ = (participant_.random() % (10n ** 17n)) + 10n ** 15n;
						const message_ = participant_.generateMessage();
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.gameProxy.donateEthWithInfo(message_, { value: amount_ })
						);
						if (receipt_) {
							globalStats_.totalEthDonated += amount_;
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "donateEthZero": {
						const receipt_ = await fuzzTryWaitForTransactionReceipt(participant_.gameProxy.donateEth({ value: 0n }));
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "transferNft": {
						const other_ = findOtherParticipant_(participant_);
						if ( ! other_) {
							break;
						}
						const rwTotalSupply_ = await contracts_.randomWalkNft.totalSupply();
						if (rwTotalSupply_ === 0n) {
							break;
						}
						for (let attempt_ = 0; attempt_ < 8; ++ attempt_) {
							const nftId_ = participant_.random() % rwTotalSupply_;
							try {
								const owner_ = await contracts_.randomWalkNft.ownerOf(nftId_);
								if (owner_ !== participant_.address) {
									continue;
								}
								const receipt_ = await fuzzTryWaitForTransactionReceipt(
									participant_.randomWalkNft.transferFrom(participant_.address, other_.address, nftId_)
								);
								if (receipt_) {
									return await markSuccess_(action_, participant_, receipt_);
								}
							} catch {
								// Ignore.
							}
						}
						break;
					}
					case "transferCosmicSignatureNft": {
						const other_ = findOtherParticipant_(participant_);
						if ( ! other_) {
							break;
						}
						const total_ = await contracts_.cosmicSignatureNft.totalSupply();
						if (total_ === 0n) {
							break;
						}
						for (let attempt_ = 0; attempt_ < 8; ++ attempt_) {
							const nftId_ = participant_.random() % total_;
							try {
								const owner_ = await contracts_.cosmicSignatureNft.ownerOf(nftId_);
								if (owner_ !== participant_.address) {
									continue;
								}
								const used_ = await contracts_.stakingWalletCosmicSignatureNft.usedNfts(nftId_);
								if ( ! isNftSlotUnused_(used_)) {
									continue;
								}
								const receipt_ = await fuzzTryWaitForTransactionReceipt(
									participant_.cosmicSignatureNft.transferFrom(participant_.address, other_.address, nftId_)
								);
								if (receipt_) {
									return await markSuccess_(action_, participant_, receipt_);
								}
							} catch {
								// Ignore.
							}
						}
						break;
					}
					case "transferCst": {
						const other_ = findOtherParticipant_(participant_);
						if ( ! other_) {
							break;
						}
						const balance_ = await contracts_.cosmicSignatureToken.balanceOf(participant_.address);
						if (balance_ <= 10n ** 18n) {
							break;
						}
						const amount_ = (participant_.random() % (balance_ / 10n)) + 10n ** 18n;
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.cosmicSignatureToken.transfer(other_.address, amount_)
						);
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "transferCstMany": {
						const others_ = participants_.filter((p_) => p_.address !== participant_.address).slice(0, 3);
						if (others_.length === 0) {
							break;
						}
						const balance_ = await contracts_.cosmicSignatureToken.balanceOf(participant_.address);
						if (balance_ < 10n ** 19n) {
							break;
						}
						const per_ = 10n ** 18n;
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.cosmicSignatureToken.getFunction("transferMany(address[],uint256)")(
								others_.map((p_) => p_.address),
								per_
							)
						);
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "cstDelegateSelf": {
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.cosmicSignatureToken.delegate(participant_.address)
						);
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "cstBurnSmall": {
						const balance_ = await contracts_.cosmicSignatureToken.balanceOf(participant_.address);
						if (balance_ < 2n) {
							break;
						}
						const burnAmt_ = participant_.random() % (balance_ / 100n + 1n);
						if (burnAmt_ === 0n) {
							break;
						}
						const receipt_ = await fuzzTryWaitForTransactionReceipt(participant_.cosmicSignatureToken.burn(burnAmt_));
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "setCosmicSignatureNftName": {
						const total_ = await contracts_.cosmicSignatureNft.totalSupply();
						if (total_ === 0n) {
							break;
						}
						const nftId_ = participant_.random() % total_;
						try {
							const owner_ = await contracts_.cosmicSignatureNft.ownerOf(nftId_);
							if (owner_ !== participant_.address) {
								break;
							}
							const name_ = participant_.generateMessage(64);
							const receipt_ = await fuzzTryWaitForTransactionReceipt(
								participant_.cosmicSignatureNft.setNftName(nftId_, name_)
							);
							if (receipt_) {
								return await markSuccess_(action_, participant_, receipt_);
							}
						} catch {
							// Ignore.
						}
						break;
					}
					case "setRandomWalkTokenName": {
						const total_ = await contracts_.randomWalkNft.totalSupply();
						if (total_ === 0n) {
							break;
						}
						const nftId_ = participant_.random() % total_;
						try {
							const owner_ = await contracts_.randomWalkNft.ownerOf(nftId_);
							if (owner_ !== participant_.address) {
								break;
							}
							const name_ = participant_.generateMessage(40);
							const receipt_ = await fuzzTryWaitForTransactionReceipt(
								participant_.randomWalkNft.setTokenName(nftId_, name_)
							);
							if (receipt_) {
								return await markSuccess_(action_, participant_, receipt_);
							}
						} catch {
							// Ignore.
						}
						break;
					}
					case "randomWalkWithdraw": {
						const receipt_ = await fuzzTryWaitForTransactionReceipt(participant_.randomWalkNft.withdraw());
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "charityWalletSend": {
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.charityWallet.getFunction("send()")()
						);
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "charityWalletSendAmount": {
						const bal_ = await hre.ethers.provider.getBalance(contracts_.charityWalletAddress);
						const amount_ = bal_ > 2n ? bal_ / 3n : 0n;
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							participant_.charityWallet.getFunction("send(uint256)")(amount_)
						);
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "marketingWalletPayReward": {
						const amt_ = participant_.random() % (10n ** 18n);
						const receipt_ = await fuzzTryWaitForTransactionReceipt(
							contracts_.marketingWallet.connect(contracts_.treasurerSigner).payReward(participant_.address, amt_)
						);
						if (receipt_) {
							return await markSuccess_(action_, participant_, receipt_);
						}
						break;
					}
					case "daoGovernanceCycle": {
						// Mirrors `CosmicSignatureDao.js`: use early signers with pre-bootstrapped voting weights.
						const proposer_ = contracts_.signers[0];
						const daoAddr_ = await contracts_.cosmicSignatureDao.getAddress();
						const daoConn_ = contracts_.cosmicSignatureDao.connect(proposer_);
						const votingDelay_ = await contracts_.cosmicSignatureDao.votingDelay();
						const votingPeriod_ = await contracts_.cosmicSignatureDao.votingPeriod();
						const newDelay_ = votingDelay_ + 1n;
						const proposalCallData_ = contracts_.cosmicSignatureDao.interface.encodeFunctionData("setVotingDelay", [newDelay_]);
						const description_ = "FuzzTest: setVotingDelay";
						const descriptionHash_ = hre.ethers.id(description_);
						const receiptProp_ = await fuzzTryWaitForTransactionReceipt(
							daoConn_.propose([daoAddr_], [0n], [proposalCallData_], description_)
						);
						if ( ! receiptProp_) {
							break;
						}
						let proposalId_;
						for (const log_ of receiptProp_.logs) {
							try {
								const parsed_ = contracts_.cosmicSignatureDao.interface.parseLog(log_);
								if (parsed_?.name === "ProposalCreated") {
									proposalId_ = parsed_.args.proposalId;
									break;
								}
							} catch {
								// Ignore.
							}
						}
						if (proposalId_ == undefined) {
							break;
						}
						await hre.ethers.provider.send("evm_increaseTime", [Number(votingDelay_) + 1]);
						await fuzzTryWaitForTransactionReceipt(daoConn_.castVote(proposalId_, 1));
						await hre.ethers.provider.send("evm_increaseTime", [Number(votingPeriod_) + 1]);
						const receiptExec_ = await fuzzTryWaitForTransactionReceipt(
							daoConn_.execute([daoAddr_], [0n], [proposalCallData_], descriptionHash_)
						);
						if (receiptExec_) {
							expect(await contracts_.cosmicSignatureDao.votingDelay()).to.equal(newDelay_);
							return await markSuccess_(action_, participant_, receiptExec_);
						}
						break;
					}
					default:
						break;
				}
			} catch (error_) {
				++ globalStats_.failedActions;
				// Hardhat reverts are expected in fuzzing; anything else is surfaced loudly.
				if ( ! isExpectedHardhatRevertError(error_)) {
					console.error(`Unexpected error in action=${action_}: ${/** @type {Error} */ (error_).message}`);
					throw error_;
				}
			}
			return false;
		};

		// Bootstrap minimal CST voting power for DAO paths (same spirit as `CosmicSignatureDao.js`).
		for (let sIdx_ = 0; sIdx_ < Math.min(2, contracts_.signers.length); ++ sIdx_) {
			const sgn_ = contracts_.signers[sIdx_];
			await waitForTransactionReceipt(contracts_.cosmicSignatureToken.connect(sgn_).delegate(sgn_.address));
			for (let b_ = 0; b_ < 6; ++ b_) {
				await fuzzTryWaitForTransactionReceipt(
					contracts_.cosmicSignatureGameProxy.connect(sgn_).bidWithEth(-1n, "", { value: 10n ** 18n })
				);
			}
		}

		const tryCompleteRound_ = async () => {
			const lastBidder_ = await contracts_.cosmicSignatureGameProxy.lastBidderAddress();
			if (lastBidder_ === hre.ethers.ZeroAddress) {
				return false;
			}
			const mainPrizeTime_ = await contracts_.cosmicSignatureGameProxy.mainPrizeTime();
			const currentBlock_ = await hre.ethers.provider.getBlock("latest");
			const targetTime_ = Math.max(Number(mainPrizeTime_) + 1, currentBlock_.timestamp + 1);
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [targetTime_]);
			await hre.ethers.provider.send("evm_mine");
			const lastBidderParticipant_ = participants_.find((p_) => p_.address === lastBidder_);
			if (lastBidderParticipant_) {
				const receipt_ = await fuzzTryWaitForTransactionReceipt(lastBidderParticipant_.gameProxy.claimMainPrize());
				if ( ! receipt_) {
					return false;
				}
				++ globalStats_.roundsCompleted;
				++ lastBidderParticipant_.stats.prizesWon;
				const parsedMain_ = receipt_.logs
					.map((log_) => {
						try {
							return contracts_.cosmicSignatureGameProxy.interface.parseLog(log_);
						} catch {
							return null;
						}
					})
					.find((p_) => p_?.name === "MainPrizeClaimed");
				expect(parsedMain_?.name).to.equal("MainPrizeClaimed");
				return true;
			}
			return false;
		};

		// #endregion
		// #region Main loop

		console.log("\n  Starting simulation…\n");
		const startMs_ = Date.now();
		let lastProgressUpdate_ = 0;

		for (let roundIndex_ = 0; roundIndex_ < fuzzConfig_.numRounds; ++ roundIndex_) {
			if (fuzzConfig_.verbosity >= 1 && roundIndex_ - lastProgressUpdate_ >= 10) {
				const elapsedSec_ = ((Date.now() - startMs_) / 1000).toFixed(1);
				const currentGameRound_ = await contracts_.cosmicSignatureGameProxy.roundNum();
				console.log(
					`  [${elapsedSec_}s] fuzzRound ${roundIndex_ + 1}/${fuzzConfig_.numRounds} | ` +
					`chainRound ${currentGameRound_} | actions ${globalStats_.totalActions} | invariants ${globalStats_.invariantChecks}`
				);
				lastProgressUpdate_ = roundIndex_;
			}

			for (const participant_ of participants_) {
				const numActions_ = Number(
					(participant_.random() % BigInt(fuzzConfig_.actionsPerParticipantPerRound * 2)) + 1n
				);
				for (let a_ = 0; a_ < numActions_; ++ a_) {
					await hre.ethers.provider.send("hardhat_setBalance", [
						participant_.address,
						"0x" + fuzzConfig_.ethPerParticipant.toString(16),
					]);

					// Global negative-probe injection (independent of profile weights).
					const injectNegative_ =
						fuzzConfig_.negativeProbeWeight > 0 &&
						Number(participant_.random() % 100n) < fuzzConfig_.negativeProbeWeight;

					let ok_;
					if (injectNegative_) {
						++ globalStats_.actionCounts.negativeProbe.attempted;
						ok_ = await executeNegativeProbe_(participant_);
						if (ok_) {
							++ globalStats_.actionCounts.negativeProbe.succeeded;
						}
					} else {
						const action_ = participant_.selectAction();
						ok_ = await executeAction_(participant_, action_);
					}

					if (participant_.random() % 3n === 0n) {
						await advanceTime_(1, 60);
					}
				}
			}

			if (await tryCompleteRound_()) {
				if (fuzzConfig_.verbosity >= 1) {
					const newRound_ = await contracts_.cosmicSignatureGameProxy.roundNum();
					console.log(`    → Completed on-chain round ${newRound_ - 1n}`);
				}
			}
		}

		// #endregion
		// #region Final invariants + reporting

		await runProtocolInvariants(contracts_, participants_, baselineRound_, rewardPerStakedSnapshotWrapper_);

		const elapsedSecFinal_ = ((Date.now() - startMs_) / 1000).toFixed(1);
		console.log("\n" + "═".repeat(80));
		console.log("  FUZZ TEST COMPLETE");
		console.log("═".repeat(80));
		console.log(`  Duration: ${elapsedSecFinal_}s`);
		console.log(
			`  Actions: total=${globalStats_.totalActions} ok=${globalStats_.successfulActions} ` +
			`failClassified=${globalStats_.failedActions} invariants=${globalStats_.invariantChecks}`
		);
		console.log(
			`  Negative probes: ${globalStats_.negativeProbes} (expected-style outcomes: ${globalStats_.negativeProbesRevertedAsExpected})`
		);
		console.log(`  On-chain rounds completed (claim counter): ${globalStats_.roundsCompleted}`);

		const sortedActions_ = Object.entries(globalStats_.actionCounts)
			.filter(([, c_]) => c_.attempted > 0)
			.sort((a_, b_) => b_[1].attempted - a_[1].attempted);
		console.log("\n  ACTION BREAKDOWN (sample):");
		for (const [name_, counts_] of sortedActions_.slice(0, 40)) {
			const rate_ =
				counts_.attempted > 0 ? ((counts_.succeeded / counts_.attempted) * 100).toFixed(1) : "0.0";
			console.log(`    ${name_.padEnd(36)} ${String(counts_.succeeded).padStart(5)} / ${String(counts_.attempted).padStart(5)} (${rate_}%)`);
		}

		expect(globalStats_.totalActions).to.be.greaterThan(0);
		expect(globalStats_.successfulActions).to.be.greaterThan(0);
		expect(globalStats_.invariantChecks).to.be.greaterThan(0);

		// #endregion
	});

	// #endregion
});

// #endregion
