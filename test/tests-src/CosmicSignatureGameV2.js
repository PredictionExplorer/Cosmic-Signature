"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");

function sqrtBigInt(value_) {
	expect(typeof value_).equal("bigint");
	expect(value_).greaterThanOrEqual(0n);
	if (value_ < 2n) {
		return value_;
	}
	let x0_ = value_;
	let x1_ = (value_ >> 1n) + 1n;
	while (x1_ < x0_) {
		x0_ = x1_;
		x1_ = (x1_ + value_ / x1_) >> 1n;
	}
	return x0_;
}

function expectedCstBidRewardAmount(elapsedSeconds_) {
	return sqrtBigInt(3n * elapsedSeconds_ * 10n ** 36n);
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
	it("upgrades from V1 without changing proxy, token, or storage and switches bid rewards", async function () {
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
		expect(await upgradedProxy_.cstRewardAmountForBidding()).equal(flatRewardAmount_);
		expect((await upgradedProxy_.queryFilter(upgradedProxy_.filters.ContractUpgradedToV2())).length).equal(1);

		const roundActivationTime_ = await upgradedProxy_.roundActivationTime();
		await setNextBlockTimestamp(roundActivationTime_);
		await waitForTransactionReceipt(upgradedProxy_.connect(contracts_.signers[1]).bidWithEth((-1), "", {value: await upgradedProxy_.getNextEthBidPrice(),}));
		expect(await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[1].address)).equal(0n);

		const secondBidTimestamp_ = roundActivationTime_ + 60n;
		await setNextBlockTimestamp(secondBidTimestamp_);
		const expectedRewardAmount_ = expectedCstBidRewardAmount(60n);
		await expect(upgradedProxy_.connect(contracts_.signers[2]).bidWithEth((-1), "", {value: await upgradedProxy_.getNextEthBidPrice(),}))
			.emit(upgradedProxy_, "CstBidRewardMinted")
			.withArgs(1n, contracts_.signers[2].address, expectedRewardAmount_);
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
