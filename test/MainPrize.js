"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
// const { generateRandomUInt32, uint32ToPaddedHexString } = require("../src/Helpers.js");
const { setRoundActivationTimeIfNeeded } = require("../src/ContractDeploymentHelpers.js");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("MainPrize", function () {
	it("StakingWalletCosmicSignatureNft.deposit reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const brokenStakingWalletCosmicSignatureNftFactory_ = await hre.ethers.getContractFactory("BrokenStakingWalletCosmicSignatureNft", contracts_.deployerAcct);
		const brokenStakingWalletCosmicSignatureNft_ = await brokenStakingWalletCosmicSignatureNftFactory_.deploy();
		await brokenStakingWalletCosmicSignatureNft_.waitForDeployment();
		const brokenStakingWalletCosmicSignatureNftAddr_ = await brokenStakingWalletCosmicSignatureNft_.getAddress();
		// await expect(brokenStakingWalletCosmicSignatureNft_.transferOwnership(contracts_.ownerAcct.address)).not.reverted;

		const newStakingWalletCosmicSignatureNft_ =
			await contracts_.stakingWalletCosmicSignatureNftFactory.deploy(contracts_.cosmicSignatureNftAddr, brokenStakingWalletCosmicSignatureNftAddr_);
		await newStakingWalletCosmicSignatureNft_.waitForDeployment();
		const newStakingWalletCosmicSignatureNftAddr_ = await newStakingWalletCosmicSignatureNft_.getAddress();
		await expect(newStakingWalletCosmicSignatureNft_.transferOwnership(contracts_.ownerAcct.address)).not.reverted;

		await expect(brokenStakingWalletCosmicSignatureNft_.setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddr_)).not.reverted;
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).setStakingWalletCosmicSignatureNft(brokenStakingWalletCosmicSignatureNftAddr_)).not.reverted;
		await setRoundActivationTimeIfNeeded(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct), 1n);

		const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(brokenStakingWalletCosmicSignatureNft_.setDepositBlockingModeCode(2)).not.reverted;

		// Any `StakingWalletCosmicSignatureNft.deposit` panic except the division by zero will not be handled.
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).revertedWithPanic(0x01n);

		await expect(brokenStakingWalletCosmicSignatureNft_.setDepositBlockingModeCode(1)).not.reverted;

		// Any `StakingWalletCosmicSignatureNft.deposit` non-panic reversal will not be handled.
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).revertedWith("I am not accepting deposits.");

		const cosmicSignatureNftStakingTotalEthRewardAmount_ = await contracts_.cosmicSignatureGameProxy.getCosmicSignatureNftStakingTotalEthRewardAmount();
		expect(cosmicSignatureNftStakingTotalEthRewardAmount_ > 0n);
		const charityEthDonationAmount_ = await contracts_.cosmicSignatureGameProxy.getCharityEthDonationAmount();
		expect(charityEthDonationAmount_ > 0n);
		expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddr)).equal(0n);
		await expect(brokenStakingWalletCosmicSignatureNft_.setDepositBlockingModeCode(0)).not.reverted;

		// `StakingWalletCosmicSignatureNft.deposit` panic due to division by zero will be handled.
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize()).not.reverted;

		// CS NFT staking rewards have been transferred to `contracts_.charityWalletAddr`,
		// which is the same as `await contracts_.cosmicSignatureGameProxy.charityAddress()`.
		// Comment-202411078 relates.
		expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddr)).equal(cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_);
	});

	it("claimMainPrize is non-reentrant (so it's impossible to double-claim)", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(999n);
		const maliciousMainPrizeClaimerFactory_ = await hre.ethers.getContractFactory("MaliciousMainPrizeClaimer", contracts_.deployerAcct);
		const maliciousMainPrizeClaimer_ = await maliciousMainPrizeClaimerFactory_.deploy(contracts_.cosmicSignatureGameProxyAddr);
		await maliciousMainPrizeClaimer_.waitForDeployment();
		// const maliciousMainPrizeClaimerAddr_ = await maliciousMainPrizeClaimer_.getAddress();

		for ( let counter_ = 0; counter_<= 3; ++ counter_ ) {
			const durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1]);
			await hre.ethers.provider.send("evm_mine");
			const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await expect(maliciousMainPrizeClaimer_.connect(contracts_.signers[3]).doBidWithEth({value: nextEthBidPrice_,})).not.reverted;
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
			// await hre.ethers.provider.send("evm_mine");
			const numIterations_ = counter_ & 1;
			let transactionResponseFuture_ = maliciousMainPrizeClaimer_.connect(contracts_.signers[3]).resetAndClaimMainPrize(BigInt(numIterations_));
			if (numIterations_ > 0) {
				await expect(transactionResponseFuture_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed");
				transactionResponseFuture_ = maliciousMainPrizeClaimer_.connect(contracts_.signers[3]).resetAndClaimMainPrize(0n);
			}
			await expect(transactionResponseFuture_).not.reverted;
		}
	});
});
