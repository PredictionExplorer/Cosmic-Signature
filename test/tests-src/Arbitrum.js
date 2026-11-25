"use strict";

const { expect } = require("chai");
const { describe, it } = require("mocha");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { LONG_TEST_MODE_CODE, loadFixtureDeployContractsForTesting, assertEvent } = require("../../src/ContractTestingHelpers.js");
const { upgradeGameToV2 } = require("../src/GameV2UpgradeTestHelpers.js");
const { upgradeGameToV3 } = require("../src/GameV3UpgradeTestHelpers.js");

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

		const contracts_ = { ...await loadFixtureDeployContractsForTesting(-1_000_000_000n) };
		const fakeArbSys_ = await hre.ethers.getContractAt("FakeArbSys", "0x0000000000000000000000000000000000000064", contracts_.signers[1]);
		const fakeArbGasInfo_ = await hre.ethers.getContractAt("FakeArbGasInfo", "0x000000000000000000000000000000000000006C", contracts_.signers[1]);

		for (let contractVersionNumber_ = 1; contractVersionNumber_ <= 3; ++ contractVersionNumber_) {
			if (contractVersionNumber_ === 2) {
				await upgradeGameToV2(contracts_);
			}
			else if (contractVersionNumber_ === 3) {
				await upgradeGameToV3(contracts_);
			}
			const cosmicSignatureGameProxy_ = (contractVersionNumber_ === 1)
				? contracts_.cosmicSignatureGameProxy
				: contracts_[`cosmicSignatureGameV${contractVersionNumber_}Proxy`];
			const expectedEvent_ = (eventName_, callName_) => (contractVersionNumber_ < 3)
				? ["ArbitrumError", [`${callName_} call failed.`]]
				: [eventName_, []];
			const blockNumberFailure_ = expectedEvent_("ArbSysArbBlockNumberCallFailed", "ArbSys.arbBlockNumber");
			const blockHashFailure_ = expectedEvent_("ArbSysArbBlockHashCallFailed", "ArbSys.arbBlockHash");
			const gasBacklogFailure_ = expectedEvent_("ArbGasInfoGetGasBacklogCallFailed", "ArbGasInfo.getGasBacklog");
			const pricingUnitsFailure_ = expectedEvent_("ArbGasInfoGetL1PricingUnitsSinceUpdateCallFailed", "ArbGasInfo.getL1PricingUnitsSinceUpdate");
			const arbitrumCallFailedTopicHashes_ = new Set([blockNumberFailure_, blockHashFailure_, gasBacklogFailure_, pricingUnitsFailure_]
				.map(([eventName_]) => cosmicSignatureGameProxy_.interface.getEvent(eventName_).topicHash));

			for ( let counter_ = (LONG_TEST_MODE_CODE >= 3) ? 50 : 4; counter_ > 0; -- counter_ ) {
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
				const durationUntilMainPrize_ = await cosmicSignatureGameProxy_.getDurationUntilMainPrize();
				await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
				// await hre.ethers.provider.send("evm_mine");
				/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				const transactionResponsePromise_ = cosmicSignatureGameProxy_.connect(contracts_.signers[2]).claimMainPrize();
				const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
				const arbitrumCallFailedLogs_ =
					transactionReceipt_.logs.filter(
						(log_) =>
						(log_.address == contracts_.cosmicSignatureGameProxyAddress && arbitrumCallFailedTopicHashes_.has(log_.topics[0]))
					);
				// console.info("%s", `202507119 ${arbitrumCallFailedLogs_.length}`);
				let eventIndex_ = 0;
				if ((fakeArbBaseModeCode_ & 0x3n) != 0n) {
					// console.info("%s", "202507121");
					assertEvent(
						arbitrumCallFailedLogs_[eventIndex_],
						cosmicSignatureGameProxy_,
						...blockNumberFailure_
					);
					++ eventIndex_;
				} else if ((fakeArbBaseModeCode_ & 0x30n) != 0n) {
					// console.info("%s", "202507122");
					assertEvent(
						arbitrumCallFailedLogs_[eventIndex_],
						cosmicSignatureGameProxy_,
						...blockHashFailure_
					);
					++ eventIndex_;
				}
				if ((fakeArbBaseModeCode_ & 0x300n) != 0n) {
					// console.info("%s", "202507123");
					assertEvent(
						arbitrumCallFailedLogs_[eventIndex_],
						cosmicSignatureGameProxy_,
						...gasBacklogFailure_
					);
					++ eventIndex_;
				}
				if ((fakeArbBaseModeCode_ & 0x3000n) != 0n) {
					// console.info("%s", "202507124");
					assertEvent(
						arbitrumCallFailedLogs_[eventIndex_],
						cosmicSignatureGameProxy_,
						...pricingUnitsFailure_
					);
					++ eventIndex_;
				}
				// if (eventIndex_ == 0) {
				// 	console.info("%s", "202507125");
				// }
				expect(arbitrumCallFailedLogs_.length).equal(eventIndex_);
			}
		}
	});
});
