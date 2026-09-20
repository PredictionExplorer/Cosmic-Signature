"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
const { waitForTransactionReceipt } = require("../../src/Helpers.js");
const { getLatestBlockTimestamp, blockTimestampOfReceipt } = require("./V2UpgradeTestHelpers.js");

/** Executes an ETH bid at exactly the given block timestamp, paying the exact bid price. */
async function getPriceAndBidWithEthAt(game_, bidderSigner_, timeStamp_, bidCstRewardAmountMinLimit_ = 0n) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	expect(timeStamp_).greaterThan(latestTimeStamp_);
	const ethBidPrice_ = await game_.getNextEthBidPriceAdvanced(timeStamp_ - latestTimeStamp_);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	const receipt_ = await waitForTransactionReceipt(
		game_.connect(bidderSigner_).bidWithEth(-1n, "", bidCstRewardAmountMinLimit_, {value: ethBidPrice_,})
	);
	expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
	return { receipt_, ethBidPrice_ };
}

/** Executes a CST bid at exactly the given block timestamp, with `cstPriceMaxLimit_` equal the exact bid price. */
async function getPriceAndBidWithCstAt(game_, bidderSigner_, timeStamp_) {
	const latestTimeStamp_ = await getLatestBlockTimestamp();
	expect(timeStamp_).greaterThan(latestTimeStamp_);
	const cstBidPrice_ = await game_.getNextCstBidPriceAdvanced(timeStamp_ - latestTimeStamp_);
	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timeStamp_),]);
	const receipt_ = await waitForTransactionReceipt(
		game_.connect(bidderSigner_).bidWithCst(cstBidPrice_, "", 0n)
	);
	expect(await blockTimestampOfReceipt(receipt_)).equal(timeStamp_);
	return { receipt_, cstBidPrice_ };
}

/** Collects all the parsed events with the given name that the given contract emitted in the given receipt. */
function findParsedEvents(receipt_, contract_, eventName_) {
	const parsedEvents_ = [];
	for (const log_ of receipt_.logs) {
		try {
			const parsed_ = contract_.interface.parseLog(log_);
			if (parsed_?.name === eventName_) {
				parsedEvents_.push(parsed_);
			}
		} catch {
			// Ignore logs belonging to other contracts.
		}
	}
	return parsedEvents_;
}

module.exports = {
	getPriceAndBidWithEthAt,
	getPriceAndBidWithCstAt,
	findParsedEvents,
};
