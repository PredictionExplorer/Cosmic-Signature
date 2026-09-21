"use strict";

const { describe, it } = require("mocha");
const { testAcrossGameVersions, activateRoundBidAndClaimMainPrize, bidAndClaimMainPrize, finishGameRound, bidWithEthAt } = require("../src/GameRoundTestHelpers.js");
const { activateCurrentRound, mineAtOrAfter, getLatestBlockTimestamp } = require("../src/V2UpgradeTestHelpers.js");
const hre = require("hardhat");
const { expect } = require("chai");
const { SECONDS_PER_HOUR } = require("../../src/CosmicSignatureConstants.js");
const { generateRandomUInt32, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { deployBrokenToken } = require("../src/AdversarialTestHelpers.js");
const { setRoundActivationTimeIfNeeded } = require("../../src/ContractDeploymentHelpers.js");

describe("CosmicSignatureGame-All-Versions-Bidding", function () {
	it("keeps ETH Dutch auction ending-price divisor doubling checked", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			// Round zero has no ETH Dutch auction. Check the next round's auction after each claim.
			await activateRoundBidAndClaimMainPrize(contracts_, game_);
			const gameForOwner_ = game_.connect(contracts_.ownerSigner);
			const normalEndingBidPriceDivisor_ = await game_.ethDutchAuctionEndingBidPriceDivisor();
			const endingBidPriceDivisor_ = 1n << 255n;
			await waitForTransactionReceipt(gameForOwner_.setEthDutchAuctionEndingBidPriceDivisor(endingBidPriceDivisor_));
			const durationDivisor_ = await game_.ethDutchAuctionDurationDivisor();
			const [auctionDuration_] = await game_.getEthDutchAuctionDurations();
			await mineAtOrAfter((await game_.roundActivationTime()) + auctionDuration_ + 1n);

			// Comment-202508192: require the overflow panic, not division by zero after a wrapped doubling.
			await expect(gameForOwner_.halveEthDutchAuctionEndingBidPrice()).revertedWithPanic(0x11);
			expect(await game_.ethDutchAuctionEndingBidPriceDivisor()).equal(endingBidPriceDivisor_);
			expect(await game_.ethDutchAuctionDurationDivisor()).equal(durationDivisor_);

			await waitForTransactionReceipt(gameForOwner_.setRoundActivationTime((await getLatestBlockTimestamp()) + SECONDS_PER_HOUR));
			await waitForTransactionReceipt(gameForOwner_.setEthDutchAuctionEndingBidPriceDivisor(normalEndingBidPriceDivisor_));
		});
	});

	it("ETH refund receive by bidder reversal", async function () {
		await testAcrossGameVersions(async (contracts_, cosmicSignatureGameProxy_, roundNum_, contractVersionNumber_) => {
			const ethBidAmount_ = 10n ** 18n;

			const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerSigner);
			const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
			await bidderContract_.waitForDeployment();
			const bidderContractAddress_ = await bidderContract_.getAddress();

			await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[3]).setContractVersionNumber(BigInt(contractVersionNumber_)));
			await activateCurrentRound(cosmicSignatureGameProxy_, contracts_.ownerSigner);

			for ( let bidderContractEthDepositAcceptanceModeCode_ = 2n; bidderContractEthDepositAcceptanceModeCode_ >= 0n; -- bidderContractEthDepositAcceptanceModeCode_ ) {
				await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[3]).setEthDepositAcceptanceModeCode(bidderContractEthDepositAcceptanceModeCode_));
				const requiredEthBidAmount_ = await cosmicSignatureGameProxy_.getNextEthBidPriceAdvanced(1n);
				const ethRefundAmount_ = ethBidAmount_ - requiredEthBidAmount_;

				// [Comment-202606162]
				// Issue. This test is not aware that the game can swallow a too small refund amount.
				// [/Comment-202606162]
				expect(ethRefundAmount_).greaterThan(0n);

				/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				const transactionResponsePromise_ = bidderContract_.connect(contracts_.signers[4]).doBidWithEth({value: ethBidAmount_,});
				const transactionResponsePromiseAssertion_ = expect(transactionResponsePromise_);
				if (bidderContractEthDepositAcceptanceModeCode_ == 1n) {
					await transactionResponsePromiseAssertion_.revertedWith("I am not accepting deposits.");
				} else if (bidderContractEthDepositAcceptanceModeCode_ == 2n) {
					await transactionResponsePromiseAssertion_.revertedWithPanic(0x01);
				} else {
					await transactionResponsePromiseAssertion_.emit(cosmicSignatureGameProxy_, "BidPlaced");
				}
				const bidderContractEthBalanceAmount_ = await hre.ethers.provider.getBalance(bidderContractAddress_);
				expect(bidderContractEthBalanceAmount_).equal((bidderContractEthDepositAcceptanceModeCode_ > 0n) ? 0n : ethRefundAmount_);
			}

			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(await cosmicSignatureGameProxy_.mainPrizeTime())]);
			await waitForTransactionReceipt(bidderContract_.doClaimMainPrize());
		});
	});

	// Tests interactions with hostile ETH recipients and broken donated tokens.
	it("broken ERC-20 and ERC-721 donation transfers revert the whole bid atomically", async function () {
		await testAcrossGameVersions(async (contracts_, game_) => {
			await activateCurrentRound(game_, contracts_.ownerSigner);

			const brokenToken_ = await deployBrokenToken(contracts_.prizesWallet, contracts_.signers[10]);
			await waitForTransactionReceipt(brokenToken_.setModeCode(1n));
			const brokenTokenAddress_ = await brokenToken_.getAddress();
			const bidder_ = contracts_.signers[1];

			await expect(
				game_.connect(bidder_).bidWithEthAndDonateToken(
					-1n,
					"",
					...(game_.interface.getFunction("bidWithEth").inputs.length === 3 ? [0n] : []),
					brokenTokenAddress_,
					1n,
					{ value: 10n ** 18n }
				)
			).revertedWith("BrokenToken rejects transferFrom.");
			expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);

			const donatedNftIndex_ = await contracts_.prizesWallet.nextDonatedNftIndex();
			await expect(
				game_.connect(bidder_).bidWithEthAndDonateNft(
					-1n,
					"",
					...(game_.interface.getFunction("bidWithEth").inputs.length === 3 ? [0n] : []),
					brokenTokenAddress_,
					42n,
					{ value: 10n ** 18n }
				)
			).revertedWith("BrokenToken rejects transferFrom.");
			expect(await game_.lastBidderAddress()).equal(hre.ethers.ZeroAddress);
			expect(await contracts_.prizesWallet.nextDonatedNftIndex()).equal(donatedNftIndex_);
			await bidAndClaimMainPrize(contracts_, game_);
		});
	});

	// [Comment-202507055]
	// Multiple similar tests exist.
	// [/Comment-202507055]
	// [Comment-202507057/]
	it("Reentries by donated ERC-20 and ERC-721 token contracts", async function () {
		await testAcrossGameVersions(async (contracts_, game_, roundNum_, contractVersionNumber_) => {
			const maliciousTokenFactory_ = await hre.ethers.getContractFactory("MaliciousToken", contracts_.deployerSigner);
			const maliciousToken_ = await maliciousTokenFactory_.deploy(hre.ethers.ZeroAddress, contracts_.cosmicSignatureGameProxyAddress);
			await maliciousToken_.waitForDeployment();
			const maliciousTokenAddress_ = await maliciousToken_.getAddress();

			const ethPriceToPayMaxLimit_ = 10n ** (18n - 2n);
			const ethDonationAmount_ = ethPriceToPayMaxLimit_ * 1_000n;
			await waitForTransactionReceipt(contracts_.signers[4].sendTransaction({to: maliciousTokenAddress_, value: ethDonationAmount_,}));
			const cosmicSignatureGameProxy_ = game_;

			const ensureSignerCstBalanceIsSufficientToPlaceCstBid_ = async () => {
				let nextCstBidPrice_;
				for (;;) {
					nextCstBidPrice_ = await cosmicSignatureGameProxy_.getNextCstBidPriceAdvanced(1n);
					if (await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[5].address) >= nextCstBidPrice_) {
						// console.info("%s", `202507052 ${hre.ethers.formatEther(nextCstBidPrice_)}`);
						break;
					}
					// console.info("%s", "202507046");

					// [Comment-202606166]
					// Reducing the next CST bid price.
					// In V2+, also increasing bid CST reward.
					// [/Comment-202606166]
					await hre.ethers.provider.send("evm_increaseTime", [Number(SECONDS_PER_HOUR),]);
					// await hre.ethers.provider.send("evm_mine");

					// Placing an ETH bid to get some CST.
					await hre.ethers.provider.send("evm_mine");
					await bidWithEthAt(game_, contracts_.signers[5], await getLatestBlockTimestamp() + 1n);
				}
				return nextCstBidPrice_;
			};

			await waitForTransactionReceipt(maliciousToken_.connect(contracts_.signers[4]).setContractVersionNumber(BigInt(contractVersionNumber_)));
			await setRoundActivationTimeIfNeeded(cosmicSignatureGameProxy_.connect(contracts_.ownerSigner), 2n);
			let ethBidPlaced_ = false;

			for ( let counter_ = 0; counter_ < 200; ++ counter_ ) {
				let randomNumber_ = generateRandomUInt32();

				// Comment-202507062 applies.
				const maliciousTokenModeCode_ = BigInt(randomNumber_ % (10 * 2) + 1);

				// console.info("%s", `202507155 ${maliciousTokenModeCode_}`);
				await waitForTransactionReceipt(maliciousToken_.connect(contracts_.signers[4]).setModeCode(maliciousTokenModeCode_));
				const ethBidValue_ = await game_.getNextEthBidPriceAdvanced(1n);
				/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
				let transactionResponsePromise_;
				randomNumber_ = generateRandomUInt32();
				const choiceCode_ = randomNumber_ % (( ! ethBidPlaced_ ) ? 2 : 4);
				switch (choiceCode_) {
					case 0: {
						// console.info("%s", "202507047");
						transactionResponsePromise_ =
							(contractVersionNumber_ <= 1) ?
							cosmicSignatureGameProxy_.connect(contracts_.signers[5]).bidWithEthAndDonateToken(-1n, "", maliciousTokenAddress_, 1n, {value: ethBidValue_,}) :
							cosmicSignatureGameProxy_.connect(contracts_.signers[5]).bidWithEthAndDonateToken(-1n, "", 0n, maliciousTokenAddress_, 1n, {value: ethBidValue_,});
						break;
					}
					case 1: {
						// console.info("%s", "202507048");
						transactionResponsePromise_ =
							(contractVersionNumber_ <= 1) ?
							cosmicSignatureGameProxy_.connect(contracts_.signers[5]).bidWithEthAndDonateNft(-1n, "", maliciousTokenAddress_, 0n, {value: ethBidValue_,}) :
							cosmicSignatureGameProxy_.connect(contracts_.signers[5]).bidWithEthAndDonateNft(-1n, "", 0n, maliciousTokenAddress_, 0n, {value: ethBidValue_,});
						break;
					}
					case 2: {
						// console.info("%s", "202507049");
						const nextCstBidPrice_ = await ensureSignerCstBalanceIsSufficientToPlaceCstBid_();
						transactionResponsePromise_ =
							(contractVersionNumber_ <= 1) ?
							cosmicSignatureGameProxy_.connect(contracts_.signers[5]).bidWithCstAndDonateToken(nextCstBidPrice_, "", maliciousTokenAddress_, 1n) :
							cosmicSignatureGameProxy_.connect(contracts_.signers[5]).bidWithCstAndDonateToken(nextCstBidPrice_, "", 0n, maliciousTokenAddress_, 1n);
						break;
					}
					default: {
						// console.info("%s", "202507050");
						const nextCstBidPrice_ = await ensureSignerCstBalanceIsSufficientToPlaceCstBid_();
						transactionResponsePromise_ =
							(contractVersionNumber_ <= 1) ?
							cosmicSignatureGameProxy_.connect(contracts_.signers[5]).bidWithCstAndDonateNft(nextCstBidPrice_, "", maliciousTokenAddress_, 0n) :
							cosmicSignatureGameProxy_.connect(contracts_.signers[5]).bidWithCstAndDonateNft(nextCstBidPrice_, "", 0n, maliciousTokenAddress_, 0n);
						break;
					}
				}

				// Comment-202507062 applies.
				if (maliciousTokenModeCode_ <= 10n) {

					// console.info("%s", "202507044");
					await expect(transactionResponsePromise_).revertedWithCustomError(cosmicSignatureGameProxy_, "ReentrancyGuardReentrantCall");
				} else {
					// console.info("%s", "202507045");
					await waitForTransactionReceipt(transactionResponsePromise_);
					// if (choiceCode_ <= 1) {
						// console.info("%s", "202507051");
						ethBidPlaced_ = true;
					// }

					// Comment-202606166 applies.
					// Issue. On the last iteration of the loop, it would be better to not do this. But keeping it simpe.
					await hre.ethers.provider.send("evm_increaseTime", [59 * 60,]);
					// await hre.ethers.provider.send("evm_mine");
				}
			}

			if (ethBidPlaced_) {
				await finishGameRound(contracts_, game_);
			} else {
				await bidAndClaimMainPrize(contracts_, game_);
			}
		});
	});
});
