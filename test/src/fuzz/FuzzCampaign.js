// #region

"use strict";

// #endregion
// #region Imports

const { expect } = require("chai");
const hre = require("hardhat");
const {
	ENABLE_ASSERTS,
	ENABLE_HARDHAT_PREPROCESSOR,
	ENABLE_SMTCHECKER,
	HARDHAT_MODE_CODE,
	generateRandomUInt256FromSeedWrapper,
	parseIntegerEnvironmentVariable,
	uint256ToPaddedHexString,
} = require("../../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../../src/ContractTestingHelpers.js");
const { GameModel, ZERO_ADDRESS } = require("./GameModel.js");
const { ShadowState } = require("./ShadowState.js");
const { GameAbiAdapter } = require("./GameAbiAdapter.js");
const { FuzzEngine } = require("./FuzzEngine.js");
const { runInvariants, assertCoverageFloors, hasMinimalCoverageFloors, printCoverageReport, mergeStatsInto } = require("./Invariants.js");
const { performUpgradeToV2, performUpgradeToV3, upgradeAuthProbe } = require("./UpgradePhase.js");
const { biddingActions, claimActions, donationActions, stakingActions, forceCompleteRound, runClaimRace } = require("./actions/CoreActions.js");
const { randomWalkActions, tokenActions, prizesWalletActions, walletActions } = require("./actions/SecondaryActions.js");
const { adminActions, daoActions } = require("./actions/AdminActions.js");
const { extraTokenActions, extraPrizesWalletActions } = require("./actions/ExtraActions.js");
const { negativeProbes } = require("./actions/NegativeProbes.js");
const { CharityController, adversarialActions, applyArbitrumChaos, resetArbitrumChaos, ARB_SYS_ADDRESS, ARB_GAS_INFO_ADDRESS } = require("./actions/AdversarialActions.js");

// #endregion
// #region Profiles

/**
Selects the campaign profile tier.
@param {number} longTestModeCode_ Comment-202606305 applies.
@param {object} envOverrides_
*/
function buildProfile(longTestModeCode_, envOverrides_) {
	let base_;
	if (longTestModeCode_ < 2) {
		base_ = {
			numActors: 6,
			// Equal V1/V2 rounds => ~50/50 split of fuzzing time across the two code versions.
			v1Rounds: 3,
			v2Rounds: 3,
			v3Rounds: 3,
			actionsPerSegment: 22,
			invariantEveryActions: 18,
			negativeProbePercent: 14,
			burstPercent: 6,
			verbosity: 1,
			chaosPercent: 35,
			overflowModePercent: 10,
			upgradeAfterRoundZeroPercent: 50,
			enforceStrongCoverage: false,
			// Quick CI profile: a single bounded campaign (no wall-clock soak).
			maxSeconds: undefined,
		};
	} else if (longTestModeCode_ < 3) {
		base_ = {
			numActors: 7,
			v1Rounds: 5,
			v2Rounds: 5,
			v3Rounds: 5,
			actionsPerSegment: 32,
			invariantEveryActions: 28,
			negativeProbePercent: 13,
			burstPercent: 7,
			verbosity: 1,
			chaosPercent: 60,
			overflowModePercent: 15,
			upgradeAfterRoundZeroPercent: 50,
			enforceStrongCoverage: false,
			// A single, larger bounded campaign (override with FUZZ_MAX_SECONDS to soak).
			maxSeconds: 0,
		};
	} else {
		base_ = {
			numActors: 9,
			// Equal version rounds per campaign => broad coverage across V1, V2, and V3 code.
			v1Rounds: 10,
			v2Rounds: 10,
			v3Rounds: 10,
			actionsPerSegment: 45,
			invariantEveryActions: 40,
			negativeProbePercent: 12,
			burstPercent: 8,
			verbosity: 1,
			chaosPercent: 70,
			overflowModePercent: 20,
			upgradeAfterRoundZeroPercent: 50,
			enforceStrongCoverage: true,
			// Default to a 20-minute soak (repeated independent bounded campaigns). Override with FUZZ_MAX_SECONDS.
			maxSeconds: 1200,
		};
	}
	const merged_ = { ...base_, ...envOverrides_ };
	return merged_;
}

/** Reads numeric campaign environment overrides. */
function readEnvOverrides() {
	const overrides_ = {};
	const num_ = (name_, key_) => {
		const value_ = parseIntegerEnvironmentVariable(name_, undefined);
		if (value_ !== undefined) {
			overrides_[key_] = value_;
		}
	};
	num_("FUZZ_V1_ROUNDS", "v1Rounds");
	num_("FUZZ_V2_ROUNDS", "v2Rounds");
	num_("FUZZ_V3_ROUNDS", "v3Rounds");
	num_("FUZZ_ACTORS", "numActors");
	num_("FUZZ_MAX_SECONDS", "maxSeconds");
	return overrides_;
}

function chanceFromSeed(seedWrapper_, percent_) {
	if (percent_ <= 0) {
		return false;
	}
	if (percent_ >= 100) {
		return true;
	}
	return Number(generateRandomUInt256FromSeedWrapper(seedWrapper_) % 100n) < percent_;
}

/**
Derives per-campaign fuzz modes from the campaign seed so ordinary runs probabilistically cover
chaos, overflow-targeting, and production-style round-zero upgrade timing without extra env toggles.
@param {object} profile_
@param {{ value: bigint }} seedWrapper_
*/
function deriveCampaignProfile(profile_, seedWrapper_) {
	return {
		...profile_,
		chaos: chanceFromSeed(seedWrapper_, profile_.chaosPercent ?? 0),
		overflowMode: chanceFromSeed(seedWrapper_, profile_.overflowModePercent ?? 0),
		upgradeAfterRoundZero: chanceFromSeed(seedWrapper_, profile_.upgradeAfterRoundZeroPercent ?? 0),
	};
}

// #endregion
// #region Campaign

class FuzzCampaign {
	constructor(profile_, seedWrapper_) {
		this.seed = seedWrapper_.value;
		this.randomSeedWrapper = seedWrapper_;
		this.profile = deriveCampaignProfile(profile_, this.randomSeedWrapper);
		this.campaignIndex = undefined;
	}

	// #region Setup

	async setup() {
		const profile_ = this.profile;

		// Deploy V1 protocol via the standard fixture.
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
		this.contracts = contracts_;
		contracts_.charitySignerAddress = contracts_.charitySigner.address;

		// Deploy fuzz-only mock ERC-20 / ERC-721 used for donation paths.
		const deployer_ = contracts_.signers[0];
		const mockErc20Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc20", deployer_);
		const mockErc20_ = await mockErc20Factory_.deploy();
		await mockErc20_.waitForDeployment();
		const mockErc721Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc721", deployer_);
		const mockErc721_ = await mockErc721Factory_.deploy();
		await mockErc721_.waitForDeployment();
		contracts_.fuzzTestMockErc20 = mockErc20_;
		contracts_.fuzzTestMockErc20Address = await mockErc20_.getAddress();
		contracts_.fuzzTestMockErc721 = mockErc721_;
		contracts_.fuzzTestMockErc721Address = await mockErc721_.getAddress();

		// Deploy adversarial helpers.
		const maliciousBidderFactory_ = await hre.ethers.getContractFactory("MaliciousBidder", deployer_);
		const maliciousBidder_ = await maliciousBidderFactory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
		await maliciousBidder_.waitForDeployment();
		const maliciousTokenFactory_ = await hre.ethers.getContractFactory("MaliciousToken", deployer_);
		const maliciousToken_ = await maliciousTokenFactory_.deploy(contracts_.prizesWalletAddress, contracts_.cosmicSignatureGameProxyAddress);
		await maliciousToken_.waitForDeployment();
		const brokenEthReceiverFactory_ = await hre.ethers.getContractFactory("BrokenEthReceiver", deployer_);
		const brokenEthReceiver_ = await brokenEthReceiverFactory_.deploy();
		await brokenEthReceiver_.waitForDeployment();
		// A Cosmic Signature NFT staker that can reject its ETH unstake reward (BrokenEthReceiver modes),
		// used to exercise the CS staking wallet's `_payReward` failure path (`FundTransferFailed`).
		const brokenCsNftStakerFactory_ = await hre.ethers.getContractFactory("BrokenCosmicSignatureNftStaker", deployer_);
		const brokenCsNftStaker_ = await brokenCsNftStakerFactory_.deploy(contracts_.stakingWalletCosmicSignatureNftAddress);
		await brokenCsNftStaker_.waitForDeployment();
		const fakeArbSys_ = await hre.ethers.getContractAt("FakeArbSys", ARB_SYS_ADDRESS);
		const fakeArbGasInfo_ = await hre.ethers.getContractAt("FakeArbGasInfo", ARB_GAS_INFO_ADDRESS);
		this.adversaries = {
			maliciousBidder: maliciousBidder_,
			maliciousBidderAddress: (await maliciousBidder_.getAddress()).toLowerCase(),
			maliciousToken: maliciousToken_,
			maliciousTokenAddress: (await maliciousToken_.getAddress()).toLowerCase(),
			maliciousTokenVersion: 1,
			brokenEthReceiver: brokenEthReceiver_,
			brokenEthReceiverAddress: (await brokenEthReceiver_.getAddress()).toLowerCase(),
			brokenCsNftStaker: brokenCsNftStaker_,
			brokenCsNftStakerAddress: (await brokenCsNftStaker_.getAddress()).toLowerCase(),
			brokenCsNftStakerApproved: false,
			fakeArbSys: fakeArbSys_,
			fakeArbGasInfo: fakeArbGasInfo_,
		};

		// Model + ledger + engine.
		this.model = new GameModel();
		await this.model.initFromChain(contracts_.cosmicSignatureGameProxy, 1);
		this.ledger = new ShadowState(hre);
		this.engine = new FuzzEngine({ hre, randomSeedWrapper: this.randomSeedWrapper, model: this.model, ledger: this.ledger, profile: profile_ });
		await this.engine.init();

		// Game adapter (starts as V1).
		this.game = new GameAbiAdapter(contracts_.cosmicSignatureGameProxy, 1);

		// Charity controller (default recipient is the CharityWallet).
		this.charity = new CharityController(contracts_.charityWalletAddress);

		// Actors (the early signers are also DAO-capable).
		this.actors = [];
		const numActors_ = Math.min(profile_.numActors, contracts_.signers.length);
		for (let index_ = 0; index_ < numActors_; ++ index_) {
			const signer_ = contracts_.signers[index_];
			this.actors.push({
				index: index_,
				signer: signer_,
				address: signer_.address,
				addressLower: signer_.address.toLowerCase(),
				label: `actor${index_}`,
				csStakingApproved: false,
				rwStakingApproved: false,
				delegated: false,
			});
		}
		this.actorByAddressLower = new Map(this.actors.map((a_) => [a_.addressLower, a_]));

		await this._registerLedgerTracking();
		this._buildContext();
		await this._fundActors();
		await this._bootstrapDao();

		// Activate the round for the V1 phase (no bids placed yet at setup).
		await this._activateRound();
	}

	async _registerLedgerTracking() {
		const c_ = this.contracts;
		// Build interface registry for receipt application + revert decoding.
		const contractsByAddress_ = new Map();
		const register_ = (address_, name_, contract_) => {
			contractsByAddress_.set(address_.toLowerCase(), { name: name_, iface: contract_.interface });
		};
		register_(c_.cosmicSignatureTokenAddress, "CosmicSignatureToken", c_.cosmicSignatureToken);
		register_(c_.cosmicSignatureNftAddress, "CosmicSignatureNft", c_.cosmicSignatureNft);
		register_(c_.randomWalkNftAddress, "RandomWalkNFT", c_.randomWalkNft);
		register_(c_.prizesWalletAddress, "PrizesWallet", c_.prizesWallet);
		register_(c_.stakingWalletCosmicSignatureNftAddress, "StakingWalletCosmicSignatureNft", c_.stakingWalletCosmicSignatureNft);
		register_(c_.stakingWalletRandomWalkNftAddress, "StakingWalletRandomWalkNft", c_.stakingWalletRandomWalkNft);
		register_(c_.fuzzTestMockErc20Address, "FuzzTestMockErc20", c_.fuzzTestMockErc20);
		register_(c_.fuzzTestMockErc721Address, "FuzzTestMockErc721", c_.fuzzTestMockErc721);

		const v2GameFactory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV2", c_.ownerSigner);
		const v3GameFactory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV3", c_.ownerSigner);
		this.v2GameFactory = v2GameFactory_;
		this.v3GameFactory = v3GameFactory_;
		this.ledger.registerContracts(
			{
				game: c_.cosmicSignatureGameProxyAddress.toLowerCase(),
				token: c_.cosmicSignatureTokenAddress.toLowerCase(),
				prizesWallet: c_.prizesWalletAddress.toLowerCase(),
				mockErc20: c_.fuzzTestMockErc20Address.toLowerCase(),
				mockErc721: c_.fuzzTestMockErc721Address.toLowerCase(),
			},
			contractsByAddress_
		);

		// Revert-decoding interfaces.
		this.engine.revertInterfaces = [
			c_.cosmicSignatureGameProxy.interface,
			v2GameFactory_.interface,
			v3GameFactory_.interface,
			c_.cosmicSignatureToken.interface,
			c_.cosmicSignatureNft.interface,
			c_.randomWalkNft.interface,
			c_.prizesWallet.interface,
			c_.stakingWalletCosmicSignatureNft.interface,
			c_.stakingWalletRandomWalkNft.interface,
			c_.marketingWallet.interface,
			c_.charityWallet.interface,
			c_.cosmicSignatureDao.interface,
		];

		// ETH tracking for every address that can hold/move ETH.
		await this.ledger.trackEth(c_.cosmicSignatureGameProxyAddress, "game");
		await this.ledger.trackEth(c_.prizesWalletAddress, "prizesWallet");
		await this.ledger.trackEth(c_.stakingWalletCosmicSignatureNftAddress, "csStaking");
		await this.ledger.trackEth(c_.stakingWalletRandomWalkNftAddress, "rwStaking");
		await this.ledger.trackEth(c_.charityWalletAddress, "charityWallet");
		await this.ledger.trackEth(c_.charitySignerAddress, "charitySigner");
		await this.ledger.trackEth(c_.marketingWalletAddress, "marketingWallet");
		await this.ledger.trackEth(c_.cosmicSignatureDaoAddress, "dao");
		await this.ledger.trackEth(c_.randomWalkNftAddress, "randomWalkNft");
		await this.ledger.trackEth(c_.ownerSigner.address, "owner");
		await this.ledger.trackEth(c_.treasurerSigner.address, "treasurer");
		await this.ledger.trackEth(c_.deployerSigner.address, "deployer");
		await this.ledger.trackEth(this.adversaries.maliciousBidderAddress, "maliciousBidder");
		await this.ledger.trackEth(this.adversaries.maliciousTokenAddress, "maliciousToken");
		await this.ledger.trackEth(this.adversaries.brokenEthReceiverAddress, "brokenEthReceiver");
		await this.ledger.trackEth(this.adversaries.brokenCsNftStakerAddress, "brokenCsNftStaker");
		for (const actor_ of this.actors) {
			await this.ledger.trackEth(actor_.address, actor_.label);
		}
	}

	async _fundActors() {
		// Human-like finite budgets: each player gets a fixed, varied starting balance (log-distributed
		// for whale/minnow diversity) and is NEVER auto-refilled. Players spend on bids/gas and replenish
		// only by winning prizes — exactly like real users with limited funds. This (with the bid-time
		// spread that bounds Dutch-auction prices) keeps every value in a realistic, non-astronomical range.
		// The first two actors are guaranteed whales: they back the DAO and reliably seed each round.
		for (let index_ = 0; index_ < this.actors.length; ++ index_) {
			const actor_ = this.actors[index_];
			let budget_;
			if (index_ < 2) {
				budget_ = (4_000n + this.engine.randomBelow(4_001n)) * 10n ** 18n; // 4000-8000 ETH whale
			} else {
				// 2^[2..12] ETH (4..4096), scaled by a 1x-2x jitter: a realistic spread of wealth.
				const magnitude_ = 10n ** 18n * (1n << BigInt(this.engine.randomIntRange(2, 12)));
				budget_ = magnitude_ + this.engine.randomBelow(magnitude_ + 1n);
			}
			await hre.ethers.provider.send("hardhat_setBalance", [actor_.address, "0x" + budget_.toString(16)]);
			this.ledger.recordRefill(actor_.address, budget_);
			actor_.initialBudget = budget_;
		}
		// Infrastructure signers (owner / treasurer / deployer / charity) only ever pay gas, never bid,
		// so give them a large fixed allowance (the protocol operator's ops fund). Also fund the
		// malicious bidder/token contracts so their reentry attempts reach the reentrancy guard.
		const infraFunding_ = 100_000n * 10n ** 18n;
		for (const address_ of [
			this.contracts.ownerSigner.address,
			this.contracts.treasurerSigner.address,
			this.contracts.deployerSigner.address,
		]) {
			await hre.ethers.provider.send("hardhat_setBalance", [address_, "0x" + infraFunding_.toString(16)]);
			this.ledger.recordRefill(address_, infraFunding_);
		}
		const adversaryFunding_ = 10n ** 18n;
		for (const address_ of [this.adversaries.maliciousBidderAddress, this.adversaries.maliciousTokenAddress]) {
			await hre.ethers.provider.send("hardhat_setBalance", [address_, "0x" + adversaryFunding_.toString(16)]);
			this.ledger.recordRefill(address_, adversaryFunding_);
		}
		await this.ledger.verifyDirtyEth();
	}

	async _bootstrapDao() {
		// Delegate the first two actors to themselves so they can accrue voting power over the campaign.
		this.daoVotersReady = true;
		for (let index_ = 0; index_ < Math.min(2, this.actors.length); ++ index_) {
			const actor_ = this.actors[index_];
			const result_ = await this.engine.execTx({
				signer: actor_.signer,
				buildTx: (overrides_) => this.contracts.cosmicSignatureToken.connect(actor_.signer).delegate(actor_.address, overrides_),
			});
			this.engine.expectOk(result_, "DAO bootstrap delegate");
			actor_.delegated = true;
		}
		await this.ledger.verifyDirtyEth();
	}

	async _activateRound() {
		const activationTime_ = this.engine.lastTs + 2n;
		const result_ = await this.engine.execTx({
			signer: this.contracts.ownerSigner,
			buildTx: (overrides_) => this.game.connect(this.contracts.ownerSigner).contract.setRoundActivationTime(activationTime_, overrides_),
		});
		this.engine.expectOk(result_, "activate round");
		this.model.roundActivationTime = activationTime_;
		await this.engine.mineAt(activationTime_);
		await this.ledger.verifyDirtyEth();
	}

	// #endregion
	// #region Context

	_buildContext() {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self_ = this;
		this.context = {
			hre,
			engine: this.engine,
			model: this.model,
			ledger: this.ledger,
			contracts: this.contracts,
			adversaries: this.adversaries,
			charity: this.charity,
			get game() { return self_.game; },
			get actors() { return self_.actors; },
			get daoVotersReady() { return self_.daoVotersReady; },
			invariantRunCount: 0,

			actorByAddress(address_) {
				return self_.actorByAddressLower.get(address_.toLowerCase()) ?? null;
			},
			pickActor() {
				return self_.engine.pick(self_.actors);
			},
			pickActorNot(address_) {
				const addressLower_ = address_.toLowerCase();
				const candidates_ = self_.actors.filter((a_) => a_.addressLower !== addressLower_);
				return (candidates_.length === 0) ? null : self_.engine.pick(candidates_);
			},
			isRoundInactiveNow() {
				return (self_.engine.lastTs + 1n) < self_.model.roundActivationTime;
			},
			rebindGame(contract_, version_) {
				self_.game = new GameAbiAdapter(contract_, version_);
			},

			// PrizesWallet applicability helpers.
			_anyTimedOutPrizesWalletEth() {
				return this._collectTimedOutPrizesWalletEth().length > 0;
			},
			_pickTimedOutPrizesWalletEth() {
				const list_ = this._collectTimedOutPrizesWalletEth();
				return (list_.length === 0) ? null : self_.engine.pick(list_);
			},
			_collectTimedOutPrizesWalletEth() {
				const now_ = self_.engine.lastTs + 1n;
				const out_ = [];
				for (const [key_, amount_] of self_.ledger.prizesWallet.ethBalances) {
					if (amount_ <= 0n) {
						continue;
					}
					const [roundStr_, winner_] = key_.split("|");
					const timeout_ = self_.ledger.prizesWallet.roundTimeouts.get(roundStr_);
					if (timeout_ !== undefined && timeout_ > 0n && now_ >= timeout_) {
						out_.push({ round: BigInt(roundStr_), winner: winner_, amount: amount_, timeout: timeout_ });
					}
				}
				return out_;
			},
			_anyNotTimedOutPrizesWalletEth() {
				return this._collectNotTimedOutPrizesWalletEth().length > 0;
			},
			_pickNotTimedOutPrizesWalletEth(excludeWinner_) {
				const list_ = this._collectNotTimedOutPrizesWalletEth().filter((entry_) => entry_.winner !== excludeWinner_.toLowerCase());
				return (list_.length === 0) ? null : self_.engine.pick(list_);
			},
			_collectNotTimedOutPrizesWalletEth() {
				const now_ = self_.engine.lastTs + 1n;
				const out_ = [];
				for (const [key_, amount_] of self_.ledger.prizesWallet.ethBalances) {
					if (amount_ <= 0n) {
						continue;
					}
					const [roundStr_, winner_] = key_.split("|");
					const timeout_ = self_.ledger.prizesWallet.roundTimeouts.get(roundStr_);
					if (timeout_ !== undefined && timeout_ > 0n && now_ < timeout_) {
						out_.push({ round: BigInt(roundStr_), winner: winner_, amount: amount_, timeout: timeout_ });
					}
				}
				return out_;
			},
			_claimableDonatedTokenRoundsFor(address_) {
				const lower_ = address_.toLowerCase();
				const now_ = self_.engine.lastTs + 1n;
				const out_ = [];
				for (const [roundStr_, amount_] of self_.ledger.prizesWallet.donatedMockErc20) {
					if (amount_ <= 0n) {
						continue;
					}
					const beneficiary_ = self_.ledger.prizesWallet.mainPrizeBeneficiaries.get(roundStr_);
					const timeout_ = self_.ledger.prizesWallet.roundTimeouts.get(roundStr_);
					if (beneficiary_ === lower_ || (timeout_ !== undefined && timeout_ > 0n && now_ >= timeout_)) {
						out_.push(BigInt(roundStr_));
					}
				}
				return out_;
			},
			_claimableDonatedNftIndexesFor(address_) {
				const lower_ = address_.toLowerCase();
				const now_ = self_.engine.lastTs + 1n;
				const out_ = [];
				for (const [indexStr_, record_] of self_.ledger.prizesWallet.donatedNfts) {
					if (record_.claimed) {
						continue;
					}
					const beneficiary_ = self_.ledger.prizesWallet.mainPrizeBeneficiaries.get(record_.roundNum.toString());
					const timeout_ = self_.ledger.prizesWallet.roundTimeouts.get(record_.roundNum.toString());
					if (beneficiary_ === lower_ || (timeout_ !== undefined && timeout_ > 0n && now_ >= timeout_)) {
						out_.push(BigInt(indexStr_));
					}
				}
				return out_;
			},
			_claimedDonatedNftIndexes() {
				const out_ = [];
				for (const [indexStr_, record_] of self_.ledger.prizesWallet.donatedNfts) {
					if (record_.claimed) {
						out_.push(BigInt(indexStr_));
					}
				}
				return out_;
			},
		};
	}

	// #endregion
	// #region Action registry

	_actionRegistry() {
		return [
			...biddingActions,
			...claimActions,
			...donationActions,
			...stakingActions,
			...randomWalkActions,
			...tokenActions,
			...prizesWalletActions,
			...walletActions,
			...extraTokenActions,
			...extraPrizesWalletActions,
			...adminActions,
			...daoActions,
			...adversarialActions,
			{
				name: "upgradeAuthProbe",
				weight: 1,
				run: (ctx_, actor_) => upgradeAuthProbe(ctx_, actor_),
			},
		];
	}

	// #endregion
	// #region Phase loop

	async _runPhase(label_, targetRounds_) {
		const profile_ = this.profile;
		const actions_ = this._actionRegistry();
		const probeActions_ = negativeProbes;
		const startRound_ = this.model.roundNum;
		let actionsSinceInvariant_ = 0;

		while (this.model.roundNum - startRound_ < BigInt(targetRounds_)) {
			for (let step_ = 0; step_ < profile_.actionsPerSegment; ++ step_) {
				const actor_ = this.engine.pick(this.actors);

				// Negative probe injection.
				if (this.engine.chancePercent(profile_.negativeProbePercent)) {
					const probe_ = this.engine.pickAction(probeActions_.map((p_) => ({ ...p_, weight: 1 })), this.context, actor_);
					if (probe_ !== null) {
						await this.engine.runAction(probe_, this.context, actor_);
						++ actionsSinceInvariant_;
					}
				} else if (this.model.version !== 3 && this.engine.profile.burstPercent > 0 && this.engine.chancePercent(this.engine.profile.burstPercent)) {
					await this._runBurst();
					++ actionsSinceInvariant_;
				} else {
					const action_ = this.engine.pickAction(actions_, this.context, actor_);
					if (action_ !== null) {
						await this.engine.runAction(action_, this.context, actor_);
						++ actionsSinceInvariant_;
					}
				}

				if (actionsSinceInvariant_ >= profile_.invariantEveryActions) {
					actionsSinceInvariant_ = 0;
					await runInvariants(this.context);
				}
			}

			// Drive the round to completion to guarantee forward progress and a clean state.
			await applyArbitrumChaos(this.context);
			const progressed_ = await forceCompleteRound(this.context);
			await resetArbitrumChaos(this.context);
			await runInvariants(this.context);
			if ( ! progressed_ ) {
				// No actor can afford to seed/claim a round (everyone is broke) — stop the phase gracefully.
				console.info(`  [${label_}] no affordable actor to complete a round; ending phase early.`);
				break;
			}

			if (profile_.verbosity >= 1) {
				const completed_ = this.model.roundNum - startRound_;
				const elapsedSec_ = ((Date.now() - this.startMs) / 1000).toFixed(0);
				console.info(`  [${label_} ${elapsedSec_}s] completed ${completed_}/${targetRounds_} rounds | chainRound ${this.model.roundNum} | actions ${this.engine.actionSeq} | invariants ${this.context.invariantRunCount}`);
			}

			// Re-activate the freshly prepared round (post-claim it is inactive until `roundActivationTime`).
			await this._reactivateIfInactive();
		}
	}

	/** Runs a same-block contention burst: usually 2-3 ETH bids; sometimes a two-claimer race. */
	async _runBurst() {
		// Occasionally race two simultaneous `claimMainPrize` calls when a round is claimable.
		if (this.model.lastBidderAddress !== ZERO_ADDRESS && this.engine.chancePercent(35)) {
			const raced_ = await runClaimRace(this.context);
			if (raced_) {
				// The race ended the round; re-activate so the rest of the segment can keep bidding.
				await this._reactivateIfInactive();
				return;
			}
		}
		if (this.model.lastBidderAddress === ZERO_ADDRESS) {
			// A first bid in a burst is tricky to model (champions need an existing last bidder); skip to a normal bid.
			const actor_ = this.engine.pick(this.actors);
			await this.engine.runAction({ name: "burstSeedBid", run: (ctx_, a_) => biddingActions[0].run(ctx_, a_) }, this.context, actor_);
			return;
		}
		// Build 2-3 sequential ETH bids at the same timestamp, applying the model in submission order.
		// Within one block each bid escalates the next bid's price (`nextEthBidPrice = p + p/div + 1`),
		// so we compute the exact price ladder up front and send each bid its exact price (no refund).
		const ts_ = this.engine.clampTs(this.engine.planTs(this.engine.boundaryCandidates()));
		const count_ = this.engine.randomIntRange(2, 3);
		const div_ = this.model.ethBidPriceIncreaseDivisor;
		let price_ = this.model.getNextEthBidPrice(ts_);
		const items_ = [];
		const plans_ = [];
		const needByActorAddress_ = new Map();
		for (let index_ = 0; index_ < count_; ++ index_) {
			const gasPrice_ = this.engine.randomGasPrice();
			const value_ = price_;
			const candidates_ = this.actors.filter((actor_) => {
				const previousNeed_ = needByActorAddress_.get(actor_.address) ?? 0n;
				return this.ledger.expectedEth(actor_.address) >= previousNeed_ + value_ + this.engine.gasReserve;
			});
			if (candidates_.length === 0) {
				break;
			}
			const actor_ = this.engine.pick(candidates_);
			needByActorAddress_.set(actor_.address, (needByActorAddress_.get(actor_.address) ?? 0n) + value_ + this.engine.gasReserve);
			plans_.push({ actor: actor_, gasPrice: gasPrice_, value: value_ });
			items_.push({
				signer: actor_.signer,
				gasPrice: gasPrice_,
				valueNeeded: value_,
				buildTx: (overrides_) => this.game.connect(actor_.signer).bidWithEth(-1n, "burst", 0n, { ...overrides_, value: value_ }),
			});
			price_ = price_ + price_ / div_ + 1n;
		}
		if (items_.length < 2) {
			return;
		}
		// Snapshot per-actor CST before the burst (the engine applies receipts to the ledger inside `execBurst`).
		const cstBefore_ = new Map();
		const expectedRewardByActor_ = new Map();
		for (const plan_ of plans_) {
			if ( ! cstBefore_.has(plan_.actor.addressLower) ) {
				cstBefore_.set(plan_.actor.addressLower, this.ledger.cstBalanceOf(plan_.actor.address));
				expectedRewardByActor_.set(plan_.actor.addressLower, 0n);
			}
		}
		const results_ = await this.engine.execBurst(ts_, items_);
		// Apply the model/ledger for each bid in submission order (all should succeed).
		for (let index_ = 0; index_ < results_.length; ++ index_) {
			expect(results_[index_].status, "burst bid must succeed").to.equal(1);
			const plan_ = plans_[index_];
			const expectations_ = this.model.applyEthBid(plan_.actor.address, ts_, plan_.value, plan_.gasPrice, null);
			this.ledger.addEth(plan_.actor.address, -expectations_.netEthPaid);
			this.ledger.addEth(this.game.address, expectations_.netEthPaid);
			expectedRewardByActor_.set(plan_.actor.addressLower, expectedRewardByActor_.get(plan_.actor.addressLower) + expectations_.bidCstRewardAmount);
		}
		for (const [actorLower_, before_] of cstBefore_) {
			expect(this.ledger.cstBalanceOf(actorLower_) - before_, "burst bid CST reward sum").to.equal(expectedRewardByActor_.get(actorLower_));
		}
		await this.ledger.verifyAllEth();
		this.engine._statsFor("sameBlockBurst").succeeded += 1;
		this.engine._statsFor("sameBlockBurst").attempted += 1;
	}

	async _reactivateIfInactive() {
		if ((this.engine.lastTs + 1n) >= this.model.roundActivationTime) {
			return; // already active
		}
		// Either wait for natural activation or explicitly advance; advancing keeps the campaign moving.
		await this.engine.mineAt(this.model.roundActivationTime);
	}

	// #endregion
	// #region Run

	async run() {
		this.startMs = Date.now();
		const label_ = (this.campaignIndex !== undefined) ? `CAMPAIGN ${this.campaignIndex}` : "CAMPAIGN";

		// Build flags change the compiled bytecode (and thus gas / revert kinds), so a `FUZZ_SEED` only
		// reproduces a failure when they match. Surface them up front for reproducibility.
		const buildFlags_ =
			`HARDHAT_MODE_CODE=${HARDHAT_MODE_CODE} ` +
			`ENABLE_HARDHAT_PREPROCESSOR=${ENABLE_HARDHAT_PREPROCESSOR} ` +
			`ENABLE_ASSERTS=${ENABLE_ASSERTS} ` +
			`ENABLE_SMTCHECKER=${ENABLE_SMTCHECKER}`;

		console.info("\n" + "=".repeat(80));
		console.info(`  COSMIC SIGNATURE - UNIFIED FUZZ ${label_} (V1 -> upgrade -> V2 -> upgrade -> V3)`);
		console.info("=".repeat(80));
		console.info(`  seed: ${uint256ToPaddedHexString(this.seed)}`);
		console.info(
			`  profile: actors=${this.profile.numActors} v1Rounds=${this.profile.v1Rounds} ` +
			`v2Rounds=${this.profile.v2Rounds} v3Rounds=${this.profile.v3Rounds} chaos=${this.profile.chaos} ` +
			`overflowMode=${this.profile.overflowMode === true} ` +
			`upgradeAfterRoundZero=${this.profile.upgradeAfterRoundZero === true}`
		);
		console.info(`  build flags: ${buildFlags_}`);
		console.info("=".repeat(80) + "\n");

		await this.setup();

		await runInvariants(this.context);

		// Phase 1: V1. Some campaigns upgrade immediately after round zero, matching the production path.
		const v1RoundsBeforeUpgrade_ = this.profile.upgradeAfterRoundZero ? 1 : this.profile.v1Rounds;
		await this._runPhase("V1", v1RoundsBeforeUpgrade_);

		// Mid-campaign upgrade (we are in a fresh post-claim, round-inactive state).
		console.info("\n  >>> Performing V1 -> V2 upgrade <<<\n");
		await performUpgradeToV2(this.context);
		await this._activateRound();
		await runInvariants(this.context);
		console.info("  >>> Upgrade complete; continuing on V2 <<<\n");

		// Phase 2: V2.
		await this._runPhase("V2", this.profile.v2Rounds);

		// Second upgrade (V2 -> V3), again from a post-claim, round-inactive state.
		console.info("\n  >>> Performing V2 -> V3 upgrade <<<\n");
		await performUpgradeToV3(this.context);
		await this._activateRound();
		await runInvariants(this.context);
		console.info("  >>> Upgrade complete; continuing on V3 <<<\n");

		// Phase 3: V3.
		await this._runPhase("V3", this.profile.v3Rounds);

		// Final invariants. Coverage floors are asserted by the driver on the aggregate across
		// campaigns (breadth floors are probabilistic for a single bounded campaign).
		await runInvariants(this.context);

		this.engine.printStats();
		const totalSec_ = ((Date.now() - this.startMs) / 1000).toFixed(0);
		console.info(`\n  invariant runs: ${this.context.invariantRunCount}`);
		console.info(`  total actions: ${this.engine.actionSeq}`);
		console.info(`  wall-clock: ${totalSec_}s`);
		console.info("  CAMPAIGN COMPLETE\n");

		expect(this.engine.actionSeq).to.be.greaterThan(0);
		expect(this.model.version, "campaign must end on V3").to.equal(3);
		expect(this.model.roundNum, "at least one round must have completed").to.be.greaterThan(0n);
	}

	// #endregion
}

// #endregion
// #region Campaign driver

const MINIMAL_COVERAGE_EXTRA_CAMPAIGN_CAP = 3;

/**
Runs the fuzz campaign(s). With `profile.maxSeconds` set, runs repeated independent bounded
campaigns (fresh deployment + upgrade each time, seeds derived from `masterSeed_`) until the
wall-clock budget elapses; this keeps every campaign in a realistic economic regime while
maximizing coverage of the deploy/upgrade lifecycle. Otherwise runs a single campaign.

@param {object} profile_
@param {bigint} masterSeed_
@returns {Promise<void>}
*/
async function runFuzzCampaigns(profile_, masterSeed_) {
	const timeBudgetMode_ = typeof profile_.maxSeconds === "number" && profile_.maxSeconds > 0;
	/** @type {Map<string, {attempted: number, succeeded: number, skipped: number}>} Coverage aggregated across all campaigns. */
	const aggregateStats_ = new Map();
	const seedWrapper_ = { value: masterSeed_ };
	let campaignIndex_ = 0;

	const runCampaign_ = async (campaignIndexOrUndefined_) => {
		const campaign_ = new FuzzCampaign(profile_, seedWrapper_);
		campaign_.campaignIndex = campaignIndexOrUndefined_;
		await runOneCampaignWithTrace(campaign_);
		mergeStatsInto(aggregateStats_, campaign_.engine.stats);
	};

	if ( ! timeBudgetMode_ ) {
		await runCampaign_(undefined);
		while ( ! hasMinimalCoverageFloors(aggregateStats_) && campaignIndex_ < MINIMAL_COVERAGE_EXTRA_CAMPAIGN_CAP ) {
			++ campaignIndex_;
			console.info(`  >>> Minimal coverage not reached; running extra campaign ${campaignIndex_}/${MINIMAL_COVERAGE_EXTRA_CAMPAIGN_CAP} <<<\n`);
			await runCampaign_(campaignIndex_);
		}
		printCoverageReport(aggregateStats_);
		assertCoverageFloors(aggregateStats_, profile_);
		return;
	}

	const deadlineMs_ = Date.now() + profile_.maxSeconds * 1000;
	while (Date.now() < deadlineMs_) {
		++ campaignIndex_;
		await runCampaign_(campaignIndex_);
		const remainingSec_ = ((deadlineMs_ - Date.now()) / 1000).toFixed(0);
		console.info(`  >>> Time budget remaining: ~${remainingSec_}s (completed ${campaignIndex_} campaign(s)) <<<\n`);
	}
	let extraCampaignCount_ = 0;
	while ( ! hasMinimalCoverageFloors(aggregateStats_) && extraCampaignCount_ < MINIMAL_COVERAGE_EXTRA_CAMPAIGN_CAP ) {
		++ extraCampaignCount_;
		++ campaignIndex_;
		console.info(`  >>> Minimal coverage not reached after time budget; running extra campaign ${extraCampaignCount_}/${MINIMAL_COVERAGE_EXTRA_CAMPAIGN_CAP} <<<\n`);
		await runCampaign_(campaignIndex_);
	}
	// Strong breadth coverage is asserted on the aggregate across all campaigns (where low-weight
	// actions reliably fire), not per bounded campaign.
	printCoverageReport(aggregateStats_);
	assertCoverageFloors(aggregateStats_, profile_);
	console.info(`\n  SOAK COMPLETE: ran ${campaignIndex_} independent campaign(s) within the ${profile_.maxSeconds}s budget.\n`);
}

/**
@param {FuzzCampaign} campaign_
*/
async function runOneCampaignWithTrace(campaign_) {
	try {
		await campaign_.run();
	} catch (errorObject_) {
		campaign_.engine?.dumpTrace(80);
		console.error(
			`\n  Reproduce this campaign with: FUZZ_SEED=0x${campaign_.seed.toString(16).padStart(64, "0")} (omit FUZZ_MAX_SECONDS)\n`
		);
		throw errorObject_;
	}
}

// #endregion
// #region Exports

module.exports = {
	FuzzCampaign,
	runFuzzCampaigns,
	buildProfile,
	readEnvOverrides,
};

// #endregion
