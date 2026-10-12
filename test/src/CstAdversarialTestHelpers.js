"use strict";

// Helpers shared by the adversarial, economic, and misconfiguration scenarios in
// `test/tests-src/CosmicSignatureGameV3-CstAdversarial.js`. They complement the JS mirrors in `V3UpgradeTestHelpers.js`
// with a bundle of the live parameters, premium-inclusive price mirrors, event classification,
// and a deterministic way to fund CST bidders.

const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const {
	getRoundLateBidPricePremiumAmount,
	addRoundLateBidPricePremiumAmountIfNeeded,
	addRoundLateBidPricePremiumAmountToCstBidPriceBaseIfNeeded,
} = require("./V3UpgradeTestHelpers.js");
const { findParsedEvents } = require("./BidCstRewardTestHelpers.js");

/**
The late-bid premium amount calculated from `premiumBase_` at `durationUntilMainPrize_` seconds before `mainPrizeTime`
(negative after it), from the JS mirror at the given live parameters. Assumes a bid has been placed in the round.
*/
function getRoundLateBidPricePremiumAmountAt(params_, premiumBase_, durationUntilMainPrize_) {
	return getRoundLateBidPricePremiumAmount(
		premiumBase_,
		durationUntilMainPrize_,
		params_.roundLateBidDuration,
		params_.mainPrizeTimeIncrementInMicroSeconds,
		params_.roundLateBidPricePremiumAmountBaseMultiplier,
		params_.roundLateBidPricePremiumAmountExponent
	);
}

/**
The V3 CST bid price with the late-bid premium: the base plus the premium calculated from the greater of the base
and one main prize time increment of reward (Comment-202611026).
*/
function getCstBidPriceAt(params_, cstBidPriceBase_, durationUntilMainPrize_) {
	return addRoundLateBidPricePremiumAmountToCstBidPriceBaseIfNeeded(
		cstBidPriceBase_,
		params_.bidCstRewardAmountMultiplier,
		durationUntilMainPrize_,
		params_.roundLateBidDuration,
		params_.mainPrizeTimeIncrementInMicroSeconds,
		params_.roundLateBidPricePremiumAmountBaseMultiplier,
		params_.roundLateBidPricePremiumAmountExponent
	);
}

/** The V3 ETH bid price with the late-bid premium: the base plus the premium calculated from it. */
function getEthBidPriceAt(params_, ethBidPriceBase_, durationUntilMainPrize_) {
	return addRoundLateBidPricePremiumAmountIfNeeded(
		ethBidPriceBase_,
		durationUntilMainPrize_,
		params_.roundLateBidDuration,
		params_.mainPrizeTimeIncrementInMicroSeconds,
		params_.roundLateBidPricePremiumAmountBaseMultiplier,
		params_.roundLateBidPricePremiumAmountExponent
	);
}

/**
Funds a CST bidder deterministically: the treasurer pays a marketing reward out of the marketing wallet,
which receives `marketingWalletCstContributionAmount` of CST on every main prize claim, including the one of round 0.
This is a plain ERC-20 transfer, so it works for contract recipients too. Holding the last bidder position is the only
other way to obtain CST, and it moves the blockchain time, which the scenarios keep under exact control.
*/
async function payCstFromMarketingWallet(contracts_, recipientAddress_, amount_) {
	const token_ = contracts_.cosmicSignatureToken;
	expect(await token_.balanceOf(contracts_.marketingWalletAddress), "the marketing wallet must afford the funding").at.least(amount_);
	const recipientBalanceBefore_ = await token_.balanceOf(recipientAddress_);
	await waitForTransactionReceipt(contracts_.marketingWallet.connect(contracts_.treasurerSigner).payReward(recipientAddress_, amount_));
	expect(await token_.balanceOf(recipientAddress_)).equal(recipientBalanceBefore_ + amount_);
}

/**
Collects the winner addresses of the bidder raffle draws announced by a main prize claim receipt, in event order:
the ETH prizes first, then the CST and Cosmic Signature NFT prizes for bidders, excluding those for Random Walk NFT stakers.
Asserts that the number of draws equals the configured prize counts.
*/
async function getBidderRaffleWinnerAddresses(game_, claimReceipt_) {
	const winnerAddresses_ = [
		...findParsedEvents(claimReceipt_, game_, "RaffleWinnerBidderEthPrizeAllocated")
			.map((parsedEvent_) => parsedEvent_.args.winnerAddress),
		...findParsedEvents(claimReceipt_, game_, "RaffleWinnerPrizePaid")
			.filter((parsedEvent_) => ! parsedEvent_.args.winnerIsRandomWalkNftStaker)
			.map((parsedEvent_) => parsedEvent_.args.winnerAddress),
	];
	expect(BigInt(winnerAddresses_.length), "bidder raffle draw count")
		.equal((await game_.numRaffleEthPrizesForBidders()) + (await game_.numRaffleCosmicSignatureNftsForBidders()));
	return winnerAddresses_;
}

/**
Classifies the CST `Transfer` events of a receipt, in log order. A mint comes from the zero address and a burn goes to it.
@returns {{all: Array<{from: string, to: string, value: bigint}>, mints: Array, burns: Array}}
*/
function classifyCstTransferEvents(receipt_, token_) {
	const all_ =
		findParsedEvents(receipt_, token_, "Transfer")
			.map((parsedEvent_) => ({ from: parsedEvent_.args.from, to: parsedEvent_.args.to, value: parsedEvent_.args.value, }));
	return {
		all: all_,
		mints: all_.filter((transfer_) => transfer_.from === hre.ethers.ZeroAddress),
		burns: all_.filter((transfer_) => transfer_.to === hre.ethers.ZeroAddress),
	};
}

module.exports = {
	getRoundLateBidPricePremiumAmountAt,
	getCstBidPriceAt,
	getEthBidPriceAt,
	payCstFromMarketingWallet,
	getBidderRaffleWinnerAddresses,
	classifyCstTransferEvents,
};
