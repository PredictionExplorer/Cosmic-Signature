"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const {
	activateCurrentRound,
	deployV1CompleteRoundZeroAndUpgradeToV2,
	getLatestBlockTimestamp,
	mineAtOrAfter,
} = require("../src/V2UpgradeTestHelpers.js");

async function deployContract(contractName_, signer_, ...args_) {
	const factory_ = await hre.ethers.getContractFactory(contractName_, signer_);
	const contract_ = await factory_.deploy(...args_);
	await contract_.waitForDeployment();
	return contract_;
}

describe("CoverageGaps", function () {
	it("covers RandomWalkNFT view helpers, guard failures, and rejected ETH transfers", async function () {
		const [deployer_, owner_, minter_, other_] = await hre.ethers.getSigners();
		const randomWalkNft_ = await deployContract("RandomWalkNFTForCoverage", deployer_);
		const rejectingCaller_ = await deployContract("RandomWalkNFTRevertingCaller", deployer_);

		await expect(randomWalkNft_.connect(other_).setBaseURI("ipfs://random-walk/"))
			.revertedWithCustomError(randomWalkNft_, "OwnableUnauthorizedAccount");
		await waitForTransactionReceipt(randomWalkNft_.setBaseURI("ipfs://random-walk/"));

		expect(await randomWalkNft_.timeUntilSale()).equal(0n);
		const futureSaleTime_ = (await getLatestBlockTimestamp()) + 1000n;
		await waitForTransactionReceipt(randomWalkNft_.setSaleTimeForTesting(futureSaleTime_));
		expect(await randomWalkNft_.timeUntilSale()).greaterThan(0n);
		await expect(randomWalkNft_.connect(minter_).mint({ value: await randomWalkNft_.getMintPrice() }))
			.revertedWith("The sale is not open yet.");
		await waitForTransactionReceipt(randomWalkNft_.setSaleTimeForTesting(1n));

		const mintPrice_ = await randomWalkNft_.getMintPrice();
		await expect(randomWalkNft_.connect(minter_).mint({ value: mintPrice_ - 1n }))
			.revertedWith("The value submitted with this transaction is too low.");
		await waitForTransactionReceipt(randomWalkNft_.connect(minter_).mint({ value: mintPrice_ }));
		expect(await randomWalkNft_.tokenURI(0n)).equal("ipfs://random-walk/0");

		await expect(randomWalkNft_.connect(other_).setTokenName(0n, "not owner"))
			.revertedWith("setTokenName caller is not owner nor approved");
		await expect(randomWalkNft_.connect(minter_).setTokenName(0n, "x".repeat(33)))
			.revertedWith("Token name is too long.");
		await waitForTransactionReceipt(randomWalkNft_.connect(minter_).setTokenName(0n, "covered"));
		expect(await randomWalkNft_.tokenNames(0n)).equal("covered");

		expect(await randomWalkNft_.walletOfOwner(other_.address)).deep.equal([]);
		expect(await randomWalkNft_.walletOfOwner(minter_.address)).deep.equal([0n]);
		expect(await randomWalkNft_.seedsOfOwner(other_.address)).deep.equal([]);
		expect(await randomWalkNft_.seedsOfOwner(minter_.address)).deep.equal([await randomWalkNft_.seeds(0n)]);

		expect(await randomWalkNft_.timeUntilWithdrawal()).greaterThan(0n);
		await expect(randomWalkNft_.connect(other_).withdraw()).revertedWith("Only last minter can withdraw.");
		await expect(randomWalkNft_.connect(minter_).withdraw()).revertedWith("Not enough time has elapsed.");
		await waitForTransactionReceipt(randomWalkNft_.setLastMintTimeForTesting(1n));
		expect(await randomWalkNft_.timeUntilWithdrawal()).equal(0n);
		await waitForTransactionReceipt(randomWalkNft_.connect(minter_).withdraw());

		await waitForTransactionReceipt(rejectingCaller_.setEthDepositAcceptanceModeCode(1n));
		const refundFailPrice_ = await randomWalkNft_.getMintPrice();
		await expect(rejectingCaller_.mint(randomWalkNft_, { value: refundFailPrice_ + 1n }))
			.revertedWith("Transfer failed.");

		await waitForTransactionReceipt(rejectingCaller_.setEthDepositAcceptanceModeCode(0n));
		const withdrawFailPrice_ = await randomWalkNft_.getMintPrice();
		await waitForTransactionReceipt(rejectingCaller_.mint(randomWalkNft_, { value: withdrawFailPrice_ }));
		await waitForTransactionReceipt(randomWalkNft_.setLastMintTimeForTesting(1n));
		await waitForTransactionReceipt(rejectingCaller_.setEthDepositAcceptanceModeCode(1n));
		await expect(rejectingCaller_.withdraw(randomWalkNft_)).revertedWith("Transfer failed.");

		expect(owner_.address).properAddress;
	});

	it("covers inactive-round modifiers through V1 and V2 harnesses", async function () {
		const latestBlockTimestamp_ = await getLatestBlockTimestamp();
		const v1Harness_ = await deployContract("BiddingBaseForCoverage", (await hre.ethers.getSigners())[0]);
		const v2Harness_ = await deployContract("BiddingBaseV2ForCoverage", (await hre.ethers.getSigners())[0]);

		await waitForTransactionReceipt(v1Harness_.setRoundActivationTimeForTesting(latestBlockTimestamp_ - 1n));
		expect(await v1Harness_.onlyRoundIsActiveForTesting()).equal(true);
		await waitForTransactionReceipt(v1Harness_.setRoundActivationTimeForTesting(latestBlockTimestamp_ + 1000n));
		await expect(v1Harness_.onlyRoundIsActiveForTesting()).revertedWithCustomError(v1Harness_, "RoundIsInactive");

		await waitForTransactionReceipt(v2Harness_.setRoundActivationTimeForTesting(latestBlockTimestamp_ - 1n));
		expect(await v2Harness_.onlyRoundIsActiveForTesting()).equal(true);
		await waitForTransactionReceipt(v2Harness_.setRoundActivationTimeForTesting(latestBlockTimestamp_ + 1000n));
		await expect(v2Harness_.onlyRoundIsActiveForTesting()).revertedWithCustomError(v2Harness_, "RoundIsInactive");
		expect(await v2Harness_.getDurationUntilRoundActivation()).greaterThan(0n);
	});

	it("covers BidStatisticsV2 getters and champion projection handoff paths", async function () {
		const [deployer_, bidder1_, bidder2_, bidder3_, bidder4_] = await hre.ethers.getSigners();
		const bidStatistics_ = await deployContract("BidStatisticsV2ForCoverage", deployer_);

		await waitForTransactionReceipt(bidStatistics_.setRoundNumForTesting(7n));
		await waitForTransactionReceipt(bidStatistics_.setBidderSpentAmountsForTesting(bidder1_.address, 11n, 22n));
		expect(await bidStatistics_.getBidderTotalSpentAmounts(7n, bidder1_.address)).deep.equal([11n, 22n]);

		await waitForTransactionReceipt(bidStatistics_.setEnduranceChampionForTesting(bidder1_.address, 1000n, 100n, 10n));
		await waitForTransactionReceipt(bidStatistics_.setLastBidderForTesting(bidder2_.address, 1200n));
		await waitForTransactionReceipt(bidStatistics_.setChronoWarriorForTesting(bidder3_.address, 0n));
		await mineAtOrAfter((await getLatestBlockTimestamp()) + 500n);
		let champions_ = await bidStatistics_.tryGetCurrentChampions();
		expect(champions_[0]).equal(bidder2_.address);
		expect(champions_[2]).properAddress;

		await waitForTransactionReceipt(bidStatistics_.setChronoWarriorForTesting(bidder4_.address, 1000n));
		await mineAtOrAfter((await getLatestBlockTimestamp()) + 500n);
		champions_ = await bidStatistics_.tryGetCurrentChampions();
		expect(champions_[0]).equal(bidder2_.address);
		expect(champions_[2]).properAddress;

		await waitForTransactionReceipt(bidStatistics_.setEnduranceChampionForTesting(bidder1_.address, 1000n, 100n, 0n));
		await waitForTransactionReceipt(bidStatistics_.setLastBidderForTesting(bidder2_.address, 1200n));
		await waitForTransactionReceipt(bidStatistics_.setChronoWarriorForTesting(bidder4_.address, 1000n));
		await mineAtOrAfter((await getLatestBlockTimestamp()) + 500n);
		champions_ = await bidStatistics_.tryGetCurrentChampions();
		expect(champions_[0]).equal(bidder2_.address);
		expect(champions_[2]).properAddress;
	});

	it("covers V2 getter and bidding branches missing from the previous coverage report", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;

		expect(await game_.getDurationUntilRoundActivation()).greaterThan(0n);
		await expect(game_.connect(contracts_.signers[2]).bidWithEth(-1n, "inactive", 0n, { value: 10n ** 18n }))
			.revertedWithCustomError(game_, "RoundIsInactive");
		await activateCurrentRound(game_, contracts_.ownerSigner);
		await mineAtOrAfter(await game_.roundActivationTime());
		expect(await game_.getDurationUntilRoundActivation()).lessThanOrEqual(0n);
		expect(await game_.getDurationUntilMainPrize()).equal(0n);
		expect(await game_.numEthDonationWithInfoRecords()).equal(0n);

		await waitForTransactionReceipt(game_.connect(contracts_.signers[2]).donateEthWithInfo("coverage", { value: 123n }));
		expect(await game_.numEthDonationWithInfoRecords()).equal(1n);
		const [initialCstDuration_, initialCstElapsedDuration_] = await game_.getCstDutchAuctionDurations();
		expect(initialCstDuration_).greaterThan(0n);
		expect(initialCstElapsedDuration_).greaterThanOrEqual(0n);

		await expect(game_.connect(contracts_.signers[2]).halveEthDutchAuctionEndingBidPrice())
			.revertedWithCustomError(game_, "OwnableUnauthorizedAccount");
		await expect(game_.connect(contracts_.ownerSigner).halveEthDutchAuctionEndingBidPrice())
			.revertedWithCustomError(game_, "InvalidOperationInCurrentState");
		await expect(game_.connect(contracts_.signers[2]).bidWithCst(hre.ethers.MaxUint256, "first cst", 0n))
			.revertedWithCustomError(game_, "WrongBidType");

		let ethPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(game_.connect(contracts_.signers[2]).bidWithEth(-1n, "first eth", 0n, { value: ethPrice_ }));
		await expect(game_.connect(contracts_.ownerSigner).halveEthDutchAuctionEndingBidPrice())
			.revertedWithCustomError(game_, "BidHasBeenPlacedInCurrentRound");
		expect(await game_.getDurationUntilMainPrize()).greaterThan(0n);

		const roundNum_ = await game_.roundNum();
		const bidderSpentAmounts_ = await game_.getBidderTotalSpentAmounts(roundNum_, contracts_.signers[2].address);
		expect(bidderSpentAmounts_[0]).greaterThan(0n);
		expect(bidderSpentAmounts_[1]).equal(0n);

		let randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[3]).mint({ value: randomWalkNftMintPrice_ }));
		const randomWalkNftId_ = (await contracts_.randomWalkNft.totalSupply()) - 1n;
		ethPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
		let ethPlusRandomWalkNftPrice_ = await game_.getEthPlusRandomWalkNftBidPrice(ethPrice_);
		await waitForTransactionReceipt(
			game_.connect(contracts_.signers[3]).bidWithEth(randomWalkNftId_, "rw", 0n, { value: ethPlusRandomWalkNftPrice_ })
		);
		ethPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
		ethPlusRandomWalkNftPrice_ = await game_.getEthPlusRandomWalkNftBidPrice(ethPrice_);
		await expect(
			game_.connect(contracts_.signers[3]).bidWithEth(randomWalkNftId_, "rw again", 0n, { value: ethPlusRandomWalkNftPrice_ })
		).revertedWithCustomError(game_, "UsedRandomWalkNft");
	});

	it("covers V2 CST minimum and zero-reward burn branches", async function () {
		const contracts_ = await deployV1CompleteRoundZeroAndUpgradeToV2(2n);
		const game_ = contracts_.cosmicSignatureGameV2Proxy;

		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(0n));
		await activateCurrentRound(game_, contracts_.ownerSigner);
		const ethPrice_ = await game_.getNextEthBidPriceAdvanced(1n);
		await waitForTransactionReceipt(game_.connect(contracts_.signers[2]).bidWithEth(-1n, "first eth", 0n, { value: ethPrice_ }));
		await mineAtOrAfter((await getLatestBlockTimestamp()) + (await game_.cstDutchAuctionDuration()) + 1n);

		expect(await game_.getBidCstRewardAmount()).equal(0n);
		expect(await game_.getNextCstBidPrice()).equal(0n);
		await expect(game_.connect(contracts_.signers[3]).bidWithCst(hre.ethers.MaxUint256, "min", 1n))
			.revertedWithCustomError(game_, "BidCstRewardAmountMinLimitNotReached");
		await waitForTransactionReceipt(game_.connect(contracts_.signers[3]).bidWithCst(hre.ethers.MaxUint256, "burn zero", 0n));
	});
});
