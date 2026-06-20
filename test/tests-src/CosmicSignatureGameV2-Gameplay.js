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
	mineAtOrAfter,
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
	expect(
		parsed_.args.bidCstRewardAmount,
		"expected CST reward assumes the bid transaction mines one second after the pre-bid view"
	).equal(expectedBidCstRewardAmount_);
	expect(parsed_.args.cstDutchAuctionDuration).equal(await game_.cstDutchAuctionDuration());
	expect(parsed_.args.mainPrizeTime).equal(await game_.mainPrizeTime());
}

describe("CosmicSignatureGameV2-Gameplay", function () {
	it("executes all V2 bid entry points and completes a V2 round", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;
		await assertDefaultV2Initialization(game_);
		expect(await game_.numEthDonationWithInfoRecords()).equal(0n);
		await waitForTransactionReceipt(game_.connect(contracts_.signers[2]).donateEthWithInfo("v2 info", { value: 123n }));
		expect(await game_.numEthDonationWithInfoRecords()).equal(1n);
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const [initialCstDuration_, initialCstElapsedDuration_] = await game_.getCstDutchAuctionDurations();
		expect(initialCstDuration_).greaterThan(0n);
		expect(initialCstElapsedDuration_).greaterThanOrEqual(0n);

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
		let expectedCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
		let receipt_ = await waitForTransactionReceipt(
			game_.connect(bidder_).bidWithEth(-1n, "v2 eth", 0n, { value: ethPrice_ })
		);
		await assertV2BidPlaced(receipt_, game_, bidder_, BigInt(ethPrice_), -1n, -1n, expectedCstReward_);
		{
			const spent_ = await game_.getBidderTotalSpentAmounts(await game_.roundNum(), bidder_.address);
			expect(spent_[0]).greaterThan(0n);
			expect(spent_[1]).equal(0n);
		}

		await mineAtOrAfter((await getLatestBlockTimestamp()) + 60n);
		bidder_ = contracts_.signers[3];
		ethPrice_ = await game_.getNextEthBidPrice();
		expectedCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
		receipt_ = await waitForTransactionReceipt(
			bidder_.sendTransaction({ to: contracts_.cosmicSignatureGameProxyAddress, value: ethPrice_ })
		);
		await assertV2BidPlaced(receipt_, game_, bidder_, BigInt(ethPrice_), -1n, -1n, expectedCstReward_);

		await mineAtOrAfter((await getLatestBlockTimestamp()) + 60n);
		bidder_ = contracts_.signers[4];
		ethPrice_ = await game_.getNextEthBidPrice();
		expectedCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
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
		await assertV2BidPlaced(receipt_, game_, bidder_, BigInt(ethPrice_), -1n, -1n, expectedCstReward_);

		await mineAtOrAfter((await getLatestBlockTimestamp()) + 60n);
		bidder_ = contracts_.signers[5];
		const donatedNft1_ = await mocks_.erc721_.mint.staticCall(bidder_.address);
		await waitForTransactionReceipt(mocks_.erc721_.mint(bidder_.address));
		ethPrice_ = await game_.getNextEthBidPrice();
		expectedCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
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
		await assertV2BidPlaced(receipt_, game_, bidder_, BigInt(ethPrice_), -1n, -1n, expectedCstReward_);

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
		expectedCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
		receipt_ = await waitForTransactionReceipt(
			game_.connect(bidder_).bidWithEth(randomWalkNftId_, "v2 rw", 0n, { value: ethPlusRandomWalkNftPrice_ })
		);
		await assertV2BidPlaced(receipt_, game_, bidder_, BigInt(ethPlusRandomWalkNftPrice_), -1n, randomWalkNftId_, expectedCstReward_);
		ethPrice_ = await game_.getNextEthBidPrice();
		await expect(
			game_.connect(bidder_).bidWithEth(
				randomWalkNftId_,
				"v2 rw reuse",
				0n,
				{ value: await game_.getEthPlusRandomWalkNftBidPrice(ethPrice_) }
			)
		).revertedWithCustomError(game_, "UsedRandomWalkNft");

		await mineAtOrAfter((await getLatestBlockTimestamp()) + 24n * 60n * 60n);
		bidder_ = contracts_.signers[2];
		let cstPrice_ = await game_.getNextCstBidPrice();
		expectedCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
		// console.info("%s", `202606251 ${hre.ethers.formatEther(expectedCstReward_)}`);
		receipt_ = await waitForTransactionReceipt(
			game_.connect(bidder_).bidWithCst(hre.ethers.MaxUint256, "v2 cst", 0n)
		);
		await assertV2BidPlaced(receipt_, game_, bidder_, -1n, BigInt(cstPrice_), -1n, expectedCstReward_);

		await mineAtOrAfter((await getLatestBlockTimestamp()) + (await game_.cstDutchAuctionDuration()) + 1n);
		bidder_ = contracts_.signers[2];
		cstPrice_ = await game_.getNextCstBidPrice();
		expectedCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
		receipt_ = await waitForTransactionReceipt(
			game_.connect(bidder_).bidWithCstAndDonateToken(
				hre.ethers.MaxUint256,
				"v2 cst token",
				0n,
				mocks_.erc20Address_,
				222n
			)
		);
		await assertV2BidPlaced(receipt_, game_, bidder_, -1n, BigInt(cstPrice_), -1n, expectedCstReward_);

		await mineAtOrAfter((await getLatestBlockTimestamp()) + (await game_.cstDutchAuctionDuration()) + 1n);
		bidder_ = contracts_.signers[2];
		const donatedNft2_ = await mocks_.erc721_.mint.staticCall(bidder_.address);
		await waitForTransactionReceipt(mocks_.erc721_.mint(bidder_.address));
		cstPrice_ = await game_.getNextCstBidPrice();
		expectedCstReward_ = await game_.getBidCstRewardAmountAdvanced(1n);
		receipt_ = await waitForTransactionReceipt(
			game_.connect(bidder_).bidWithCstAndDonateNft(
				hre.ethers.MaxUint256,
				"v2 cst nft",
				0n,
				mocks_.erc721Address_,
				donatedNft2_
			)
		);
		await assertV2BidPlaced(receipt_, game_, bidder_, -1n, BigInt(cstPrice_), -1n, expectedCstReward_);
		expect(await game_.getBidCstRewardAmount()).equal(0n);
		expect(await game_.getBidCstRewardAmountAdvanced(0n)).equal(0n);

		const mainPrizeTime_ = await game_.mainPrizeTime();
		await mineAtOrAfter(mainPrizeTime_);
		receipt_ = await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());
		expect(findParsedEvent(receipt_, game_, "MainPrizeClaimed"), "MainPrizeClaimed must be emitted").not.undefined;
		expect(await game_.roundNum()).equal(2n);
		expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
	});
});
