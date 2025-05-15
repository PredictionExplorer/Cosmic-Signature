"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("CosmicSignatureGame-2", function () {
	it("claimMainPrize is non-reentrant (so it's impossible to claim multiple times)", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(999n);
		const maliciousMainPrizeClaimerFactory_ = await hre.ethers.getContractFactory("MaliciousMainPrizeClaimer", contracts_.deployerAcct);
		const maliciousMainPrizeClaimer_ = await maliciousMainPrizeClaimerFactory_.deploy(contracts_.cosmicSignatureGameProxyAddr);
		await maliciousMainPrizeClaimer_.waitForDeployment();
		// const maliciousMainPrizeClaimerAddr_ = await maliciousMainPrizeClaimer_.getAddress();

		for ( let numIterations_ = 0; numIterations_<= 1; ++ numIterations_ ) {
			const durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1]);
			await hre.ethers.provider.send("evm_mine");
			const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await expect(maliciousMainPrizeClaimer_.connect(contracts_.signers[3]).doBidWithEth({value: nextEthBidPrice_,})).not.reverted;
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
			// await hre.ethers.provider.send("evm_mine");
			const transactionResponseFuture_ = maliciousMainPrizeClaimer_.connect(contracts_.signers[3]).resetAndClaimMainPrize(BigInt(numIterations_));
			if (numIterations_ == 0) {
				await expect(transactionResponseFuture_).not.reverted;
			} else {
				await expect(transactionResponseFuture_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed");
			}
		}
	});
});
