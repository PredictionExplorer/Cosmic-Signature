// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
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
				const cosmicSignatureTokenForSigner = cosmicSignatureToken.connect(signer);
				const cosmicSignatureGameProxyForSigner = cosmicSignatureGameProxy.connect(signer);
				let transactionSucceeded = false;
				randomNumber = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper);

				// #endregion
				// #region

				// todo-0 Calling only some contract methods for now. We need to call some others as well.
				switch (randomNumber % 4n) {
					// #region

					case 0n: {
						randomNumber = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper);
						const ethDonationAmount = ((randomNumber & (0xFn << 128n)) == 0n) ? 0n : (randomNumber & ((1n << 40n) - 1n));
						const transactionResponseFuture = cosmicSignatureGameProxyForSigner.donateEth({value: ethDonationAmount,});
						// await expect(transaction).not.reverted;
						await expect(transactionResponseFuture)
							.emit(cosmicSignatureGameProxyForSigner, "EthDonated")
							.withArgs(cosmicSignatureGameProxyState.roundNum, signer.address, ethDonationAmount);
						const transactionResponse = await transactionResponseFuture;
						const transactionReceipt = await transactionResponse.wait();
						// console.log(transactionReceipt.logs);
						// console.log("");
						expect(transactionReceipt.logs.length).equal(1);
						cosmicSignatureGameProxyState.balanceAmount += ethDonationAmount;
						break;
					}

					// #endregion
					// #region

					case 1n: {
						// todo-0 query block before and after transaction.
						const latestBlock = await hre.ethers.provider.getBlock("latest");
						const ethBidPrice = getNextEthBidPrice(latestBlock, 1n);
						const paidEthPrice = ethBidPrice;
						randomNumber = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper);
						const ethPriceToPayMaxLimit = randomNumber % (paidEthPrice * 3n + 1n);
						// todo-0 Sometimes bid with RWalk and/or donate an NFT.
						const transactionResponseFuture = /*await*/ cosmicSignatureGameProxyForSigner.bidWithEth((-1n), "", {value: ethPriceToPayMaxLimit,});
						const overpaidEthPrice = ethPriceToPayMaxLimit - paidEthPrice;
						if (overpaidEthPrice < 0) {
							await expect(transactionResponseFuture)
								.revertedWithCustomError(cosmicSignatureGameProxyForSigner, "InsufficientReceivedBidAmount")
								.withArgs("The current ETH bid price is greater than the amount you transferred.", paidEthPrice, ethPriceToPayMaxLimit);
						} else if(cosmicSignatureGameProxyState.lastBidderAddress == hre.ethers.ZeroAddress) {
							if (BigInt(latestBlock.timestamp + 1) < cosmicSignatureGameProxyState.roundActivationTime) {
								await expect(transactionResponseFuture)
									.revertedWithCustomError(cosmicSignatureGameProxyForSigner, "RoundIsInactive")
									.withArgs("The current bidding round is not active yet.", cosmicSignatureGameProxyState.roundActivationTime, latestBlock.timestamp + 1);
							} else {
								transactionSucceeded = true;
							}
						} else {
							transactionSucceeded = true;
						}
						if (transactionSucceeded) {
							// await expect(transactionResponseFuture).not.reverted;
							const transactionResponse = await transactionResponseFuture;
							const transactionReceipt = await transactionResponse.wait();

							// todo-0 update balance.

							if (cosmicSignatureGameProxyState.lastBidderAddress == hre.ethers.ZeroAddress) {
								cosmicSignatureGameProxyState.ethDutchAuctionBeginningBidPrice = ethBidPrice * cosmicSignatureGameProxyState.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
							}
							cosmicSignatureGameProxyState.nextEthBidPrice = ethBidPrice + ethBidPrice / cosmicSignatureGameProxyState.ethBidPriceIncreaseDivisor + 1n;
							// todo-1 This is incorrect because this can be `undefined`. Add functions to mint and burn.
							cosmicSignatureTokenState.accountBalanceAmounts[signer.address] += cosmicSignatureGameProxyState.cstRewardAmountForBidding;
							await expect(transactionResponseFuture)
								.emit(cosmicSignatureTokenForSigner, "Transfer")
								.withArgs(hre.ethers.ZeroAddress, signer.address, cosmicSignatureGameProxyState.cstRewardAmountForBidding);
							if (cosmicSignatureGameProxyState.lastBidderAddress == hre.ethers.ZeroAddress) {
								cosmicSignatureGameProxyState.cstDutchAuctionBeginningTimeStamp = BigInt(latestBlock.timestamp + 1);
								cosmicSignatureGameProxyState.mainPrizeTime =
									BigInt(latestBlock.timestamp + 1) +
									(cosmicSignatureGameProxyState.mainPrizeTimeIncrementInMicroSeconds / cosmicSignatureGameProxyState.initialDurationUntilMainPrizeDivisor);
								await expect(transactionResponseFuture)
									.emit(cosmicSignatureGameProxyForSigner, "FirstBidPlacedInRound")
									.withArgs(cosmicSignatureGameProxyState.roundNum, BigInt(latestBlock.timestamp + 1));
							} else {
								_updateChampionsIfNeeded(cosmicSignatureGameProxyState);
								const mainPrizeCorrectedTime = BigInt(Math.max(Number(cosmicSignatureGameProxyState.mainPrizeTime), latestBlock.timestamp + 1));
								cosmicSignatureGameProxyState.mainPrizeTime =
									mainPrizeCorrectedTime +
									(cosmicSignatureGameProxyState.mainPrizeTimeIncrementInMicroSeconds / 1_000_000n);
							}
							cosmicSignatureGameProxyState.lastBidderAddress = signer.address;
							++ cosmicSignatureGameProxyState.bidderAddresses[Number(cosmicSignatureGameProxyState.roundNum)];
							updateBidderInfo(cosmicSignatureGameProxyState, latestBlock, signer.address);
							await expect(transactionResponseFuture)
								.emit(cosmicSignatureGameProxyForSigner, "BidPlaced")
								.withArgs(
									cosmicSignatureGameProxyState.roundNum,
									BigInt(latestBlock.timestamp + 1),
									signer.address,
									paidEthPrice,
									(-1n),
									(-1n),
									"",
									cosmicSignatureGameProxyState.mainPrizeTime
								);

							// todo-0 if (overpaidEthPrice_ > int256(0)) {
							// todo-0 . . .

							// todo-0 assert the number of events
						}
						break;
					}

					// #endregion
					// #region

					case 2n: {
						const latestBlock = await hre.ethers.provider.getBlock("latest");
						const nextCstBidPrice = getNextCstBidPrice(latestBlock, 1n);
						randomNumber = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper);
						const cstPriceToPayMaxLimit = randomNumber % (nextCstBidPrice * 3n + 1n);
						const signerCstBalance = tokenBalanceOf(cosmicSignatureTokenState, signer.address);
						// todo-0 Sometimes bid with donating an NFT.
						const transactionResponseFuture = /*await*/ cosmicSignatureGameProxyForSigner.bidWithCst(cstPriceToPayMaxLimit, "");
						if (nextCstBidPrice > cstPriceToPayMaxLimit) {
							await expect(transactionResponseFuture).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "InsufficientReceivedBidAmount");
						} else if (nextCstBidPrice > signerCstBalance) {
							await expect(transactionResponseFuture).revertedWithCustomError(cosmicSignatureTokenForSigner, "ERC20InsufficientBalance");
						} else if(cosmicSignatureGameProxyState.lastBidderAddress == hre.ethers.ZeroAddress) {
							if (latestBlock.timestamp + 1 < cosmicSignatureGameProxyState.roundActivationTime) {
								await expect(transactionResponseFuture).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "RoundIsInactive");
							} else {
								await expect(transactionResponseFuture).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "WrongBidType");
							}
						} else {
							transactionSucceeded = true;
						}
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
						}
						break;
					}

					// #endregion
					// #region

					case 3n: {
						const latestBlock = await hre.ethers.provider.getBlock("latest");
						// todo-0 Rename this and similar variables to `transactionResponse`.
						const transaction = /*await*/ cosmicSignatureGameProxyForSigner.claimMainPrize();
						if (signer.address == cosmicSignatureGameProxyState.lastBidderAddress) {
							if (latestBlock.timestamp + 1 < cosmicSignatureGameProxyState.mainPrizeTime) {
								await expect(transaction).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "MainPrizeEarlyClaim");
							} else {
								transactionSucceeded = true;
							}
						} else {
							if (cosmicSignatureGameProxyState.lastBidderAddress == hre.ethers.ZeroAddress) {
								await expect(transaction).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "NoBidsPlacedInCurrentRound");
							} else if (latestBlock.timestamp + 1 < cosmicSignatureGameProxyState.mainPrizeTime + cosmicSignatureGameProxyState.timeoutDurationToClaimMainPrize) {
								await expect(transaction).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "MainPrizeClaimDenied");
							} else {
								transactionSucceeded = true;
							}
						}
						if (transactionSucceeded) {
							// todo-0 Check events instead of checking not reverted.
							await expect(transaction).not.reverted;
							console.log(
								cosmicSignatureGameProxyState.roundNum.toString(),
								cosmicSignatureGameProxyState.bidderAddresses[Number(cosmicSignatureGameProxyState.roundNum)].toString(),
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
					await assertCosmicSignatureGameProxyState(cosmicSignatureGameProxyForSigner, cosmicSignatureGameProxyAddr, cosmicSignatureGameProxyState);
					await assertCosmicSignatureTokenState(cosmicSignatureTokenForSigner, cosmicSignatureTokenState);
				}

				// #endregion
			} while (cosmicSignatureGameProxyState.roundNum < numRoundsToRun);

			// #endregion
			// #region

			// [Comment-202504043/]
			{
				// We are really supposed to skip the last item in this array, but it's always zero.
				const totalBidCount = cosmicSignatureGameProxyState.bidderAddresses.reduce((sum, item) => (sum + item), 0n);

				const bidAverageCountPerRound = Number(totalBidCount) / Number(cosmicSignatureGameProxyState.roundNum);
				const isSuccess = bidAverageCountPerRound >= bidAverageCountPerRoundMinLimit;
				if ( ! isSuccess ) {
					const errorDetails = {bidAverageCountPerRound,};
					throw new Error("Error 202504052. " + JSON.stringify(errorDetails));
				}
			}

			// #endregion
		} catch (errorDetails) {
			// #region

			{
				const errorDetails2 = {randomNumberSeed: "0x" + randomNumberSeed.toString(16),};
				console.log("Error 202504055. " + JSON.stringify(errorDetails2));
			}

			throw errorDetails;

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
	};
	return cosmicSignatureGameProxyState;
}

// #endregion
// #region `assertCosmicSignatureGameProxyState`

async function assertCosmicSignatureGameProxyState(cosmicSignatureGameProxy, cosmicSignatureGameProxyAddr, cosmicSignatureGameProxyState) {
	// todo-0 Assert more variables

	expect(await hre.ethers.provider.getBalance(cosmicSignatureGameProxyAddr)).equal(cosmicSignatureGameProxyState.balanceAmount);
	expect(await cosmicSignatureGameProxy.lastBidderAddress()).equal(cosmicSignatureGameProxyState.lastBidderAddress);
	expect(cosmicSignatureGameProxyState.bidderAddresses.length).equal(Number(cosmicSignatureGameProxyState.roundNum + 1n));
	expect((await cosmicSignatureGameProxy.bidderAddresses(cosmicSignatureGameProxyState.roundNum))/*[0]*/).equal(cosmicSignatureGameProxyState.bidderAddresses[Number(cosmicSignatureGameProxyState.roundNum)]);
	expect(await cosmicSignatureGameProxy.roundNum()).equal(cosmicSignatureGameProxyState.roundNum);
	expect(await cosmicSignatureGameProxy.delayDurationBeforeRoundActivation()).equal(cosmicSignatureGameProxyState.delayDurationBeforeRoundActivation);
	expect(await cosmicSignatureGameProxy.roundActivationTime()).equal(cosmicSignatureGameProxyState.roundActivationTime);
	expect(await cosmicSignatureGameProxy.ethDutchAuctionDurationDivisor()).equal(cosmicSignatureGameProxyState.ethDutchAuctionDurationDivisor);
	expect(await cosmicSignatureGameProxy.mainPrizeTime()).equal(cosmicSignatureGameProxyState.mainPrizeTime);
	expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds()).equal(cosmicSignatureGameProxyState.mainPrizeTimeIncrementInMicroSeconds);
	expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementIncreaseDivisor()).equal(cosmicSignatureGameProxyState.mainPrizeTimeIncrementIncreaseDivisor);
	expect(await cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize()).equal(cosmicSignatureGameProxyState.timeoutDurationToClaimMainPrize);
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

/// todo-0
/*async*/ function getNextCstBidPrice(latestBlock, currentTimeOffset) {
	return 123n;
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
// #region `tokenBalanceOf`

function tokenBalanceOf(tokenState, account) {
	return tokenState.accountBalanceAmounts[account] ?? 0n;
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
 * @returns {bigint}
 */
async function generateRandomUInt256Seed(cosmicSignatureGameProxy) {
	const blockPrevRandao = await cosmicSignatureGameProxy.getBlockPrevRandao();
	const blockBaseFee = await cosmicSignatureGameProxy.getBlockBaseFee();
	return blockPrevRandao ^ blockBaseFee;
}

// #endregion
