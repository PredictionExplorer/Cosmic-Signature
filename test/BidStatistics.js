"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { waitForTransactionReceipt } = require("../src/Helpers.js");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractTestingHelpers.js");

describe("BidStatistics", function () {
	it("Bid duration accounting: 2 bidders place bids of different durations", async function () {
		// Test case description:
		//    signer 1 longest bid is 1000 seconds long.
		//    signer 2 longest bid is 5000 seconds long.
		
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(100_000_000_000n);

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_000_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid1

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_001_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid2
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_006_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid3
				
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_007_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid4

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_008_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid5

		const [enduranceChampionAddress_, enduranceChampionDuration_,] = await contracts_.cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(enduranceChampionAddress_).equal(await contracts_.cosmicSignatureGameProxy.enduranceChampionAddress());
		expect(enduranceChampionAddress_).equal(contracts_.signers[2].address);
		expect(enduranceChampionDuration_).equal(await contracts_.cosmicSignatureGameProxy.enduranceChampionDuration());
		expect(enduranceChampionDuration_).equal(5000);
	});

	it("Bid duration accounting: 3 bidders place bids of equal durations", async function () {
		// Test case description:
		//    3 bidders place bids of equal durations of 1000 seconds.
		//    Signer 1 places the 1st bid and becomes the winner.

		const contracts_ = await loadFixtureDeployContractsForUnitTesting(100_000_000_000n);

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_000_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid1

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_001_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid2
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_002_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid3
				
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_003_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid4

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_004_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid5
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_005_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid6
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_006_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid7
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_007_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid8
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_008_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid9
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_009_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid10
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_010_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid11
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_011_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid12
		
		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_012_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid13

		const [enduranceChampionAddress_, enduranceChampionDuration_,] = await contracts_.cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(enduranceChampionAddress_).equal(await contracts_.cosmicSignatureGameProxy.enduranceChampionAddress());
		expect(enduranceChampionAddress_).equal(contracts_.signers[1].address);
		expect(enduranceChampionDuration_).equal(await contracts_.cosmicSignatureGameProxy.enduranceChampionDuration());
		expect(enduranceChampionDuration_).equal(1000);
	});

	it("Endurance Champion selection is correct for a specific use case", async function () {
		// Test case description:
		//    Signer 0 places the 1st bid of 1000 seconds long.
		//    Signer 1 places the 2nd bid of 2000 seconds long.
		//    Signer 2 places the 3d bid of 5000 seconds long.
		//    The 5000 seconds bid is the longest, therefore signer 2 is the Endurance Champion.
		
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(100_000_000_000n);

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_080_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid1 (for 1,000 seconds)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_081_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid2 (for 2,000 seconds)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_083_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid3 (for 5,000 seconds)

		await hre.ethers.provider.send("evm_setNextBlockTimestamp", [100_000_088_000,]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: 10n ** 18n,})); // bid4 (close everything)

		const [enduranceChampionAddress_, enduranceChampionDuration_,] = await contracts_.cosmicSignatureGameProxy.tryGetCurrentChampions();
		expect(enduranceChampionAddress_).equal(await contracts_.cosmicSignatureGameProxy.enduranceChampionAddress());
		expect(enduranceChampionAddress_).equal(contracts_.signers[2].address);
		expect(enduranceChampionDuration_).equal(await contracts_.cosmicSignatureGameProxy.enduranceChampionDuration());
		expect(enduranceChampionDuration_).equal(5000);
	});
});
