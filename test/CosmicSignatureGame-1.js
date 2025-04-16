// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256, generateRandomUInt256FromSeedWrapper } = require("../src/Helpers.js");
const { createFairRandomNumberGenerator } = require("../src/FairRandomNumberGenerator.js");
const { loadFixtureDeployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");
const {assertHardhatInvariant} = require("hardhat/internal/core/errors.js");
const {bigint} = require("hardhat/internal/core/params/argumentTypes.js");

// #endregion
// #region

const SKIP_LONG_TESTS = false;

// #endregion
// #region `describe`

describe("CosmicSignatureGame-1", function () {
	// #region

	it("Multiple bidding rounds", async function () {
		// #region

		if (SKIP_LONG_TESTS) return;

		// #endregion
		// #region

		// todo-0 Revisit these.
		const numRoundsToRun_ = 20;
		const bidAverageCountPerRoundMinLimit_ = 6.0;

		// #endregion
		// #region

		const randomNumberSeed_ = generateRandomUInt256();
		// console.log("0x" + randomNumberSeed_.toString(16));

		// #endregion
		// #region

		try {
			// #region

			const randomNumberSeedWrapper_ = {value: randomNumberSeed_,};
			const fairRandomNumberGenerator1_ = createFairRandomNumberGenerator(4, 3, randomNumberSeedWrapper_);
			let randomNumber_;

			// #endregion
			// #region

			// Remember to re-query this as needed.
			// todo-0 See above.
			let latestBlock_ = await hre.ethers.provider.getBlock("latest");

			randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
			const roundActivationTime_ = BigInt(latestBlock_.timestamp) - 90n + randomNumber_ % 201n;
			const contracts_ = await loadFixtureDeployContractsForUnitTesting(roundActivationTime_);
			const blockchainPropertyGetterFactory_ = await hre.ethers.getContractFactory("BlockchainPropertyGetter", contracts_.deployerAcct);
			const blockchainPropertyGetter_ = await blockchainPropertyGetterFactory_.deploy();
			await blockchainPropertyGetter_.waitForDeployment();
			// const blockchainPropertyGetterAddr_ = await blockchainPropertyGetter_.getAddress();
			latestBlock_ = await hre.ethers.provider.getBlock("latest");

			// #endregion
			// #region

			// todo-0 Keep in mind that this is not `bigint`.
			let totalBidCount_ = 0;
			const cosmicSignatureTokenState_ = /*await*/ createCosmicSignatureTokenState();
			await assertCosmicSignatureTokenState(cosmicSignatureTokenState_, contracts_);
			const randomWalkNftState_ = /*await*/ createRandomWalkNftState();
			await assertRandomWalkNftState(randomWalkNftState_, contracts_);
			const cosmicSignatureGameProxyState_ = /*await*/ createCosmicSignatureGameProxyState(contracts_, roundActivationTime_);
			await assertCosmicSignatureGameProxyState(cosmicSignatureGameProxyState_, contracts_, -1, -1n);

			// #endregion
			// #region

			do {
				// #region

				// Increasing the current time.
				// Issue. This logic is a bit of a hack, not precise science.
				// What we need is that the logic near Comment-202504043 succeeded
				// and the behavior was generally close to what will be happening in the production.
				// During an ETH Dutch auction, the time increase affects the initial ETH bid price, so as as a result,
				// over multiple bidding rounds, this logic affects whether the price tends to increase or decline.
				// So we want the price to decline (not too fast) so that we tested it approaching zero.
				{
					// This condition helps to slow down the decline of ETH Dutch auction bid price over multiple bidding rounds.
					if ( cosmicSignatureGameProxyState_.lastBidderAddress == hre.ethers.ZeroAddress &&
						  BigInt(latestBlock_.timestamp + 1) >= cosmicSignatureGameProxyState_.roundActivationTime
					) {

						// Doing nothing.
					} else {
						// Increasing time increase as the number of binds in the current bidding round increases.
						// Doing so ensures that the current time will eventually reach main prize time.
						let timeIncrementMaxLimit_ =
							cosmicSignatureGameProxyState_.mainPrizeTimeIncrementInMicroSeconds /
							BigInt(Math.max(4_000_000 - 10_000 * cosmicSignatureGameProxyState_.bidderAddresses.length, 1));

						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);

						// We want to sometimes let the first bidder or a non-last bidder to claim the main prize.
						// todo-0 But test how often a non-last bidder claims.
						if ((randomNumber_ & ((cosmicSignatureGameProxyState_.bidderAddresses.length == 1) ? 0x7n : 0x1Fn)) == 0n) {
							timeIncrementMaxLimit_ <<= 10n;
						}

						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
						const timeIncrement_ = randomNumber_ % timeIncrementMaxLimit_;
						if (timeIncrement_ > 0n) {
							if (timeIncrement_ > 1n) {
								await hre.ethers.provider.send("evm_increaseTime", [Number(timeIncrement_)]);
							}
							await hre.ethers.provider.send("evm_mine");
							latestBlock_ = await hre.ethers.provider.getBlock("latest");
						}
					}
				}

				// #endregion
				// #region

				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				const signerIndex_ = Number(randomNumber_ % BigInt(contracts_.signers.length));
				const signer_ = contracts_.signers[signerIndex_];
				// todo-0 Do we really need this?
				const cosmicSignatureTokenForSigner_ = contracts_.cosmicSignatureToken.connect(signer_);
				let signer2Index_ = signerIndex_;
				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				if ((randomNumber_ & 7n) == 0n) {
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					signer2Index_ = Number(randomNumber_ % BigInt(contracts_.signers.length));
				}
				const signer2_ = contracts_.signers[signer2Index_];
				const randomWalkNftForSigner2_ = contracts_.randomWalkNft.connect(signer2_);
				const cosmicSignatureGameProxyForSigner_ = contracts_.cosmicSignatureGameProxy.connect(signer_);
				let transactionSucceeded_ = true;
				let randomWalkNftId_ = -1n;
				const fairRandomNumber1_ = fairRandomNumberGenerator1_.getNext();

				// #endregion
				// #region

				// todo-0 Calling only some contract methods for now. We need to call some others as well.
				switch (fairRandomNumber1_ % 4) {
					// #region Calling `donateEth`

					case 0: {
						const blockBefore_ = latestBlock_;
						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
						const ethDonationAmount_ = ((randomNumber_ & (0xFn << 128n)) == 0n) ? 0n : (randomNumber_ & ((1n << 40n) - 1n));
						const transactionResponseFuture_ = cosmicSignatureGameProxyForSigner_.donateEth({value: ethDonationAmount_,});
						// await expect(transaction).not.reverted;
						await expect(transactionResponseFuture_)
							.emit(cosmicSignatureGameProxyForSigner_, "EthDonated")
							.withArgs(cosmicSignatureGameProxyState_.roundNum, signer_.address, ethDonationAmount_);
						const transactionResponse_ = await transactionResponseFuture_;
						const transactionReceipt_ = await transactionResponse_.wait();
						// console.log(transactionReceipt.logs);
						// console.log();
						expect(transactionReceipt_.logs.length).equal(1);
						latestBlock_ = await hre.ethers.provider.getBlock("latest");
						const blockAfter_ = latestBlock_;
						expect(blockAfter_.timestamp).equal(blockBefore_.timestamp + 1)
						cosmicSignatureGameProxyState_.ethBalanceAmount += ethDonationAmount_;
						break;
					}

					// #endregion
					// #region Calling `bidWithEth`

					case 1: {
						// todo-0 latestBlock_, blockBefore_, blockAfter_
						// todo-0 Sometimes donate an NFT.

						// #region

						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);

						// Issue. Not testing an invalid NFT ID. In that case `ERC721.ownerOf`, which our contract calls,
						// would revert with a different error.
						randomWalkNftId_ = BigInt.asIntN(256, randomNumber_);

						if (randomWalkNftId_ >= 0n) {
							randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
							if ((randomNumber_ & 0xFn) == 0n) {
								const randomWalkNftTotalSupply_ = randomWalkNftState_.totalSupply()
								if (randomWalkNftTotalSupply_ > 0n) {
									// This NFT already exists.
									// There is a small chance that it belongs to a particular signer.
									// There is probably over 50% chance that it's already used.
									randomWalkNftId_ %= randomWalkNftTotalSupply_;

									// Making a reasonble effort to find an unused NFT that belongs to `signer_` (not `signer2_`).
									for ( let counter_ = contracts_.signers.length; counter_ > 0; -- counter_ ) {
										if ( randomWalkNftState_.ownerOf(randomWalkNftId_) == signer_.address &&
										     ( ! cosmicSignatureGameProxyState_.usedRandomWalkNfts[randomWalkNftId_] )
										) {
											break;
										}
										randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
										randomWalkNftId_ = randomNumber_ % randomWalkNftTotalSupply_;
									}
								} else {
									randomWalkNftId_ = ( ~ randomWalkNftId_ );
								}
							} else {
								await expect(randomWalkNftForSigner2_.mint({value: await randomWalkNftForSigner2_.getMintPrice(),})).not.reverted;
								latestBlock_ = await hre.ethers.provider.getBlock("latest");
								randomWalkNftId_ = randomWalkNftState_.mint(signer2_.address);
							}
						}

						// #endregion
						// #region

						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
						const bidMessageLength_ = cosmicSignatureGameProxyState_.bidMessageLengthMaxLimit + randomNumber_ % 32n - 29n;
						const bidMessage_ = "x".repeat(Number(bidMessageLength_));
						const blockBefore_ = latestBlock_;
						const ethBidPrice_ = cosmicSignatureGameProxyState_.getNextEthBidPrice(blockBefore_, 1n);
						const paidEthPrice_ =
							(randomWalkNftId_ < 0n) ?
							ethBidPrice_ :
							cosmicSignatureGameProxyState_.getEthPlusRandomWalkNftBidPrice(ethBidPrice_);
						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
						const ethPriceToPayMaxLimit_ = randomNumber_ % (paidEthPrice_ * 16n);
						const signerEthBalanceAmountBefore_ = await hre.ethers.provider.getBalance(signer_.address);

						// #endregion
						// #region

						const transactionResponseFuture_ = cosmicSignatureGameProxyForSigner_.bidWithEth(randomWalkNftId_, bidMessage_, {value: ethPriceToPayMaxLimit_,});

						// #endregion
						// #region

						const overpaidEthPrice_ = ethPriceToPayMaxLimit_ - paidEthPrice_;
						if (transactionSucceeded_) {
							if (overpaidEthPrice_ < 0) {
								await expect(transactionResponseFuture_)
									.revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "InsufficientReceivedBidAmount")
									.withArgs("The current ETH bid price is greater than the amount you transferred.", paidEthPrice_, ethPriceToPayMaxLimit_);
								// console.log("202504151");
								transactionSucceeded_ = false;
							}
						}
						if (transactionSucceeded_) {
							if (randomWalkNftId_ < 0n) {
								// Doing nothing.
							} else {
								if (cosmicSignatureGameProxyState_.usedRandomWalkNfts[randomWalkNftId_]) {
									await expect(transactionResponseFuture_)
										.revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "UsedRandomWalkNft")
										.withArgs("This Random Walk NFT has already been used for bidding.", randomWalkNftId_);
									// console.log("202504152");
									transactionSucceeded_ = false;
								}
								else if (signer_.address != randomWalkNftState_.ownerOf(randomWalkNftId_)) {
									await expect(transactionResponseFuture_)
										.revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "CallerIsNotNftOwner")
										.withArgs("You are not the owner of this Random Walk NFT.", contracts_.randomWalkNftAddr, randomWalkNftId_, signer_.address);
									// console.log("202504153");
									transactionSucceeded_ = false;
								}
							}
						}
						if (transactionSucceeded_) {
							if (bidMessageLength_ > cosmicSignatureGameProxyState_.bidMessageLengthMaxLimit) {
								await expect(transactionResponseFuture_)
									.revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "TooLongBidMessage")
									.withArgs("Message is too long.", bidMessageLength_);
								// console.log("202504154");
								transactionSucceeded_ = false;
							}
						}
						if (transactionSucceeded_) {
							if (cosmicSignatureGameProxyState_.lastBidderAddress == hre.ethers.ZeroAddress) {
								// console.log(blockBefore_.timestamp, cosmicSignatureGameProxyState_.roundActivationTime);
								if (BigInt(blockBefore_.timestamp + 1) < cosmicSignatureGameProxyState_.roundActivationTime) {
									await expect(transactionResponseFuture_)
										.revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "RoundIsInactive")
										.withArgs("The current bidding round is not active yet.", cosmicSignatureGameProxyState_.roundActivationTime, BigInt(blockBefore_.timestamp + 1));
									console.log("202504155");
									transactionSucceeded_ = false;
								}
							}
						}

						// #endregion
						// #region

						if (transactionSucceeded_) {
							console.log("202504158", hre.ethers.formatEther(ethBidPrice_));
							// await expect(transactionResponseFuture).not.reverted;
							const transactionResponse_ = await transactionResponseFuture_;
							const transactionReceipt_ = await transactionResponse_.wait();
							latestBlock_ = await hre.ethers.provider.getBlock("latest");
							const blockAfter_ = latestBlock_;
							expect(blockAfter_.timestamp).equal(blockBefore_.timestamp + 1)
							const signerEthBalanceAmountAfter_ = await hre.ethers.provider.getBalance(signer_.address);
							let numEvents_ = 2;
							if (randomWalkNftId_ >= 0n) {
								cosmicSignatureGameProxyState_.usedRandomWalkNfts[randomWalkNftId_] = true;
							}
							cosmicSignatureGameProxyState_.biddersInfo[signer_.address].totalSpentEthAmount += paidEthPrice_;
							if (cosmicSignatureGameProxyState_.lastBidderAddress == hre.ethers.ZeroAddress) {
								cosmicSignatureGameProxyState_.ethDutchAuctionBeginningBidPrice = ethBidPrice_ * cosmicSignatureGameProxyState_.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
							}
							cosmicSignatureGameProxyState_.nextEthBidPrice = ethBidPrice_ + ethBidPrice_ / cosmicSignatureGameProxyState_.ethBidPriceIncreaseDivisor + 1n;
							cosmicSignatureTokenState_.mint(signer_.address, cosmicSignatureGameProxyState_.cstRewardAmountForBidding);
							await expect(transactionResponseFuture_)
								.emit(cosmicSignatureTokenForSigner_, "Transfer")
								.withArgs(hre.ethers.ZeroAddress, signer_.address, cosmicSignatureGameProxyState_.cstRewardAmountForBidding);
							if (cosmicSignatureGameProxyState_.lastBidderAddress == hre.ethers.ZeroAddress) {
								cosmicSignatureGameProxyState_.cstDutchAuctionBeginningTimeStamp = BigInt(blockAfter_.timestamp);
								cosmicSignatureGameProxyState_.mainPrizeTime =
									BigInt(blockAfter_.timestamp) + cosmicSignatureGameProxyState_.getInitialDurationUntilMainPrize();
								await expect(transactionResponseFuture_)
									.emit(cosmicSignatureGameProxyForSigner_, "FirstBidPlacedInRound")
									.withArgs(cosmicSignatureGameProxyState_.roundNum, BigInt(blockAfter_.timestamp));
								++ numEvents_;
							} else {
								cosmicSignatureGameProxyState_._updateChampionsIfNeeded(blockAfter_);
								cosmicSignatureGameProxyState_._extendMainPrizeTime(blockAfter_);
							}
							cosmicSignatureGameProxyState_.lastBidderAddress = signer_.address;
							cosmicSignatureGameProxyState_.bidderAddresses.push(signer_.address);
							cosmicSignatureGameProxyState_.biddersInfo[signer_.address].lastBidTimeStamp = BigInt(blockAfter_.timestamp);
							await expect(transactionResponseFuture_)
								.emit(cosmicSignatureGameProxyForSigner_, "BidPlaced")
								.withArgs(
									cosmicSignatureGameProxyState_.roundNum,
									signer_.address,
									paidEthPrice_,
									(-1n),
									randomWalkNftId_,
									bidMessage_,
									cosmicSignatureGameProxyState_.mainPrizeTime
								);
							expect(transactionReceipt_.logs.length).equal(numEvents_);
							let cosmicSignatureGameProxyEthBalanceAmountIncrement_ = paidEthPrice_;
							if (overpaidEthPrice_ > 0n) {
								// todo-0 This is zero, so make an effort to test this case.
								const blockBaseFee_ = await blockchainPropertyGetter_.getBlockBaseFee();
								const ethBidRefundAmountMinLimit_ = cosmicSignatureGameProxyState_.ethBidRefundAmountInGasMinLimit * blockBaseFee_;
								if (overpaidEthPrice_ >= ethBidRefundAmountMinLimit_) {
									// todo-1 Not testing refund transfer error.
									// todo-1 Reference where we test it.
								} else {
									cosmicSignatureGameProxyEthBalanceAmountIncrement_ = ethPriceToPayMaxLimit_;
								}
							}
							cosmicSignatureGameProxyState_.ethBalanceAmount += cosmicSignatureGameProxyEthBalanceAmountIncrement_;
							const transactionFeeInEth_ =
								BigInt(transactionReceipt_.gasUsed * (transactionReceipt_.effectiveGasPrice ?? transactionReceipt_.gasPrice));
							expect(signerEthBalanceAmountAfter_).equal(signerEthBalanceAmountBefore_ - cosmicSignatureGameProxyEthBalanceAmountIncrement_ - transactionFeeInEth_);
							await assertCosmicSignatureTokenBalanceAmountOf(cosmicSignatureTokenState_, contracts_, signer_.address);
						} else {
							latestBlock_ = await hre.ethers.provider.getBlock("latest");
						}

						// #endregion
						// #region
						
						break;

						// #endregion
					}

					// #endregion
					// #region Calling `bidWithCst`

					// todo-0 Validate ETH and CST balance of relevant contracts and signers.
					case 2: {
						// const latestBlock_ = await hre.ethers.provider.getBlock("latest");
						// const nextCstBidPrice_ = getNextCstBidPrice(latestBlock_, 1n);
						// randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
						// const cstPriceToPayMaxLimit_ = randomNumber_ % (nextCstBidPrice_ * 3n + 1n);
						// const signerCstBalance_ = tokenBalanceOf(cosmicSignatureTokenState_, signer_.address);
						// // todo-0 Sometimes bid with donating an NFT.
						// const transactionResponseFuture_ = /*await*/ cosmicSignatureGameProxyForSigner_.bidWithCst(cstPriceToPayMaxLimit_, "");
						// if (nextCstBidPrice_ > cstPriceToPayMaxLimit_) {
						// 	await expect(transactionResponseFuture_).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "InsufficientReceivedBidAmount");
						// } else if (nextCstBidPrice_ > signerCstBalance_) {
						// 	await expect(transactionResponseFuture_).revertedWithCustomError(cosmicSignatureTokenForSigner_, "ERC20InsufficientBalance");
						// } else if (cosmicSignatureGameProxyState_.lastBidderAddress == hre.ethers.ZeroAddress) {
						// 	if (latestBlock_.timestamp + 1 < cosmicSignatureGameProxyState_.roundActivationTime) {
						// 		await expect(transactionResponseFuture_).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "RoundIsInactive");
						// 	} else {
						// 		await expect(transactionResponseFuture_).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "WrongBidType");
						// 	}
						// } else {
						// 	transactionSucceeded_ = true;
						// }
						// if (transactionSucceeded_) {
						// 	// todo-0 Check events instead of checking not reverted.
						// 	await expect(transactionResponseFuture_).not.reverted;
						// 	if (cosmicSignatureGameProxyState_.lastBidderAddress == hre.ethers.ZeroAddress) {
						// 		cosmicSignatureGameProxyState_.mainPrizeTime =
						// 			BigInt(latestBlock_.timestamp + 1) +
						// 			(cosmicSignatureGameProxyState_.mainPrizeTimeIncrementInMicroSeconds / cosmicSignatureGameProxyState_.initialDurationUntilMainPrizeDivisor);
						// 	} else {
						// 		const mainPrizeCorrectedTime_ = BigInt(Math.max(Number(cosmicSignatureGameProxyState_.mainPrizeTime), latestBlock_.timestamp + 1));
						// 		cosmicSignatureGameProxyState_.mainPrizeTime =
						// 			mainPrizeCorrectedTime_ +
						// 			(cosmicSignatureGameProxyState_.mainPrizeTimeIncrementInMicroSeconds / 1_000_000n);
						// 	}
						// 	cosmicSignatureGameProxyState_.lastBidderAddress = signer_.address;
						// 	++ cosmicSignatureGameProxyState_.bidderAddresses[Number(cosmicSignatureGameProxyState_.roundNum)];
						// }
						break;
					}

					// #endregion
					// #region Calling `claimMainPrize`

					// todo-0 Remember to assert marketing wallet balance.
					// todo-0 Afterwarsd, call cosmicSignatureGameProxyState_._prepareNextRound
					// todo-0 Validate ETH and CST balance of relevant contracts and signers.
					// todo-0 Use generateRandomUInt256Seed
					case 3: {
						// const latestBlock_ = await hre.ethers.provider.getBlock("latest");
						// // todo-0 Rename this and similar variables to `transactionResponse`.
						// const transaction_ = /*await*/ cosmicSignatureGameProxyForSigner_.claimMainPrize();
						// if (signer_.address == cosmicSignatureGameProxyState_.lastBidderAddress) {
						// 	if (latestBlock_.timestamp + 1 < cosmicSignatureGameProxyState_.mainPrizeTime) {
						// 		await expect(transaction_).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "MainPrizeEarlyClaim");
						// 	} else {
						// 		transactionSucceeded_ = true;
						// 	}
						// } else {
						// 	if (cosmicSignatureGameProxyState_.lastBidderAddress == hre.ethers.ZeroAddress) {
						// 		await expect(transaction_).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "NoBidsPlacedInCurrentRound");
						// 	} else if (latestBlock_.timestamp + 1 < cosmicSignatureGameProxyState_.mainPrizeTime + cosmicSignatureGameProxyState_.timeoutDurationToClaimMainPrize) {
						// 		await expect(transaction_).revertedWithCustomError(cosmicSignatureGameProxyForSigner_, "MainPrizeClaimDenied");
						// 	} else {
						// 		transactionSucceeded_ = true;
						// 	}
						// }
						// if (transactionSucceeded_) {
						// 	// todo-0 Remember to reset `cosmicSignatureGameProxyState_.bidderAddresses.length = 0`.
						// 	// todo-0 Same for `biddersInfo`.

						// 	// todo-0 Remember to update `totalBidCount_`.

						// 	// todo-0 Check events instead of checking not reverted.
						// 	await expect(transaction_).not.reverted;
						// 	console.log(
						// 		cosmicSignatureGameProxyState_.roundNum.toString(),
						// 		cosmicSignatureGameProxyState_.bidderAddresses[Number(cosmicSignatureGameProxyState_.roundNum)].toString(),
						// 		// (await hre.ethers.provider.getBalance(signer_.address) + 10n ** 18n / 2n) / 10n ** 18n
						// 		hre.ethers.formatEther(await cosmicSignatureGameProxyForSigner_.getNextEthBidPrice(0n))
						// 	);
						// 	cosmicSignatureGameProxyState_.lastBidderAddress = hre.ethers.ZeroAddress;
						// 	cosmicSignatureGameProxyState_.bidderAddresses.push(0n);
						// 	++ cosmicSignatureGameProxyState_.roundNum;
						// 	cosmicSignatureGameProxyState_.roundActivationTime = BigInt(latestBlock_.timestamp + 1) + cosmicSignatureGameProxyState_.delayDurationBeforeRoundActivation;
						// 	cosmicSignatureGameProxyState_.mainPrizeTimeIncrementInMicroSeconds += cosmicSignatureGameProxyState_.mainPrizeTimeIncrementInMicroSeconds / cosmicSignatureGameProxyState_.mainPrizeTimeIncrementIncreaseDivisor;
						// }
						break;
					}

					// #endregion
					// #region Unreachable
					
					default: {
						throw new Error("Bug 202504041.");
						// break;
					}

					// #endregion
				}
			
				// #endregion
				// #region

				if (transactionSucceeded_) {
					await assertCosmicSignatureTokenState(cosmicSignatureTokenState_, contracts_);
					await assertRandomWalkNftState(randomWalkNftState_, contracts_);
					await assertCosmicSignatureGameProxyState(cosmicSignatureGameProxyState_, contracts_, signerIndex_, randomWalkNftId_);
				}

				// #endregion
			} while (cosmicSignatureGameProxyState_.roundNum < numRoundsToRun_);

			// #endregion
			// #region

			// [Comment-202504043/]
			{
				const bidAverageCountPerRound_ = totalBidCount_ / Number(cosmicSignatureGameProxyState_.roundNum);
				const isSuccess_ = bidAverageCountPerRound_ >= bidAverageCountPerRoundMinLimit_;
				if ( ! isSuccess_ ) {
					const errorDetails_ = {bidAverageCountPerRound: bidAverageCountPerRound_,};
					throw new Error("Error 202504052. " + JSON.stringify(errorDetails_));
				}
			}

			// #endregion
		} catch (errorDetails_) {
			// #region

			{
				const errorContext_ = {randomNumberSeed: "0x" + randomNumberSeed_.toString(16),};
				console.log("Error 202504055. " + JSON.stringify(errorContext_));
			}
			throw errorDetails_;

			// #endregion
		}

		// #endregion
	});

	// #endregion
});

// #endregion
// #region `createCosmicSignatureTokenState`

/*async*/ function createCosmicSignatureTokenState() {
	// #region

	const cosmicSignatureTokenState_ = {
		// #region Data

		accountBalanceAmounts: {},

		// #endregion
		// #region `mint`

		mint: function(account_, value_) {
			if (account_ == hre.ethers.ZeroAddress) {
				throw Error("Error 202504126.");
			}
			if (value_ < 0n) {
				throw Error("Error 202504127.");
			}
			const tokenNewBalanceAmount_ = this.balanceOf(account_) + value_;

			// We want the balance to occupy not too many bits.
			// It would be a concern if we observe it to be bigger than this.
			// Comment-202412033 relates and/or applies.
			if (tokenNewBalanceAmount_ >= 1n << 128n) {
				throw Error("Error 202504128.");
			}

			this.accountBalanceAmounts[account_] = tokenNewBalanceAmount_;
		},

		// #endregion
		// #region `burn`

		burn: function(account_, value_) {
			if (account_ == hre.ethers.ZeroAddress) {
				throw Error("Error 202504129.");
			}
			if (value_ < 0n) {
				throw Error("Error 202504131.");
			}
			const tokenNewBalanceAmount_ = this.balanceOf(account_) - value_;
			if (tokenNewBalanceAmount_ < 0n) {
				throw Error("Error 202504132.");
			}
			this.accountBalanceAmounts[account_] = tokenNewBalanceAmount_;
		},

		// #endregion
		// #region `balanceOf`

		balanceOf: function(account_) {
			return this.accountBalanceAmounts[account_] ?? 0n;
		},

		// #endregion
	};

	// #endregion
	// #region

	return cosmicSignatureTokenState_;

	// #endregion
}

// #endregion
// #region `assertCosmicSignatureTokenState`

async function assertCosmicSignatureTokenState(cosmicSignatureTokenState_, contracts_) {
	// Doing nothing.
	// todo-0 Not much to do here?
}

// #endregion
// #region `assertCosmicSignatureTokenBalanceAmountOf`

async function assertCosmicSignatureTokenBalanceAmountOf(cosmicSignatureTokenState_, contracts_, account_) {
	expect(await contracts_.cosmicSignatureToken.balanceOf(account_)).equal(cosmicSignatureTokenState_.balanceOf(account_));
}

// #endregion
// #region `createRandomWalkNftState`

/*async*/ function createRandomWalkNftState() {
	// #region

	const randomWalkNftState_ = {
		// #region Data

		/// For each NFT ID, stores NFT owner address.
		nftOwnerAddresses: [],

		// #endregion
		// #region `mint`

		mint: function(to_) {
			if (to_ == hre.ethers.ZeroAddress) {
				throw Error("Error 202504122.");
			}
			const nftId_ = this.totalSupply();
			this.nftOwnerAddresses.push(to_);
			return nftId_;
		},

		// #endregion
		// #region `transferFrom`

		transferFrom: function(from_, to_, nftId_) {
			if (to_ == hre.ethers.ZeroAddress) {
				throw Error("Error 202504123.");
			}
			if (this.ownerOf(nftId_) != from_) {
				throw Error("Error 202504124.");
			}
			this.nftOwnerAddresses[Number(nftId_)] = to_;
		},

		// #endregion
		// #region `ownerOf`

		ownerOf: function(nftId_) {
			this.checkNftIdIsValid(nftId_);
			return this.nftOwnerAddresses[Number(nftId_)];
		},

		// #endregion
		// #region `checkNftIdIsValid`

		checkNftIdIsValid: function(nftId_) {
			if ( ! this.isNftIdValid(nftId_) ) {
				throw Error("Error 202504125.");
			}
		},

		// #endregion
		// #region `isNftIdValid`

		isNftIdValid: function(nftId_) {
			return nftId_ < this.totalSupply();
		},

		// #endregion
		// #region `totalSupply`

		totalSupply: function() {
			return BigInt(this.nftOwnerAddresses.length);
		},

		// #endregion
	};

	// #endregion
	// #region

	return randomWalkNftState_;

	// #endregion
}

// #endregion
// #region `assertRandomWalkNftState`

async function assertRandomWalkNftState(randomWalkNftState_, contracts_) {
	// Doing nothing.
	// todo-0 Not much to do here?
}

// #endregion
// #region `createCosmicSignatureGameProxyState`

/// todo-0 Add similar states for some other contracts.
/// todo-0 Another test would be to populate this with some random values.
/*async*/ function createCosmicSignatureGameProxyState(contracts_, roundActivationTime_) {
	// #region

	const FIRST_ROUND_INITIAL_ETH_BID_PRICE = 10n ** (18n - 4n);
	const ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER = 2n;
	const RANDOMWALK_NFT_BID_PRICE_DIVISOR = 2n;
	const CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER = 2n;

	// #endregion
	// #region

	const cosmicSignatureGameProxyState_ = {
		// #region Data

		ethBalanceAmount: 0n,
		ethDonationWithInfoRecords: [],
		lastBidderAddress: hre.ethers.ZeroAddress,
		lastCstBidderAddress: hre.ethers.ZeroAddress,

		/// 1 item per bid.
		/// [Comment-202504102]
		/// We do not store info on past bidding rounds here.
		/// I have reviewed contract code to confirm that it never modifies info related to past bidding rounds.
		/// Comment-202411098 relates.
		/// [/Comment-202504102]
		bidderAddresses: [],

		/// 1 item per bidder.
		/// Comment-202504102 applies.
		biddersInfo: {},

		enduranceChampionAddress: hre.ethers.ZeroAddress,
		enduranceChampionStartTimeStamp: 0n,
		enduranceChampionDuration: 0n,
		prevEnduranceChampionDuration: 0n,
		chronoWarriorAddress: hre.ethers.ZeroAddress,
		chronoWarriorDuration: (-1n),
		roundNum: 0n,
		delayDurationBeforeRoundActivation: 60n * 60n / 2n,
		roundActivationTime: roundActivationTime_,
		ethDutchAuctionDurationDivisor: (1_000_000n + 24n) / (2n * 24n) - 0n,
		FIRST_ROUND_INITIAL_ETH_BID_PRICE,
		ethDutchAuctionBeginningBidPrice: 0n,
		ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER,
		ethDutchAuctionEndingBidPriceDivisor: 10n * ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER,
		nextEthBidPrice: 0n,
		ethBidPriceIncreaseDivisor: 100n,
		RANDOMWALK_NFT_BID_PRICE_DIVISOR,
		ethBidRefundAmountInGasMinLimit: (6813n + 7n) * 29n / 10n,
		cstDutchAuctionBeginningTimeStamp: 0n,
		cstDutchAuctionDurationDivisor: (1_000_000n + 24n / 4n) / (24n / 2n) - 1n,
		cstDutchAuctionBeginningBidPrice: 0n,
		CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER,
		nextRoundFirstCstDutchAuctionBeginningBidPrice: 200n * 10n ** 18n,
		cstDutchAuctionBeginningBidPriceMinLimit: 200n * 10n ** 18n,
		usedRandomWalkNfts: {},
		bidMessageLengthMaxLimit: 280n,
		cstRewardAmountForBidding: 100n * 10n ** 18n,
		cstPrizeAmountMultiplier: 10n * 10n ** 18n,
		chronoWarriorEthPrizeAmountPercentage: 7n,
		raffleTotalEthPrizeAmountForBiddersPercentage: 5n,
		numRaffleEthPrizesForBidders: 3n,
		numRaffleCosmicSignatureNftsForBidders: 5n,
		numRaffleCosmicSignatureNftsForRandomWalkNftStakers: 4n,
		cosmicSignatureNftStakingTotalEthRewardAmountPercentage: 10n,
		initialDurationUntilMainPrizeDivisor: (1_000_000n + 24n / 2n) / 24n - 1n,
		mainPrizeTime: 0n,
		mainPrizeTimeIncrementInMicroSeconds: 60n * 60n * 1_000_000n,
		mainPrizeTimeIncrementIncreaseDivisor: 100n,
		timeoutDurationToClaimMainPrize: 24n * 60n * 60n,
		mainEthPrizeAmountPercentage: 25n,
		// token =
		// randomWalkNft =
		// nft =
		// prizesWallet =
		// stakingWalletRandomWalkNft =
		// stakingWalletCosmicSignatureNft =
		// marketingWallet =
		marketingWalletCstContributionAmount: 300n * 10n ** 18n,
		// charityAddress =
		charityEthDonationAmountPercentage: 10n,

		// #endregion
		// #region `initialize`

		initialize: function(contracts_) {
			this._resetBiddersInfo(contracts_);
		},

		// #endregion
		// #region `getDurationUntilRoundActivation`

		getDurationUntilRoundActivation: function(latestBlock_) {
			const durationUntilRoundActivation_ = ( - this.getDurationElapsedSinceRoundActivation(latestBlock_) );
			return durationUntilRoundActivation_;
		},

		// #endregion
		// #region `getDurationElapsedSinceRoundActivation`

		getDurationElapsedSinceRoundActivation: function(latestBlock_) {
			const durationElapsedSinceRoundActivation_ = BigInt(latestBlock_.timestamp) - this.roundActivationTime;
			return durationElapsedSinceRoundActivation_;
		},

		// #endregion
		// #region `getInitialDurationUntilMainPrize`

		getInitialDurationUntilMainPrize: function() {
			return this.mainPrizeTimeIncrementInMicroSeconds / this.initialDurationUntilMainPrizeDivisor;
		},

		// #endregion
		// #region `_extendMainPrizeTime`

		_extendMainPrizeTime: function(blockAfter_) {
			const mainPrizeCorrectedTime_ = BigInt(Math.max(Number(this.mainPrizeTime), blockAfter_.timestamp));
			this.mainPrizeTime = mainPrizeCorrectedTime_ + (this.mainPrizeTimeIncrementInMicroSeconds / 1_000_000n);
		},

		// #endregion
		// #region `numEthDonationWithInfoRecords`

		numEthDonationWithInfoRecords: function() {
			return BigInt(this.ethDonationWithInfoRecords.length);
		},

		// #endregion
		// #region `getTotalNumBids`

		getTotalNumBids: function() {
			return BigInt(this.bidderAddresses.length);
		},

		// #endregion
		// #region `_updateChampionsIfNeeded`

		_updateChampionsIfNeeded: function(blockAfter_) {
			const lastBidTimeStampCopy_ = this.biddersInfo[this.lastBidderAddress].lastBidTimeStamp;
			const lastBidDuration_ = BigInt(blockAfter_.timestamp) - lastBidTimeStampCopy_;
			if (this.enduranceChampionAddress == hre.ethers.ZeroAddress) {
				this.enduranceChampionAddress = this.lastBidderAddress;
				this.enduranceChampionStartTimeStamp = lastBidTimeStampCopy_;
				this.enduranceChampionDuration = lastBidDuration_;
			} else if (lastBidDuration_ > this.enduranceChampionDuration) {
				{
					const chronoEndTimeStamp_ = lastBidTimeStampCopy_ + this.enduranceChampionDuration;
					this._updateChronoWarriorIfNeeded(chronoEndTimeStamp_);
				}
				this.prevEnduranceChampionDuration = this.enduranceChampionDuration;
				this.enduranceChampionAddress = this.lastBidderAddress;
				this.enduranceChampionStartTimeStamp = lastBidTimeStampCopy_;
				this.enduranceChampionDuration = lastBidDuration_;
			}
		},

		// #endregion
		// #region `_updateChronoWarriorIfNeeded`

		_updateChronoWarriorIfNeeded: function(chronoEndTimeStamp_) {
			const chronoStartTimeStamp_ = this.enduranceChampionStartTimeStamp + this.prevEnduranceChampionDuration;
			const chronoDuration_ = chronoEndTimeStamp_ - chronoStartTimeStamp_;
			if (chronoDuration_ > this.chronoWarriorDuration) {
				this.chronoWarriorAddress = this.enduranceChampionAddress;
				this.chronoWarriorDuration = chronoDuration_;
			}
		},

		// #endregion
		// #region `getNextEthBidPrice`

		getNextEthBidPrice: function(blockBefore_, currentTimeOffset_) {
			let nextEthBidPrice_;
			if (this.lastBidderAddress == hre.ethers.ZeroAddress) {
				nextEthBidPrice_ = this.ethDutchAuctionBeginningBidPrice;
				if (nextEthBidPrice_ == 0n) {
					nextEthBidPrice_ = this.FIRST_ROUND_INITIAL_ETH_BID_PRICE;
				} else {
					const ethDutchAuctionElapsedDuration_ = this.getDurationElapsedSinceRoundActivation(blockBefore_) + currentTimeOffset_;
					if (ethDutchAuctionElapsedDuration_ <= 0n) {
						// Doing nothing.
					} else {
						// Comment-202501301 applies.
						const ethDutchAuctionEndingBidPrice_ = nextEthBidPrice_ / this.ethDutchAuctionEndingBidPriceDivisor + 1n;

						const ethDutchAuctionDuration_ = this._getEthDutchAuctionDuration();
						if (ethDutchAuctionElapsedDuration_ < ethDutchAuctionDuration_) {
							const ethDutchAuctionBidPriceDifference_ = nextEthBidPrice_ - ethDutchAuctionEndingBidPrice_;
							nextEthBidPrice_ -= ethDutchAuctionBidPriceDifference_ * ethDutchAuctionElapsedDuration_ / ethDutchAuctionDuration_;
						} else {
							nextEthBidPrice_ = ethDutchAuctionEndingBidPrice_;
						}
					}
				}
			} else {
				nextEthBidPrice_ = this.nextEthBidPrice;
			}
			return nextEthBidPrice_;
		},

		// #endregion
		// #region `getEthPlusRandomWalkNftBidPrice`

		getEthPlusRandomWalkNftBidPrice: function(ethBidPrice_) {
			const ethPlusRandomWalkNftBidPrice_ =
				(ethBidPrice_ + (this.RANDOMWALK_NFT_BID_PRICE_DIVISOR - 1n)) /
				this.RANDOMWALK_NFT_BID_PRICE_DIVISOR;
			return ethPlusRandomWalkNftBidPrice_;
		},

		// #endregion
		// #region `_getEthDutchAuctionDuration`

		_getEthDutchAuctionDuration: function() {
			const ethDutchAuctionDuration_ = this.mainPrizeTimeIncrementInMicroSeconds / this.ethDutchAuctionDurationDivisor;
			return ethDutchAuctionDuration_;
		},

		// #endregion
		// #region `getNextCstBidPrice`

		getNextCstBidPrice: function(blockBefore_, currentTimeOffset_) {
			let [cstDutchAuctionDuration_, cstDutchAuctionRemainingDuration_] = this._getCstDutchAuctionTotalAndRemainingDurations(blockBefore_);
			cstDutchAuctionRemainingDuration_ -= currentTimeOffset_;
			if (cstDutchAuctionRemainingDuration_ <= 0n) {
				return 0n;
			}

			// Comment-202501307 relates and/or applies.
			const cstDutchAuctionBeginningBidPrice_ =
				(this.lastCstBidderAddress == hre.ethers.ZeroAddress) ? this.nextRoundFirstCstDutchAuctionBeginningBidPrice : this.cstDutchAuctionBeginningBidPrice;

			const nextCstBidPrice_ = cstDutchAuctionBeginningBidPrice_ * cstDutchAuctionRemainingDuration_ / cstDutchAuctionDuration_;
			return nextCstBidPrice_;
		},

		// #endregion
		// #region `_getCstDutchAuctionDuration`

		_getCstDutchAuctionDuration: function() {
			const cstDutchAuctionDuration_ = this.mainPrizeTimeIncrementInMicroSeconds / this.cstDutchAuctionDurationDivisor;
			return cstDutchAuctionDuration_;
		},

		// #endregion
		// #region `_getCstDutchAuctionElapsedDuration`

		_getCstDutchAuctionElapsedDuration: function(latestBlock_) {
			const cstDutchAuctionElapsedDuration_ = BigInt(latestBlock_.timestamp) - this.cstDutchAuctionBeginningTimeStamp;
			return cstDutchAuctionElapsedDuration_;
		},

		// #endregion
		// #region `_getCstDutchAuctionTotalAndRemainingDurations`

		_getCstDutchAuctionTotalAndRemainingDurations: function(latestBlock_) {
			const cstDutchAuctionDuration_ = this._getCstDutchAuctionDuration();
			const cstDutchAuctionElapsedDuration_ = this._getCstDutchAuctionElapsedDuration(latestBlock_);
			const cstDutchAuctionRemainingDuration_ = cstDutchAuctionDuration_ - cstDutchAuctionElapsedDuration_;
			return [cstDutchAuctionDuration_, cstDutchAuctionRemainingDuration_];
		},

		// #endregion
		// #region `_prepareNextRound`

		_prepareNextRound: function(contracts_, blockAfter_) {
			this.lastBidderAddress = hre.ethers.ZeroAddress;
			this.lastCstBidderAddress = hre.ethers.ZeroAddress;
				this.bidderAddresses.length = 0;
			this._resetBiddersInfo(contracts_);
			this.enduranceChampionAddress = hre.ethers.ZeroAddress;
			this.prevEnduranceChampionDuration = 0n;
			this.chronoWarriorAddress = hre.ethers.ZeroAddress;
			this.chronoWarriorDuration = (-1n);
			++ this.roundNum;
			this.mainPrizeTimeIncrementInMicroSeconds += this.mainPrizeTimeIncrementInMicroSeconds / this.mainPrizeTimeIncrementIncreaseDivisor;
			this.roundActivationTime_ = BigInt(blockAfter_.timestamp) + this.delayDurationBeforeRoundActivation;
		},

		// #endregion
		// #region `_resetBiddersInfo`

		_resetBiddersInfo: function(contracts_) {
			for (const signer_ of contracts_.signers) {
				this.biddersInfo[signer_.address] = {
					totalSpentEthAmount: 0n,
					totalSpentCstAmount: 0n,
					lastBidTimeStamp: 0n,
				};
			}
		},

		// #endregion
		// #region `updateBidderInfo`

		updateBidderInfo: function(blockAfter_, bidderAddress_) {
			this.biddersInfo[bidderAddress_] = BigInt(blockAfter_.timestamp);
		},

		// #endregion
	};

	// #endregion
	// #region

	cosmicSignatureGameProxyState_.initialize(contracts_);
	return cosmicSignatureGameProxyState_;

	// #endregion
}

// #endregion
// #region `assertCosmicSignatureGameProxyState`

async function assertCosmicSignatureGameProxyState(cosmicSignatureGameProxyState_, contracts_, signerIndex_, randomWalkNftId_) {
	expect(await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddr)).equal(cosmicSignatureGameProxyState_.ethBalanceAmount);
	{
		const numEthDonationWithInfoRecords_ = await contracts_.cosmicSignatureGameProxy.numEthDonationWithInfoRecords();
		expect(numEthDonationWithInfoRecords_).equal(cosmicSignatureGameProxyState_.numEthDonationWithInfoRecords());
		if (numEthDonationWithInfoRecords_ > 0n) {
			const lastEthDonationWithInfoRecord_ = await contracts_.cosmicSignatureGameProxy.ethDonationWithInfoRecords(numEthDonationWithInfoRecords_ - 1n);
			expect(lastEthDonationWithInfoRecord_[0]).equal(cosmicSignatureGameProxyState_.ethDonationWithInfoRecords[Number(numEthDonationWithInfoRecords_) - 1].roundNum);
			expect(lastEthDonationWithInfoRecord_[1]).equal(cosmicSignatureGameProxyState_.ethDonationWithInfoRecords[Number(numEthDonationWithInfoRecords_) - 1].donorAddress);
			expect(lastEthDonationWithInfoRecord_[2]).equal(cosmicSignatureGameProxyState_.ethDonationWithInfoRecords[Number(numEthDonationWithInfoRecords_) - 1].amount);
			expect(lastEthDonationWithInfoRecord_[3]).equal(cosmicSignatureGameProxyState_.ethDonationWithInfoRecords[Number(numEthDonationWithInfoRecords_) - 1].data);
		}
	}
	expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(cosmicSignatureGameProxyState_.lastBidderAddress);
	expect(await contracts_.cosmicSignatureGameProxy.lastCstBidderAddress()).equal(cosmicSignatureGameProxyState_.lastCstBidderAddress);
	{
		const totalNumBids_ = await contracts_.cosmicSignatureGameProxy.getTotalNumBids(cosmicSignatureGameProxyState_.roundNum);
		expect(totalNumBids_).equal(cosmicSignatureGameProxyState_.getTotalNumBids());
		if (totalNumBids_ > 0n) {
			expect(await contracts_.cosmicSignatureGameProxy.getBidderAddressAt(cosmicSignatureGameProxyState_.roundNum, totalNumBids_ - 1n)).equal(cosmicSignatureGameProxyState_.bidderAddresses[Number(totalNumBids_) - 1]);
		}
	}
	if (signerIndex_ >= 0) {
		const signer_ = contracts_.signers[signerIndex_];
		const bidderInfo_ = await contracts_.cosmicSignatureGameProxy.biddersInfo(cosmicSignatureGameProxyState_.roundNum, signer_.address);
		expect(bidderInfo_[0]).equal(cosmicSignatureGameProxyState_.biddersInfo[signer_.address].totalSpentEthAmount);
		expect(bidderInfo_[1]).equal(cosmicSignatureGameProxyState_.biddersInfo[signer_.address].totalSpentCstAmount);
		expect(bidderInfo_[2]).equal(cosmicSignatureGameProxyState_.biddersInfo[signer_.address].lastBidTimeStamp);
	}
	expect(await contracts_.cosmicSignatureGameProxy.enduranceChampionAddress()).equal(cosmicSignatureGameProxyState_.enduranceChampionAddress);
	expect(await contracts_.cosmicSignatureGameProxy.enduranceChampionStartTimeStamp()).equal(cosmicSignatureGameProxyState_.enduranceChampionStartTimeStamp);
	expect(await contracts_.cosmicSignatureGameProxy.enduranceChampionDuration()).equal(cosmicSignatureGameProxyState_.enduranceChampionDuration);
	expect(await contracts_.cosmicSignatureGameProxy.prevEnduranceChampionDuration()).equal(cosmicSignatureGameProxyState_.prevEnduranceChampionDuration);
	expect(await contracts_.cosmicSignatureGameProxy.chronoWarriorAddress()).equal(cosmicSignatureGameProxyState_.chronoWarriorAddress);
	expect(BigInt.asIntN(256, await contracts_.cosmicSignatureGameProxy.chronoWarriorDuration())).equal(cosmicSignatureGameProxyState_.chronoWarriorDuration);
	expect(await contracts_.cosmicSignatureGameProxy.roundNum()).equal(cosmicSignatureGameProxyState_.roundNum);
	expect(await contracts_.cosmicSignatureGameProxy.delayDurationBeforeRoundActivation()).equal(cosmicSignatureGameProxyState_.delayDurationBeforeRoundActivation);
	expect(await contracts_.cosmicSignatureGameProxy.roundActivationTime()).equal(cosmicSignatureGameProxyState_.roundActivationTime);
	expect(await contracts_.cosmicSignatureGameProxy.ethDutchAuctionDurationDivisor()).equal(cosmicSignatureGameProxyState_.ethDutchAuctionDurationDivisor);
	expect(await contracts_.cosmicSignatureGameProxy.ethDutchAuctionBeginningBidPrice()).equal(cosmicSignatureGameProxyState_.ethDutchAuctionBeginningBidPrice);
	expect(await contracts_.cosmicSignatureGameProxy.ethDutchAuctionEndingBidPriceDivisor()).equal(cosmicSignatureGameProxyState_.ethDutchAuctionEndingBidPriceDivisor);
	expect(await contracts_.cosmicSignatureGameProxy.nextEthBidPrice()).equal(cosmicSignatureGameProxyState_.nextEthBidPrice);
	expect(await contracts_.cosmicSignatureGameProxy.ethBidPriceIncreaseDivisor()).equal(cosmicSignatureGameProxyState_.ethBidPriceIncreaseDivisor);
	expect(await contracts_.cosmicSignatureGameProxy.ethBidRefundAmountInGasMinLimit()).equal(cosmicSignatureGameProxyState_.ethBidRefundAmountInGasMinLimit);
	expect(await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningTimeStamp()).equal(cosmicSignatureGameProxyState_.cstDutchAuctionBeginningTimeStamp);
	expect(await contracts_.cosmicSignatureGameProxy.cstDutchAuctionDurationDivisor()).equal(cosmicSignatureGameProxyState_.cstDutchAuctionDurationDivisor);
	expect(await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningBidPrice()).equal(cosmicSignatureGameProxyState_.cstDutchAuctionBeginningBidPrice);
	expect(await contracts_.cosmicSignatureGameProxy.nextRoundFirstCstDutchAuctionBeginningBidPrice()).equal(cosmicSignatureGameProxyState_.nextRoundFirstCstDutchAuctionBeginningBidPrice);
	expect(await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningBidPriceMinLimit()).equal(cosmicSignatureGameProxyState_.cstDutchAuctionBeginningBidPriceMinLimit);
	if (randomWalkNftId_ >= 0n) {
		expect(cosmicSignatureGameProxyState_.usedRandomWalkNfts[randomWalkNftId_]);
		expect(await contracts_.cosmicSignatureGameProxy.usedRandomWalkNfts(randomWalkNftId_)).equal(1n);
	}
	expect(await contracts_.cosmicSignatureGameProxy.bidMessageLengthMaxLimit()).equal(cosmicSignatureGameProxyState_.bidMessageLengthMaxLimit);
	expect(await contracts_.cosmicSignatureGameProxy.cstRewardAmountForBidding()).equal(cosmicSignatureGameProxyState_.cstRewardAmountForBidding);
	expect(await contracts_.cosmicSignatureGameProxy.cstPrizeAmountMultiplier()).equal(cosmicSignatureGameProxyState_.cstPrizeAmountMultiplier);
	expect(await contracts_.cosmicSignatureGameProxy.chronoWarriorEthPrizeAmountPercentage()).equal(cosmicSignatureGameProxyState_.chronoWarriorEthPrizeAmountPercentage);
	expect(await contracts_.cosmicSignatureGameProxy.raffleTotalEthPrizeAmountForBiddersPercentage()).equal(cosmicSignatureGameProxyState_.raffleTotalEthPrizeAmountForBiddersPercentage);
	expect(await contracts_.cosmicSignatureGameProxy.numRaffleEthPrizesForBidders()).equal(cosmicSignatureGameProxyState_.numRaffleEthPrizesForBidders);
	expect(await contracts_.cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForBidders()).equal(cosmicSignatureGameProxyState_.numRaffleCosmicSignatureNftsForBidders);
	expect(await contracts_.cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForRandomWalkNftStakers()).equal(cosmicSignatureGameProxyState_.numRaffleCosmicSignatureNftsForRandomWalkNftStakers);
	expect(await contracts_.cosmicSignatureGameProxy.cosmicSignatureNftStakingTotalEthRewardAmountPercentage()).equal(cosmicSignatureGameProxyState_.cosmicSignatureNftStakingTotalEthRewardAmountPercentage);
	expect(await contracts_.cosmicSignatureGameProxy.initialDurationUntilMainPrizeDivisor()).equal(cosmicSignatureGameProxyState_.initialDurationUntilMainPrizeDivisor);
	expect(await contracts_.cosmicSignatureGameProxy.mainPrizeTime()).equal(cosmicSignatureGameProxyState_.mainPrizeTime);
	expect(await contracts_.cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds()).equal(cosmicSignatureGameProxyState_.mainPrizeTimeIncrementInMicroSeconds);
	expect(await contracts_.cosmicSignatureGameProxy.mainPrizeTimeIncrementIncreaseDivisor()).equal(cosmicSignatureGameProxyState_.mainPrizeTimeIncrementIncreaseDivisor);
	expect(await contracts_.cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize()).equal(cosmicSignatureGameProxyState_.timeoutDurationToClaimMainPrize);
	expect(await contracts_.cosmicSignatureGameProxy.token()).equal(contracts_.cosmicSignatureTokenAddr);
	expect(await contracts_.cosmicSignatureGameProxy.randomWalkNft()).equal(contracts_.randomWalkNftAddr);
	expect(await contracts_.cosmicSignatureGameProxy.nft()).equal(contracts_.cosmicSignatureNftAddr);
	expect(await contracts_.cosmicSignatureGameProxy.prizesWallet()).equal(contracts_.prizesWalletAddr);
	expect(await contracts_.cosmicSignatureGameProxy.stakingWalletRandomWalkNft()).equal(contracts_.stakingWalletRandomWalkNftAddr);
	expect(await contracts_.cosmicSignatureGameProxy.stakingWalletCosmicSignatureNft()).equal(contracts_.stakingWalletCosmicSignatureNftAddr);
	expect(await contracts_.cosmicSignatureGameProxy.marketingWallet()).equal(contracts_.marketingWalletAddr);
	expect(await contracts_.cosmicSignatureGameProxy.marketingWalletCstContributionAmount()).equal(cosmicSignatureGameProxyState_.marketingWalletCstContributionAmount);
	expect(await contracts_.cosmicSignatureGameProxy.charityAddress()).equal(contracts_.charityWalletAddr);
	expect(await contracts_.cosmicSignatureGameProxy.charityEthDonationAmountPercentage()).equal(cosmicSignatureGameProxyState_.charityEthDonationAmountPercentage);
}

// #endregion
// #region `generateRandomUInt256Seed`

/**
 * todo-0 Move this to a seperate file, named "BlockchainPropertyGetterHelpers.js".
 * 
 * Issue. This is a workaround for Comment-202504071.
 * Comment-202504067 applies.
 * @returns {Promise<bigint>}
 */
async function generateRandomUInt256Seed(blockchainPropertyGetter_) {
	const blockPrevRandao_ = await blockchainPropertyGetter_.getBlockPrevRandao();
	const blockBaseFee_ = await blockchainPropertyGetter_.getBlockBaseFee();
	return blockPrevRandao_ ^ blockBaseFee_;
}

// #endregion
