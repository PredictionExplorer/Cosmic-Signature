"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const {
	getLatestBlockTimestamp,
	mineAt,
} = require("../src/V2UpgradeTestHelpers.js");

describe("CosmicSignatureGameV1-Regression", function () {
	// todo-0 Issue, This title appears incorrect or at least poorly phrased.
	// todo-0 `delayDurationBeforeRoundActivation` will actually affect all future rounds until contract owner changes it to a different value.
	it("setDelayDurationBeforeRoundActivation(48 hours) only affects the next round activation", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
		const game_ = contracts_.cosmicSignatureGameProxy;
		const bidder_ = contracts_.signers[2];

		const oldRoundActivationTime_ = await game_.roundActivationTime();
		await mineAt(oldRoundActivationTime_);
		const ethPrice_ = await game_.getNextEthBidPrice();
		await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", { value: ethPrice_ }));
		const mainPrizeTime_ = await game_.mainPrizeTime();

		const newDelay_ = 48n * 60n * 60n;
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setDelayDurationBeforeRoundActivation(newDelay_));
		expect(await game_.delayDurationBeforeRoundActivation()).equal(newDelay_);
		expect(await game_.roundActivationTime()).equal(oldRoundActivationTime_);
		expect(await game_.mainPrizeTime()).equal(mainPrizeTime_);

		await mineAt(mainPrizeTime_);
		const beforeClaimBlockTime_ = await getLatestBlockTimestamp();
		await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());
		expect(await game_.roundNum()).equal(1n);
		expect(await game_.roundActivationTime()).equal(beforeClaimBlockTime_ + newDelay_ + 1n);
	});

	// todo-0 Issue. Don't we already have a test like this?
	it("keeps V1 upgrade authorization blocked during an active round after a bid", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
		const game_ = contracts_.cosmicSignatureGameProxy;
		await mineAt(await game_.roundActivationTime());
		const ethPrice_ = await game_.getNextEthBidPrice();
		await waitForTransactionReceipt(game_.connect(contracts_.signers[2]).bidWithEth(-1n, "", { value: ethPrice_ }));

		const cosmicSignatureGameV2Factory_ =
			await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
		await expect(
			hre.upgrades.upgradeProxy(
				game_,
				cosmicSignatureGameV2Factory_,
				{ kind: "uups", call: "initializeV2" }
			)
		).revertedWithCustomError(game_, "RoundIsActive");
	});

	// todo-0 This belongs to the big fuzz test. I don't want to deal with a zillion of little tests.
	it("keeps V1 main prize claimable by last bidder and by anyone after timeout", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
		const game_ = contracts_.cosmicSignatureGameProxy;
		await mineAt(await game_.roundActivationTime());
		let ethPrice_ = await game_.getNextEthBidPrice();
		await waitForTransactionReceipt(game_.connect(contracts_.signers[2]).bidWithEth(-1n, "", { value: ethPrice_ }));
		await mineAt(await game_.mainPrizeTime());
		await waitForTransactionReceipt(game_.connect(contracts_.signers[2]).claimMainPrize());
		expect(await game_.roundNum()).equal(1n);

		await mineAt(await game_.roundActivationTime());
		ethPrice_ = await game_.getNextEthBidPrice();
		await waitForTransactionReceipt(game_.connect(contracts_.signers[3]).bidWithEth(-1n, "", { value: ethPrice_ }));
		await mineAt((await game_.mainPrizeTime()) + (await game_.timeoutDurationToClaimMainPrize()) + 1n);
		await waitForTransactionReceipt(game_.connect(contracts_.signers[4]).claimMainPrize());
		expect(await game_.roundNum()).equal(2n);
	});
});
