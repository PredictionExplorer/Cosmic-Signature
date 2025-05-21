"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
// const { generateRandomUInt32, uint32ToPaddedHexString } = require("../src/Helpers.js");
const { setRoundActivationTimeIfNeeded } = require("../src/ContractDeploymentHelpers.js");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

describe("MainPrize", function () {
	it("The StakingWalletCosmicSignatureNft.deposit method reversal", async function () {
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
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
		const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1]);
		// await hre.ethers.provider.send("evm_mine");
		await expect(brokenStakingWalletCosmicSignatureNft_.setEthDepositAcceptanceModeCode(2n)).not.reverted;

		// Any `StakingWalletCosmicSignatureNft.deposit` panic except the division by zero will not be handled.
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize()).revertedWithPanic(0x01n);

		await expect(brokenStakingWalletCosmicSignatureNft_.setEthDepositAcceptanceModeCode(1n)).not.reverted;

		// Any `StakingWalletCosmicSignatureNft.deposit` non-panic reversal will not be handled.
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize()).revertedWith("I am not accepting deposits.");

		const cosmicSignatureNftStakingTotalEthRewardAmount_ = await contracts_.cosmicSignatureGameProxy.getCosmicSignatureNftStakingTotalEthRewardAmount();
		expect(cosmicSignatureNftStakingTotalEthRewardAmount_).greaterThan(0n);
		const charityEthDonationAmount_ = await contracts_.cosmicSignatureGameProxy.getCharityEthDonationAmount();
		expect(charityEthDonationAmount_).greaterThan(0n);
		expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddr)).equal(0n);
		await expect(brokenStakingWalletCosmicSignatureNft_.setEthDepositAcceptanceModeCode(0n)).not.reverted;

		// `StakingWalletCosmicSignatureNft.deposit` panic due to division by zero will be handled.
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize())
			.emit(contracts_.cosmicSignatureGameProxy, "FundsTransferredToCharity")
			.withArgs(contracts_.charityWalletAddr, cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_);

		// CS NFT staking rewards have been transferred to `contracts_.charityWalletAddr`,
		// which is the same as `await contracts_.cosmicSignatureGameProxy.charityAddress()`.
		// Comment-202411078 relates.
		expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddr)).equal(cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_);
	});

	// Comment-202411077 relates and/or applies.
	it("ETH receive by charity reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(999n);

		const brokenEthReceiverFactory_ = await hre.ethers.getContractFactory("BrokenEthReceiver", contracts_.deployerAcct);
		const brokenEthReceiver_ = await brokenEthReceiverFactory_.deploy();
		await brokenEthReceiver_.waitForDeployment();
		const brokenEthReceiverAddr_ = await brokenEthReceiver_.getAddress();
		// await expect(brokenEthReceiver_.transferOwnership(contracts_.ownerAcct.address)).not.reverted;

		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).setCharityAddress(brokenEthReceiverAddr_)).not.reverted;

		for (let ethDepositAcceptanceModeCode_ = 2n; ethDepositAcceptanceModeCode_ >= 0n; -- ethDepositAcceptanceModeCode_ ) {
			await expect(brokenEthReceiver_.setEthDepositAcceptanceModeCode(ethDepositAcceptanceModeCode_)).not.reverted;
			const durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1]);
			await hre.ethers.provider.send("evm_mine");
			const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).not.reverted;
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_)]);
			// await hre.ethers.provider.send("evm_mine");

			// There are no staked CS NFTs, so on main prize claim we will transfer this to charity.
			const cosmicSignatureNftStakingTotalEthRewardAmount_ = await contracts_.cosmicSignatureGameProxy.getCosmicSignatureNftStakingTotalEthRewardAmount();

			expect(cosmicSignatureNftStakingTotalEthRewardAmount_).greaterThan(0n);
			const charityEthDonationAmount_ = await contracts_.cosmicSignatureGameProxy.getCharityEthDonationAmount();
			expect(charityEthDonationAmount_).greaterThan(0n);
			const transactionResponseFuture_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[4]).claimMainPrize();
			if (ethDepositAcceptanceModeCode_ > 0n) {
				await expect(transactionResponseFuture_)
					.emit(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
					.withArgs("ETH transfer to charity failed.", brokenEthReceiverAddr_, cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_);
			} else {
				await expect(transactionResponseFuture_)
					.emit(contracts_.cosmicSignatureGameProxy, "FundsTransferredToCharity")
					.withArgs(brokenEthReceiverAddr_, cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_);
			}
			const brokenEthReceiverEthBalanceAmount_ = await hre.ethers.provider.getBalance(brokenEthReceiverAddr_);
			expect(brokenEthReceiverEthBalanceAmount_).equal((ethDepositAcceptanceModeCode_ > 0n) ? 0n : (cosmicSignatureNftStakingTotalEthRewardAmount_ + charityEthDonationAmount_));
		}
	});

	it("ETH receive by main prize beneficiary reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(1n);

		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerAcct);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddr);
		await bidderContract_.waitForDeployment();
		const bidderContractAddr_ = await bidderContract_.getAddress();

		const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(bidderContract_.connect(contracts_.signers[4]).doBidWithEth2({value: nextEthBidPrice_,})).not.reverted;
		const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1]);
		// await hre.ethers.provider.send("evm_mine");
		const mainEthPrizeAmount_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
		await expect(bidderContract_.setEthDepositAcceptanceModeCode(2n)).not.reverted;
		await expect(bidderContract_.connect(contracts_.signers[4]).doClaimMainPrize())
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
			.withArgs("ETH transfer to bidding round main prize beneficiary failed.", bidderContractAddr_, mainEthPrizeAmount_);
		await expect(bidderContract_.setEthDepositAcceptanceModeCode(1n)).not.reverted;
		await expect(bidderContract_.connect(contracts_.signers[4]).doClaimMainPrize())
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
			.withArgs("ETH transfer to bidding round main prize beneficiary failed.", bidderContractAddr_, mainEthPrizeAmount_);
		await expect(bidderContract_.setEthDepositAcceptanceModeCode(0n)).not.reverted;
		await expect(bidderContract_.connect(contracts_.signers[4]).doClaimMainPrize())
			.emit(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimed")
			.withArgs(0n, bidderContractAddr_, mainEthPrizeAmount_, 0n);
	});

	it("Reentry and double-claim attempts", async function () {
		const contracts_ = await loadFixtureDeployContractsForUnitTesting(999n);
		const maliciousBidderFactory_ = await hre.ethers.getContractFactory("MaliciousBidder", contracts_.deployerAcct);
		const maliciousBidder_ = await maliciousBidderFactory_.deploy(contracts_.cosmicSignatureGameProxyAddr);
		await maliciousBidder_.waitForDeployment();
		const maliciousBidderAddr_ = await maliciousBidder_.getAddress();

		const ethPriceToPay_ = 10n ** 18n;
		for ( let counter_ = 0; counter_ < 3; ++ counter_ ) {
			const durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilRoundActivation_) - 1]);
			// await hre.ethers.provider.send("evm_mine");
			for ( let maliciousBidderModeCode_ = 3n; maliciousBidderModeCode_ >= 0n; -- maliciousBidderModeCode_ ) {
				await expect(maliciousBidder_.setModeCode(maliciousBidderModeCode_)).not.reverted;
				const paidEthPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
				const overpaidEthPrice_ = ethPriceToPay_ - paidEthPrice_;
				expect(overpaidEthPrice_).greaterThan(0n);
				const transactionResponseFuture_ = maliciousBidder_.connect(contracts_.signers[4]).doBidWithEth({value: ethPriceToPay_,});
				if (maliciousBidderModeCode_ > 0n) {
					await expect(transactionResponseFuture_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
						.withArgs("ETH refund transfer failed.", maliciousBidderAddr_, overpaidEthPrice_);
				} else {
					await expect(transactionResponseFuture_)
						.emit(contracts_.cosmicSignatureGameProxy, "BidPlaced");
				}
			}
			const durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrize();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - 1]);
			// await hre.ethers.provider.send("evm_mine");
			for ( let maliciousBidderModeCode_ = 3n; maliciousBidderModeCode_ >= 0n; -- maliciousBidderModeCode_ ) {
				await expect(maliciousBidder_.setModeCode(maliciousBidderModeCode_)).not.reverted;
				const mainEthPrizeAmount_ = await contracts_.cosmicSignatureGameProxy.getMainEthPrizeAmount();
				const transactionResponseFuture_ = maliciousBidder_.connect(contracts_.signers[4]).doClaimMainPrize();
				if (maliciousBidderModeCode_ > 0n) {
					await expect(transactionResponseFuture_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
						.withArgs("ETH transfer to bidding round main prize beneficiary failed.", maliciousBidderAddr_, mainEthPrizeAmount_);
				} else {
					await expect(transactionResponseFuture_)
						.emit(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimed");
				}
			}
		}
	});
});
