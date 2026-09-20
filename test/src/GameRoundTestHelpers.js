"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { SECONDS_PER_HOUR } = require("../../src/CosmicSignatureConstants.js");
const { generateRandomUInt32, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting } = require("../../src/ContractTestingHelpers.js");
const { upgradeToV2, activateCurrentRound, setNextBlockTimeToAtLeast, getLatestBlockTimestamp, blockTimestampOfReceipt } = require("./V2UpgradeTestHelpers.js");
const { upgradeToV3 } = require("./V3UpgradeTestHelpers.js");

/** Uses one proxy throughout: random 1-4 rounds before upgrades, then four rounds on the final version. */
async function testAcrossGameVersions(testRound_, firstVersion_ = 1, lastVersion_ = 3) {
	const contracts_ = { ...await loadFixtureDeployContractsForTesting(SECONDS_PER_HOUR) };
	for (let version_ = 1; version_ <= lastVersion_; ++ version_) {
		if (version_ === 2) await upgradeToV2(contracts_);
		else if (version_ === 3) await upgradeToV3(contracts_);
		const game_ = (version_ === 1) ? contracts_.cosmicSignatureGameProxy : contracts_[`cosmicSignatureGameV${version_}Proxy`];
		const numRounds_ = (version_ === lastVersion_) ? 4 : (1 + generateRandomUInt32() % 4);
		await testGameRounds(contracts_, game_, async (contracts_, game_, roundNum_) => {
			if (version_ >= firstVersion_) {
				await testRound_(contracts_, game_, roundNum_, version_);
			} else {
				await bidAndClaimMainPrize(contracts_, game_);
			}
		}, numRounds_);
	}
}

/** Repeats the scenario on successive rounds, without restoring snapshots between rounds. */
async function testGameRounds(contracts_, game_, testRound_, numRounds_ = 4) {
	for (let roundIndex_ = 0; roundIndex_ < numRounds_; ++ roundIndex_) {
		const roundNum_ = await game_.roundNum();
		await testRound_(contracts_, game_, roundNum_);

		// Normally, this is greater by 1, but it's OK if this is greater by 2+.
		expect(await game_.roundNum(), "the scenario must finish its round").greaterThan(roundNum_);

		expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
	}
}

/** Plays a minimal round for scenarios that do not exercise bidding. */
async function bidAndClaimMainPrize(contracts_, game_) {
	expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
	await activateCurrentRound(game_, contracts_.ownerSigner);
	await bidWithEthAt(game_, contracts_.signers[1], (await getLatestBlockTimestamp()) + 1n);
	return finishGameRound(contracts_, game_);
}

/** Claims an already-started round as its last bidder; never places a bid. */
async function finishGameRound(contracts_, game_) {
	const lastBidderAddress_ = await game_.lastBidderAddress();
	const winner_ = contracts_.signers[contracts_.signerAddressToIndexMapping[lastBidderAddress_]];
	expect(winner_, "the round helper needs a signer for the last bidder").not.undefined;
	await setNextBlockTimeToAtLeast(await game_.mainPrizeTime());
	return waitForTransactionReceipt(game_.connect(winner_).claimMainPrize());
}

/** Pays the exact quoted price at the specified timestamp, using the current implementation's ABI. */
async function bidWithEthAt(game_, bidder_, timeStamp_) {
	expect(timeStamp_).greaterThan(await getLatestBlockTimestamp());
	const price_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - await getLatestBlockTimestamp());
	const args_ = [-1n, ""];
	if (game_.interface.getFunction("bidWithEth").inputs.length === 3) args_.push(0n);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_)]);
	const receipt_ = await waitForTransactionReceipt(game_.connect(bidder_).bidWithEth(...args_, { value: price_ }));
	expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
	return receipt_;
}

module.exports = {
	testAcrossGameVersions,
	testGameRounds,
	bidAndClaimMainPrize,
	finishGameRound,
	bidWithEthAt,
};
