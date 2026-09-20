"use strict";

// Tests V3-specific bidding behavior shared by ETH and CST bid entry points.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER, SECONDS_PER_HOUR, SECONDS_PER_DAY } = require("../../src/CosmicSignatureConstants.js");
const { generateRandomUInt32, waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	activateCurrentRound,
	findParsedEvent,
	mineAtOrAfter,
	setNextBlockTimeToAtLeast,
	getLatestBlockTimestamp,
	blockTimestampOfReceipt,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	addRoundLateBidPricePremiumAmountIfNeeded,
	getV3CstBidPrice,
	getV3CstDutchAuctionDuration,
	tryIncreaseValueExponentially,
	tryReduceValueExponentially,
} = require("../src/V3UpgradeTestHelpers.js");
const { configureRewardAndDeployHostileBidder } = require("../src/AdversarialTestHelpers.js");
const { testAcrossGameVersions, finishGameRound, bidWithEthAt } = require("../src/GameRoundTestHelpers.js");

/** Checks the derived total duration and elapsed time, including the beginning-price selection. */
async function assertCstAuctionDurations(game_) {
	const auction_ = await readCstAuctionState(game_);
	const beginningPrice_ = (await game_.lastCstBidderAddress()) === hre.ethers.ZeroAddress ?
		auction_.nextRoundBeginningPrice : auction_.beginningPrice;
	const [duration_, elapsed_] = await game_.getCstDutchAuctionDurations();
	expect(duration_).equal(getV3CstDutchAuctionDuration(beginningPrice_, auction_.declineMultiplier));

	// Comment-202610021 applies.
	if ((await game_.lastBidderAddress()) !== hre.ethers.ZeroAddress) {
		expect(elapsed_).equal((await getLatestBlockTimestamp()) - auction_.beginningTimeStamp);
	}

	return duration_;
}

/** Reads only CST auction parameters that are valid in the current state. */
async function readCstAuctionState(game_) {
	const auction_ = {
		declineMultiplier: await game_.cstBidPriceDeclineMultiplier(),
		changeDivisor: await game_.cstBidPriceDeclineMultiplierChangeDivisor(),
		nextRoundBeginningPrice: await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice(),
		beginningPriceMinLimit: await game_.cstDutchAuctionBeginningBidPriceMinLimit(),
	};

	// Comment-202610021 applies.
	if ((await game_.lastCstBidderAddress()) !== hre.ethers.ZeroAddress) {
		auction_.beginningPrice = await game_.cstDutchAuctionBeginningBidPrice();
	}

	// Comment-202610021 applies.
	if ((await game_.lastBidderAddress()) !== hre.ethers.ZeroAddress) {
		auction_.beginningTimeStamp = await game_.cstDutchAuctionBeginningTimeStamp();
	}

	return auction_;
}

/**
JS mirror of the V2 ETH Dutch auction price at a given elapsed-since-activation duration.
@param {bigint} beginningBidPrice_
@param {bigint} elapsedDuration_
@param {bigint} auctionDuration_
@param {bigint} endingBidPriceDivisor_
*/
function ethDutchAuctionPrice(beginningBidPrice_, elapsedDuration_, auctionDuration_, endingBidPriceDivisor_) {
	if (elapsedDuration_ <= 0n) {
		return beginningBidPrice_;
	}
	const endingBidPrice_ = beginningBidPrice_ / endingBidPriceDivisor_ + 1n;
	if (elapsedDuration_ < auctionDuration_) {
		const difference_ = beginningBidPrice_ - endingBidPrice_;
		return beginningBidPrice_ - difference_ * elapsedDuration_ / auctionDuration_;
	}
	return endingBidPrice_;
}

describe("CosmicSignatureGameV3-Bidding", function () {
	it("adjusts the CST decline multiplier for every bid entry point, including zero-price CST bids after long waits", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const bidder_ = contracts_.signers[1];
			const gameForBidder_ = game_.connect(bidder_);
			const changeDivisor_ = 20n + BigInt(generateRandomUInt32() % 181);
			await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstBidPriceDeclineMultiplierChangeDivisor(changeDivisor_));
			const mockToken_ = await (await hre.ethers.getContractFactory("FuzzTestMockErc20", bidder_)).deploy();
			await mockToken_.waitForDeployment();
			await waitForTransactionReceipt(mockToken_.mint(bidder_.address, 2n));
			await waitForTransactionReceipt(mockToken_.approve(contracts_.prizesWalletAddress, 2n));
			const mockNft_ = await (await hre.ethers.getContractFactory("FuzzTestMockErc721", bidder_)).deploy();
			await mockNft_.waitForDeployment();
			const nftIds_ = [];
			for (let nftIndex_ = 0; nftIndex_ < 2; ++ nftIndex_) {
				nftIds_.push(await mockNft_.mint.staticCall(bidder_.address));
				await waitForTransactionReceipt(mockNft_.mint(bidder_.address));
			}
			await waitForTransactionReceipt(mockNft_.setApprovalForAll(contracts_.prizesWalletAddress, true));
			await waitForTransactionReceipt(contracts_.randomWalkNft.connect(bidder_).mint({value: await contracts_.randomWalkNft.getMintPrice(),}));
			const randomWalkNftId_ = (await contracts_.randomWalkNft.totalSupply()) - 1n;
			await activateCurrentRound(game_, contracts_.ownerSigner);

			const ethBidSubmissions_ = [
				() => gameForBidder_.bidWithEth(-1n, "", 0n, {value: 10n ** 18n,}),
				() => bidder_.sendTransaction({to: contracts_.cosmicSignatureGameProxyAddress, value: 10n ** 18n,}),
				() => gameForBidder_.bidWithEth(randomWalkNftId_, "", 0n, {value: 10n ** 18n,}),
				() => gameForBidder_.bidWithEthAndDonateToken(-1n, "", 0n, mockToken_, 1n, {value: 10n ** 18n,}),
				() => gameForBidder_.bidWithEthAndDonateNft(-1n, "", 0n, mockNft_, nftIds_[0], {value: 10n ** 18n,}),
			];
			for (const submitBid_ of ethBidSubmissions_) {
				const expectedMultiplier_ = tryIncreaseValueExponentially(await game_.cstBidPriceDeclineMultiplier(), changeDivisor_);
				const receipt_ = await waitForTransactionReceipt(submitBid_());
				expect(await game_.cstBidPriceDeclineMultiplier()).equal(expectedMultiplier_);
				expect(findParsedEvent(receipt_, game_, "BidPlaced").args.cstBidPriceDeclineMultiplier).equal(expectedMultiplier_);
				await assertCstAuctionDurations(game_);
			}

			const cstBidSubmissions_ = [
				() => gameForBidder_.bidWithCst(0n, "", 0n),
				() => gameForBidder_.bidWithCstAndDonateToken(0n, "", 0n, mockToken_, 1n),
				() => gameForBidder_.bidWithCstAndDonateNft(0n, "", 0n, mockNft_, nftIds_[1]),
			];
			for (const submitBid_ of cstBidSubmissions_) {
				const auctionBefore_ = await readCstAuctionState(game_);
				const durationBefore_ = await assertCstAuctionDurations(game_);
				const waitDuration_ = (3n + BigInt(generateRandomUInt32() % 19)) * SECONDS_PER_DAY;
				await mineAtOrAfter(auctionBefore_.beginningTimeStamp + durationBefore_ + waitDuration_);
				expect(await readCstAuctionState(game_)).deep.equal(auctionBefore_);
				expect(await assertCstAuctionDurations(game_)).equal(durationBefore_);
				expect(await game_.getNextCstBidPrice()).equal(0n);

				const expectedMultiplier_ = tryReduceValueExponentially(auctionBefore_.declineMultiplier, changeDivisor_);
				const receipt_ = await waitForTransactionReceipt(submitBid_());
				const bidPlaced_ = findParsedEvent(receipt_, game_, "BidPlaced");
				expect(bidPlaced_.args.paidCstPrice).equal(0n);
				expect(bidPlaced_.args.cstBidPriceDeclineMultiplier).equal(expectedMultiplier_);
				expect(await game_.cstBidPriceDeclineMultiplier()).equal(expectedMultiplier_);
				expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(auctionBefore_.beginningPriceMinLimit);
				expect(await game_.cstDutchAuctionBeginningTimeStamp()).equal(await blockTimestampOfReceipt(receipt_));
				await assertCstAuctionDurations(game_);
			}
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("advances CST auction elapsed duration and price through long bid-free waits without changing its total duration", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);
			await bidWithEthAt(game_, contracts_.signers[1], (await getLatestBlockTimestamp()) + 10n);
			const auction_ = await readCstAuctionState(game_);
			const duration_ = await assertCstAuctionDurations(game_);

			// The price reaches zero before the premium window, so these quotes equal the premium-free price.
			expect(auction_.beginningTimeStamp + duration_).lessThan((await game_.mainPrizeTime()) - (await game_.getRoundLateBidDuration()));
			for (const elapsed_ of [1n, duration_ / 2n, duration_ - 1n, duration_, duration_ + (3n + BigInt(generateRandomUInt32() % 19)) * SECONDS_PER_DAY]) {
				await mineAtOrAfter(auction_.beginningTimeStamp + elapsed_);
				expect(await readCstAuctionState(game_)).deep.equal(auction_);
				expect(await assertCstAuctionDurations(game_)).equal(duration_);
				const price_ = await game_.getNextCstBidPrice();
				expect(price_).equal(getV3CstBidPrice(auction_.nextRoundBeginningPrice, elapsed_, auction_.declineMultiplier));
				if (elapsed_ < duration_) {
					expect(price_).greaterThan(0n);
				} else {
					expect(price_).equal(0n);
				}
			}
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("preserves CST auction parameters across unrelated actions and claims while selecting the next round's beginning price", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const ownerGame_ = game_.connect(contracts_.ownerSigner);
		const bidder1_ = contracts_.signers[1];
		const bidder2_ = contracts_.signers[2];
		const initialAuction_ = await readCstAuctionState(game_);
		await waitForTransactionReceipt(ownerGame_.setBidMessageLengthMaxLimit((await game_.bidMessageLengthMaxLimit()) + 1n));
		expect(await readCstAuctionState(game_)).deep.equal(initialAuction_);
		await activateCurrentRound(game_, contracts_.ownerSigner);
		expect(await readCstAuctionState(game_)).deep.equal(initialAuction_);
		await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
		await mineAtOrAfter((await getLatestBlockTimestamp()) + 10n * SECONDS_PER_DAY);
		await waitForTransactionReceipt(game_.connect(bidder2_).bidWithCst(0n, "", 0n));

		// The first CST bid rewards bidder1 and sets the next-round beginning price to the minimum.
		// A paid second CST bid makes the current and next-round beginning prices different.
		const paidCstPrice_ = await game_.getNextCstBidPriceAdvanced(1n);
		expect(paidCstPrice_).greaterThan(0n);
		expect(await contracts_.cosmicSignatureToken.balanceOf(bidder1_.address)).greaterThan(paidCstPrice_);
		await setNextBlockTimeToAtLeast((await getLatestBlockTimestamp()) + 1n);
		await waitForTransactionReceipt(game_.connect(bidder1_).bidWithCst(paidCstPrice_, "", 0n));
		const auction_ = await readCstAuctionState(game_);
		expect(auction_.beginningPrice).greaterThan(auction_.nextRoundBeginningPrice);
		const currentDuration_ = await assertCstAuctionDurations(game_);
		for (const donate_ of [
			() => game_.connect(bidder2_).donateEth({value: 1n,}),
			() => game_.connect(bidder2_).donateEthWithInfo("{}", {value: 1n,}),
		]) {
			await waitForTransactionReceipt(donate_());
			expect(await readCstAuctionState(game_)).deep.equal(auction_);
			expect(await assertCstAuctionDurations(game_)).equal(currentDuration_);
		}
		const roundNum_ = await game_.roundNum();
		await setNextBlockTimeToAtLeast(await game_.mainPrizeTime());
		await waitForTransactionReceipt(game_.connect(bidder1_).claimMainPrize());
		expect(await game_.roundNum()).equal(roundNum_ + 1n);
		expect(await game_.lastCstBidderAddress()).equal(hre.ethers.ZeroAddress);
		expect(auction_).include(await readCstAuctionState(game_));
		const nextDuration_ = await assertCstAuctionDurations(game_);
		expect(nextDuration_).lessThan(currentDuration_);
		await activateCurrentRound(game_, contracts_.ownerSigner);
		expect(auction_).include(await readCstAuctionState(game_));
		expect(await assertCstAuctionDurations(game_)).equal(nextDuration_);
		await mineAtOrAfter((await getLatestBlockTimestamp()) + 7n * SECONDS_PER_DAY);
		await waitForTransactionReceipt(ownerGame_.halveEthDutchAuctionEndingBidPrice());
		expect(auction_).include(await readCstAuctionState(game_));
		expect(await assertCstAuctionDurations(game_)).equal(nextDuration_);
		await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 10n);
		expect(await game_.cstBidPriceDeclineMultiplier()).equal(tryIncreaseValueExponentially(auction_.declineMultiplier, auction_.changeDivisor));
		expect(await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice()).equal(auction_.nextRoundBeginningPrice);
		expect(await game_.cstDutchAuctionBeginningTimeStamp()).equal(await getLatestBlockTimestamp());
		await assertCstAuctionDurations(game_);
	});

	it("allows random combinations of ETH, receive(), and CST bids within one block", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const token_ = contracts_.cosmicSignatureToken;

			// Make all three bidders rich enough in CST for even the worst-case random sequence of 30 CST bids,
			// whose auction beginning price can double after each bid.
			await waitForTransactionReceipt(
				game_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(
					600_000_000_000n * DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER
				)
			);
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const bidder1_ = contracts_.signers[1];
			const bidder2_ = contracts_.signers[2];
			const bidder3_ = contracts_.signers[3];
			await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 10n);
			await bidWithEthAt(game_, bidder2_, (await getLatestBlockTimestamp()) + 100n);
			await bidWithEthAt(game_, bidder3_, (await getLatestBlockTimestamp()) + 100n);
			await bidWithEthAt(game_, bidder1_, (await getLatestBlockTimestamp()) + 100n);

			expect(await token_.balanceOf(bidder1_.address)).greaterThan(0n);
			expect(await token_.balanceOf(bidder2_.address)).greaterThan(0n);
			expect(await token_.balanceOf(bidder3_.address)).greaterThan(0n);
			const ethDutchAuctionBeginningBidPrice_ = await game_.ethDutchAuctionBeginningBidPrice();
			const gameAddress_ = await game_.getAddress();
			const bidders_ = [bidder1_, bidder2_, bidder3_];
			const bidTypes_ = ["ETH", "receive", "CST"];
			const roundNum_ = await game_.roundNum();
			const ethBidPriceIncreaseDivisor_ = await game_.ethBidPriceIncreaseDivisor();

			// [Comment-202609061]
			// Transactions submitted by different accounts do not inherently have a deterministic execution
			// order. Each transaction is therefore funded for any execution order, and the assertions below
			// do not depend on which randomly selected bid executes first.
			// [/Comment-202609061]
			for (let iterationIndex_ = 0; iterationIndex_ < 10; ++ iterationIndex_) {
				const bidTypeCombination_ = bidders_.map(() => bidTypes_[generateRandomUInt32() % bidTypes_.length]);
				const timeStamp_ = (await getLatestBlockTimestamp()) + 100n;
				const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(100n);
				const ethBidValue_ = ethBidPrice_ * 10n;
				const firstBidIndex_ = await game_.getTotalNumBids(roundNum_);
				const prevBidRaffleCumulativeWeight_ =
					(firstBidIndex_ > 0n) ?
					(await game_.getBidInfoAt(roundNum_, firstBidIndex_ - 1n)).raffleCumulativeWeight :
					0n;
				const submitBid_ = (bidType_, bidder_) => {
					switch (bidType_) {
						case "ETH":
							return game_.connect(bidder_).bidWithEth(-1n, "", 0n, { value: ethBidValue_, });
						case "receive":
							return bidder_.sendTransaction({ to: gameAddress_, value: ethBidValue_, });
						case "CST":
							return game_.connect(bidder_).bidWithCst(hre.ethers.MaxUint256, "", 0n);
						default:
							throw new Error(`Unexpected bid type: ${bidType_}`);
					}
				};

				let transactionResponses_;
				try {
					await hre.ethers.provider.send("evm_setAutomine", [false,]);
					await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);

					// Comment-202609061 applies to this combination.
					transactionResponses_ = [];
					for (let bidderIndex_ = 0; bidderIndex_ < bidders_.length; ++ bidderIndex_) {
						transactionResponses_.push(await submitBid_(bidTypeCombination_[bidderIndex_], bidders_[bidderIndex_]));
					}

					await hre.ethers.provider.send("evm_mine");
				} finally {
					await hre.ethers.provider.send("evm_setAutomine", [true,]);
				}

				const receipts_ = await Promise.all(
					transactionResponses_.map(transactionResponse_ =>
						hre.ethers.provider.getTransactionReceipt(transactionResponse_.hash)
					)
				);
				const combinationDescription_ = bidTypeCombination_.join("+");
				expect(new Set(receipts_.map(receipt_ => receipt_.blockNumber)).size, combinationDescription_).equal(1);
				expect(receipts_.map(receipt_ => receipt_.status), combinationDescription_).deep.equal([1, 1, 1]);
				const bidCstRewardAmounts_ =
					receipts_.map(receipt_ => findParsedEvent(receipt_, game_, "BidPlaced").args.bidCstRewardAmount);
				expect(bidCstRewardAmounts_.filter(value_ => value_ === 0n).length, combinationDescription_).equal(2);
				expect(bidCstRewardAmounts_.filter(value_ => value_ > 0n).length, combinationDescription_).equal(1);

				const executedBids_ = receipts_.map((receipt_, submittedBidIndex_) => ({
					receipt: receipt_,
					bidType: bidTypeCombination_[submittedBidIndex_],
				})).sort((bid1_, bid2_) => bid1_.receipt.index - bid2_.receipt.index);
				let expectedBidRaffleWeight_ = ethBidPrice_;
				let cumulativeWeightBeforeBid_ = prevBidRaffleCumulativeWeight_;
				for ( let executionIndex_ = 0; executionIndex_ < executedBids_.length; ++ executionIndex_ ) {
					const bidInfo_ = await game_.getBidInfoAt(roundNum_, firstBidIndex_ + BigInt(executionIndex_));
					expect(
						bidInfo_.raffleCumulativeWeight - cumulativeWeightBeforeBid_,
						`${combinationDescription_}, executed bid ${executionIndex_}`
					).equal(expectedBidRaffleWeight_);
					cumulativeWeightBeforeBid_ = bidInfo_.raffleCumulativeWeight;
					if (executedBids_[executionIndex_].bidType !== "CST") {
						expectedBidRaffleWeight_ += expectedBidRaffleWeight_ / ethBidPriceIncreaseDivisor_ + 1n;
					}
				}
				expect(await game_.ethDutchAuctionBeginningBidPrice(), combinationDescription_).equal(ethDutchAuctionBeginningBidPrice_);
			}
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	// Tests `BiddingV3`'s late bid price premium: within a configurable duration before `mainPrizeTime`
	// (`getRoundLateBidDuration()`), both the ETH and the CST bid price get an exponentially growing
	// premium, reaching a multiplier of ~4x at (and beyond) `mainPrizeTime` with the default parameters.
	it("adds an exponentially growing, capped premium to ETH and CST bid prices near mainPrizeTime", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			// #region Setup: V1 -> V2 -> V3, then activate the round.

			const bidder_ = contracts_.signers[1];

			// Slow the CST price decline down (the round is inactive right after the upgrade, so the owner can),
			// so that the 200 CST beginning bid price carried over from V1 declines to zero only after ~55 hours.
			// That makes the CST bid price still nonzero within the late bid premium window,
			// which opens ~24 hours into the round, so the CST premium section below can sample nonzero prices.
			await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstBidPriceDeclineMultiplier(10n ** 15n));

			await activateCurrentRound(game_, contracts_.ownerSigner);

			// #endregion
			// #region No bid in the round yet: no premium, even though the stale `mainPrizeTime` is in the past.

			{
				expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
				expect(await game_.getDurationUntilMainPrize()).lessThan(0n);
				const ts_ = await getLatestBlockTimestamp();
				const elapsed_ = ts_ - await game_.roundActivationTime();
				const expectedPurePrice_ = ethDutchAuctionPrice(
					await game_.ethDutchAuctionBeginningBidPrice(),
					elapsed_,
					(await game_.mainPrizeTimeIncrementInMicroSeconds()) / (await game_.ethDutchAuctionDurationDivisor()),
					await game_.ethDutchAuctionEndingBidPriceDivisor()
				);
				expect(await game_.getNextEthBidPrice()).equal(expectedPurePrice_);
			}

			// #endregion
			// #region First bid; collect the parameters that drive the premium curve.

			await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", 0n, {value: 10n ** 18n,}));

			/** @type {bigint} */
			const mainPrizeTimeIncrementInMicroSeconds_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
			/** @type {bigint} */
			const roundLateBidDurationDivisor_ = await game_.roundLateBidDurationDivisor();
			const roundLateBidDuration_ = mainPrizeTimeIncrementInMicroSeconds_ / roundLateBidDurationDivisor_;
			expect(await game_.getRoundLateBidDuration()).equal(roundLateBidDuration_);

			// The default 20-minute window grows with completed rounds.
			expect(roundLateBidDuration_).greaterThanOrEqual(20n * 60n);

			const baseMultiplier_ = await game_.roundLateBidPricePremiumAmountBaseMultiplier();
			const exponent_ = await game_.roundLateBidPricePremiumAmountExponent();
			const ethBidPriceBase_ = await game_.nextEthBidPrice();

			// #endregion
			// #region ETH premium curve: exact mirror, zero outside the window, monotonic and convex inside, ~4x cap.

			{
				/** @type {bigint} */
				const mainPrizeTime_ = await game_.mainPrizeTime();
				const ts_ = await getLatestBlockTimestamp();
				const adjustedPriceAt_ = (durationUntilMainPrize_) => addRoundLateBidPricePremiumAmountIfNeeded(
					ethBidPriceBase_,
					durationUntilMainPrize_,
					roundLateBidDuration_,
					mainPrizeTimeIncrementInMicroSeconds_,
					baseMultiplier_,
					exponent_
				);

				// Exact-mirror sweep of the curve; `durationUntilMainPrize` decreases left to right.
				for (const durationUntilMainPrize_ of [
					roundLateBidDuration_ + SECONDS_PER_HOUR,
					roundLateBidDuration_ + 1n,
					roundLateBidDuration_,
					roundLateBidDuration_ / 3n,
					7n,
					1n,
					0n,
					-1n,
					-SECONDS_PER_HOUR,
					-roundLateBidDuration_ * 10n,
				]) {
					const currentTimeOffset_ = mainPrizeTime_ - durationUntilMainPrize_ - ts_;
					expect(
						await game_.getNextEthBidPriceAdvanced(currentTimeOffset_),
						`ETH premium mismatch at durationUntilMainPrize == ${durationUntilMainPrize_}`
					).equal(adjustedPriceAt_(durationUntilMainPrize_));
				}

				// No premium at or before the window opening.
				expect(adjustedPriceAt_(roundLateBidDuration_ + SECONDS_PER_HOUR)).equal(ethBidPriceBase_);
				expect(adjustedPriceAt_(roundLateBidDuration_)).equal(ethBidPriceBase_);

				// Uniform sweep across the window: on-chain values match the mirror, and the premium growth
				// is monotonically nondecreasing and convex (exponential acceleration).
				{
					const numUniformSamples_ = 8n;
					let prevIncrement_ = 0n;
					let prevPrice_ = ethBidPriceBase_;
					for (let sampleIndex_ = 1n; sampleIndex_ <= numUniformSamples_; ++ sampleIndex_) {
						const durationUntilMainPrize_ = roundLateBidDuration_ * (numUniformSamples_ - sampleIndex_) / numUniformSamples_;
						const currentTimeOffset_ = mainPrizeTime_ - durationUntilMainPrize_ - ts_;
						const onChainPrice_ = await game_.getNextEthBidPriceAdvanced(currentTimeOffset_);
						expect(onChainPrice_, `ETH premium mismatch at uniform sample ${sampleIndex_}`)
							.equal(adjustedPriceAt_(durationUntilMainPrize_));
						const increment_ = onChainPrice_ - prevPrice_;
						expect(increment_, `premium must not decrease at uniform sample ${sampleIndex_}`).greaterThanOrEqual(0n);
						expect(increment_, `premium growth must accelerate at uniform sample ${sampleIndex_}`).greaterThanOrEqual(prevIncrement_);
						prevIncrement_ = increment_;
						prevPrice_ = onChainPrice_;
					}
				}

				// The maximum premium AMOUNT is ~4x the price (Comment-202607119), so the adjusted price
				// is ~5x the price, and it stays constant after `mainPrizeTime`.
				const maxAdjustedPrice_ = adjustedPriceAt_(0n);
				expect(maxAdjustedPrice_ - ethBidPriceBase_).greaterThan(ethBidPriceBase_ * 4n * 99n / 100n);
				expect(maxAdjustedPrice_ - ethBidPriceBase_).lessThan(ethBidPriceBase_ * 4n * 101n / 100n);
				expect(adjustedPriceAt_(-1n)).equal(maxAdjustedPrice_);
				expect(adjustedPriceAt_(-SECONDS_PER_HOUR)).equal(maxAdjustedPrice_);
				expect(adjustedPriceAt_(-roundLateBidDuration_ * 10n)).equal(maxAdjustedPrice_);
			}

			// #endregion
			// #region A real ETH bid within the window must pay the premium-adjusted price.

			{
				/** @type {bigint} */
				const mainPrizeTime_ = await game_.mainPrizeTime();

				// Underpaying with the premium-free price must revert.
				{
					const bidTs_ = mainPrizeTime_ - roundLateBidDuration_ / 2n;
					await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTs_),]);
					await expect(game_.connect(bidder_).bidWithEth(-1n, "", 0n, {value: ethBidPriceBase_,}))
						.revertedWithCustomError(game_, "InsufficientReceivedBidAmount");
				}

				// Paying the premium-adjusted price at the next timestamp must succeed.
				{
					const bidTs_ = mainPrizeTime_ - roundLateBidDuration_ / 2n + 1n;
					const durationUntilMainPrize_ = mainPrizeTime_ - bidTs_;
					const adjustedPrice_ = addRoundLateBidPricePremiumAmountIfNeeded(
						ethBidPriceBase_,
						durationUntilMainPrize_,
						roundLateBidDuration_,
						mainPrizeTimeIncrementInMicroSeconds_,
						baseMultiplier_,
						exponent_
					);
					expect(adjustedPrice_).greaterThan(ethBidPriceBase_);
					await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTs_),]);
					const transactionReceipt_ =
						await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", 0n, {value: adjustedPrice_,}));
					let bidPlacedLog_;
					for (const log_ of transactionReceipt_.logs) {
						const parsedLog_ = game_.interface.parseLog(log_);
						if (parsedLog_?.name === "BidPlaced") {
							bidPlacedLog_ = parsedLog_;
							break;
						}
					}
					expect(bidPlacedLog_.args.paidEthPrice).equal(adjustedPrice_);

					// The next price grows from the base after the bid closes the premium window.
					const ethBidPriceIncreaseDivisor_ = await game_.ethBidPriceIncreaseDivisor();
					const newEthBidPriceBase_ = ethBidPriceBase_ + ethBidPriceBase_ / ethBidPriceIncreaseDivisor_ + 1n;
					expect(await game_.nextEthBidPrice()).equal(newEthBidPriceBase_);
					expect((await game_.mainPrizeTime()) - (await getLatestBlockTimestamp())).greaterThan(roundLateBidDuration_);
					expect(await game_.getNextEthBidPrice()).equal(newEthBidPriceBase_);
				}
			}

			// #endregion
			// #region CST premium curve: exact mirror on top of the V3 linear CST price decline.

			{
				// No CST bid has been placed in this round, so the CST price declines from
				// `nextRoundFirstCstDutchAuctionBeginningBidPrice` (200 CST carried over from V1's initialization)
				// since the first bid of the round. With the slowed-down decline rate configured above,
				// that decline covers the whole premium window with nonzero prices.
				expect(await game_.lastCstBidderAddress()).equal(hre.ethers.ZeroAddress);
				const cstDutchAuctionBeginningTimeStamp_ = await game_.cstDutchAuctionBeginningTimeStamp();
				const cstDutchAuctionBeginningBidPrice_ = await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice();
				const cstBidPriceDeclineMultiplier_ = await game_.cstBidPriceDeclineMultiplier();
				/** @type {bigint} */
				const mainPrizeTime_ = await game_.mainPrizeTime();
				const ts_ = await getLatestBlockTimestamp();
				expect(mainPrizeTime_ - roundLateBidDuration_).greaterThan(ts_);

				// The decline must overlap the whole premium window, and its derived duration getter must agree.
				{
					const cstDutchAuctionDerivedDuration_ =
						(cstDutchAuctionBeginningBidPrice_ + (cstBidPriceDeclineMultiplier_ - 1n)) / cstBidPriceDeclineMultiplier_;
					expect(cstDutchAuctionBeginningTimeStamp_ + cstDutchAuctionDerivedDuration_).greaterThan(mainPrizeTime_ + 60n);
					expect((await game_.getCstDutchAuctionDurations())[0]).equal(cstDutchAuctionDerivedDuration_);
				}

				for (const durationUntilMainPrize_ of [
					roundLateBidDuration_ + 60n,
					roundLateBidDuration_,
					roundLateBidDuration_ * 3n / 4n,
					roundLateBidDuration_ / 2n,
					roundLateBidDuration_ / 8n,
					0n,
					-60n,
				]) {
					const sampleTs_ = mainPrizeTime_ - durationUntilMainPrize_;

					// The V3 premium-free CST bid price declines linearly at `cstBidPriceDeclineMultiplier` per second.
					const cstBidPriceBase_ =
						cstDutchAuctionBeginningBidPrice_ - (sampleTs_ - cstDutchAuctionBeginningTimeStamp_) * cstBidPriceDeclineMultiplier_;
					expect(cstBidPriceBase_).greaterThan(0n);

					const adjustedCstPrice_ = addRoundLateBidPricePremiumAmountIfNeeded(
						cstBidPriceBase_,
						durationUntilMainPrize_,
						roundLateBidDuration_,
						mainPrizeTimeIncrementInMicroSeconds_,
						baseMultiplier_,
						exponent_
					);
					expect(
						await game_.getNextCstBidPriceAdvanced(sampleTs_ - ts_),
						`CST premium mismatch at durationUntilMainPrize == ${durationUntilMainPrize_}`
					).equal(adjustedCstPrice_);
					if (durationUntilMainPrize_ <= 0n) {
						// The maximum premium AMOUNT is ~4x the price (Comment-202607119).
						expect(adjustedCstPrice_ - cstBidPriceBase_).greaterThan(cstBidPriceBase_ * 4n * 99n / 100n);
					}
				}
			}

			// #endregion
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("charges late bid premiums without increasing price anchors or raffle weights", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const token_ = contracts_.cosmicSignatureToken;
			const [bidder1_, bidder2_] = contracts_.signers.slice(1, 3);

			// Keep the first CST auction open for twice this round's initial duration until main-prize.
			const cstBidPriceDeclineMultiplier_ =
				(await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice()) /
				(2n * (await game_.getInitialDurationUntilMainPrize()));
			expect(cstBidPriceDeclineMultiplier_).greaterThan(0n);
			await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstBidPriceDeclineMultiplier(cstBidPriceDeclineMultiplier_));

			await activateCurrentRound(game_, contracts_.ownerSigner);
			await waitForTransactionReceipt(
				contracts_.randomWalkNft.connect(bidder2_).mint({ value: await contracts_.randomWalkNft.getMintPrice(), })
			);
			const randomWalkNftId_ = (await contracts_.randomWalkNft.totalSupply()) - 1n;
			const roundNum_ = await game_.roundNum();
			await waitForTransactionReceipt(game_.connect(bidder1_).bidWithEth(-1n, "", 0n, { value: 10n ** 18n, }));
			const mainPrizeTimeIncrement_ = await game_.mainPrizeTimeIncrementInMicroSeconds();
			const lateDuration_ = await game_.getRoundLateBidDuration();
			const increaseDivisor_ = await game_.ethBidPriceIncreaseDivisor();
			const ethAuctionBeginningPrice_ = await game_.ethDutchAuctionBeginningBidPrice();
			let cumulativeWeight_ = (await game_.getBidInfoAt(roundNum_, 0n)).raffleCumulativeWeight;

			// Exercise deep-window ETH and receive bids, then an NFT-assisted bid past the deadline.
			for (const bidType_ of ["ETH", "receive", "NFT"]) {
				const bidder_ = (bidType_ === "NFT") ? bidder2_ : bidder1_;
				const ethBidPriceBase_ = await game_.nextEthBidPrice();
				const mainPrizeTime_ = await game_.mainPrizeTime();
				const bidTimeStamp_ = mainPrizeTime_ + ((bidType_ === "NFT") ? 123n : -lateDuration_ / 8n);
				const adjustedPrice_ = addRoundLateBidPricePremiumAmountIfNeeded(
					ethBidPriceBase_, mainPrizeTime_ - bidTimeStamp_, lateDuration_, mainPrizeTimeIncrement_
				);
				expect(adjustedPrice_).greaterThan(ethBidPriceBase_ * 2n);
				const paidPrice_ = (bidType_ === "NFT") ? (adjustedPrice_ + 1n) / 2n : adjustedPrice_;
				const spentBefore_ = (await game_.getBidderTotalSpentAmounts(roundNum_, bidder_.address))[0];
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
				const receipt_ = await waitForTransactionReceipt(
					(bidType_ === "receive") ?
					bidder_.sendTransaction({ to: await game_.getAddress(), value: paidPrice_, }) :
					game_.connect(bidder_).bidWithEth((bidType_ === "NFT") ? randomWalkNftId_ : -1n, "", 0n, { value: paidPrice_, })
				);
				expect(findParsedEvent(receipt_, game_, "BidPlaced").args.paidEthPrice).equal(paidPrice_);
				expect((await game_.getBidderTotalSpentAmounts(roundNum_, bidder_.address))[0] - spentBefore_).equal(paidPrice_);
				const newEthBidPriceBase_ = ethBidPriceBase_ + ethBidPriceBase_ / increaseDivisor_ + 1n;
				expect(await game_.nextEthBidPrice()).equal(newEthBidPriceBase_);
				expect(await game_.getNextEthBidPrice()).equal(newEthBidPriceBase_);
				expect(await game_.ethDutchAuctionBeginningBidPrice()).equal(ethAuctionBeginningPrice_);
				cumulativeWeight_ += ethBidPriceBase_;
				expect((await game_.getBidInfoAt(roundNum_, (await game_.getTotalNumBids(roundNum_)) - 1n)).raffleCumulativeWeight)
					.equal(cumulativeWeight_);
			}

			// Only the first CST bid sets the next round's anchor; neither reset includes a premium.
			let nextRoundCstBeginningPrice_;
			for (let bidIndex_ = 0; bidIndex_ < 2; ++ bidIndex_) {
				const ethBidPriceBase_ = await game_.nextEthBidPrice();
				const mainPrizeTime_ = await game_.mainPrizeTime();
				const bidTimeStamp_ = mainPrizeTime_ - lateDuration_ / 4n;
				const beginningPrice_ = (bidIndex_ === 0) ?
					await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice() : await game_.cstDutchAuctionBeginningBidPrice();
				const cstBidPriceBase_ = beginningPrice_ -
					(bidTimeStamp_ - await game_.cstDutchAuctionBeginningTimeStamp()) * (await game_.cstBidPriceDeclineMultiplier());
				expect(cstBidPriceBase_).greaterThan(0n);
				const adjustedPrice_ = addRoundLateBidPricePremiumAmountIfNeeded(
					cstBidPriceBase_, mainPrizeTime_ - bidTimeStamp_, lateDuration_, mainPrizeTimeIncrement_
				);
				expect(adjustedPrice_).greaterThan(cstBidPriceBase_);
				const bidder_ = (bidIndex_ === 0) ? bidder1_ : bidder2_;

				// Share naturally earned CST rewards to fund the second premium-bearing CST bid.
				if (bidIndex_ > 0) {
					await waitForTransactionReceipt(token_.connect(bidder1_).transfer(bidder2_.address, adjustedPrice_));
				}

				const balanceBefore_ = await token_.balanceOf(bidder_.address);
				const spentBefore_ = (await game_.getBidderTotalSpentAmounts(roundNum_, bidder_.address))[1];
				await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
				const receipt_ = await waitForTransactionReceipt(game_.connect(bidder_).bidWithCst(adjustedPrice_, "", 0n));
				expect(findParsedEvent(receipt_, game_, "BidPlaced").args.paidCstPrice).equal(adjustedPrice_);
				expect(balanceBefore_ - await token_.balanceOf(bidder_.address)).equal(adjustedPrice_);
				expect((await game_.getBidderTotalSpentAmounts(roundNum_, bidder_.address))[1] - spentBefore_).equal(adjustedPrice_);
				const minLimit_ = await game_.cstDutchAuctionBeginningBidPriceMinLimit();
				const newBeginningPrice_ = (cstBidPriceBase_ * 2n > minLimit_) ? cstBidPriceBase_ * 2n : minLimit_;
				expect(await game_.cstDutchAuctionBeginningBidPrice()).equal(newBeginningPrice_);
				expect(await game_.getNextCstBidPrice()).equal(newBeginningPrice_);
				if (bidIndex_ === 0) {
					nextRoundCstBeginningPrice_ = newBeginningPrice_;
				}
				expect(await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice()).equal(nextRoundCstBeginningPrice_);
				expect(await game_.nextEthBidPrice()).equal(ethBidPriceBase_);
				cumulativeWeight_ += ethBidPriceBase_;
				expect((await game_.getBidInfoAt(roundNum_, (await game_.getTotalNumBids(roundNum_)) - 1n)).raffleCumulativeWeight)
					.equal(cumulativeWeight_);
			}
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});

	it("a first V3 CST bid reaches token minting before inactive-round and wrong-bid-type guards", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		const token_ = contracts_.cosmicSignatureToken;
		const bidder_ = contracts_.signers[2];

		// Keep the round inactive while advancing past the derived end of the CST Dutch auction.
		// At that point the zero CST price cannot mask the attempted reward mint to `address(0)`.
		let latestTimeStamp_ = await getLatestBlockTimestamp();
		const cstDutchAuctionEndTimeStamp_ =
			(await game_.cstDutchAuctionBeginningTimeStamp()) + (await game_.getCstDutchAuctionDurations())[0];
		let bidTimeStamp_ = (cstDutchAuctionEndTimeStamp_ > latestTimeStamp_) ? cstDutchAuctionEndTimeStamp_ : latestTimeStamp_ + 1n;
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setRoundActivationTime(bidTimeStamp_ + 1_000n));
		latestTimeStamp_ = await getLatestBlockTimestamp();
		if (bidTimeStamp_ <= latestTimeStamp_) {
			bidTimeStamp_ = latestTimeStamp_ + 1n;
		}

		const currentTimeOffset_ = bidTimeStamp_ - latestTimeStamp_;
		expect(await game_.getNextCstBidPriceAdvanced(currentTimeOffset_)).equal(0n);
		expect(await game_.getBidCstRewardAmountAdvanced(currentTimeOffset_)).greaterThan(0n);
		expect(await game_.getDurationUntilRoundActivation()).greaterThan(0n);
		const totalSupplyBefore_ = await token_.totalSupply();

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(bidTimeStamp_),]);
		await expect(game_.connect(bidder_).bidWithCst(hre.ethers.MaxUint256, "", 0n))
			.revertedWithCustomError(token_, "ERC20InvalidReceiver")
			.withArgs(hre.ethers.ZeroAddress);

		// The token error wins over both `RoundIsInactive` and `WrongBidType`, and all interim work rolls back.
		expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
		expect(await game_.getTotalNumBids(await game_.roundNum())).equal(0n);
		expect(await token_.totalSupply()).equal(totalSupplyBefore_);
	});

	it("a reentrancy attempt via the ETH bid overpayment refund reverts the attacker's own bid only", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const { hostileBidder_ } = await configureRewardAndDeployHostileBidder(contracts_, game_);
			const deployerOfHostileContract_ = contracts_.signers[10];
			const eoaBidder1_ = contracts_.signers[1];

			await bidWithEthAt(game_, eoaBidder1_, (await getLatestBlockTimestamp()) + 10n);

			// Mode 4 makes the contract reenter `bidWithEth` when it receives ETH.
			// A significantly overpaying bid triggers the refund, the refund triggers the reentry attempt,
			// the reentrancy guard reverts it, and that reverts the refund and the entire hostile bid.
			await waitForTransactionReceipt(hostileBidder_.setHostilityModeCode(4n));
			const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(2n);
			await expect(
				hostileBidder_.connect(deployerOfHostileContract_).doBidWithEth(-1n, "reentry attempt", 0n, {value: ethBidPrice_ + 10n ** 18n,})
			).revertedWithCustomError(game_, "ReentrancyGuardReentrantCall");

			// The game is unaffected: the EOA is still the last bidder, and bidding continues normally.
			expect(await game_.lastBidderAddress()).equal(eoaBidder1_.address);
			await bidWithEthAt(game_, eoaBidder1_, (await getLatestBlockTimestamp()) + 30n);
			await finishGameRound(contracts_, game_);
		}, 3, 3);
	});
});
