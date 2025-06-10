"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { sleepForMilliSeconds } = require("../src/Helpers.js");
const { loadFixtureDeployContractsForUnitTesting, makeNextBlockTimeDeterministic } = require("../src/ContractUnitTestingHelpers.js");

// Comment-202501193 relates and/or applies.
describe("BlockTimeStamps", function () {
	it("Test 1", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		await expect(contracts_.charityWallet.connect(contracts_.ownerAcct).setCharityAddress(contracts_.signers[2].address)).not.reverted;
		await makeNextBlockTimeDeterministic(1000);
		await hre.ethers.provider.send("evm_mine");
		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		let blockExpectedTimeStamp_ = latestBlock_.timestamp;
		const timeStamp1_ = Date.now();
		for (;;) {
			const timeStamp2_ = Date.now();
			const slept_ = await makeNextBlockTimeDeterministic();
			// blockExpectedTimeStamp_ += slept_ + 3;
			blockExpectedTimeStamp_ += 3;
			// console.log(slept_.toString());
			await hre.ethers.provider.send("evm_mine");
			await expect(contracts_.signers[0].sendTransaction({to: contracts_.signers[1].address, value: 1,})).not.reverted;
			await expect(contracts_.charityWallet.connect(contracts_.signers[1]).send()).not.reverted;
			latestBlock_ = await hre.ethers.provider.getBlock("latest");
			expect(latestBlock_.timestamp).equal(blockExpectedTimeStamp_);
			if (timeStamp2_ - timeStamp1_ >= 5000) {
				break;
			}
			await sleepForMilliSeconds(50);
		}
	});

	it("Test 2", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		await expect(contracts_.charityWallet.connect(contracts_.ownerAcct).setCharityAddress(contracts_.signers[2].address)).not.reverted;
		await makeNextBlockTimeDeterministic(1000);
		await hre.ethers.provider.send("evm_mine");
		let latestBlock_ = await hre.ethers.provider.getBlock("latest");
		let blockExpectedTimeStamp_ = latestBlock_.timestamp;
		for (let blockTimeStampIncrement_ = 1; blockTimeStampIncrement_ <= 3; ) {
			const slept_ = await makeNextBlockTimeDeterministic();
			blockExpectedTimeStamp_ += blockTimeStampIncrement_ + 2;
			// console.log(slept_.toString(), blockTimeStampIncrement_.toString());
			await hre.ethers.provider.send("evm_increaseTime", [blockTimeStampIncrement_ - slept_]);
			await hre.ethers.provider.send("evm_mine");
			await expect(contracts_.signers[0].sendTransaction({to: contracts_.signers[1].address, value: 1,})).not.reverted;
			await expect(contracts_.charityWallet.connect(contracts_.signers[1]).send()).not.reverted;
			latestBlock_ = await hre.ethers.provider.getBlock("latest");
			expect(latestBlock_.timestamp).equal(blockExpectedTimeStamp_);
			blockTimeStampIncrement_ += slept_;
			await sleepForMilliSeconds(50);
		}
	});
});
