"use strict";

const { describe, it } = require("mocha");
const { testAcrossGameVersions, activateRoundBidAndClaimMainPrize } = require("../src/GameRoundTestHelpers.js");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { expect } = require("chai");

describe("CosmicSignatureGame-All-Versions-EthDonations", function () {
	it("increments the ETH donation record count independently of bidding", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const numDonationRecordsBefore_ = await game_.numEthDonationWithInfoRecords();
			await waitForTransactionReceipt(game_.connect(contracts_.signers[2]).donateEthWithInfo("donation info", { value: 123n }));
			expect(await game_.numEthDonationWithInfoRecords()).equal(numDonationRecordsBefore_ + 1n);
			await activateRoundBidAndClaimMainPrize(contracts_, game_);
		});
	});
});
