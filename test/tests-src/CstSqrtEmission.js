"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { anyUint } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { computeBidCstRewardAmount } = require("../../src/BidCstRewardHelpers.js");
const { deployContractsForTestingAdvanced } = require("../../src/ContractTestingHelpers.js");
const { setRoundActivationTimeIfNeeded } = require("../../src/ContractDeploymentHelpers.js");

function expectedBidCstRewardAmount(elapsedDurationInSeconds_) {
	expect(typeof elapsedDurationInSeconds_).equal("bigint");
	return computeBidCstRewardAmount(elapsedDurationInSeconds_);
}

async function deployV2ContractsForTesting() {
	const contracts_ = await deployContractsForTestingAdvanced("CosmicSignatureGameV2");
	await setRoundActivationTimeIfNeeded(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner), 0n);
	return contracts_;
}

async function setNextBlockTimestamp(timestamp_) {
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp_),]);
}

async function setRoundActivationTimeInFuture(contracts_) {
	const roundActivationTime_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
	await setRoundActivationTimeIfNeeded(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner), roundActivationTime_);
	return roundActivationTime_;
}

async function getNextCstBidPriceAt(cosmicSignatureGameProxy_, timestamp_) {
	const latestTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp);
	return cosmicSignatureGameProxy_.getNextCstBidPriceAdvanced(timestamp_ - latestTimestamp_);
}

async function bidWithEthAt(contracts_, bidderSigner_, timestamp_) {
	await setNextBlockTimestamp(timestamp_);
	const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
	const transactionReceipt_ =
		await waitForTransactionReceipt(
			contracts_.cosmicSignatureGameProxy.connect(bidderSigner_).bidWithEth((-1), "", 0n, {value: ethBidPrice_,})
		);
	const transactionBlock_ = await transactionReceipt_.getBlock();
	expect(transactionBlock_.timestamp).equal(Number(timestamp_));
	return {ethBidPrice_, transactionReceipt_, transactionBlock_,};
}

describe("CST sqrt emission", function () {
	it("mints zero CST for the first bid of a round", async function () {
		const contracts_ = await deployV2ContractsForTesting();
		const roundActivationTime_ = await setRoundActivationTimeInFuture(contracts_);
		const bidderAddress_ = contracts_.signers[0].address;
		await setNextBlockTimestamp(roundActivationTime_);
		const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();

		const transactionResponsePromise_ =
			contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(
				(-1),
				"",
				0n,
				{value: ethBidPrice_,}
			);
		await expect(transactionResponsePromise_)
			.emit(contracts_.cosmicSignatureGameProxy, "BidPlaced")
			.withArgs(0n, bidderAddress_, ethBidPrice_, -1n, -1n, "", 0n, anyUint);
		expect(await contracts_.cosmicSignatureToken.balanceOf(bidderAddress_)).equal(0n);
		expect(roundActivationTime_).lessThanOrEqual(BigInt((await hre.ethers.provider.getBlock("latest")).timestamp));
	});

	it("mints floor(sqrt(3 * elapsedSeconds) * 1e18) CST for ETH bids", async function () {
		for (const elapsedSeconds_ of [1n, 2n, 60n, 3600n, 86400n, 31_536_000n,]) {
			const contracts_ = await deployV2ContractsForTesting();
			const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
			await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);
			const bidderSigner_ = contracts_.signers[Number(elapsedSeconds_ % 10n) + 1];
			const bidTimestamp_ = firstBidTimestamp_ + elapsedSeconds_;
			const expectedRewardAmount_ = expectedBidCstRewardAmount(elapsedSeconds_);

			await setNextBlockTimestamp(bidTimestamp_);
			const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
			const transactionResponsePromise_ =
				contracts_.cosmicSignatureGameProxy.connect(bidderSigner_).bidWithEth((-1), "", 0n, {value: ethBidPrice_,});
			await expect(transactionResponsePromise_)
				.emit(contracts_.cosmicSignatureGameProxy, "BidPlaced")
				.withArgs(0n, bidderSigner_.address, ethBidPrice_, -1n, -1n, "", expectedRewardAmount_, anyUint);
			expect(await contracts_.cosmicSignatureToken.balanceOf(bidderSigner_.address)).equal(expectedRewardAmount_);
		}
	});

	it("returns the exact sqrt reward for a broad deterministic sample", async function () {
		const contracts_ = await deployV2ContractsForTesting();
		const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
		await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

		const elapsedDurations_ = new Set([0n, 1n, 2n, 60n, 3600n, 86400n, 31_536_000n,]);
		let seed_ = 0x123456789abcdefn;
		while (elapsedDurations_.size < 1000) {
			seed_ = (seed_ * 1103515245n + 12345n) & ((1n << 48n) - 1n);
			elapsedDurations_.add(seed_ % (1n << 32n));
		}
		const sortedElapsedDurations_ = [...elapsedDurations_].sort((a_, b_) => Number(a_ - b_));

		for (const elapsedSeconds_ of sortedElapsedDurations_) {
			const timestamp_ = firstBidTimestamp_ + elapsedSeconds_;
			if (timestamp_ > BigInt((await hre.ethers.provider.getBlock("latest")).timestamp)) {
				await setNextBlockTimestamp(timestamp_);
				await hre.ethers.provider.send("evm_mine");
			}
			expect(await contracts_.cosmicSignatureGameProxy.getBidCstRewardAmount())
				.equal(expectedBidCstRewardAmount(elapsedSeconds_));
			expect(await contracts_.cosmicSignatureGameProxy.getBidCstRewardAmountAdvanced(1n))
				.equal(expectedBidCstRewardAmount(elapsedSeconds_ + 1n));
		}
	});

	it("mints zero CST for same-block bids", async function () {
		const contracts_ = await deployV2ContractsForTesting();
		const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
		await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

		const secondEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
		const thirdEthBidPrice_ = secondEthBidPrice_ + secondEthBidPrice_ / (await contracts_.cosmicSignatureGameProxy.ethBidPriceIncreaseDivisor()) + 1n;

		await hre.ethers.provider.send("evm_setAutomine", [false,]);
		try {
			const tx2_ =
				await contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(
					(-1),
					"",
					0n,
					{value: secondEthBidPrice_,}
				);
			const tx3_ =
				await contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(
					(-1),
					"",
					0n,
					{value: thirdEthBidPrice_,}
				);
			await hre.ethers.provider.send("evm_mine");
			const receipt2_ = await tx2_.wait();
			const receipt3_ = await tx3_.wait();
			expect((await receipt2_.getBlock()).timestamp).equal((await receipt3_.getBlock()).timestamp);
			expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[2].address)).equal(0n);
		} finally {
			await hre.ethers.provider.send("evm_setAutomine", [true,]);
		}
	});

	it("uses the same sqrt reward path for CST bids and preserves the burn", async function () {
		const contracts_ = await deployV2ContractsForTesting();
		const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
		await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

		const ethBidderSigner_ = contracts_.signers[1];
		const secondBidTimestamp_ = firstBidTimestamp_ + 3600n;
		await bidWithEthAt(contracts_, ethBidderSigner_, secondBidTimestamp_);

		const cstBidTimestamp_ = firstBidTimestamp_ + 21600n;
		await setNextBlockTimestamp(cstBidTimestamp_);
		const paidCstPrice_ = await getNextCstBidPriceAt(contracts_.cosmicSignatureGameProxy, cstBidTimestamp_);
		const expectedRewardAmount_ = expectedBidCstRewardAmount(cstBidTimestamp_ - secondBidTimestamp_);
		const balanceBefore_ = await contracts_.cosmicSignatureToken.balanceOf(ethBidderSigner_.address);

		const transactionResponsePromise_ =
			contracts_.cosmicSignatureGameProxy.connect(ethBidderSigner_).bidWithCst(paidCstPrice_, "", 0n);
		await expect(transactionResponsePromise_)
			.emit(contracts_.cosmicSignatureGameProxy, "BidPlaced")
			.withArgs(0n, ethBidderSigner_.address, -1n, paidCstPrice_, -1n, "", expectedRewardAmount_, anyUint);
		const bidderInfo_ = await contracts_.cosmicSignatureGameProxy.biddersInfo(0n, ethBidderSigner_.address);
		const actualPaidCstPrice_ = bidderInfo_.totalSpentCstAmount ?? bidderInfo_[1];
		expect(await contracts_.cosmicSignatureToken.balanceOf(ethBidderSigner_.address))
			.equal(balanceBefore_ - actualPaidCstPrice_ + expectedRewardAmount_);
	});

	it("resets the first-bid reward to zero after a round ends", async function () {
		const contracts_ = await deployV2ContractsForTesting();
		const firstBidTimestamp_ = BigInt((await hre.ethers.provider.getBlock("latest")).timestamp) + 10n;
		await bidWithEthAt(contracts_, contracts_.signers[0], firstBidTimestamp_);

		await setNextBlockTimestamp((await contracts_.cosmicSignatureGameProxy.mainPrizeTime()) + 1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).claimMainPrize());
		const nextRoundActivationTime_ = await contracts_.cosmicSignatureGameProxy.roundActivationTime();
		await setNextBlockTimestamp(nextRoundActivationTime_);

		const firstBidderNextRound_ = contracts_.signers[1];
		const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
		const transactionResponsePromise_ =
			contracts_.cosmicSignatureGameProxy.connect(firstBidderNextRound_).bidWithEth(
				(-1),
				"",
				0n,
				{value: ethBidPrice_,}
			);
		await expect(transactionResponsePromise_)
			.emit(contracts_.cosmicSignatureGameProxy, "BidPlaced")
			.withArgs(1n, firstBidderNextRound_.address, ethBidPrice_, -1n, -1n, "", 0n, anyUint);
	});

	it("removes the CST farming advantage from same-transaction batch bids after upgrade", async function () {
		const numBids_ = 100n;
		const contracts_ = await deployContractsForTestingAdvanced("CosmicSignatureGame");
		await setRoundActivationTimeIfNeeded(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner), 0n);
		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerSigner);
		const v1BatchBidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
		await v1BatchBidderContract_.waitForDeployment();
		const v1BatchBidderContractAddress_ = await v1BatchBidderContract_.getAddress();

		await waitForTransactionReceipt(
			v1BatchBidderContract_.doBidWithEthMany(numBids_, {value: hre.ethers.parseEther("1.0"),})
		);
		expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(v1BatchBidderContractAddress_);
		expect(await contracts_.cosmicSignatureToken.balanceOf(v1BatchBidderContractAddress_))
			.equal(numBids_ * await contracts_.cosmicSignatureGameProxy.cstRewardAmountForBidding());

		await setNextBlockTimestamp((await contracts_.cosmicSignatureGameProxy.mainPrizeTime()) + 1n);
		await waitForTransactionReceipt(v1BatchBidderContract_.doClaimMainPrize());

		const v2Factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
		const upgradedProxy_ =
			await hre.upgrades.upgradeProxy(
				contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner),
				v2Factory_,
				{
					kind: "uups",
					call: "initialize2",
				}
			);
		await upgradedProxy_.waitForDeployment();

		const v2BatchBidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
		await v2BatchBidderContract_.waitForDeployment();
		const v2BatchBidderContractAddress_ = await v2BatchBidderContract_.getAddress();
		await setNextBlockTimestamp(await upgradedProxy_.roundActivationTime());

		// Use the V2-typed batch helper with `bidCstRewardMinLimit_ = 0` so the batch farms zero CST
		// without tripping the new slippage protection.
		await waitForTransactionReceipt(
			v2BatchBidderContract_.doBidWithEthManyV2(numBids_, 0n, {value: hre.ethers.parseEther("1.0"),})
		);
		expect(await upgradedProxy_.lastBidderAddress()).equal(v2BatchBidderContractAddress_);
		expect(await contracts_.cosmicSignatureToken.balanceOf(v2BatchBidderContractAddress_)).equal(0n);
		expect(await upgradedProxy_.getBidCstRewardAmount()).equal(0n);
	});
});
