"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { sleepForMilliSeconds, generateRandomUInt32, waitForTransactionReceipt } = require("../src/Helpers.js");
const { loadFixtureDeployContractsForTesting, makeNextBlockTimeDeterministic } = require("../src/ContractTestingHelpers.js");

// Comment-202501193 relates and/or applies.
describe("BlockTimeStamps", function () {
	it("Test 1", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const mineBlock_ = async () => {
			switch (generateRandomUInt32() % 4) {
				case 0: {
					await hre.ethers.provider.send("evm_mine");
					break;
				}
				case 1: {
					await hre.ethers.provider.send("hardhat_mine");
					break;
				}
				case 2: {
					await waitForTransactionReceipt(contracts_.signers[1].sendTransaction({to: contracts_.signers[2].address, value: 1,}));
					break;
				}
				default: {
					await waitForTransactionReceipt(contracts_.charityWallet.connect(contracts_.signers[1]).send());
					break;
				}
			}
		};

		await makeNextBlockTimeDeterministic(1000);
		await hre.ethers.provider.send("evm_mine");
		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		let latestBlockExpectedTimeStamp_ = latestBlock_.timestamp;
		for ( let counter_ = 0; counter_ < 10; ++ counter_ ) {
			const numSecondsToSleepFor_ = generateRandomUInt32() % 4;

			// This reaches the beginning of a second `numSecondsToSleepFor_` times.
			// Comment-202506264 applies.
			await sleepForMilliSeconds(numSecondsToSleepFor_ * 1000 + 1);

			switch (generateRandomUInt32() % 3) {
				case 0: {
					latestBlockExpectedTimeStamp_ += Math.max(numSecondsToSleepFor_, 1);
					break;
				}
				case 1: {
					const nextBlockTimeIncrease_ = generateRandomUInt32() % 4;
					await hre.ethers.provider.send("evm_increaseTime", [nextBlockTimeIncrease_]);
					latestBlockExpectedTimeStamp_ += Math.max(numSecondsToSleepFor_ + nextBlockTimeIncrease_, 1);
					break;
				}
				default: {
					const nextBlockTimeIncrease_ = generateRandomUInt32() % 3 + 1;
					await hre.ethers.provider.send("evm_setNextBlockTimestamp", [latestBlock_.timestamp + nextBlockTimeIncrease_,]);
					latestBlockExpectedTimeStamp_ += nextBlockTimeIncrease_;
					break;
				}
			}
			await mineBlock_();
			latestBlock_ = await hre.ethers.provider.getBlock("latest");
			// console.info(Date.now().toString(), latestBlock_.timestamp.toString());

			// Issue. There is an astronomically small chance that this assertion will fail after many iterations of this loop
			// if the generated random numbers result in system time running faster than we increase block timestamps.
			// But it will fail even sooner becuse the loop takes a few ms to execute (besides the sleeping),
			// which will eventually add up to 1 second, at which point we will reach the beginning of another second,
			// which will cause an additional incrase of the next block timestamp, which this logic is not prepared for.
			// But given that we execute this loop few times, a failure is highly unlikely.
			// That likelyhood is higher when the system is under stress.
			expect(latestBlock_.timestamp).equal(latestBlockExpectedTimeStamp_);
		}
	});
});
