"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { anyUint } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { DEFAULT_BID_CST_REWARD_FORMULA_PRODUCT, computeBidCstRewardAmount } = require("../../src/BidCstRewardHelpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");

function expectedBidCstRewardAmount(elapsedDurationInSeconds_) {
	return computeBidCstRewardAmount(elapsedDurationInSeconds_);
}

async function setNextBlockTimestamp(timestamp_) {
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp_),]);
}

async function bidWithEth(contracts_, bidderSigner_) {
	const ethBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice();
	return waitForTransactionReceipt(
		contracts_.cosmicSignatureGameProxy.connect(bidderSigner_).bidWithEth((-1), "", {value: ethBidPrice_,})
	);
}

async function deployV2Implementation(ownerSigner_) {
	const factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV2", ownerSigner_);
	const implementation_ = await factory_.deploy();
	await implementation_.waitForDeployment();
	return implementation_;
}

describe("CosmicSignatureGameV2", function () {
	it("upgrades from V1 without changing proxy or token and switches bid rewards", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(0n);
		const proxyAddress_ = await contracts_.cosmicSignatureGameProxy.getAddress();
		const tokenAddress_ = await contracts_.cosmicSignatureToken.getAddress();
		const flatRewardAmount_ = await contracts_.cosmicSignatureGameProxy.cstRewardAmountForBidding();

		await bidWithEth(contracts_, contracts_.signers[0]);
		expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[0].address)).equal(flatRewardAmount_);

		await setNextBlockTimestamp((await contracts_.cosmicSignatureGameProxy.mainPrizeTime()) + 1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).claimMainPrize());
		expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(hre.ethers.ZeroAddress);

		const proxyAsOwner_ = await hre.ethers.getContractAt("CosmicSignatureGame", proxyAddress_, contracts_.ownerSigner);
		const v2Factory_ = await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
		const upgradedProxy_ =
			await hre.upgrades.upgradeProxy(
				proxyAsOwner_,
				v2Factory_,
				{
					kind: "uups",
					call: "initialize2",
				}
			);
		await upgradedProxy_.waitForDeployment();

		expect(await upgradedProxy_.getAddress()).equal(proxyAddress_);
		expect(await upgradedProxy_.token()).equal(tokenAddress_);
		expect(await upgradedProxy_.cstRewardAmountForBidding()).equal(DEFAULT_BID_CST_REWARD_FORMULA_PRODUCT);

		const roundActivationTime_ = await upgradedProxy_.roundActivationTime();
		await setNextBlockTimestamp(roundActivationTime_);
		const firstEthBidPrice_ = await upgradedProxy_.getNextEthBidPrice();
		await waitForTransactionReceipt(upgradedProxy_.connect(contracts_.signers[1]).bidWithEth((-1), "", 0n, {value: firstEthBidPrice_,}));
		expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[1].address)).equal(0n);

		const secondBidTimestamp_ = roundActivationTime_ + 60n;
		await setNextBlockTimestamp(secondBidTimestamp_);
		const expectedRewardAmount_ = expectedBidCstRewardAmount(60n);
		const secondEthBidPrice_ = await upgradedProxy_.getNextEthBidPrice();
		await expect(upgradedProxy_.connect(contracts_.signers[2]).bidWithEth((-1), "", 0n, {value: secondEthBidPrice_,}))
			.emit(upgradedProxy_, "BidPlaced")
			.withArgs(1n, contracts_.signers[2].address, secondEthBidPrice_, -1n, -1n, "", expectedRewardAmount_, anyUint);
		expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[2].address)).equal(expectedRewardAmount_);
	});

	it("rejects unauthorized upgrades", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(10_000n);
		const implementation_ = await deployV2Implementation(contracts_.ownerSigner);
		const proxyAsNonOwner_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]);

		await expect(proxyAsNonOwner_.upgradeToAndCall(await implementation_.getAddress(), "0x"))
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
	});

	it("rejects upgrades while a round is active", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(0n);
		const implementation_ = await deployV2Implementation(contracts_.ownerSigner);

		await bidWithEth(contracts_, contracts_.signers[0]);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).upgradeToAndCall(await implementation_.getAddress(), "0x"))
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsActive");
	});
});
