"use strict";

const { describe, it } = require("mocha");
const hre = require("hardhat");
const { activateCurrentRound, assertDefaultV2Initialization, findParsedEvent, mineAtOrAfter, getLatestBlockTimestamp } = require("../src/V2UpgradeTestHelpers.js");
const { expect } = require("chai");
const { SECONDS_PER_DAY } = require("../../src/CosmicSignatureConstants.js");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { testAcrossGameVersions, bidAndClaimMainPrize, finishGameRound } = require("../src/GameRoundTestHelpers.js");

async function deployDonationMocks(contracts_) {
	const erc20Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc20", contracts_.deployerSigner);
	const erc20_ = await erc20Factory_.deploy();
	await erc20_.waitForDeployment();
	const erc20Address_ = await erc20_.getAddress();
	const erc721Factory_ = await hre.ethers.getContractFactory("FuzzTestMockErc721", contracts_.deployerSigner);
	const erc721_ = await erc721Factory_.deploy();
	await erc721_.waitForDeployment();
	const erc721Address_ = await erc721_.getAddress();
	return { erc20_, erc20Address_, erc721_, erc721Address_ };
}

async function assertV2BidPlaced(receipt_, game_, bidder_, expectedEthPrice_, expectedCstPrice_, expectedRandomWalkNftId_, expectedBidCstRewardAmount_) {
	const parsed_ = findParsedEvent(receipt_, game_, "BidPlaced");
	expect(parsed_, "BidPlaced must be emitted").not.undefined;
	expect(parsed_.args.roundNum).equal(await game_.roundNum());
	expect(parsed_.args.lastBidderAddress).equal(bidder_.address);
	expect(parsed_.args.paidEthPrice).equal(expectedEthPrice_);
	expect(parsed_.args.paidCstPrice).equal(expectedCstPrice_);
	expect(parsed_.args.randomWalkNftId).equal(expectedRandomWalkNftId_);
	expect(
		parsed_.args.bidCstRewardAmount,
		"expected bid CST reward assumes the bid transaction mines one second after the pre-bid view"
	).equal(expectedBidCstRewardAmount_);
	expect(parsed_.args.cstDutchAuctionDuration).equal(await game_.cstDutchAuctionDuration());
	expect(parsed_.args.mainPrizeTime).equal(await game_.mainPrizeTime());
}

const DURATION_DRIFT_ITERATIONS = 50;

async function placeEthBid(game_, bidder_) {
	const price_ = await game_.getNextEthBidPrice();
	await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", 0n, { value: price_ }));
	return price_;
}

describe("CosmicSignatureGameV2-Bidding", function () {
	it("halves the V2 ETH Dutch auction ending price after the auction has elapsed", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const endingBidPriceDivisorBefore_ = await game_.ethDutchAuctionEndingBidPriceDivisor();
			const durationDivisorBefore_ = await game_.ethDutchAuctionDurationDivisor();
			const [ethDutchAuctionDuration_,] = await game_.getEthDutchAuctionDurations();
			const halveTimeStamp_ = (await game_.roundActivationTime()) + ethDutchAuctionDuration_ + 1n;
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(halveTimeStamp_),]);

			await expect(game_.connect(contracts_.ownerSigner).halveEthDutchAuctionEndingBidPrice())
				.emit(game_, "EthDutchAuctionEndingBidPriceDivisorChanged")
				.withArgs(endingBidPriceDivisorBefore_ * 2n);

			expect(await game_.ethDutchAuctionEndingBidPriceDivisor()).equal(endingBidPriceDivisorBefore_ * 2n);
			const durationDivisorAfter_ = await game_.ethDutchAuctionDurationDivisor();
			expect(durationDivisorAfter_).greaterThan(0n);
			expect(durationDivisorAfter_).lessThanOrEqual(durationDivisorBefore_);
			await bidAndClaimMainPrize(contracts_, game_);
		}, 2, 2);
	});

	it("documents changeDivisor greater than duration as a no-op reduction boundary", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionDuration(10n));
			await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionDurationChangeDivisor(100n));
			await activateCurrentRound(game_, contracts_.ownerSigner);

			const bidder_ = contracts_.signers[2];
			const before_ = await game_.cstDutchAuctionDuration();
			const ethPrice_ = await game_.getNextEthBidPrice();
			await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "boundary", 0n, { value: ethPrice_ }));
			const after_ = await game_.cstDutchAuctionDuration();
			expect(after_).equal(before_);
			await finishGameRound(contracts_, game_);
		}, 2, 2);
	});

	it("documents zero-price CST bids minting only the computed reward", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);

			const bidder_ = contracts_.signers[2];
			await mineAtOrAfter((await getLatestBlockTimestamp()) + 60n);
			await placeEthBid(game_, bidder_);

			const duration_ = await game_.cstDutchAuctionDuration();
			await mineAtOrAfter((await getLatestBlockTimestamp()) + duration_ + 1n);
			expect(await game_.getNextCstBidPrice()).equal(0n);

			const reward_ = await game_.getBidCstRewardAmountAdvanced(1n);
			expect(reward_).greaterThan(0n);
			const balanceBefore_ = await contracts_.cosmicSignatureToken.balanceOf(bidder_.address);
			const receipt_ = await waitForTransactionReceipt(
				game_.connect(bidder_).bidWithCst(hre.ethers.MaxUint256, "free cst bid", 0n)
			);
			const parsed_ = findParsedEvent(receipt_, game_, "BidPlaced");
			expect(parsed_).not.equal(undefined);
			expect(parsed_.args.paidCstPrice).equal(0n);
			expect(parsed_.args.bidCstRewardAmount).equal(reward_);
			expect(await contracts_.cosmicSignatureToken.balanceOf(bidder_.address)).equal(balanceBefore_ + reward_);
			expect(await game_.lastCstBidderAddress()).equal(bidder_.address);
			await finishGameRound(contracts_, game_);
		}, 2, 2);
	});

	it("ETH bids can abruptly reduce the current CST bid price to zero near the duration boundary", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);

			const bidder1_ = contracts_.signers[2];
			const bidder2_ = contracts_.signers[3];
			await mineAtOrAfter((await getLatestBlockTimestamp()) + 60n);
			await placeEthBid(game_, bidder1_);

			const duration_ = await game_.cstDutchAuctionDuration();
			await mineAtOrAfter((await getLatestBlockTimestamp()) + duration_ - 60n);
			const priceBefore_ = await game_.getNextCstBidPrice();
			expect(priceBefore_).greaterThan(0n);
			const priceBeforeAhead_ = await game_.getNextCstBidPriceAdvanced(30n);
			expect(priceBeforeAhead_).greaterThan(0n);
			expect(priceBeforeAhead_).lessThan(priceBefore_);

			await placeEthBid(game_, bidder2_);
			const priceAfter_ = await game_.getNextCstBidPrice();
			expect(priceAfter_).equal(0n);
			await finishGameRound(contracts_, game_);
		}, 2, 2);
	});

	it("cstDutchAuctionDuration drifts down on ETH bids and up on CST bids", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);

			const initialDuration_ = await game_.cstDutchAuctionDuration();
			const durationStack_ = [initialDuration_];
			let prevDuration_ = initialDuration_;
			for (let counter_ = 0; counter_ < DURATION_DRIFT_ITERATIONS; ++ counter_) {
				await mineAtOrAfter((await getLatestBlockTimestamp()) + 60n);
				await placeEthBid(game_, contracts_.signers[2 + counter_ % (contracts_.signers.length - 2)]);
				const newDuration_ = await game_.cstDutchAuctionDuration();
				expect(newDuration_).lessThan(prevDuration_);
				durationStack_.push(newDuration_);
				prevDuration_ = newDuration_;
			}

			for (let counter_ = 0; counter_ < DURATION_DRIFT_ITERATIONS; ++ counter_) {
				await mineAtOrAfter((await getLatestBlockTimestamp()) + prevDuration_ + 1n);
				const price_ = await game_.getNextCstBidPrice();
				const balance_ = await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[2].address);
				expect(balance_).gte(price_);
				await waitForTransactionReceipt(
					game_.connect(contracts_.signers[2]).bidWithCst(hre.ethers.MaxUint256, "duration up", 0n)
				);
				const newDuration_ = await game_.cstDutchAuctionDuration();
				expect(newDuration_).greaterThan(prevDuration_);
				durationStack_.pop();
				expect(newDuration_).equal(durationStack_[durationStack_.length - 1]);
				prevDuration_ = newDuration_;
			}
			await finishGameRound(contracts_, game_);
		}, 2, 2);
	});

	it("covers V2 pre-bid round-state and bidding guard paths", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			expect(await game_.getDurationUntilRoundActivation()).greaterThan(0n);

			// // [Comment-202610021]
			// // Do not assert indeterminate, irrelevant values in contract-only checks.
			// // Before the first bid, Comment-202501022 applies to `mainPrizeTime`, `nextEthBidPrice`,
			// // CST Dutch auction elapsed duration, next CST bid price, and V3+ bid CST reward getters.
			// // The next ETH bid price getters remain valid before the first bid and round activation.
			// // CST Dutch auction beginning bid price and raw champion durations have their own validity conditions.
			// // Contract/model equality and upgrade storage-preservation checks may compare these values.
			// // [/Comment-202610021]
			// expect(await game_.getDurationUntilMainPrize()).lessThan(0n);

			await expect(game_.connect(contracts_.signers[2]).bidWithEth(-1n, "inactive", 0n, { value: 10n ** 18n }))
				.revertedWithCustomError(game_, "RoundIsInactive");

			await activateCurrentRound(game_, contracts_.ownerSigner);
			await mineAtOrAfter(await game_.roundActivationTime());
			expect(await game_.getDurationUntilRoundActivation()).lessThanOrEqual(0n);

			await expect(game_.connect(contracts_.signers[2]).halveEthDutchAuctionEndingBidPrice())
				.revertedWithCustomError(game_, "OwnableUnauthorizedAccount");
			await expect(game_.connect(contracts_.ownerSigner).halveEthDutchAuctionEndingBidPrice())
				.revertedWithCustomError(game_, "InvalidOperationInCurrentState");
			await expect(game_.connect(contracts_.signers[2]).bidWithCst(hre.ethers.MaxUint256, "first cst", 0n))
				.revertedWithCustomError(game_, "WrongBidType");

			const bidder_ = contracts_.signers[2];
			const ethPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
			await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "first eth", 0n, { value: ethPrice_ }));
			await expect(game_.connect(contracts_.ownerSigner).halveEthDutchAuctionEndingBidPrice())
				.revertedWithCustomError(game_, "BidHasBeenPlacedInCurrentRound");

			const cstBidPrice_ = await game_.getNextCstBidPriceAdvanced(1n);
			expect(cstBidPrice_).greaterThan(0n);
			await expect(game_.connect(contracts_.signers[3]).bidWithCst(cstBidPrice_ - 1n, "price limit", 0n))
				.revertedWithCustomError(game_, "InsufficientReceivedBidAmount");
			expect(await game_.getDurationUntilMainPrize()).greaterThan(0n);
			await finishGameRound(contracts_, game_);
		}, 2, 2);
	});

	it("executes all V2 bid entry points and completes a V2 round", async function () {
		let isFirstV2Round_ = true;
		await testAcrossGameVersions(async (contracts_, game_, roundNum_) => {
			if (isFirstV2Round_) {
				await assertDefaultV2Initialization(game_);
				isFirstV2Round_ = false;
			}
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const [initialCstDuration_, /* initialCstElapsedDuration_ */] = await game_.getCstDutchAuctionDurations();
			expect(initialCstDuration_).greaterThan(0n);

			// // Comment-202610021 applies.
			// expect(initialCstElapsedDuration_).greaterThanOrEqual(0n);

			const mocks_ = await deployDonationMocks(contracts_);
			for (const signer_ of contracts_.signers.slice(2, 8)) {
				await waitForTransactionReceipt(mocks_.erc20_.mint(signer_.address, 1_000_000n * 10n ** 18n));
				await waitForTransactionReceipt(
					mocks_.erc20_.connect(signer_).approve(contracts_.prizesWalletAddress, hre.ethers.MaxUint256)
				);
				await waitForTransactionReceipt(
					mocks_.erc721_.connect(signer_).setApprovalForAll(contracts_.prizesWalletAddress, true)
				);
			}

			await mineAtOrAfter((await getLatestBlockTimestamp()) + 60n);
			let bidder_ = contracts_.signers[2];
			// The first ETH bid price decays with block time; coverage instrumentation can make the tx mine one second later.
			let ethPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
			let expectedBidCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
			let receipt_ = await waitForTransactionReceipt(
				game_.connect(bidder_).bidWithEth(-1n, "v2 eth", 0n, { value: ethPrice_ })
			);
			await assertV2BidPlaced(receipt_, game_, bidder_, BigInt(ethPrice_), -1n, -1n, expectedBidCstReward_);
			{
				// const spent_ = await game_.getBidderTotalSpentAmounts(await game_.roundNum(), bidder_.address);
				const spent_ = await game_.biddersInfo(await game_.roundNum(), bidder_.address);
				expect(spent_[0]).greaterThan(0n);
				expect(spent_[1]).equal(0n);
			}

			await mineAtOrAfter((await getLatestBlockTimestamp()) + 60n);
			bidder_ = contracts_.signers[3];
			ethPrice_ = await game_.getNextEthBidPrice();
			expectedBidCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
			receipt_ = await waitForTransactionReceipt(
				bidder_.sendTransaction({ to: contracts_.cosmicSignatureGameProxyAddress, value: ethPrice_ })
			);
			await assertV2BidPlaced(receipt_, game_, bidder_, BigInt(ethPrice_), -1n, -1n, expectedBidCstReward_);

			await mineAtOrAfter((await getLatestBlockTimestamp()) + 60n);
			bidder_ = contracts_.signers[4];
			ethPrice_ = await game_.getNextEthBidPrice();
			expectedBidCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
			receipt_ = await waitForTransactionReceipt(
				game_.connect(bidder_).bidWithEthAndDonateToken(
					-1n,
					"v2 eth token",
					0n,
					mocks_.erc20Address_,
					12345n,
					{ value: ethPrice_ }
				)
			);
			await assertV2BidPlaced(receipt_, game_, bidder_, BigInt(ethPrice_), -1n, -1n, expectedBidCstReward_);

			await mineAtOrAfter((await getLatestBlockTimestamp()) + 60n);
			bidder_ = contracts_.signers[5];
			const donatedNft1_ = await mocks_.erc721_.mint.staticCall(bidder_.address);
			await waitForTransactionReceipt(mocks_.erc721_.mint(bidder_.address));
			ethPrice_ = await game_.getNextEthBidPrice();
			expectedBidCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
			receipt_ = await waitForTransactionReceipt(
				game_.connect(bidder_).bidWithEthAndDonateNft(
					-1n,
					"v2 eth nft",
					0n,
					mocks_.erc721Address_,
					donatedNft1_,
					{ value: ethPrice_ }
				)
			);
			await assertV2BidPlaced(receipt_, game_, bidder_, BigInt(ethPrice_), -1n, -1n, expectedBidCstReward_);

			await expect(
				game_.connect(contracts_.signers[6]).bidWithEth(-1n, "min too high", hre.ethers.MaxUint256, { value: 0n })
			).revertedWithCustomError(game_, "BidCstRewardAmountMinLimitNotReached");

			await mineAtOrAfter((await getLatestBlockTimestamp()) + 60n);
			bidder_ = contracts_.signers[6];
			let randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
			await waitForTransactionReceipt(contracts_.randomWalkNft.connect(bidder_).mint({ value: randomWalkNftMintPrice_ }));
			const randomWalkNftId_ = (await contracts_.randomWalkNft.totalSupply()) - 1n;
			ethPrice_ = await game_.getNextEthBidPrice();
			const ethPlusRandomWalkNftPrice_ = await game_.getEthPlusRandomWalkNftBidPrice(ethPrice_);
			expectedBidCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
			receipt_ = await waitForTransactionReceipt(
				game_.connect(bidder_).bidWithEth(randomWalkNftId_, "v2 rw", 0n, { value: ethPlusRandomWalkNftPrice_ })
			);
			await assertV2BidPlaced(receipt_, game_, bidder_, BigInt(ethPlusRandomWalkNftPrice_), -1n, randomWalkNftId_, expectedBidCstReward_);
			ethPrice_ = await game_.getNextEthBidPrice();
			await expect(
				game_.connect(bidder_).bidWithEth(
					randomWalkNftId_,
					"v2 rw reuse",
					0n,
					{ value: await game_.getEthPlusRandomWalkNftBidPrice(ethPrice_) }
				)
			).revertedWithCustomError(game_, "UsedRandomWalkNft");

			await mineAtOrAfter((await getLatestBlockTimestamp()) + SECONDS_PER_DAY);
			bidder_ = contracts_.signers[2];
			let cstPrice_ = await game_.getNextCstBidPrice();
			expectedBidCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
			// console.info("%s", `202606251 ${hre.ethers.formatEther(expectedBidCstReward_)}`);
			receipt_ = await waitForTransactionReceipt(
				game_.connect(bidder_).bidWithCst(hre.ethers.MaxUint256, "v2 cst", 0n)
			);
			await assertV2BidPlaced(receipt_, game_, bidder_, -1n, BigInt(cstPrice_), -1n, expectedBidCstReward_);

			await mineAtOrAfter((await getLatestBlockTimestamp()) + (await game_.cstDutchAuctionDuration()) + 1n);
			bidder_ = contracts_.signers[2];
			cstPrice_ = await game_.getNextCstBidPrice();
			expectedBidCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
			receipt_ = await waitForTransactionReceipt(
				game_.connect(bidder_).bidWithCstAndDonateToken(
					hre.ethers.MaxUint256,
					"v2 cst token",
					0n,
					mocks_.erc20Address_,
					222n
				)
			);
			await assertV2BidPlaced(receipt_, game_, bidder_, -1n, BigInt(cstPrice_), -1n, expectedBidCstReward_);

			await mineAtOrAfter((await getLatestBlockTimestamp()) + (await game_.cstDutchAuctionDuration()) + 1n);
			bidder_ = contracts_.signers[2];
			const donatedNft2_ = await mocks_.erc721_.mint.staticCall(bidder_.address);
			await waitForTransactionReceipt(mocks_.erc721_.mint(bidder_.address));
			cstPrice_ = await game_.getNextCstBidPrice();
			expectedBidCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
			receipt_ = await waitForTransactionReceipt(
				game_.connect(bidder_).bidWithCstAndDonateNft(
					hre.ethers.MaxUint256,
					"v2 cst nft",
					0n,
					mocks_.erc721Address_,
					donatedNft2_
				)
			);
			await assertV2BidPlaced(receipt_, game_, bidder_, -1n, BigInt(cstPrice_), -1n, expectedBidCstReward_);
			expect(await game_.getBidCstRewardAmount()).equal(0n);
			expect(await game_.getBidCstRewardAmountAdvanced(0n)).equal(0n);

			const mainPrizeTime_ = await game_.mainPrizeTime();
			await mineAtOrAfter(mainPrizeTime_);
			receipt_ = await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());
			expect(findParsedEvent(receipt_, game_, "MainPrizeClaimed"), "MainPrizeClaimed must be emitted").not.undefined;
			expect(await game_.roundNum()).equal(roundNum_ + 1n);
			expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
		}, 2, 2);
	});

	// // This tests Comment-202607016.
	// it("raises the V2 next-round first CST bid price when the owner raises the CST bid price minimum", async function () {
	// 	const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2();
	// 	const game_ = contracts_.cosmicSignatureGameV2Proxy;
	// 	const newMinLimit_ = 300n * 10n ** 18n;
	// 	await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setCstDutchAuctionBeginningBidPriceMinLimit(newMinLimit_));
	// 	expect(await game_.cstDutchAuctionBeginningBidPriceMinLimit()).equal(newMinLimit_);
	// 	expect(await game_.nextRoundFirstCstDutchAuctionBeginningBidPrice()).equal(newMinLimit_);
	// 	
	// 	await activateCurrentRound(game_, contracts_.ownerSigner);
	// 	const bidder_ = contracts_.signers[2];
	// 	const ethPrice_ = await game_.getNextEthBidPrice();
	// 	await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "raised cst min", 0n, {value: ethPrice_,}));
	// 	expect(await game_.getNextCstBidPrice()).equal(newMinLimit_);
	// });
});
