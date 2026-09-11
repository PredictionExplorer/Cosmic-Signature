"use strict";

// Tests V3-specific bidding behavior shared by ETH and CST bid entry points.

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { generateRandomUInt32, waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getLatestBlockTimestamp,
	blockTimestampOfReceipt,
	activateCurrentRound,
	findParsedEvent,
	mineAtOrAfter,
	setNextBlockTimeToAtLeast,
} = require("../src/V2UpgradeTestHelpers.js");
const {
	DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER,
	deployV1CompleteRoundZeroAndUpgradeToV2AndV3,
	getV3CstBidPrice,
	getV3CstDutchAuctionDuration,
	tryIncreaseValueExponentially,
	tryReduceValueExponentially,
} = require("../src/V3UpgradeTestHelpers.js");

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

/** Executes an ETH bid at exactly the given block timestamp, paying the exact bid price. */
async function bidWithEthAt(game_, bidderSigner_, timeStamp_) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	expect(timeStamp_).greaterThan(latestTimeStamp_);
	const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - latestTimeStamp_);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	const receipt_ = await waitForTransactionReceipt(
		game_.connect(bidderSigner_).bidWithEth(-1n, "", 0n, { value: ethBidPrice_, })
	);
	expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
}

describe("CosmicSignatureGameV3-Bidding", function () {
	it("adjusts the CST decline multiplier for every bid entry point, including zero-price CST bids after long waits", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
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
			const waitDuration_ = (3n + BigInt(generateRandomUInt32() % 19)) * 86_400n;
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
	});

	it("advances CST auction elapsed time and price through long bid-free waits without changing its total duration", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
		await activateCurrentRound(game_, contracts_.ownerSigner);
		await bidWithEthAt(game_, contracts_.signers[1], (await getLatestBlockTimestamp()) + 10n);
		const auction_ = await readCstAuctionState(game_);
		const duration_ = await assertCstAuctionDurations(game_);

		// The price reaches zero before the premium window, so these quotes equal the premium-free price.
		expect(auction_.beginningTimeStamp + duration_).lessThan((await game_.mainPrizeTime()) - (await game_.getRoundLateBidDuration()));
		for (const elapsed_ of [1n, duration_ / 2n, duration_ - 1n, duration_, duration_ + (3n + BigInt(generateRandomUInt32() % 19)) * 86_400n]) {
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
		await mineAtOrAfter((await getLatestBlockTimestamp()) + 10n * 86_400n);
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
		await mineAtOrAfter((await getLatestBlockTimestamp()) + 7n * 86_400n);
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
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2AndV3();
		const game_ = contracts_.cosmicSignatureGameV3Proxy;
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
	});
});
