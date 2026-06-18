// #region

"use strict";

// #endregion
// #region Imports

const { expect } = require("chai");
const { ZERO_ADDRESS } = require("../GameModel.js");
const { MAX_UINT256 } = require("../FuzzMath.js");

// #endregion
// #region Bid planning helpers

/**
Chooses a bid timestamp respecting round activation for first bids.

For the FIRST bid of a round, the timestamp is spread across (and sometimes beyond) the ETH Dutch
auction duration rather than always landing right at activation. This matters: the first bid sets
`ethDutchAuctionBeginningBidPrice = ethBidPrice * 2`, so if every round's first bid lands at
activation (no decay), the beginning price ratchets up ~2x per round and explodes exponentially
over hundreds of rounds — eventually overflowing the contract's `unchecked` ETH-price arithmetic
(an unrealistic regime). Spreading the first bid lets the Dutch auction decay, so the long-run
price mean-reverts and stays in a realistic, bug-finding range. It is also closer to real usage.

@returns {bigint | null} `null` if bidding is impossible in a sane time frame (round frozen).
*/
function planBidTs(ctx_) {
	const { engine, model } = ctx_;
	if (model.lastBidderAddress !== ZERO_ADDRESS) {
		return engine.planTs(engine.boundaryCandidates());
	}

	// First bid of the round: choose an offset after activation, usually within the auction window.
	const ethAuctionDuration_ = model.getEthDutchAuctionDuration();
	const span_ = (ethAuctionDuration_ > 0n) ? ethAuctionDuration_ : 600n;
	let offset_;
	if (engine.profile.overflowMode) {
		// Overflow-targeting mode: always bid the first bid right at activation (no Dutch decay), so the
		// beginning price ratchets up ~2x each round and the ETH price climbs into the high / `unchecked`
		// uint256-wraparound regime that the default spreading deliberately avoids. The model mirrors the
		// wraparound exactly via `u256(...)`; finite actor budgets bound how far it actually climbs.
		offset_ = 0n;
	} else {
		const roll_ = engine.randomIntRange(0, 99);
		if (roll_ < 20) {
			offset_ = engine.randomBigIntRange(0n, 600n); // quick bid (exercises the high-price path)
		} else if (roll_ < 85) {
			offset_ = engine.randomBigIntRange(0n, span_); // spread across the auction (decays the price)
		} else {
			offset_ = span_ + engine.randomBigIntRange(0n, span_); // past the auction end (price at floor)
		}
	}
	let ts_ = engine.clampTs(model.roundActivationTime + offset_);
	// A frozen round (activation far in the future) cannot be bid into.
	if (model.roundActivationTime > ts_) {
		return null;
	}
	return ts_;
}

/**
Picks the ETH value to send for a planned ETH bid.
@param {"exact" | "swallow" | "refund" | "random"} mode_
@returns {{value: bigint, mode: string}}
*/
function chooseEthBidValue(ctx_, paidEthPrice_, gasPrice_, mode_) {
	const { engine, model } = ctx_;

	// // Comment-202607014 applies.
	// const swallowLimit_ =
	// 	(gasPrice_ > 0n) ?
	// 	(model.ethBidRefundAmountInGasToSwallowMaxLimit * gasPrice_) :
	// 	MAX_UINT256;
	
	const swallowLimit_ = model.ethBidRefundAmountInGasToSwallowMaxLimit * gasPrice_;
	let effectiveMode_ = mode_;
	if (effectiveMode_ === "random") {
		effectiveMode_ = engine.pick(["exact", "exact", "swallow", "refund"]);
	}
	if (effectiveMode_ === "swallow" && swallowLimit_ === 0n) {
		effectiveMode_ = "exact";
	}
	switch (effectiveMode_) {
		case "exact":
			return { value: paidEthPrice_, mode: "exact" };
		case "swallow":
			return { value: paidEthPrice_ + engine.randomBigIntRange(1n, swallowLimit_), mode: "swallow" };
		case "refund":
			return { value: paidEthPrice_ + swallowLimit_ + engine.randomBigIntRange(1n, 10n ** 18n), mode: "refund" };
		default:
			throw new Error(`unknown ETH bid value mode ${effectiveMode_}`);
	}
}

/** Picks an unused (for bidding) Random Walk NFT owned by `actor_`, or null. */
function pickBiddableRandomWalkNft(ctx_, actor_) {
	const { model, ledger } = ctx_;
	const owned_ = ledger.nftIdsOwnedBy("rw", actor_.address);
	const candidates_ = owned_.filter((id_) => ! model.usedRandomWalkNfts.has(id_) && ! ledger.rwStaking.usedNfts.has(id_));
	return (candidates_.length === 0) ? null : BigInt(ctx_.engine.pick(candidates_));
}

/** Picks a Random Walk NFT owned by `actor_` never used for staking, or null. */
function pickStakeableRandomWalkNft(ctx_, actor_) {
	const owned_ = ctx_.ledger.nftIdsOwnedBy("rw", actor_.address);
	const candidates_ = owned_.filter((id_) => ! ctx_.ledger.rwStaking.usedNfts.has(id_));
	return (candidates_.length === 0) ? null : BigInt(ctx_.engine.pick(candidates_));
}

/** Picks a Cosmic Signature NFT owned by `actor_` never used for staking, or null. */
function pickStakeableCosmicSignatureNft(ctx_, actor_) {
	const owned_ = ctx_.ledger.nftIdsOwnedBy("cs", actor_.address);
	const candidates_ = owned_.filter((id_) => ! ctx_.ledger.csStaking.usedNfts.has(id_));
	return (candidates_.length === 0) ? null : BigInt(ctx_.engine.pick(candidates_));
}

/** Stake action ids owned by `actor_` in the given staking ledger. */
function ownedStakeActionIds(stakingLedger_, actor_) {
	const out_ = [];
	for (const [actionId_, action_] of stakingLedger_.stakeActions) {
		if (action_.ownerAddress === actor_.addressLower) {
			out_.push(BigInt(actionId_));
		}
	}
	return out_;
}

/**
Ensures `actor_` has approved the PrizesWallet as operator for the mock donation ERC-721.
PrizesWallet.donateNft pulls the NFT via `transferFrom(donor, prizesWallet, id)` (msg.sender is the
PrizesWallet), so the donor must approve the PrizesWallet (not the game).
*/
async function ensureMockNftApproval(ctx_, actor_) {
	if (actor_.mockNftApproved) {
		return;
	}
	const { engine, ledger, contracts } = ctx_;
	const result_ = await engine.execTx({
		signer: actor_.signer,
		buildTx: (overrides_) =>
			contracts.fuzzTestMockErc721.connect(actor_.signer).setApprovalForAll(contracts.prizesWalletAddress, true, overrides_),
	});
	engine.expectOk(result_, "mock ERC-721 approval for PrizesWallet");
	actor_.mockNftApproved = true;
	await ledger.verifyDirtyEth();
}

/** Ensures `actor_` owns a mock donation ERC-721 (mints one) and has approved the PrizesWallet. */
async function ensureMockNftFor(ctx_, actor_) {
	const { engine, ledger, contracts } = ctx_;
	await ensureMockNftApproval(ctx_, actor_);
	const owned_ = ledger.nftIdsOwnedBy("mock", actor_.address);
	if (owned_.length > 0) {
		return BigInt(engine.pick(owned_));
	}
	const result_ = await engine.execTx({
		signer: actor_.signer,
		buildTx: (overrides_) => contracts.fuzzTestMockErc721.connect(actor_.signer).mint(actor_.address, overrides_),
	});
	engine.expectOk(result_, "mock ERC-721 mint");
	const newlyOwned_ = ledger.nftIdsOwnedBy("mock", actor_.address);
	expect(newlyOwned_.length > 0, "mock ERC-721 mint did not assign ownership").to.equal(true);
	await ledger.verifyDirtyEth();
	return BigInt(newlyOwned_[newlyOwned_.length - 1]);
}

/**
Ensures `actor_` holds at least `amount_` mock ERC-20 and has approved the PrizesWallet to spend it.
PrizesWallet.donateToken pulls via `safeTransferFrom(token, donor, holder, amount)` (msg.sender is the
PrizesWallet), so the donor must approve the PrizesWallet.
*/
async function ensureMockErc20For(ctx_, actor_, amount_) {
	const { engine, ledger, contracts } = ctx_;
	if ( ! actor_.mockErc20Approved ) {
		const approveResult_ = await engine.execTx({
			signer: actor_.signer,
			buildTx: (overrides_) =>
				contracts.fuzzTestMockErc20.connect(actor_.signer).approve(contracts.prizesWalletAddress, MAX_UINT256, overrides_),
		});
		engine.expectOk(approveResult_, "mock ERC-20 approval for PrizesWallet");
		actor_.mockErc20Approved = true;
		await ledger.verifyDirtyEth();
	}
	if (ledger.mockErc20BalanceOf(actor_.address) >= amount_) {
		return;
	}
	const result_ = await engine.execTx({
		signer: actor_.signer,
		buildTx: (overrides_) => contracts.fuzzTestMockErc20.connect(actor_.signer).mint(actor_.address, 10n ** 24n, overrides_),
	});
	engine.expectOk(result_, "mock ERC-20 top-up mint");
	await ledger.verifyDirtyEth();
}

// #endregion
// #region ETH bid execution

/**
Executes and fully verifies an ETH bid (any flavor).
@param {object} options_
@param {"plain" | "rwNft" | "receive" | "donateToken" | "donateNft"} options_.flavor
@param {"exact" | "swallow" | "refund" | "random"} [options_.valueMode]
@param {"zero" | "exact"} [options_.minRewardMode] V2 only.
@returns {Promise<string>} "ok" or "skip".
*/
async function executeEthBid(ctx_, actor_, options_) {
	const { engine, model, ledger, contracts } = ctx_;
	const gasPrice_ = engine.randomGasPrice();

	let randomWalkNftId_ = null;
	if (options_.flavor === "rwNft" || (options_.flavor === "donateNft" && engine.chancePercent(35))) {
		randomWalkNftId_ = pickBiddableRandomWalkNft(ctx_, actor_);
		if (options_.flavor === "rwNft" && randomWalkNftId_ === null) {
			return "skip";
		}
	}

	// All donation setup transactions (mint/approve) must happen BEFORE planning the bid timestamp,
	// otherwise they advance the clock past the planned `ts_` and the engine would clamp the bid to a
	// later block than the model assumed (drifting the price and the recorded `lastBidTimeStamp`).
	let donationNftId_ = null;
	if (options_.flavor === "donateNft") {
		donationNftId_ = await ensureMockNftFor(ctx_, actor_);
	}
	let donationTokenAmount_ = null;
	if (options_.flavor === "donateToken") {
		donationTokenAmount_ = engine.randomBigIntRange(1n, 10n ** 18n);
		await ensureMockErc20For(ctx_, actor_, donationTokenAmount_);
	}

	const ts_ = planBidTs(ctx_);
	if (ts_ === null) {
		return "skip";
	}

	const basePlan_ = model.planEthBid(ts_, 0n, gasPrice_, randomWalkNftId_);
	const { value: value_ } = chooseEthBidValue(ctx_, basePlan_.paidEthPrice, gasPrice_, options_.valueMode ?? "random");
	// Like a real human with limited funds: only bid if affordable, otherwise skip.
	if ( ! engine.canAfford(actor_.address, value_) ) {
		return "skip";
	}
	const message_ = (options_.flavor === "receive") ? "" : engine.randomMessage(Math.min(Number(model.bidMessageLengthMaxLimit), 120));
	const planForReward_ = model.getBidCstRewardAmount(ts_);
	const minReward_ = (model.version === 2 && options_.minRewardMode === "exact") ? planForReward_ : 0n;

	const gameAdapter_ = ctx_.game.connect(actor_.signer);
	const buildTx_ = (overrides_) => {
		const txOverrides_ = { ...overrides_, value: value_ };
		switch (options_.flavor) {
			case "plain":
			case "rwNft":
				return gameAdapter_.bidWithEth(randomWalkNftId_ ?? -1n, message_, minReward_, txOverrides_);
			case "receive":
				return actor_.signer.sendTransaction({ to: ctx_.game.address, value: value_, gasPrice: overrides_.gasPrice });
			case "donateToken":
				return gameAdapter_.bidWithEthAndDonateToken(
					randomWalkNftId_ ?? -1n, message_, minReward_, contracts.fuzzTestMockErc20Address, donationTokenAmount_, txOverrides_);
			case "donateNft":
				return gameAdapter_.bidWithEthAndDonateNft(
					randomWalkNftId_ ?? -1n, message_, minReward_, contracts.fuzzTestMockErc721Address, donationNftId_, txOverrides_);
			default:
				throw new Error(`unknown ETH bid flavor ${String(options_.flavor)}`);
		}
	};

	// Snapshot the CST balance before sending (the engine applies the receipt to the ledger inside `execTx`).
	const cstBefore_ = ledger.cstBalanceOf(actor_.address);
	const roundNumBefore_ = model.roundNum;
	const result_ = await engine.execTx({ signer: actor_.signer, buildTx: buildTx_, ts: ts_, gasPrice: gasPrice_, valueNeeded: value_ });
	const receipt_ = engine.expectOk(result_, `ETH bid (${options_.flavor})`);

	const expectations_ = model.applyEthBid(actor_.address, ts_, value_, gasPrice_, randomWalkNftId_);

	// Net ETH: the actor loses `netEthPaid` (the base price plus any swallowed overpay; a real refund
	// returns in the same tx), and the game keeps it.
	ledger.addEth(actor_.address, -expectations_.netEthPaid);
	ledger.addEth(ctx_.game.address, expectations_.netEthPaid);

	const bidPlaced_ = engine.singleEvent(receipt_, ctx_.game.contract, "BidPlaced", "ETH bid");
	expect(bidPlaced_.args.roundNum).to.equal(roundNumBefore_);
	expect(bidPlaced_.args.lastBidderAddress.toLowerCase()).to.equal(actor_.addressLower);
	expect(bidPlaced_.args.paidEthPrice).to.equal(expectations_.paidEthPrice);
	expect(bidPlaced_.args.paidCstPrice).to.equal(-1n);
	expect(bidPlaced_.args.randomWalkNftId).to.equal(randomWalkNftId_ ?? -1n);
	if (options_.flavor !== "receive") {
		expect(bidPlaced_.args.message).to.equal(message_);
	}
	expect(bidPlaced_.args.mainPrizeTime).to.equal(model.mainPrizeTime);
	if (model.version === 2) {
		expect(bidPlaced_.args.bidCstRewardAmount).to.equal(expectations_.bidCstRewardAmount);
		expect(bidPlaced_.args.cstDutchAuctionDuration).to.equal(expectations_.newCstDutchAuctionDuration);
	}

	expect(ledger.cstBalanceOf(actor_.address) - cstBefore_, "ETH bid: CST reward mismatch").to.equal(expectations_.bidCstRewardAmount);

	{
		const chainLastBidTs_ = (await ctx_.game.contract.biddersInfo(roundNumBefore_, actor_.address)).lastBidTimeStamp;
		const modelLastBidTs_ = model.getBidderInfo(roundNumBefore_, actor_.address).lastBidTimeStamp;
		expect(chainLastBidTs_, `ETH bid (${options_.flavor}): lastBidTimeStamp drift`).to.equal(modelLastBidTs_);
	}

	if (options_.flavor === "donateToken") {
		const tokenDonated_ = engine.singleEvent(receipt_, contracts.prizesWallet, "TokenDonated", "ETH bid + token donation");
		expect(tokenDonated_.args.amount).to.equal(donationTokenAmount_);
	} else if (options_.flavor === "donateNft") {
		const nftDonated_ = engine.singleEvent(receipt_, contracts.prizesWallet, "NftDonated", "ETH bid + NFT donation");
		expect(nftDonated_.args.nftId).to.equal(donationNftId_);
		expect(ledger.mockNftOwners.get(donationNftId_.toString()), "donated NFT should be held by PrizesWallet")
			.to.equal(contracts.prizesWalletAddress.toLowerCase());
	}

	await ledger.verifyDirtyEth();
	return "ok";
}

// #endregion
// #region CST bid execution

/**
Executes and fully verifies a CST bid.
@param {object} options_
@param {"plain" | "donateToken" | "donateNft"} options_.flavor
@param {"max" | "exact" | "padded"} [options_.maxLimitMode]
@returns {Promise<string>} "ok" or "skip".
*/
async function executeCstBid(ctx_, actor_, options_) {
	const { engine, model, ledger, contracts } = ctx_;
	if (model.lastBidderAddress === ZERO_ADDRESS) {
		return "skip"; // The first bid of a round must be ETH.
	}

	let donationNftId_ = null;
	if (options_.flavor === "donateNft") {
		donationNftId_ = await ensureMockNftFor(ctx_, actor_);
	}
	let donationTokenAmount_ = null;
	if (options_.flavor === "donateToken") {
		donationTokenAmount_ = engine.randomBigIntRange(1n, 10n ** 18n);
		await ensureMockErc20For(ctx_, actor_, donationTokenAmount_);
	}

	const ts_ = engine.clampTs(engine.planTs(engine.boundaryCandidates()));
	const price_ = model.getNextCstBidPrice(ts_);
	if (ledger.cstBalanceOf(actor_.address) < price_) {
		return "skip";
	}
	let priceMaxLimit_;
	switch (options_.maxLimitMode ?? "padded") {
		case "max": priceMaxLimit_ = MAX_UINT256; break;
		case "exact": priceMaxLimit_ = price_; break;
		default: priceMaxLimit_ = price_ + engine.randomBigIntRange(0n, price_ + 1n); break;
	}
	const message_ = engine.randomMessage(Math.min(Number(model.bidMessageLengthMaxLimit), 120));
	const expectedCstReward_ = model.getBidCstRewardAmount(ts_);
	const minReward_ = (model.version === 2 && engine.chancePercent(30)) ? expectedCstReward_ : 0n;

	const gameContract_ = ctx_.game.connect(actor_.signer).contract;
	const buildTx_ = (overrides_) => {
		switch (options_.flavor) {
			case "plain":
				return ctx_.game.connect(actor_.signer).bidWithCst(priceMaxLimit_, message_, minReward_, overrides_);
			case "donateToken":
				return ctx_.game.connect(actor_.signer).bidWithCstAndDonateToken(
					priceMaxLimit_, message_, minReward_, contracts.fuzzTestMockErc20Address, donationTokenAmount_, overrides_);
			case "donateNft": {
				const sig_ = (model.version === 2) ?
					"bidWithCstAndDonateNft(uint256,string,uint256,address,uint256)" :
					"bidWithCstAndDonateNft(uint256,string,address,uint256)";
				const args_ = (model.version === 2) ?
					[priceMaxLimit_, message_, minReward_, contracts.fuzzTestMockErc721Address, donationNftId_] :
					[priceMaxLimit_, message_, contracts.fuzzTestMockErc721Address, donationNftId_];
				return gameContract_.getFunction(sig_)(...args_, overrides_);
			}
			default:
				throw new Error(`unknown CST bid flavor ${String(options_.flavor)}`);
		}
	};

	// Snapshot the CST balance before sending (the engine applies the receipt to the ledger inside `execTx`).
	const cstBefore_ = ledger.cstBalanceOf(actor_.address);
	const roundNumBefore_ = model.roundNum;
	const result_ = await engine.execTx({ signer: actor_.signer, buildTx: buildTx_, ts: ts_ });
	const receipt_ = engine.expectOk(result_, `CST bid (${options_.flavor})`);

	const expectations_ = model.applyCstBid(actor_.address, ts_);
	expect(expectations_.paidPrice, "CST bid: planned price changed").to.equal(price_);
	expect(expectations_.bidCstRewardAmount).to.equal(expectedCstReward_);

	const bidPlaced_ = engine.singleEvent(receipt_, ctx_.game.contract, "BidPlaced", "CST bid");
	expect(bidPlaced_.args.roundNum).to.equal(roundNumBefore_);
	expect(bidPlaced_.args.lastBidderAddress.toLowerCase()).to.equal(actor_.addressLower);
	expect(bidPlaced_.args.paidEthPrice).to.equal(-1n);
	expect(bidPlaced_.args.paidCstPrice).to.equal(price_);
	expect(bidPlaced_.args.randomWalkNftId).to.equal(-1n);
	expect(bidPlaced_.args.mainPrizeTime).to.equal(model.mainPrizeTime);
	if (model.version === 2) {
		expect(bidPlaced_.args.bidCstRewardAmount).to.equal(expectations_.bidCstRewardAmount);
		expect(bidPlaced_.args.cstDutchAuctionDuration).to.equal(expectations_.newCstDutchAuctionDuration);
	}

	expect(ledger.cstBalanceOf(actor_.address) - cstBefore_, "CST bid: net CST delta mismatch")
		.to.equal(expectations_.bidCstRewardAmount - price_);

	{
		const chainLastBidTs_ = (await ctx_.game.contract.biddersInfo(roundNumBefore_, actor_.address)).lastBidTimeStamp;
		const modelLastBidTs_ = model.getBidderInfo(roundNumBefore_, actor_.address).lastBidTimeStamp;
		expect(chainLastBidTs_, `CST bid (${options_.flavor}): lastBidTimeStamp drift`).to.equal(modelLastBidTs_);
	}

	if (options_.flavor === "donateToken") {
		engine.singleEvent(receipt_, contracts.prizesWallet, "TokenDonated", "CST bid + token donation");
	} else if (options_.flavor === "donateNft") {
		engine.singleEvent(receipt_, contracts.prizesWallet, "NftDonated", "CST bid + NFT donation");
	}

	await ledger.verifyDirtyEth();
	return "ok";
}

// #endregion
// #region Claim verification

/**
Fully verifies a successful `claimMainPrize` receipt against the model breakdown and applies
all ETH / PrizesWallet bookkeeping. Shared by EOA, timeout, and contract claims.
The caller must have already mutated `model` via `applyClaim` to obtain `breakdown_`.

@param {object} args_
@param {string} args_.claimerAddress The game-level `_msgSender()` of the claim.
@param {import("ethers").TransactionReceipt} args_.receipt
@param {object} args_.breakdown From `model.applyClaim`.
@param {Set<string>} args_.rwStakerOwnersBefore Lowercase owners of staked RW NFTs before the claim.
*/
function verifyClaimReceipt(ctx_, { claimerAddress, receipt, breakdown, rwStakerOwnersBefore }) {
	const { engine, model, ledger, contracts } = ctx_;
	const game_ = ctx_.game.contract;
	const claimerLower_ = claimerAddress.toLowerCase();

	const mainClaimed_ = engine.singleEvent(receipt, game_, "MainPrizeClaimed", "claim");
	expect(mainClaimed_.args.roundNum).to.equal(breakdown.roundNum);
	expect(mainClaimed_.args.beneficiaryAddress.toLowerCase()).to.equal(claimerLower_);
	expect(mainClaimed_.args.ethPrizeAmount).to.equal(breakdown.mainEthPrizeAmount);
	expect(mainClaimed_.args.cstPrizeAmount).to.equal(breakdown.cstPrizeAmount);

	// Independent sanity: no prize is ever paid to the zero address.
	expect(claimerLower_, "claim: zero-address beneficiary").to.not.equal(ZERO_ADDRESS);
	expect(breakdown.enduranceChampionAddress, "claim: zero-address endurance champion").to.not.equal(ZERO_ADDRESS);
	expect(breakdown.chronoWarriorAddress, "claim: zero-address chrono-warrior").to.not.equal(ZERO_ADDRESS);

	// Record the round registration so PrizesWallet claim actions know the beneficiary and timeout.
	ledger.prizesWallet.mainPrizeBeneficiaries.set(breakdown.roundNum.toString(), claimerLower_);
	ledger.prizesWallet.roundTimeouts.set(breakdown.roundNum.toString(), mainClaimed_.args.timeoutTimeToWithdrawSecondaryPrizes);

	const chronoEvents_ = engine.parsedEvents(receipt, game_, "ChronoWarriorPrizePaid");
	expect(chronoEvents_.length, "claim: ChronoWarriorPrizePaid count").to.equal(1);
	expect(chronoEvents_[0].args.chronoWarriorAddress.toLowerCase()).to.equal(breakdown.chronoWarriorAddress);
	expect(chronoEvents_[0].args.ethPrizeAmount).to.equal(breakdown.chronoWarriorEthPrizeAmount);

	const enduranceEvents_ = engine.parsedEvents(receipt, game_, "EnduranceChampionPrizePaid");
	expect(enduranceEvents_.length, "claim: EnduranceChampionPrizePaid count").to.equal(1);
	expect(enduranceEvents_[0].args.enduranceChampionAddress.toLowerCase()).to.equal(breakdown.enduranceChampionAddress);

	const lastCstEvents_ = engine.parsedEvents(receipt, game_, "LastCstBidderPrizePaid");
	expect(lastCstEvents_.length, "claim: LastCstBidderPrizePaid count").to.equal(breakdown.hasLastCstBidder ? 1 : 0);
	if (breakdown.hasLastCstBidder) {
		expect(lastCstEvents_[0].args.lastCstBidderAddress.toLowerCase()).to.equal(breakdown.lastCstBidderAddress);
	}

	const biddersSet_ = new Set(breakdown.bidderAddresses);
	const raffleEthEvents_ = engine.parsedEvents(receipt, game_, "RaffleWinnerBidderEthPrizeAllocated");
	expect(BigInt(raffleEthEvents_.length), "claim: raffle ETH event count").to.equal(breakdown.numRaffleEthPrizesForBidders);
	for (const event_ of raffleEthEvents_) {
		expect(event_.args.winnerAddress.toLowerCase(), "claim: zero-address raffle ETH winner").to.not.equal(ZERO_ADDRESS);
		expect(biddersSet_.has(event_.args.winnerAddress.toLowerCase()), "claim: raffle ETH winner not a bidder").to.equal(true);
		expect(event_.args.ethPrizeAmount).to.equal(breakdown.raffleEthPrizeAmountPerBidder);
	}

	const rafflePrizeEvents_ = engine.parsedEvents(receipt, game_, "RaffleWinnerPrizePaid");
	expect(BigInt(rafflePrizeEvents_.length), "claim: raffle CST/NFT event count")
		.to.equal(breakdown.numRaffleCosmicSignatureNftsForBidders + breakdown.numLuckyStakers);
	for (const event_ of rafflePrizeEvents_) {
		expect(event_.args.winnerAddress.toLowerCase(), "claim: zero-address raffle NFT winner").to.not.equal(ZERO_ADDRESS);
		if (event_.args.winnerIsRandomWalkNftStaker) {
			expect(rwStakerOwnersBefore.has(event_.args.winnerAddress.toLowerCase()), "claim: lucky staker not an RW staker").to.equal(true);
		} else {
			expect(biddersSet_.has(event_.args.winnerAddress.toLowerCase()), "claim: raffle NFT winner not a bidder").to.equal(true);
		}
	}

	// Charity transfer outcome depends on the current charity recipient.
	const charityAccepts_ = ctx_.charity.accepts();
	const charitySuccessEvents_ = engine.parsedEvents(receipt, game_, "FundsTransferredToCharity");
	const charityFailedEvents_ = engine.parsedEvents(receipt, game_, "FundTransferFailed");
	expect(charitySuccessEvents_.length, "claim: charity success event count").to.equal(charityAccepts_ ? 1 : 0);
	expect(charityFailedEvents_.length, "claim: charity failure event count").to.equal(charityAccepts_ ? 0 : 1);
	const charityEventArgs_ = (charityAccepts_ ? charitySuccessEvents_ : charityFailedEvents_)[0].args;
	expect(charityEventArgs_.amount).to.equal(breakdown.charityEthDonationAmount);

	const ethReceivedEvents_ = engine.parsedEvents(receipt, contracts.prizesWallet, "EthReceived");
	expect(BigInt(ethReceivedEvents_.length), "claim: PrizesWallet EthReceived count")
		.to.equal(breakdown.numRaffleEthPrizesForBidders + 1n);

	const stakingDepositEvents_ = engine.parsedEvents(receipt, contracts.stakingWalletCosmicSignatureNft, "EthDepositReceived");
	expect(stakingDepositEvents_.length, "claim: staking deposit event count").to.equal(breakdown.stakingDepositSucceeds ? 1 : 0);
	if (breakdown.stakingDepositSucceeds) {
		expect(stakingDepositEvents_[0].args.depositAmount).to.equal(breakdown.stakingTotalEthRewardAmount);
	}

	// CST mints (from == zero address): numNftMints prize mints + 1 marketing mint.
	const cstMints_ = engine.parsedEvents(receipt, contracts.cosmicSignatureToken, "Transfer")
		.filter((event_) => event_.args[0].toLowerCase() === ZERO_ADDRESS);
	expect(BigInt(cstMints_.length), "claim: CST mint count").to.equal(breakdown.numNftMints + 1n);
	let marketingMints_ = 0;
	for (const mint_ of cstMints_) {
		if (mint_.args[1].toLowerCase() === model.marketingWalletAddress) {
			expect(mint_.args[2]).to.equal(breakdown.marketingWalletCstContributionAmount);
			++ marketingMints_;
		} else {
			expect(mint_.args[2], "claim: CST prize mint amount").to.equal(breakdown.cstPrizeAmount);
		}
	}
	expect(marketingMints_, "claim: marketing CST mint count").to.equal(1);

	const nftMints_ = engine.parsedEvents(receipt, contracts.cosmicSignatureNft, "Transfer")
		.filter((event_) => event_.args[0].toLowerCase() === ZERO_ADDRESS);
	expect(BigInt(nftMints_.length), "claim: CS NFT mint count").to.equal(breakdown.numNftMints);

	// Round-transition config events.
	const activationChanged_ = engine.singleEvent(receipt, game_, "RoundActivationTimeChanged", "claim");
	expect(activationChanged_.args[0]).to.equal(model.roundActivationTime);
	const incrementChanged_ = engine.singleEvent(receipt, game_, "MainPrizeTimeIncrementInMicroSecondsChanged", "claim");
	expect(incrementChanged_.args[0]).to.equal(model.mainPrizeTimeIncrementInMicroSeconds);

	// ETH ledger.
	ledger.addEth(claimerAddress, breakdown.mainEthPrizeAmount);
	ledger.addEth(contracts.prizesWalletAddress, breakdown.ethDepositsTotalAmount);
	if (breakdown.stakingDepositSucceeds) {
		ledger.addEth(contracts.stakingWalletCosmicSignatureNftAddress, breakdown.stakingTotalEthRewardAmount);
	}
	if (charityAccepts_) {
		ledger.addEth(model.charityAddress, breakdown.charityEthDonationAmount);
	}
	// Whatever the game does not pay out (rounding remainder + failed charity transfer) stays in the game.
	const gameOutflow_ =
		breakdown.mainEthPrizeAmount +
		breakdown.ethDepositsTotalAmount +
		(breakdown.stakingDepositSucceeds ? breakdown.stakingTotalEthRewardAmount : 0n) +
		(charityAccepts_ ? breakdown.charityEthDonationAmount : 0n);
	ledger.addEth(ctx_.game.address, -gameOutflow_);
}

// #endregion
// #region

module.exports = {
	planBidTs,
	chooseEthBidValue,
	pickBiddableRandomWalkNft,
	pickStakeableRandomWalkNft,
	pickStakeableCosmicSignatureNft,
	ownedStakeActionIds,
	ensureMockNftFor,
	ensureMockErc20For,
	executeEthBid,
	executeCstBid,
	verifyClaimReceipt,
};

// #endregion
