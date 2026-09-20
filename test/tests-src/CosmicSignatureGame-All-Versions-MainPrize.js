"use strict";

const { describe, it } = require("mocha");
const { testAcrossGameVersions, bidWithEthAt } = require("../src/GameRoundTestHelpers.js");
const { activateCurrentRound, mineAtOrAfter, getLatestBlockTimestamp } = require("../src/V2UpgradeTestHelpers.js");
const hre = require("hardhat");
const { expect } = require("chai");
const { generateRandomUInt32, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { anyUint } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { deployHostileBidder } = require("../src/AdversarialTestHelpers.js");

describe("CosmicSignatureGame-All-Versions-MainPrize", function () {
	it("allows non-last bidders to claim only after the claim timeout", async function () {
		await testAcrossGameVersions(async (contracts_, game_, roundNum_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const bidder_ = contracts_.signers[2];
			const other_ = contracts_.signers[3];
			await bidWithEthAt(game_, bidder_, await getLatestBlockTimestamp() + 1n);
			const publicClaimTime_ = await game_.mainPrizeTime() + await game_.timeoutDurationToClaimMainPrize();
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(publicClaimTime_) - 1,]);
			await expect(game_.connect(other_).claimMainPrize()).revertedWithCustomError(game_, "MainPrizeClaimDenied");
			await waitForTransactionReceipt(game_.connect(other_).claimMainPrize());
			expect(await game_.roundNum()).equal(roundNum_ + 1n);
		});
	});

	it("allows a late bidder to bid and immediately claim when mainPrizeTime remains in the past", async function () {
		await testAcrossGameVersions(async (contracts_, game_, roundNum_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);
			const firstBidder_ = contracts_.signers[2];
			await bidWithEthAt(game_, firstBidder_, await getLatestBlockTimestamp() + 1n);
			await mineAtOrAfter(await game_.mainPrizeTime() + await game_.getMainPrizeTimeIncrement() + 100n);
			const lateBidder_ = contracts_.signers[3];
			await bidWithEthAt(game_, lateBidder_, await getLatestBlockTimestamp() + 1n);
			expect(await game_.mainPrizeTime()).lte(await getLatestBlockTimestamp());
			await expect(game_.connect(firstBidder_).claimMainPrize()).revertedWithCustomError(game_, "MainPrizeClaimDenied");
			await waitForTransactionReceipt(game_.connect(lateBidder_).claimMainPrize());
			expect(await game_.roundNum()).equal(roundNum_ + 1n);
		}, 2);
	});

	it("The StakingWalletCosmicSignatureNft.deposit method reversal", async function () {
		await testAcrossGameVersions(async (contracts_, cosmicSignatureGameProxy_, roundNum_, contractVersionNumber_) => {
			const brokenStakingWalletCosmicSignatureNftFactory_ = await hre.ethers.getContractFactory("BrokenStakingWalletCosmicSignatureNft", contracts_.deployerSigner);
			const brokenStakingWalletCosmicSignatureNft_ = await brokenStakingWalletCosmicSignatureNftFactory_.deploy();
			await brokenStakingWalletCosmicSignatureNft_.waitForDeployment();
			const brokenStakingWalletCosmicSignatureNftAddress_ = await brokenStakingWalletCosmicSignatureNft_.getAddress();
			// await waitForTransactionReceipt(brokenStakingWalletCosmicSignatureNft_.transferOwnership(contracts_.ownerSigner.address));

			const newStakingWalletCosmicSignatureNft_ =
				await contracts_.stakingWalletCosmicSignatureNftFactory.deploy(contracts_.cosmicSignatureNftAddress, brokenStakingWalletCosmicSignatureNftAddress_);
			await newStakingWalletCosmicSignatureNft_.waitForDeployment();
			const newStakingWalletCosmicSignatureNftAddress_ = await newStakingWalletCosmicSignatureNft_.getAddress();
			await waitForTransactionReceipt(newStakingWalletCosmicSignatureNft_.transferOwnership(contracts_.ownerSigner.address));

			await waitForTransactionReceipt(brokenStakingWalletCosmicSignatureNft_.connect(contracts_.signers[4]).setStakingWalletCosmicSignatureNft(newStakingWalletCosmicSignatureNftAddress_));
			await waitForTransactionReceipt(cosmicSignatureGameProxy_.connect(contracts_.ownerSigner).setStakingWalletCosmicSignatureNft(brokenStakingWalletCosmicSignatureNftAddress_));

			await activateCurrentRound(cosmicSignatureGameProxy_, contracts_.ownerSigner);

			await waitForTransactionReceipt(contracts_.signers[4].sendTransaction({to: contracts_.cosmicSignatureGameProxyAddress, value: 10n ** 18n,}));
			const durationUntilMainPrize_ = await cosmicSignatureGameProxy_.getDurationUntilMainPrize();
			await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
			// await hre.ethers.provider.send("evm_mine");

			await waitForTransactionReceipt(brokenStakingWalletCosmicSignatureNft_.connect(contracts_.signers[4]).setEthDepositAcceptanceModeCode(2n));

			// Any `StakingWalletCosmicSignatureNft.deposit` panic except the division by zero will not be handled.
			// Comment-202410161 relates.
			await expect(cosmicSignatureGameProxy_.connect(contracts_.signers[4]).claimMainPrize()).revertedWithPanic(0x01n);

			await waitForTransactionReceipt(brokenStakingWalletCosmicSignatureNft_.connect(contracts_.signers[4]).setEthDepositAcceptanceModeCode(1n));

			// Any `StakingWalletCosmicSignatureNft.deposit` non-panic reversal will not be handled.
			// Comment-202410161 relates.
			await expect(cosmicSignatureGameProxy_.connect(contracts_.signers[4]).claimMainPrize()).revertedWith("I am not accepting deposits.");

			await waitForTransactionReceipt(brokenStakingWalletCosmicSignatureNft_.connect(contracts_.signers[4]).setEthDepositAcceptanceModeCode(0n));

			// `StakingWalletCosmicSignatureNft.deposit` panic due to division by zero will be handled.
			// Comment-202410161 relates.
			await expect(cosmicSignatureGameProxy_.connect(contracts_.signers[4]).claimMainPrize())
				.emit(cosmicSignatureGameProxy_, "MainPrizeClaimed")
				.and.emit(contracts_.cosmicSignatureNft, "NftMinted")
				.and.not.emit(newStakingWalletCosmicSignatureNft_, "EthDepositReceived");

				// // Testing. This assert has proven to fail.
				// .and.not.emit(contracts_.prizesWallet, "EthReceived");

			expect(await newStakingWalletCosmicSignatureNft_.numStakedNfts()).equal(0n);
			expect(await hre.ethers.provider.getBalance(newStakingWalletCosmicSignatureNftAddress_)).equal(0n);
		});
	});

	// Comment-202411077 relates and/or applies.
	it("ETH receive by charity reversal", async function () {
		await testAcrossGameVersions(async (contracts_, cosmicSignatureGameProxy_, roundNum_, contractVersionNumber_) => {
			const brokenEthReceiverFactory_ = await hre.ethers.getContractFactory("BrokenEthReceiver", contracts_.deployerSigner);
			const brokenEthReceiver_ = await brokenEthReceiverFactory_.deploy();
			await brokenEthReceiver_.waitForDeployment();
			const brokenEthReceiverAddress_ = await brokenEthReceiver_.getAddress();
			// await waitForTransactionReceipt(brokenEthReceiver_.transferOwnership(contracts_.ownerSigner.address));

			await waitForTransactionReceipt(cosmicSignatureGameProxy_.connect(contracts_.ownerSigner).setCharityAddress(brokenEthReceiverAddress_));

			const brokenEthReceiverEthDepositAcceptanceModeCode_ = BigInt(generateRandomUInt32() % 3);
			{
				await waitForTransactionReceipt(brokenEthReceiver_.connect(contracts_.signers[4]).setEthDepositAcceptanceModeCode(brokenEthReceiverEthDepositAcceptanceModeCode_));
				await activateCurrentRound(cosmicSignatureGameProxy_, contracts_.ownerSigner);
				await waitForTransactionReceipt(contracts_.signers[4].sendTransaction({to: contracts_.cosmicSignatureGameProxyAddress, value: 10n ** 18n,}));
				const durationUntilMainPrize_ = await cosmicSignatureGameProxy_.getDurationUntilMainPrize();
				await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
				// await hre.ethers.provider.send("evm_mine");
				const charityEthDonationAmount_ = await cosmicSignatureGameProxy_.getCharityEthDonationAmount();
				expect(charityEthDonationAmount_).greaterThan(0n);
				/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				const transactionResponsePromise_ = cosmicSignatureGameProxy_.connect(contracts_.signers[4]).claimMainPrize();
				const transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
				if (brokenEthReceiverEthDepositAcceptanceModeCode_ > 0n) {
					await transactionResponsePromiseAssertion_
						.emit(cosmicSignatureGameProxy_, "EthTransferToCharityFailed")
						.withArgs(brokenEthReceiverAddress_, charityEthDonationAmount_);
				} else {
					await transactionResponsePromiseAssertion_
						.emit(cosmicSignatureGameProxy_, "FundsTransferredToCharity")
						.withArgs(brokenEthReceiverAddress_, charityEthDonationAmount_);
				}
				const brokenEthReceiverEthBalanceAmount_ = await hre.ethers.provider.getBalance(brokenEthReceiverAddress_);
				expect(brokenEthReceiverEthBalanceAmount_).equal((brokenEthReceiverEthDepositAcceptanceModeCode_ > 0n) ? 0n : charityEthDonationAmount_);
			}
		});
	});

	it("ETH receive by main prize beneficiary reversal", async function () {
		await testAcrossGameVersions(async (contracts_, cosmicSignatureGameProxy_, roundNum_, contractVersionNumber_) => {
			const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerSigner);
			const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
			await bidderContract_.waitForDeployment();
			const bidderContractAddress_ = await bidderContract_.getAddress();

			await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[3]).setContractVersionNumber(BigInt(contractVersionNumber_)));
			await activateCurrentRound(cosmicSignatureGameProxy_, contracts_.ownerSigner);

			const nextEthBidPrice_ = await cosmicSignatureGameProxy_.getNextEthBidPriceAdvanced(1n);
			await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[4]).doBidWithEth({value: nextEthBidPrice_,}));
			const mainPrizeTime_ = await cosmicSignatureGameProxy_.mainPrizeTime();
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime_),]);
			// await hre.ethers.provider.send("evm_mine");
			const mainEthPrizeAmount_ = await cosmicSignatureGameProxy_.getMainEthPrizeAmount();

			for ( let bidderContractEthDepositAcceptanceModeCode_ = 2n; bidderContractEthDepositAcceptanceModeCode_ >= 0n; -- bidderContractEthDepositAcceptanceModeCode_ ) {
				await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[3]).setEthDepositAcceptanceModeCode(bidderContractEthDepositAcceptanceModeCode_));
				/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				const transactionResponsePromise_ = bidderContract_.connect(contracts_.signers[4]).doClaimMainPrize();
				const transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
				if (bidderContractEthDepositAcceptanceModeCode_ == 1n) {
					await transactionResponsePromiseAssertion_.revertedWith("I am not accepting deposits.");
				} else if (bidderContractEthDepositAcceptanceModeCode_ == 2n) {
					await transactionResponsePromiseAssertion_.revertedWithPanic(0x01);
				} else {
					// The V3 `MainPrizeClaimed` event gained the `prizeNumCosmicSignatureNfts` parameter.
					const mainPrizeClaimedEventOtherArgs_ = (contractVersionNumber_ < 3) ? [anyUint, anyUint, anyUint] : [anyUint, anyUint, anyUint, anyUint];
					await transactionResponsePromiseAssertion_
						.emit(cosmicSignatureGameProxy_, "MainPrizeClaimed")
						.withArgs(roundNum_, bidderContractAddress_, mainEthPrizeAmount_, ... mainPrizeClaimedEventOtherArgs_);
				}
				const bidderContractEthBalanceAmount_ = await hre.ethers.provider.getBalance(bidderContractAddress_);
				expect(bidderContractEthBalanceAmount_).equal((bidderContractEthDepositAcceptanceModeCode_ > 0n) ? 0n : mainEthPrizeAmount_);
			}
		});
	});

	it("a charity that reenters the game cannot block main-prize claiming", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			const hostileCharity_ = await deployHostileBidder(game_, contracts_.signers[10]);
			const hostileCharityAddress_ = await hostileCharity_.getAddress();

			// Mode 4 reenters `bidWithEth` whenever the charity receives ETH.
			await waitForTransactionReceipt(hostileCharity_.setHostilityModeCode(4n));
			await waitForTransactionReceipt(
				game_.connect(contracts_.ownerSigner).setCharityAddress(hostileCharityAddress_)
			);
			await activateCurrentRound(game_, contracts_.ownerSigner);

			const bidder_ = contracts_.signers[1];
			await bidWithEthAt(game_, bidder_, (await getLatestBlockTimestamp()) + 10n);
			const roundNum_ = await game_.roundNum();
			const charityAmount_ = await game_.getCharityEthDonationAmount();
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await game_.mainPrizeTime()),]);

			// Charity payout is best-effort: reentry makes the transfer fail, but claiming still completes.
			await expect(game_.connect(bidder_).claimMainPrize())
				.emit(game_, "EthTransferToCharityFailed")
				.withArgs(hostileCharityAddress_, charityAmount_);
			expect(await game_.roundNum()).equal(roundNum_ + 1n);
		});
	});
});
