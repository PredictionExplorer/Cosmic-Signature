"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { loadFixtureDeployContractsForTesting, assertEvent } = require("../../src/ContractTestingHelpers.js");

describe("Arbitrum", function () {
	it("Calls to Arbitrum precompile contracts errors", async function () {
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
		// 	console.info("%s", `202507114 ${successCounter_} ${failureCounter_}`);
		// }

		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);
		const fakeArbSys_ = await hre.ethers.getContractAt("FakeArbSys", "0x0000000000000000000000000000000000000064", contracts_.signers[1]);
		const fakeArbGasInfo_ = await hre.ethers.getContractAt("FakeArbGasInfo", "0x000000000000000000000000000000000000006C", contracts_.signers[1]);

		let cosmicSignatureGameProxy_ = contracts_.cosmicSignatureGameProxy;

		for ( let contractVersionNumber_ = 1; ; ++ contractVersionNumber_ ) {
			const cosmicSignatureGameProxyArbitrumErrorTopicHash_ = cosmicSignatureGameProxy_.interface.getEvent("ArbitrumError").topicHash;

			for ( let counter_ = 0; counter_ < 50; ++ counter_ ) {
				let fakeArbBaseModeCode_ = generateRandomUInt256();

				// [Comment-202507116]
				// This makes the probabilities of success and failure to call a particular fake Arbitrum precompiled contract method
				// about equal.
				// [/Comment-202507116]
				fakeArbBaseModeCode_ &= fakeArbBaseModeCode_ >> 128n;

				await waitForTransactionReceipt(fakeArbSys_.setModeCode(fakeArbBaseModeCode_));
				await waitForTransactionReceipt(fakeArbGasInfo_.setModeCode(fakeArbBaseModeCode_));

				// [Comment-202606179]
				// This avoids exponential increase of ETH bid price.
				// [/Comment-202606179]
				await waitForTransactionReceipt(cosmicSignatureGameProxy_.connect(contracts_.ownerSigner).setRoundActivationTime(123n));

				await waitForTransactionReceipt(contracts_.signers[2].sendTransaction({to: contracts_.cosmicSignatureGameProxyAddress, value: 10n ** 18n,}));
				const durationUntilMainPrize_ = await cosmicSignatureGameProxy_.getDurationUntilMainPrizeRaw();
				await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
				// await hre.ethers.provider.send("evm_mine");
				/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				const transactionResponsePromise_ = cosmicSignatureGameProxy_.connect(contracts_.signers[2]).claimMainPrize();
				const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
				const cosmicSignatureGameProxyArbitrumErrorLogs_ = transactionReceipt_.logs.filter((log_) => (log_.topics[0] == cosmicSignatureGameProxyArbitrumErrorTopicHash_));
				// console.info("%s", `202507119 ${cosmicSignatureGameProxyArbitrumErrorLogs_.length}`);
				let eventIndex_ = 0;
				if ((fakeArbBaseModeCode_ & 0x3n) != 0n) {
					// console.info("%s", "202507121");
					assertEvent(
						cosmicSignatureGameProxyArbitrumErrorLogs_[eventIndex_],
						cosmicSignatureGameProxy_,
						"ArbitrumError",
						["ArbSys.arbBlockNumber call failed.",]
					);
					++ eventIndex_;
				} else if ((fakeArbBaseModeCode_ & 0x30n) != 0n) {
					// console.info("%s", "202507122");
					assertEvent(
						cosmicSignatureGameProxyArbitrumErrorLogs_[eventIndex_],
						cosmicSignatureGameProxy_,
						"ArbitrumError",
						["ArbSys.arbBlockHash call failed.",]
					);
					++ eventIndex_;
				}
				if ((fakeArbBaseModeCode_ & 0x300n) != 0n) {
					// console.info("%s", "202507123");
					assertEvent(
						cosmicSignatureGameProxyArbitrumErrorLogs_[eventIndex_],
						cosmicSignatureGameProxy_,
						"ArbitrumError",
						["ArbGasInfo.getGasBacklog call failed.",]
					);
					++ eventIndex_;
				}
				if ((fakeArbBaseModeCode_ & 0x3000n) != 0n) {
					// console.info("%s", "202507124");
					assertEvent(
						cosmicSignatureGameProxyArbitrumErrorLogs_[eventIndex_],
						cosmicSignatureGameProxy_,
						"ArbitrumError",
						["ArbGasInfo.getL1PricingUnitsSinceUpdate call failed.",]
					);
					++ eventIndex_;
				}
				// if (eventIndex_ == 0) {
				// 	console.info("%s", "202507125");
				// }
				expect(cosmicSignatureGameProxyArbitrumErrorLogs_.length).equal(eventIndex_);
			}

			if ( ! (contractVersionNumber_ < 2) ) {
				break;
			}

			const cosmicSignatureGameV2Factory_ =
				await hre.ethers.getContractFactory("CosmicSignatureGameV2", contracts_.ownerSigner);
			cosmicSignatureGameProxy_ =
				await hre.upgrades.upgradeProxy(
					contracts_.cosmicSignatureGameProxy,
					cosmicSignatureGameV2Factory_,
					{
						kind: "uups",
						call: "initializeV2",
					}
				);
			// await cosmicSignatureGameProxy_.waitForDeployment();
		}
	});
});
