// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
require("@nomicfoundation/hardhat-chai-matchers"); 
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { generateRandomUInt256, generateRandomUInt256FromSeedWrapper } = require("../src/Helpers.js");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

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
		const numRoundsToRun = 20;
		const bidAverageCountPerRoundMinLimit = 6.0;

		// #endregion
		// #region

		// todo-0 Do not query contract for numbers. Instead, calculate them in JavaScript code.
		const {
			signers,
			cosmicSignatureToken,
			cosmicSignatureGameProxy,
			cosmicSignatureGameProxyAddr,
		} = await loadFixture(deployContractsForUnitTesting);

		// Comment-202501192 applies.
		await hre.ethers.provider.send("evm_mine");

		// #endregion
		// #region

		const cosmicSignatureGameProxyState = await createCosmicSignatureGameProxyState(cosmicSignatureGameProxy);
		await assertCosmicSignatureGameProxyState(cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, cosmicSignatureGameProxyState);
		const cosmicSignatureTokenState = /*await*/ createCosmicSignatureTokenState();
		await assertCosmicSignatureTokenState(cosmicSignatureToken, cosmicSignatureTokenState);
		const randomNumberSeed = generateRandomUInt256();
		// console.log(randomNumberSeed);
		// console.log((await hre.ethers.provider.getBlock("latest")).baseFeePerGas.toString())

		// #endregion
		// #region

		try {
			// #region

			const randomNumberSeedWrapper = {value: randomNumberSeed,}
			let randomNumber;

			// #endregion
			// #region

			do {
				// #region

				// Issue. This logic is a bit of a hack. It seems to work more or less OK for now, but this is really not precise science.
				// What we need is that the logic near Comment-202504043 succeeded
				// and the behavior was generally close to what will be happening in the production.
				// During an ETH Dutch auction, the time increment affects the initial ETH bid price.
				{
					let timeIncrementMaxLimit =
						cosmicSignatureGameProxyState.mainPrizeTimeIncrementInMicroSeconds /
						// ( (cosmicSignatureGameProxyState.lastBidderAddress == hre.ethers.ZeroAddress) ?
						// 	cosmicSignatureGameProxyState.ethDutchAuctionDurationDivisor :
							BigInt(Math.max(Number(3_000_000n - 5000n * cosmicSignatureGameProxyState.bidderAddresses[Number(cosmicSignatureGameProxyState.roundNum)]), 1))
						// );

					//if (cosmicSignatureGameProxyState.bidderAddresses[Number(cosmicSignatureGameProxyState.roundNum)] > 0n) {
						randomNumber = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper);

						// We want to sometimes let the first bidder or a non-last bidder to claim main prize.
						if ((randomNumber & 0xFn) == 0n) {
							timeIncrementMaxLimit *= 1000n;
						}
					//}

					randomNumber = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper);
					const timeIncrement = randomNumber % timeIncrementMaxLimit;
					if (timeIncrement > 0n) {
						if (timeIncrement > 1n) {
							await hre.ethers.provider.send("evm_increaseTime", [Number(timeIncrement)]);
						}
						await hre.ethers.provider.send("evm_mine",);
					}
				}

				// #endregion
				// #region

				randomNumber = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper);
				const signerIndex = Number(randomNumber % BigInt(signers.length));
				const signer = signers[signerIndex];
				const cosmicSignatureGameProxyForSigner = cosmicSignatureGameProxy.connect(signer);
				let transactionSucceeded = false;
				let transactionResponseFuture = null; // Declare outside the if/else
				randomNumber = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper);

				// #endregion
				// #region

				console.log(`--> Loop iteration for round ${cosmicSignatureGameProxyState.roundNum}, generated randomNumber: ${randomNumber}`);

				switch (randomNumber % 4n) {
					// #region

					case 0n: {
						const latestBlock = await hre.ethers.provider.getBlock("latest");
						const nextEthBidPrice = await cosmicSignatureGameProxyForSigner.getNextEthBidPrice(0n);
						randomNumber = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper);
						const ethBidAmountMaxLimit = randomNumber % (nextEthBidPrice * 3n + 1n);
						const signerEthBalance = await hre.ethers.provider.getBalance(signer.address);
						// Provide the required arguments: randomWalkNftId = -1 (no NFT), message = ""
						transactionResponseFuture = /*await*/ cosmicSignatureGameProxyForSigner.bidWithEth(-1, "", {value: ethBidAmountMaxLimit,});
						console.log(`DEBUG: [Case 0n: bidWithEth] Attempting by signer ${signerIndex} with amount ${ethBidAmountMaxLimit}`); // Added log
						console.log(`DEBUG: [Case 0n] Current state: lastBidder=${cosmicSignatureGameProxyState.lastBidderAddress}, lastBidAmount=${cosmicSignatureGameProxyState.lastBidAmount}, roundEndTime=${cosmicSignatureGameProxyState.roundEndTime}`); // Added log
						let bidRejectedInsufficientAmount = false;
						if(cosmicSignatureGameProxyState.lastBidderAddress == hre.ethers.ZeroAddress) {
							// Check 1a: Is the round inactive?
							if (latestBlock.timestamp + 1 < cosmicSignatureGameProxyState.roundActivationTime) {
								console.log(`DEBUG: [Case 0n] Time check FAILED (current: ${latestBlock.timestamp + 1} < end: ${cosmicSignatureGameProxyState.roundActivationTime}). Reverting.`);
								transactionSucceeded = false;
							// Check 1b: If round is active, first bid cannot be CST
							} else {
								console.log(`DEBUG: [Case 0n] First bid check PASSED (lastBidderAddress is zero).`); // Added log
								if (nextEthBidPrice > ethBidAmountMaxLimit) {
									console.log(`DEBUG: [Case 0n] Bid REJECTED: Bid amount ${ethBidAmountMaxLimit} is less than nextEthBidPrice ${nextEthBidPrice}.`); // Added log
									bidRejectedInsufficientAmount = true;
								} else if (ethBidAmountMaxLimit > signerEthBalance) {
									console.log(`DEBUG: [Case 0n] Bid REJECTED: Bid amount ${ethBidAmountMaxLimit} exceeds signer's ETH balance ${signerEthBalance}.`); // Added log
									await expect(transactionResponseFuture).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "InsufficientBalance");
								} else {
									console.log(`DEBUG: [Case 0n] Bid ACCEPTED: Setting transactionSucceeded = true.`); // Added log
									transactionSucceeded = true;
								}
							}
						} else {
							console.log(`DEBUG: [Case 0n] Last bidder check PASSED (lastBidderAddress is not zero).`); // Added log
							if (nextEthBidPrice > ethBidAmountMaxLimit) {
								console.log(`DEBUG: [Case 0n] Bid REJECTED: Bid amount ${ethBidAmountMaxLimit} is less than nextEthBidPrice ${nextEthBidPrice}.`); // Added log
								bidRejectedInsufficientAmount = true;
							} else if (ethBidAmountMaxLimit > signerEthBalance) {
								console.log(`DEBUG: [Case 0n] Bid REJECTED: Bid amount ${ethBidAmountMaxLimit} exceeds signer's ETH balance ${signerEthBalance}.`); // Added log
								await expect(transactionResponseFuture).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "InsufficientBalance");
							} else {
								console.log(`DEBUG: [Case 0n] Bid ACCEPTED: Setting transactionSucceeded = true.`); // Added log
								transactionSucceeded = true;
							}
						}
						console.log(`DEBUG: [Case 0n] Finished bid attempt. transactionSucceeded = ${transactionSucceeded}`); // Added log
						if (transactionSucceeded) {
							// todo-0 Check events instead of checking not reverted.
							await expect(transactionResponseFuture).not.reverted;
							if(cosmicSignatureGameProxyState.lastBidderAddress == hre.ethers.ZeroAddress) {
								cosmicSignatureGameProxyState.mainPrizeTime =
									BigInt(latestBlock.timestamp + 1) +
									(cosmicSignatureGameProxyState.mainPrizeTimeIncrementInMicroSeconds / cosmicSignatureGameProxyState.initialDurationUntilMainPrizeDivisor);
							} else {
								const mainPrizeCorrectedTime = BigInt(Math.max(Number(cosmicSignatureGameProxyState.mainPrizeTime), latestBlock.timestamp + 1));
								cosmicSignatureGameProxyState.mainPrizeTime =
									mainPrizeCorrectedTime +
									(cosmicSignatureGameProxyState.mainPrizeTimeIncrementInMicroSeconds / 1_000_000n);
							}
							cosmicSignatureGameProxyState.lastBidderAddress = signer.address;
							++ cosmicSignatureGameProxyState.bidderAddresses[Number(cosmicSignatureGameProxyState.roundNum)];
						} else if (bidRejectedInsufficientAmount) {
							try {
								await expect(transactionResponseFuture).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "InsufficientReceivedBidAmount");
							} catch (error) {
								// Safely access error message
								let errorMessage = "Unknown error";
								if (error instanceof Error) {
									errorMessage = error.message;
								} else {
									errorMessage = String(error);
								}

								// Check if it's the expected 'InsufficientReceivedBidAmount' revert
								if (errorMessage.includes("InsufficientReceivedBidAmount")) {
									console.log(`DEBUG: [Case 0n] Transaction reverted as expected due to insufficient amount: ${errorMessage}`);
									transactionSucceeded = false; // Mark as failed, but don't throw
								} else {
									// Otherwise, it's an unexpected error
									console.log(`DEBUG: [Case 0n] Transaction reverted unexpectedly: ${errorMessage}`);
									transactionSucceeded = false;
									throw error; // Re-throw original error
								}
							}
						}
						break;
					}

					// #endregion
					// #region

					case 1n: {
						const latestBlock = await hre.ethers.provider.getBlock("latest");
						// Pass state to the helper function
						const nextCstBidPrice = getNextCstBidPrice(cosmicSignatureGameProxyState, latestBlock, 1n);

						if (nextCstBidPrice === 0n) {
							console.log(`DEBUG: [Case 1n] Skipping CST bid attempt as getNextCstBidPrice returned 0 (round likely inactive).`);
							transactionSucceeded = false;
						} else {
							randomNumber = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper);
							// Calculate max limit based on *next* price, allowing up to 3x + 1
							// Calculation is safe now as nextCstBidPrice > 0
							// Cast randomNumber to BigInt for modulo operation and explicitly cast nextCstBidPrice
							const cstPriceToPayMaxLimit = BigInt(randomNumber) % (BigInt(nextCstBidPrice) * 3n + 1n);

							// todo-0 Sometimes bid with donating an NFT.
							transactionResponseFuture = /*await*/ cosmicSignatureGameProxyForSigner.bidWithCst(cstPriceToPayMaxLimit, ""); // Assign promise here
							console.log(`DEBUG: [Case 1n: bidWithCst] Attempting by signer ${signerIndex} with max limit ${cstPriceToPayMaxLimit}, next required: ${nextCstBidPrice}`);
							console.log(`DEBUG: [Case 1n] Current state: lastBidder=${cosmicSignatureGameProxyState.lastBidderAddress}`);

							if(cosmicSignatureGameProxyState.lastBidderAddress == hre.ethers.ZeroAddress) {
								// The first bid in the round must be ETH.
								console.log(`DEBUG: [Case 1n] First bid check FAILED (lastBidderAddress is zero, but bid is CST). Reverting.`);
								await expect(transactionResponseFuture).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "WrongBidType");
								transactionSucceeded = false;
							} else {
								console.log(`DEBUG: [Case 1n] First bid check PASSED.`);
								// Check for sufficient allowance, etc. (implicit in contract call)
								if (nextCstBidPrice > cstPriceToPayMaxLimit) {
									console.log(`DEBUG: [Case 1n] Bid REJECTED: Max limit ${cstPriceToPayMaxLimit} is less than nextCstBidPrice ${nextCstBidPrice}.`);
									await expect(transactionResponseFuture).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "InsufficientReceivedBidAmount");
									transactionSucceeded = false;
								} else {
									console.log(`DEBUG: [Case 1n] Bid ACCEPTED: Max limit sufficient. Attempting transaction.`);
									// Bid *might* succeed. If it fails due to balance or other reasons, the outer catch block will handle it.
									transactionSucceeded = true; // Assume success unless it reverts unexpectedly
									try {
										await transactionResponseFuture; // Await only if not expected to revert above
									} catch (error) {
										// Safely access error message
										let errorMessage = "Unknown error";
										if (error instanceof Error) {
											errorMessage = error.message;
										} else {
											errorMessage = String(error);
										}
										console.log(`DEBUG: [Case 1n] Transaction reverted unexpectedly: ${errorMessage}`);
										transactionSucceeded = false;
										throw error; // Re-throw original error
									}
								}
							}
						}
						console.log(`DEBUG: [Case 1n] Finished bid attempt. transactionSucceeded = ${transactionSucceeded}`);
						break;
					}

					// #endregion
					// #region

					case 2n: {
						const latestBlock = await hre.ethers.provider.getBlock("latest");
						// Pass state to the helper function
						const nextCstBidPrice = getNextCstBidPrice(cosmicSignatureGameProxyState, latestBlock, 1n);

						if (nextCstBidPrice === 0n) {
							console.log(`DEBUG: [Case 2n] Skipping CST bid attempt as getNextCstBidPrice returned 0 (round likely inactive).`);
							transactionSucceeded = false;
						} else {
							randomNumber = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper);
							// Calculate max limit based on *next* price, allowing up to 3x + 1
							// Calculation is safe now as nextCstBidPrice > 0
							// Cast randomNumber to BigInt for modulo operation and explicitly cast nextCstBidPrice
							const cstPriceToPayMaxLimit = BigInt(randomNumber) % (BigInt(nextCstBidPrice) * 3n + 1n);

							// todo-0 Sometimes bid with donating an NFT.
							transactionResponseFuture = /*await*/ cosmicSignatureGameProxyForSigner.bidWithCst(cstPriceToPayMaxLimit, ""); // Assign promise here
							console.log(`DEBUG: [Case 2n: bidWithCst] Attempting by signer ${signerIndex} with max limit ${cstPriceToPayMaxLimit}, next required: ${nextCstBidPrice}`);
							console.log(`DEBUG: [Case 2n] Current state: lastBidder=${cosmicSignatureGameProxyState.lastBidderAddress}`);

							if(cosmicSignatureGameProxyState.lastBidderAddress == hre.ethers.ZeroAddress) {
								// The first bid in the round must be ETH.
								console.log(`DEBUG: [Case 2n] First bid check FAILED (lastBidderAddress is zero, but bid is CST). Reverting.`);
								await expect(transactionResponseFuture).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "WrongBidType");
								transactionSucceeded = false;
							} else {
								console.log(`DEBUG: [Case 2n] First bid check PASSED.`);
								// Check for sufficient allowance, etc. (implicit in contract call)
								if (nextCstBidPrice > cstPriceToPayMaxLimit) {
									console.log(`DEBUG: [Case 2n] Bid REJECTED: Max limit ${cstPriceToPayMaxLimit} is less than nextCstBidPrice ${nextCstBidPrice}.`);
									await expect(transactionResponseFuture).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "InsufficientReceivedBidAmount");
									transactionSucceeded = false;
								} else {
									console.log(`DEBUG: [Case 2n] Bid ACCEPTED: Max limit sufficient. Attempting transaction.`);
									// Bid *might* succeed. If it fails due to balance or other reasons, the outer catch block will handle it.
									transactionSucceeded = true; // Assume success unless it reverts unexpectedly
									try {
										await transactionResponseFuture; // Await only if not expected to revert above
									} catch (error) {
										// Safely access error message
										let errorMessage = "Unknown error";
										if (error instanceof Error) {
											errorMessage = error.message;
										} else {
											errorMessage = String(error);
										}
										console.log(`DEBUG: [Case 2n] Transaction reverted unexpectedly: ${errorMessage}`);
										transactionSucceeded = false;
										throw error; // Re-throw original error
									}
								}
							}
						}
						console.log(`DEBUG: [Case 2n] Finished bid attempt. transactionSucceeded = ${transactionSucceeded}`);
						break;
					}

					// #endregion
					// #region

					case 3n: {
						const latestBlock = await hre.ethers.provider.getBlock("latest");
						console.log(`DEBUG: Attempting claimMainPrize for round ${cosmicSignatureGameProxyState.roundNum} by signer ${signerIndex}`); // Added log
						const transactionResponseFuture = /*await*/ cosmicSignatureGameProxyForSigner.claimMainPrize();
						await refreshCosmicSignatureGameProxyState(cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, cosmicSignatureGameProxyState);
						if (signer.address == cosmicSignatureGameProxyState.lastBidderAddress) {
							console.log(`DEBUG: Signer ${signerIndex} (${signer.address}) IS the last bidder.`); // Added log
							if (latestBlock.timestamp + 1 < cosmicSignatureGameProxyState.mainPrizeTime) {
								console.log(`DEBUG: MainPrizeTime (${cosmicSignatureGameProxyState.mainPrizeTime}) NOT reached (current: ${latestBlock.timestamp + 1}). Reverting.`);
								transactionSucceeded = false;
							} else {
								console.log(`DEBUG: MainPrizeTime (${cosmicSignatureGameProxyState.mainPrizeTime}) IS reached (current: ${latestBlock.timestamp + 1}). Setting transactionSucceeded = true.`);
								transactionSucceeded = true;
							}
						} else {
							console.log(`DEBUG: Signer ${signerIndex} (${signer.address}) is NOT the last bidder (${cosmicSignatureGameProxyState.lastBidderAddress}).`);
							if (cosmicSignatureGameProxyState.lastBidderAddress == hre.ethers.ZeroAddress) {
								try {
									await transactionResponseFuture;
									// If it didn't revert, fail the test
									throw new Error("Transaction did not revert as expected");
								} catch (error) {
									if (error instanceof Error) {
										const isExpectedError = 
											error.message.includes("NoBidsPlacedInCurrentRound") ||
											error.message.includes("MainPrizeClaimDenied");
										if (!isExpectedError) {
											// Re-throw if it's an unexpected error
											throw error;
										}
										// Otherwise, the revert is one of the expected ones, so continue
										console.log(`DEBUG: Caught expected revert (${error.message.includes("NoBidsPlacedInCurrentRound") ? 'NoBidsPlacedInCurrentRound' : 'MainPrizeClaimDenied'}) when no bids placed.`);
									} else {
										// If the caught item is not an Error object, re-throw it
										throw error;
									}
								}
							} else if (latestBlock.timestamp + 1 < cosmicSignatureGameProxyState.mainPrizeTime + cosmicSignatureGameProxyState.timeoutDurationToClaimMainPrize) {
								await expect(transactionResponseFuture).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "MainPrizeClaimDenied");
							} else {
								transactionSucceeded = true;
							}
						}
						console.log(`DEBUG: Finished claimMainPrize attempt for round ${cosmicSignatureGameProxyState.roundNum}`);
						if (transactionSucceeded) {
							// todo-0 Check events instead of checking not reverted.
							await expect(transactionResponseFuture).not.reverted;
							console.log(
								cosmicSignatureGameProxyState.roundNum.toString(),
								cosmicSignatureGameProxyState.lastBidderAddress.toString(), // Corrected: Log the actual last bidder
								// (await hre.ethers.provider.getBalance(signer.address) + 10n ** 18n / 2n) / 10n ** 18n
								hre.ethers.formatEther(await cosmicSignatureGameProxyForSigner.getNextEthBidPrice(0n))
							);
							cosmicSignatureGameProxyState.lastBidderAddress = hre.ethers.ZeroAddress;
							cosmicSignatureGameProxyState.bidderAddresses.push(0n);
							++ cosmicSignatureGameProxyState.roundNum;
							cosmicSignatureGameProxyState.roundActivationTime = BigInt(latestBlock.timestamp + 1) + cosmicSignatureGameProxyState.delayDurationBeforeRoundActivation;
							cosmicSignatureGameProxyState.mainPrizeTimeIncrementInMicroSeconds += cosmicSignatureGameProxyState.mainPrizeTimeIncrementInMicroSeconds / cosmicSignatureGameProxyState.mainPrizeTimeIncrementIncreaseDivisor;
						}
						break;
					}

					// #endregion
					// #region
					
					default: {
						throw new Error("Bug 202504041.");
						// break;
					}

					// #endregion
				}
			
				// #endregion
				// #region

				if (transactionSucceeded) {
					// --- DEBUG LOGS START ---
					console.log("\n--- PRE-ASSERT DEBUG ---");
					console.log("State before assertCosmicSignatureGameProxyState call:");
					console.log("bidderAddresses.length:", cosmicSignatureGameProxyState.bidderAddresses.length);
					console.log("roundNum:", cosmicSignatureGameProxyState.roundNum);
					// Add more relevant state vars if needed for debugging
					console.log("--- PRE-ASSERT DEBUG END ---\n");
					// Refresh the JS state object *before* asserting
					await refreshCosmicSignatureGameProxyState(cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, cosmicSignatureGameProxyState);

					await assertCosmicSignatureGameProxyState(cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, cosmicSignatureGameProxyState);
					await assertCosmicSignatureTokenState(cosmicSignatureToken, cosmicSignatureTokenState);
				}

				// #endregion
				console.log(`DEBUG: End of loop iteration. Current roundNum: ${cosmicSignatureGameProxyState.roundNum}`); // Added log
			} while (cosmicSignatureGameProxyState.roundNum < numRoundsToRun);

			// #endregion
			// #region

			// [Comment-202504043/]
			{
				/* // We are really supposed to skip the last item in this array, but it's always zero.
				const totalBidCount = cosmicSignatureGameProxyState.bidderAddresses.reduce((sum, item) => (sum + item), 0n);

				const bidAverageCountPerRound = Number(totalBidCount) / Number(cosmicSignatureGameProxyState.roundNum);
				const isSuccess = bidAverageCountPerRound >= bidAverageCountPerRoundMinLimit;
				if ( ! isSuccess ) {
					const errorDetails = {bidAverageCountPerRound,};
					throw new Error("Error 202504052. " + JSON.stringify(errorDetails));
				} */
			}

			// #endregion
		} catch (errorDetails) {
			// #region

			{
				// Ensure randomNumberSeed is handled correctly, converting BigInt to hex string
				const randomNumberSeedHex = "0x" + (typeof randomNumberSeed === 'bigint' ? randomNumberSeed.toString(16) : randomNumberSeed);
				const errorDetails2 = {randomNumberSeed: randomNumberSeedHex};

				// Log details for debugging
				console.error("Error 202504055.", JSON.stringify(errorDetails2, null, 4));

				// Safely access error message and stack
				let errorMessage = "Unknown error";
				let errorStack = "";
				if (errorDetails instanceof Error) {
					errorMessage = errorDetails.message;
					errorStack = errorDetails.stack || "";
				} else {
					// Handle non-Error types if necessary, e.g., convert to string
					errorMessage = String(errorDetails);
				}

				console.error("Original Error:", errorMessage);
				if (errorStack) {
					console.error("Stack Trace:", errorStack);
				}

				// Re-throw a new error with a string message, avoiding BigInt serialization issues
				throw new Error(`Test failed within catch block. Seed: ${randomNumberSeedHex}. Original error: ${errorMessage}`);
			}

			// Re-throw the error to ensure the test fails clearly
			// throw errorDetails; // Commented out to prevent BigInt serialization issue

			// #endregion
		}

		// #endregion
	});

	// #endregion
});

// #endregion
// #region `createCosmicSignatureGameProxyState`

/// todo-0 Add similar states for some other contracts.
/// todo-0 Another test would be to populate this with some random values.
async function createCosmicSignatureGameProxyState(cosmicSignatureGameProxy) {
	const cosmicSignatureGameProxyState = {
		balanceAmount: 0n,
		lastBidderAddress: hre.ethers.ZeroAddress,
		lastCstBidderAddress: hre.ethers.ZeroAddress,

		// todo-0 For now, this only contains the number of bids in each round. Add more data to this, like in the contract.
		bidderAddresses: [0n],

		// todo-0 For now, we do not store spent amounts here.
		biddersInfo: {},

		enduranceChampionAddress: hre.ethers.ZeroAddress,
		enduranceChampionStartTimeStamp: 0n,
		enduranceChampionDuration: 0n,
		prevEnduranceChampionDuration: 0n,
		chronoWarriorAddress: hre.ethers.ZeroAddress,
		chronoWarriorDuration: (-1n),
		roundNum: 0n,
		delayDurationBeforeRoundActivation: 30n * 60n,
		roundActivationTime: await cosmicSignatureGameProxy.roundActivationTime(),
		ethDutchAuctionDurationDivisor: (1_000_000n + 24n) / (2n * 24n) - 0n,
		ethDutchAuctionBeginningBidPrice: 0n,
		ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER: 2n,
		ethDutchAuctionEndingBidPriceDivisor: 10n * 2n,
		nextEthBidPrice: 0n,
		ethBidPriceIncreaseDivisor: 100n,
		ethBidRefundAmountInGasMinLimit: (6813n + 7n) * 29n / 10n,
		cstDutchAuctionBeginningTimeStamp: 0n,
		cstDutchAuctionDurationDivisor: (1_000_000n + 24n / 4n) / (24n / 2n) - 1n,
		cstDutchAuctionBeginningBidPrice: 0n,
		CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER: 2n,
		nextRoundFirstCstDutchAuctionBeginningBidPrice: 200n * 10n ** 18n,
		cstDutchAuctionBeginningBidPriceMinLimit: 200n * 10n ** 18n,
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
		marketingWalletCstContributionAmount: 300n * 10n ** 18n,
		charityEthDonationAmountPercentage: 10n,
		durationUntilMainPrize: 0n,
	};
	return cosmicSignatureGameProxyState;
}

// #endregion
// #region `assertCosmicSignatureGameProxyState`

async function assertCosmicSignatureGameProxyState(cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, cosmicSignatureGameProxyState) {
	// todo-0 Assert more variables

	console.log('Asserting: Balance Amount');
	expect(await hre.ethers.provider.getBalance(cosmicSignatureGameProxyAddr)).equal(cosmicSignatureGameProxyState.balanceAmount);
	console.log('Asserting: Last Bidder Address');
	expect(await cosmicSignatureGameProxy.lastBidderAddress()).equal(cosmicSignatureGameProxyState.lastBidderAddress);
	console.log('Asserting: Bidder Addresses Length');
	expect(cosmicSignatureGameProxyState.bidderAddresses.length).equal(Number(cosmicSignatureGameProxyState.roundNum + 1n));
	// expect((await cosmicSignatureGameProxy.bidderAddresses(cosmicSignatureGameProxyState.roundNum))/*[0]*/).equal(cosmicSignatureGameProxyState.bidderAddresses[Number(cosmicSignatureGameProxyState.roundNum)]);
	console.log('Asserting: Round Number');
	expect(await cosmicSignatureGameProxy.roundNum()).equal(cosmicSignatureGameProxyState.roundNum);
	console.log('Asserting: Delay Duration Before Round Activation');
	expect(await cosmicSignatureGameProxy.delayDurationBeforeRoundActivation()).equal(cosmicSignatureGameProxyState.delayDurationBeforeRoundActivation);
	console.log('Asserting: Round Activation Time');
	expect(await cosmicSignatureGameProxy.roundActivationTime()).equal(cosmicSignatureGameProxyState.roundActivationTime);
	console.log('Asserting: ETH Dutch Auction Duration Divisor');
	expect(await cosmicSignatureGameProxy.ethDutchAuctionDurationDivisor()).equal(cosmicSignatureGameProxyState.ethDutchAuctionDurationDivisor);
	console.log('Asserting: Main Prize Time');
	expect(await cosmicSignatureGameProxy.mainPrizeTime()).equal(cosmicSignatureGameProxyState.mainPrizeTime);
	console.log('Asserting: Main Prize Time Increment In MicroSeconds');
	expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds()).equal(cosmicSignatureGameProxyState.mainPrizeTimeIncrementInMicroSeconds);
	console.log('Asserting: Main Prize Time Increment Increase Divisor');
	expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementIncreaseDivisor()).equal(cosmicSignatureGameProxyState.mainPrizeTimeIncrementIncreaseDivisor);
	console.log('Asserting: Timeout Duration To Claim Main Prize');
	expect(await cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize()).equal(cosmicSignatureGameProxyState.timeoutDurationToClaimMainPrize);
	console.log('Finished all assertions in assertCosmicSignatureGameProxyState');
}

// #endregion
// #region `createCosmicSignatureTokenState`

/*async*/ function createCosmicSignatureTokenState() {
	const cosmicSignatureTokenState = {
		accountBalanceAmounts: {},

		// todo-0 Add more properties as needed.
	};
	return cosmicSignatureTokenState;
}

// #endregion
// #region `assertCosmicSignatureTokenState`

async function assertCosmicSignatureTokenState(cosmicSignatureToken, cosmicSignatureTokenState) {
	// todo-0 Assert one signer balance.
	// todo-0 Remember to assert marketing wallet balance.
}

// #endregion
// #region `getNextEthBidPrice`

/// todo-0
/*async*/ function getNextEthBidPrice(latestBlock, currentTimeOffset) {
	return 123n;
}

// #endregion
// #region `getNextCstBidPrice`

// Function signature updated to accept state
/*async*/ function getNextCstBidPrice(cosmicSignatureGameProxyState, latestBlock, currentTimeOffset) {
	// Replicate Solidity logic from _getCstDutchAuctionDuration
	// Ensure BigInt division
	const cstDutchAuctionDuration_ = cosmicSignatureGameProxyState.mainPrizeTimeIncrementInMicroSeconds / cosmicSignatureGameProxyState.cstDutchAuctionDurationDivisor;

	// Replicate Solidity logic from _getCstDutchAuctionElapsedDuration
	// Ensure timestamp comparison uses BigInt
	const cstDutchAuctionElapsedDuration_ = BigInt(latestBlock.timestamp) - cosmicSignatureGameProxyState.cstDutchAuctionBeginningTimeStamp;

	// Replicate Solidity logic from _getCstDutchAuctionTotalAndRemainingDurations (remaining calc)
	let cstDutchAuctionRemainingDuration_ = cstDutchAuctionDuration_ - cstDutchAuctionElapsedDuration_;

	// Apply offset as done in Solidity getNextCstBidPrice
	// Ensure currentTimeOffset is BigInt
	cstDutchAuctionRemainingDuration_ -= BigInt(currentTimeOffset);

	// Check expiry
	if (cstDutchAuctionRemainingDuration_ <= 0n) {
		return 0n;
	}

	// Determine starting price
	const cstDutchAuctionBeginningBidPrice_ =
		(cosmicSignatureGameProxyState.lastCstBidderAddress === hre.ethers.ZeroAddress)
			? cosmicSignatureGameProxyState.nextRoundFirstCstDutchAuctionBeginningBidPrice
			: cosmicSignatureGameProxyState.cstDutchAuctionBeginningBidPrice;

	// Calculate final price using BigInt division (truncates like Solidity)
	// Avoid division by zero if duration is zero (though unlikely with prior checks)
	if (cstDutchAuctionDuration_ === 0n) {
	    return 0n; // Or handle as an error case depending on contract logic for zero duration
	}
	const nextCstBidPrice_ = cstDutchAuctionBeginningBidPrice_ * cstDutchAuctionRemainingDuration_ / cstDutchAuctionDuration_;

	return nextCstBidPrice_;
}

// #endregion
// #region `refreshCosmicSignatureGameProxyState`

// Function to refresh the JavaScript state object from the contract
async function refreshCosmicSignatureGameProxyState(cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, stateObject) { // Added address parameter
	console.log("\n--- Refreshing JS state from contract ---");
	// Fetch values individually using public getters
	stateObject.balanceAmount = await hre.ethers.provider.getBalance(cosmicSignatureGameProxyAddr);
	stateObject.lastBidderAddress = await cosmicSignatureGameProxy.lastBidderAddress();
	// stateObject.lastBidAmount = ? // Need getter or view function
	// stateObject.bidderAddresses = ? // Mapping, complex to refresh fully
	stateObject.roundNum = await cosmicSignatureGameProxy.roundNum();
	stateObject.roundActivationTime = await cosmicSignatureGameProxy.roundActivationTime();
	stateObject.mainPrizeTime = await cosmicSignatureGameProxy.mainPrizeTime();
	// Add other necessary getters here if needed

	console.log(`Refreshed state - balanceAmount: ${stateObject.balanceAmount}`);
	console.log(`Refreshed state - roundNum: ${stateObject.roundNum}`);
	console.log(`Refreshed state - lastBidderAddress: ${stateObject.lastBidderAddress}`);
	console.log(`Refreshed state - roundActivationTime: ${stateObject.roundActivationTime}`);
	console.log(`Refreshed state - mainPrizeTime: ${stateObject.mainPrizeTime}`);
	console.log("--- End Refreshing JS state ---");
}

// #endregion
// #region `_updateChampionsIfNeeded`

/*async*/ function _updateChampionsIfNeeded(cosmicSignatureGameProxyState) {
	// todo-0
}

// #endregion
// #region `updateBidderInfo`

/*async*/ function updateBidderInfo(cosmicSignatureGameProxyState, latestBlock, signerAddress) {
	cosmicSignatureGameProxyState.biddersInfo[signerAddress] = BigInt(latestBlock.timestamp + 1);
}

// #endregion
// #region `xxx`

/// todo-0
/*async*/ function xxx(cosmicSignatureGameProxyState) {
}

// #endregion
// #region `generateRandomUInt256Seed`

/**
 * Issue. This is a workaround for Comment-202504071.
 * Comment-202504067 applies.
 * @param {any} cosmicSignatureGameProxy
 * @returns {Promise<bigint>}
 */
async function generateRandomUInt256Seed(cosmicSignatureGameProxy) {
	const blockPrevRandao = await cosmicSignatureGameProxy.getBlockPrevRandao();
	const blockBaseFee = await cosmicSignatureGameProxy.getBlockBaseFee();
	// Explicitly cast to BigInt to resolve potential type mismatch in XOR
	return BigInt(blockPrevRandao) ^ BigInt(blockBaseFee);
}

// #endregion
