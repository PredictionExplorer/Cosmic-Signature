"use strict";

const { expect } = require("chai");
const { describe, it } = require("mocha");
const hre = require("hardhat");
const { activateCurrentRound } = require("../src/GameV2UpgradeTestHelpers.js");
const { testAcrossGameVersions, bidAndClaimMainPrize } = require("../src/GameRoundTestHelpers.js");

describe("CosmicSignatureGame-All-Versions-BiddingCommon", function () {
	it("The getDurationUntilRoundActivation and getDurationElapsedSinceRoundActivation methods", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);

			const roundActivationTime_ = await game_.roundActivationTime();

			for ( let counter_ = -1; counter_ <= 1; ++ counter_ ) {
				const latestBlock_ = await hre.ethers.provider.getBlock("latest");
				expect(latestBlock_.timestamp).equal(Number(roundActivationTime_) + counter_);
				const durationUntilRoundActivation_ = await game_.getDurationUntilRoundActivation();
				expect(durationUntilRoundActivation_).equal( - counter_ );
				const durationElapsedSinceRoundActivation_ = await game_.getDurationElapsedSinceRoundActivation();
				expect(durationElapsedSinceRoundActivation_).equal(counter_);
				await hre.ethers.provider.send("evm_mine");
			}
			await bidAndClaimMainPrize(contracts_, game_);
		});
	});
});
