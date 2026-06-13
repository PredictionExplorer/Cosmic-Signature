"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	activateCurrentRound,
	assertDefaultV2Initialization,
	deployV1CompleteRoundZeroAndUpgradeToV2,
	findParsedEvent,
	getLatestBlockTimestamp,
	mineAt,
} = require("../src/V2UpgradeTestHelpers.js");

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
	expect(parsed_.args.bidCstRewardAmount).gte(expectedBidCstRewardAmount_);
	expect(parsed_.args.cstDutchAuctionDuration).equal(await game_.cstDutchAuctionDuration());
	expect(parsed_.args.mainPrizeTime).equal(await game_.mainPrizeTime());
}

describe("CosmicSignatureGameV2-Gameplay", function () {
	it("executes all V2 bid entry points and completes a V2 round", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;
		await assertDefaultV2Initialization(game_);
		await activateCurrentRound(game_, contracts_.ownerSigner);

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

		await mineAt((await getLatestBlockTimestamp()) + 60n);
		let bidder_ = contracts_.signers[2];
		let ethPrice_ = await game_.getNextEthBidPrice();
		// todo-ai-1 Here and in similar cases, call `game_.getBidCstRewardAmountAdvanced(1n)` instead,
		// todo-ai-1 then in `assertV2BidPlaced`, assert that the actual CST reward equals `expectedBidCstRewardAmount_`.
		// todo-ai-1 Strictly speaking, it appears that that assert will have a chance to fail, especially if the system is under stress, but it's OK.
		let expectedReward_ = await game_.getBidCstRewardAmount();
		let receipt_ = await waitForTransactionReceipt(
			game_.connect(bidder_).bidWithEth(-1n, "v2 eth", 0n, { value: ethPrice_ })
		);
		await assertV2BidPlaced(receipt_, game_, bidder_, BigInt(ethPrice_), -1n, -1n, expectedReward_);

		await mineAt((await getLatestBlockTimestamp()) + 60n);
		bidder_ = contracts_.signers[3];
		ethPrice_ = await game_.getNextEthBidPrice();
		expectedReward_ = await game_.getBidCstRewardAmount();
		receipt_ = await waitForTransactionReceipt(
			bidder_.sendTransaction({ to: contracts_.cosmicSignatureGameProxyAddress, value: ethPrice_ })
		);
		await assertV2BidPlaced(receipt_, game_, bidder_, BigInt(ethPrice_), -1n, -1n, expectedReward_);

		await mineAt((await getLatestBlockTimestamp()) + 60n);
		bidder_ = contracts_.signers[4];
		ethPrice_ = await game_.getNextEthBidPrice();
		expectedReward_ = await game_.getBidCstRewardAmount();
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
		await assertV2BidPlaced(receipt_, game_, bidder_, BigInt(ethPrice_), -1n, -1n, expectedReward_);

		await mineAt((await getLatestBlockTimestamp()) + 60n);
		bidder_ = contracts_.signers[5];
		const donatedNft1_ = await mocks_.erc721_.mint.staticCall(bidder_.address);
		await waitForTransactionReceipt(mocks_.erc721_.mint(bidder_.address));
		ethPrice_ = await game_.getNextEthBidPrice();
		expectedReward_ = await game_.getBidCstRewardAmount();
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
		await assertV2BidPlaced(receipt_, game_, bidder_, BigInt(ethPrice_), -1n, -1n, expectedReward_);

		await expect(
			game_.connect(contracts_.signers[6]).bidWithEth(-1n, "min too high", hre.ethers.MaxUint256, { value: 0n })
		).revertedWithCustomError(game_, "BidCstRewardAmountMinLimitNotReached");

		await mineAt((await getLatestBlockTimestamp()) + 24n * 60n * 60n);
		bidder_ = contracts_.signers[2];
		let cstPrice_ = await game_.getNextCstBidPrice();
		expectedReward_ = await game_.getBidCstRewardAmount();
		// console.info("%s", `202606251 ${hre.ethers.formatEther(expectedReward_)}`);
		receipt_ = await waitForTransactionReceipt(
			game_.connect(bidder_).bidWithCst(hre.ethers.MaxUint256, "v2 cst", 0n)
		);
		await assertV2BidPlaced(receipt_, game_, bidder_, -1n, BigInt(cstPrice_), -1n, expectedReward_);

		await mineAt((await getLatestBlockTimestamp()) + (await game_.cstDutchAuctionDuration()) + 1n);
		bidder_ = contracts_.signers[2];
		cstPrice_ = await game_.getNextCstBidPrice();
		expectedReward_ = await game_.getBidCstRewardAmount();
		receipt_ = await waitForTransactionReceipt(
			game_.connect(bidder_).bidWithCstAndDonateToken(
				hre.ethers.MaxUint256,
				"v2 cst token",
				0n,
				mocks_.erc20Address_,
				222n
			)
		);
		await assertV2BidPlaced(receipt_, game_, bidder_, -1n, BigInt(cstPrice_), -1n, expectedReward_);

		await mineAt((await getLatestBlockTimestamp()) + (await game_.cstDutchAuctionDuration()) + 1n);
		bidder_ = contracts_.signers[2];
		const donatedNft2_ = await mocks_.erc721_.mint.staticCall(bidder_.address);
		await waitForTransactionReceipt(mocks_.erc721_.mint(bidder_.address));
		cstPrice_ = await game_.getNextCstBidPrice();
		expectedReward_ = await game_.getBidCstRewardAmount();
		receipt_ = await waitForTransactionReceipt(
			game_.connect(bidder_).bidWithCstAndDonateNft(
				hre.ethers.MaxUint256,
				"v2 cst nft",
				0n,
				mocks_.erc721Address_,
				donatedNft2_
			)
		);
		await assertV2BidPlaced(receipt_, game_, bidder_, -1n, BigInt(cstPrice_), -1n, expectedReward_);

		// todo-ai-1 Before the bid transaction, query `expectedReward_` by calling `game_.getBidCstRewardAmountAdvanced(1n)`
		// todo-ai-1 and here assert that it equals both of these values.
		expect(await game_.getBidCstRewardAmount()).equal(await game_.getBidCstRewardAmountAdvanced(0n));

		const mainPrizeTime_ = await game_.mainPrizeTime();
		await mineAt(mainPrizeTime_);
		receipt_ = await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());
		expect(findParsedEvent(receipt_, game_, "MainPrizeClaimed"), "MainPrizeClaimed must be emitted").not.undefined;
		expect(await game_.roundNum()).equal(2n);
		expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
	});
});
