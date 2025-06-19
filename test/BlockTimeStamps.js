"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { sleepForMilliSeconds, generateRandomUInt32 } = require("../src/Helpers.js");
const { loadFixtureDeployContractsForUnitTesting, makeNextBlockTimeDeterministic } = require("../src/ContractUnitTestingHelpers.js");

// Comment-202501193 relates and/or applies.
describe("BlockTimeStamps", function () {
	it("Test 1", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const mineBlock_ = async () => {
			switch (generateRandomUInt32() % 3) {
				case 0: {
					await hre.ethers.provider.send("evm_mine");
					break;
				}
				case 1: {
					await expect(contracts_.signers[1].sendTransaction({to: contracts_.signers[2].address, value: 1,})).not.reverted;
					break;
				}
				default: {
					await expect(contracts_.charityWallet.connect(contracts_.signers[1]).send()).not.reverted;
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

			// This reaches the beginning of a seond `numSecondsToSleepFor_` times.
			// Comment-202506264 applies.
			await sleepForMilliSeconds(numSecondsToSleepFor_ * 1000 + 1);

			if ((generateRandomUInt32() & 1) == 0) {
				latestBlockExpectedTimeStamp_ += Math.max(numSecondsToSleepFor_, 1);
			} else {
				const nextBlockTimeIncrease_ = generateRandomUInt32() % 4;
				await hre.ethers.provider.send("evm_increaseTime", [nextBlockTimeIncrease_]);
				latestBlockExpectedTimeStamp_ += Math.max(numSecondsToSleepFor_ + nextBlockTimeIncrease_, 1);
			}
			await mineBlock_();
			latestBlock_ = await hre.ethers.provider.getBlock("latest");
			// console.info(Date.now().toString(), latestBlock_.timestamp.toString());

			// Issue. There is an astronomically small chance that this assertion will fail after many iterations of this loop
			// if the generated random numbers result in system time running fster than we increase block timestamps.
			// But it will fail even sooner becuse the loop takes a few ms to execute (besides the sleeping),
			// which will eventually add up to 1 second, at which point we will reach the beginning of another second,
			// which will cause an incrase of the next block timestamp, which this logic is not prepared for.
			// But given that we execute this loop few times, there is only a very small chance of a failure.
			// That chance is higher when the system is under stress.
			expect(latestBlock_.timestamp).equal(latestBlockExpectedTimeStamp_);
		}
	});
});
