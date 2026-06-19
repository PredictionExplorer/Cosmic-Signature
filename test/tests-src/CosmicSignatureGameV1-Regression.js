"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const {
	getLatestBlockTimestamp,
	mineAtOrAfter,
} = require("../src/V2UpgradeTestHelpers.js");

describe("CosmicSignatureGameV1-Regression", function () {
	it("setDelayDurationBeforeRoundActivation(48 hours) takes effect only when a new round activation is scheduled", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
		const game_ = contracts_.cosmicSignatureGameProxy;
		const bidder_ = contracts_.signers[2];

		const oldRoundActivationTime_ = await game_.roundActivationTime();
		await mineAtOrAfter(oldRoundActivationTime_);
		const ethPrice_ = await game_.getNextEthBidPrice();
		await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(-1n, "", { value: ethPrice_ }));
		const mainPrizeTime_ = await game_.mainPrizeTime();

		const newDelay_ = 48n * 60n * 60n;
		await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setDelayDurationBeforeRoundActivation(newDelay_));
		expect(await game_.delayDurationBeforeRoundActivation()).equal(newDelay_);
		expect(await game_.roundActivationTime()).equal(oldRoundActivationTime_);
		expect(await game_.mainPrizeTime()).equal(mainPrizeTime_);

		await mineAtOrAfter(mainPrizeTime_);
		const beforeClaimBlockTime_ = await getLatestBlockTimestamp();
		await waitForTransactionReceipt(game_.connect(bidder_).claimMainPrize());
		expect(await game_.roundNum()).equal(1n);
		expect(await game_.roundActivationTime()).equal(beforeClaimBlockTime_ + newDelay_ + 1n);
	});
});
