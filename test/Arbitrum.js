"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256, waitForTransactionReceipt } = require("../src/Helpers.js");
const { loadFixtureDeployContractsForUnitTesting, assertEvent } = require("../src/ContractUnitTestingHelpers.js");

describe("Arbitrum", function () {
	it("Calls to Arbitrum precompile contracts errors", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(999n);
		const fakeArbSys_ = await hre.ethers.getContractAt("FakeArbSys", "0x0000000000000000000000000000000000000064", contracts_.signers[0]);
		const fakeArbGasInfo_ = await hre.ethers.getContractAt("FakeArbGasInfo", "0x000000000000000000000000000000000000006C", contracts_.signers[0]);

		const cosmicSignatureGameProxyArbitrumErrorTopicHash_ = contracts_.cosmicSignatureGameProxy.interface.getEvent("ArbitrumError").topicHash;

		// Waiting longer avoids exponential increase of ETH bid price.
		const durationToWaitBeforePlacingFirstBid_ =
			await contracts_.cosmicSignatureGameProxy.delayDurationBeforeRoundActivation() +
			(await contracts_.cosmicSignatureGameProxy.getEthDutchAuctionDurations())[0];
		// console.info(Number(durationToWaitBeforePlacingFirstBid_) / (60.0 * 60.0));

		// // This tests Comment-202507116.
		// {
		// 	let successCounter_ = 0;
		// 	let failureCounter_ = 0;
		// 	for ( let counter_ = 0; counter_ < 2000; ++ counter_ ) {
		// 		let fakeArbBaseModeCode_ = generateRandomUInt256();
		// 		fakeArbBaseModeCode_ &= fakeArbBaseModeCode_ >> 128n;
		// 		if ((fakeArbBaseModeCode_ & 0x3n) != 0n) {
		// 			++ failureCounter_;
		// 		} else {
		// 			++ successCounter_;
		// 		}
		// 	}
		// 	console.info(`202507114 ${successCounter_} ${failureCounter_}`);
		// }

		for ( let counter_ = 0; counter_ < 50; ++ counter_ ) {
			let fakeArbBaseModeCode_ = generateRandomUInt256();

			// [Comment-202507116]
			// This makes the probabilities of success and failure to call a particular fake Arbitrum precompiled contract method
			// about equal.
			// [/Comment-202507116]
			fakeArbBaseModeCode_ &= fakeArbBaseModeCode_ >> 128n;

			await waitForTransactionReceipt(fakeArbSys_.setModeCode(fakeArbBaseModeCode_));
			await waitForTransactionReceipt(fakeArbGasInfo_.setModeCode(fakeArbBaseModeCode_));
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationToWaitBeforePlacingFirstBid_),]);
			// await hre.ethers.provider.send("evm_mine");
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
			let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
			// await hre.ethers.provider.send("evm_mine");
			/** @type {Promise<import("ethers").TransactionResponse>} */
			let transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize();
			let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
			let cosmicSignatureGameProxyArbitrumErrorLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics.indexOf(cosmicSignatureGameProxyArbitrumErrorTopicHash_) >= 0));
			// console.info("202507119", cosmicSignatureGameProxyArbitrumErrorLogs_.length.toString());
			let eventIndex_ = 0;
			if ((fakeArbBaseModeCode_ & 0x3n) != 0n) {
				// console.info("202507121");
				assertEvent(
					cosmicSignatureGameProxyArbitrumErrorLogs_[eventIndex_],
					contracts_.cosmicSignatureGameProxy,
					"ArbitrumError",
					["ArbSys.arbBlockNumber call failed.",]
				);
				++ eventIndex_;
			} else if ((fakeArbBaseModeCode_ & 0x30n) != 0n) {
				// console.info("202507122");
				assertEvent(
					cosmicSignatureGameProxyArbitrumErrorLogs_[eventIndex_],
					contracts_.cosmicSignatureGameProxy,
					"ArbitrumError",
					["ArbSys.arbBlockHash call failed.",]
				);
				++ eventIndex_;
			}
			if ((fakeArbBaseModeCode_ & 0x300n) != 0n) {
				// console.info("202507123");
				assertEvent(
					cosmicSignatureGameProxyArbitrumErrorLogs_[eventIndex_],
					contracts_.cosmicSignatureGameProxy,
					"ArbitrumError",
					["ArbGasInfo.getGasBacklog call failed.",]
				);
				++ eventIndex_;
			}
			if ((fakeArbBaseModeCode_ & 0x3000n) != 0n) {
				// console.info("202507124");
				assertEvent(
					cosmicSignatureGameProxyArbitrumErrorLogs_[eventIndex_],
					contracts_.cosmicSignatureGameProxy,
					"ArbitrumError",
					["ArbGasInfo.getL1PricingUnitsSinceUpdate call failed.",]
				);
				++ eventIndex_;
			}
			// if (eventIndex_ == 0) {
			// 	console.info("202507125");
			// }
			expect(cosmicSignatureGameProxyArbitrumErrorLogs_.length).equal(eventIndex_);
		}
	});
});
