"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { generateRandomUInt32, uint32ToPaddedHexString, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { testAcrossGameVersions, bidAndClaimMainPrize } = require("../src/GameRoundTestHelpers.js");
const { activateCurrentRound } = require("../src/V2UpgradeTestHelpers.js");

describe("CosmicSignatureGame-All-Versions", function () {
	// Issue. I have eliminated the `fallback` method and refactored this test to confirm the behavior that is expected
	// when there is no `fallback` method.
	it("The fallback method", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);

			await expect(
				hre.ethers.provider.call({
					to: contracts_.cosmicSignatureGameProxyAddress,

					// A (likely) non-existent selector.
					data: /*"0xffffffff"*/ uint32ToPaddedHexString(generateRandomUInt32()),
				})
			// ).revertedWith("Method does not exist.");
			).revertedWithoutReason();
			await bidAndClaimMainPrize(contracts_, game_);
		});
	});

	it("The transferOwnership method", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);

			expect(await contracts_.cosmicSignatureGameImplementation.owner()).equal(hre.ethers.ZeroAddress);
			await expect(contracts_.cosmicSignatureGameImplementation.connect(contracts_.ownerSigner).transferOwnership(contracts_.deployerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameImplementation, "OwnableUnauthorizedAccount");
			await expect(contracts_.cosmicSignatureGameImplementation.connect(contracts_.deployerSigner).transferOwnership(contracts_.ownerSigner.address)).revertedWithCustomError(contracts_.cosmicSignatureGameImplementation, "OwnableUnauthorizedAccount");
			expect(await game_.owner()).equal(contracts_.ownerSigner.address);
			for ( let counter_ = 0; counter_ <= 1; ++ counter_ ) {
				// Ownership transfer will succeed regardless if the current bidding round is active or not.
				await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setRoundActivationTime((counter_ <= 0) ? 123_456_789_012n : 123n));

				if (counter_ <= 0) {
					expect(await game_.getDurationUntilRoundActivation()).greaterThan(+1e9);
				} else {
					expect(await game_.getDurationUntilRoundActivation()).lessThan(-1e9);
				}
				await expect(game_.connect(contracts_.signers[2]).transferOwnership(contracts_.ownerSigner.address)).revertedWithCustomError(game_, "OwnableUnauthorizedAccount");
				await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).transferOwnership(contracts_.signers[2].address));
				expect(await game_.owner()).equal(contracts_.signers[2].address);
				await waitForTransactionReceipt(game_.connect(contracts_.signers[2]).transferOwnership(contracts_.ownerSigner.address));
				expect(await game_.owner()).equal(contracts_.ownerSigner.address);
				await expect(game_.connect(contracts_.signers[2]).transferOwnership(contracts_.ownerSigner.address)).revertedWithCustomError(game_, "OwnableUnauthorizedAccount");
			}
			await bidAndClaimMainPrize(contracts_, game_);
		});
	});
});
