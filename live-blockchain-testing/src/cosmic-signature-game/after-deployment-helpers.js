"use strict";

const nodeOsModule = require("node:os");
const { expect } = require("chai");
const { waitForTransactionReceipt } = require("../../../src/Helpers.js");

async function validateCosmicSignatureGameState(
	cosmicSignatureGameProxy_,
	ownerAddress_,
	cosmicSignatureTokenAddress_,
	randomWalkNftAddress_,
	cosmicSignatureNftAddress_,
	prizesWalletAddress_,
	stakingWalletRandomWalkNftAddress_,
	stakingWalletCosmicSignatureNftAddress_,
	marketingWalletAddress_,
	charityWalletAddress_
	// cosmicSignatureDaoAddress_
) {
	expect(await cosmicSignatureGameProxy_.owner({blockTag: "pending",})).equal(ownerAddress_);
	expect(await cosmicSignatureGameProxy_.token({blockTag: "pending",})).equal(cosmicSignatureTokenAddress_);
	expect(await cosmicSignatureGameProxy_.randomWalkNft({blockTag: "pending",})).equal(randomWalkNftAddress_);
	expect(await cosmicSignatureGameProxy_.nft({blockTag: "pending",})).equal(cosmicSignatureNftAddress_);
	expect(await cosmicSignatureGameProxy_.prizesWallet({blockTag: "pending",})).equal(prizesWalletAddress_);
	expect(await cosmicSignatureGameProxy_.stakingWalletRandomWalkNft({blockTag: "pending",})).equal(stakingWalletRandomWalkNftAddress_);
	expect(await cosmicSignatureGameProxy_.stakingWalletCosmicSignatureNft({blockTag: "pending",})).equal(stakingWalletCosmicSignatureNftAddress_);
	expect(await cosmicSignatureGameProxy_.marketingWallet({blockTag: "pending",})).equal(marketingWalletAddress_);
	expect(await cosmicSignatureGameProxy_.charityAddress({blockTag: "pending",})).equal(charityWalletAddress_);
}

/// Assuming `cosmicSignatureGameProxy_.roundActivationTime` is in the future.
/// Otherwise contract parameter setters would revert.
/// Comment-202509065 applies.
async function configureCosmicSignatureGame(
	cosmicSignatureGameProxy_,
	ownerSigner_,
	delayDurationBeforeRoundActivation_,
	ethDutchAuctionDuration_,
	cstDutchAuctionDuration_,
	initialDurationUntilMainPrize_,
	mainPrizeTimeIncrement_,
	timeoutDurationToClaimMainPrize_
) {
	await waitForTransactionReceipt(cosmicSignatureGameProxy_.connect(ownerSigner_).setDelayDurationBeforeRoundActivation(delayDurationBeforeRoundActivation_));
	const mainPrizeTimeIncrementInMicroSeconds_ = mainPrizeTimeIncrement_ * 10n ** 6n;
	await waitForTransactionReceipt(cosmicSignatureGameProxy_.connect(ownerSigner_).setMainPrizeTimeIncrementInMicroSeconds(mainPrizeTimeIncrementInMicroSeconds_));
	{
		const ethDutchAuctionDurationDivisor_ = (mainPrizeTimeIncrementInMicroSeconds_ + ethDutchAuctionDuration_ / 2n) / ethDutchAuctionDuration_;
		console.info(`${nodeOsModule.EOL}ethDutchAuctionDurationDivisor = ${ethDutchAuctionDurationDivisor_}`);
		await waitForTransactionReceipt(cosmicSignatureGameProxy_.connect(ownerSigner_).setEthDutchAuctionDurationDivisor(ethDutchAuctionDurationDivisor_));
	}
	{
		const cstDutchAuctionDurationDivisor_ = (mainPrizeTimeIncrementInMicroSeconds_ + cstDutchAuctionDuration_ / 2n) / cstDutchAuctionDuration_;
		console.info(`cstDutchAuctionDurationDivisor = ${cstDutchAuctionDurationDivisor_}`);
		await waitForTransactionReceipt(cosmicSignatureGameProxy_.connect(ownerSigner_).setCstDutchAuctionDurationDivisor(cstDutchAuctionDurationDivisor_));
	}
	{
		const initialDurationUntilMainPrizeDivisor_ = (mainPrizeTimeIncrementInMicroSeconds_ + initialDurationUntilMainPrize_ / 2n) / initialDurationUntilMainPrize_;
		console.info(`initialDurationUntilMainPrizeDivisor = ${initialDurationUntilMainPrizeDivisor_}`);
		await waitForTransactionReceipt(cosmicSignatureGameProxy_.connect(ownerSigner_).setInitialDurationUntilMainPrizeDivisor(initialDurationUntilMainPrizeDivisor_));
	}
	if (timeoutDurationToClaimMainPrize_ >= 0n) {
		await waitForTransactionReceipt(cosmicSignatureGameProxy_.connect(ownerSigner_).setTimeoutDurationToClaimMainPrize(timeoutDurationToClaimMainPrize_));
	}
}

module.exports = {
	validateCosmicSignatureGameState,
	configureCosmicSignatureGame,
};
