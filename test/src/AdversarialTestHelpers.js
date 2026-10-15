"use strict";

const hre = require("hardhat");
const { DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER } = require("../../src/CosmicSignatureConstants.js");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { activateCurrentRound, getLatestBlockTimestamp, blockTimestampOfReceipt } = require("./V2UpgradeTestHelpers.js");
const { getV3BidCstRewardAmount } = require("./V3UpgradeTestHelpers.js");
const { expect } = require("chai");

// A high reward rate, so that the hostile contract can quickly afford CST bids: ~300 CST per minute.
const BID_CST_REWARD_AMOUNT_MULTIPLIER = 300n * DEFAULT_BID_CST_REWARD_AMOUNT_MULTIPLIER;

async function configureRewardAndDeployHostileBidder(contracts_, game_) {
	await waitForTransactionReceipt(game_.connect(contracts_.ownerSigner).setBidCstRewardAmountMultiplier(BID_CST_REWARD_AMOUNT_MULTIPLIER));
	await activateCurrentRound(game_, contracts_.ownerSigner);
	const hostileBidder_ = await deployHostileBidder(game_, contracts_.signers[10]);
	const rewardAt_ = async (elapsedDuration_) =>
		getV3BidCstRewardAmount(elapsedDuration_, BID_CST_REWARD_AMOUNT_MULTIPLIER, await game_.mainPrizeTimeIncrementInMicroSeconds());
	return { contracts_, game_, hostileBidder_, rewardAt_ };
}

/** Makes the hostile contract place an ETH bid at exactly the given block timestamp, paying the exact bid price. */
async function hostileBidWithEthAt(game_, hostileBidder_, callerSigner_, timeStamp_) {
	const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - await getLatestBlockTimestamp());
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	const receipt_ = await waitForTransactionReceipt(
		hostileBidder_.connect(callerSigner_).doBidWithEth(-1n, "hostile bid", 0n, {value: ethBidPrice_,})
	);
	expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
	return receipt_;
}

async function deployHostileBidder(game_, deployerSigner_) {
	const hostileBidderFactory_ = await hre.ethers.getContractFactory("HostileBidder", deployerSigner_);
	const hostileBidder_ = await hostileBidderFactory_.deploy(await game_.getAddress());
	await hostileBidder_.waitForDeployment();
	return hostileBidder_;
}

async function deployBrokenToken(prizesWallet_, deployerSigner_) {
	const brokenTokenFactory_ = await hre.ethers.getContractFactory("BrokenToken", deployerSigner_);
	const brokenToken_ = await brokenTokenFactory_.deploy(await prizesWallet_.getAddress());
	await brokenToken_.waitForDeployment();
	return brokenToken_;
}

module.exports = {
	configureRewardAndDeployHostileBidder,
	hostileBidWithEthAt,
	deployHostileBidder,
	deployBrokenToken,
};
