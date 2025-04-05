// todo-0 Rename this file to "CosmicSignatureGame-1".

// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
// todo-1 Do we still need both of these?
const { generateRandomUInt32, generateRandomUInt256 } = require("../src/Helpers.js");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

// #endregion
// #region

const SKIP_LONG_TESTS = false;

// #endregion
// #region `describe`

describe("Bidding-1", function () {
	// #region

	it("Multiple bidding rounds", async function () {
		// #region

		if (SKIP_LONG_TESTS) return;

		// #endregion
		// #region
		
		const roundCountMinLimit = 10;
		const bidAverageCountPerRoundMinLimit = 15.0;

		// Comment-202504045 relates and/or applies.
		const timeIncrementParam1 = 2_000_000n;

		// #endregion
		// #region

		const {
			signers,
			cosmicSignatureToken,
			cosmicSignatureGameProxy,
		} = await loadFixture(deployContractsForUnitTesting);

		// Comment-202501192 applies.
		await hre.ethers.provider.send("evm_mine");

		// #endregion
		// #region

		const cosmicSignatureGameState = await createCosmicSignatureGameState(cosmicSignatureGameProxy);
		await assertCosmicSignatureGameState(cosmicSignatureGameProxy, cosmicSignatureGameState);
		const cosmicSignatureTokenState = await createCosmicSignatureTokenState(signers.length);
		await assertCosmicSignatureTokenState(cosmicSignatureToken, cosmicSignatureTokenState);

		// #endregion
		// #region

		for (;;) {
			// #region

			let randomNumber;

			// #endregion
			// #region

			{
				// [Comment-202504045]
				// Issue. This simple logic seems to work for now, but this is really not precise science.
				// What we need is that the condition near Comment-202504043 was `true` and
				// this test took not too long to complete.
				// During an ETH Dutch auction, the time increment affects the initial ETH bid price,
				// which affects how long it will take a signer to run out of ETH.
				// [/Comment-202504045]
				const timeIncrementMaxLimit =
					cosmicSignatureGameState.mainPrizeTimeIncrementInMicroSeconds /
					( (cosmicSignatureGameState.lastBidderAddress == hre.ethers.ZeroAddress) ?
					  cosmicSignatureGameState.ethDutchAuctionDurationDivisor :
					  timeIncrementParam1
					);

				randomNumber = BigInt(generateRandomUInt32());
				const timeIncrement = Number(randomNumber % timeIncrementMaxLimit);
				if (timeIncrement > 0) {
					if (timeIncrement > 1) {
						await hre.ethers.provider.send("evm_increaseTime", [timeIncrement]);
					}
					await hre.ethers.provider.send("evm_mine",);
				}
			}

			// #endregion
			// #region

			randomNumber = BigInt(generateRandomUInt32());
			const signerIndex = Number(randomNumber % BigInt(signers.length));
			const signer = signers[signerIndex];
			const cosmicSignatureTokenForSigner = cosmicSignatureToken.connect(signer);
			const cosmicSignatureGameProxyForSigner = cosmicSignatureGameProxy.connect(signer);
			randomNumber = BigInt(generateRandomUInt32());

			// #endregion
			// #region

			try {
				// #region

				// todo-0 Calling only some contract methods for now. We need to call some others as well.
				switch (randomNumber % 4n) {
					// #region

					case 0n: {
						randomNumber = generateRandomUInt256();
						const donationAmount = ((randomNumber & (0x7n << 128n)) == 0n) ? 0n : (randomNumber & ((1n << 40n) - 1n));
						const transaction = await cosmicSignatureGameProxyForSigner.donateEth({value: donationAmount});
						// await expect(transaction).not.reverted;
						await expect(transaction)
							.emit(cosmicSignatureGameProxyForSigner, "EthDonated")
							.withArgs(cosmicSignatureGameState.roundNum, signer.address, donationAmount);

						// todo-0 Update game and token state. For now, nothing to update.
						// cosmicSignatureGameState.balance += donationAmount;

						break;
					}

					// #endregion
					// #region

					case 1n: {
						const latestBlock = await hre.ethers.provider.getBlock("latest");
						// todo-0 We really should calculate this bid price here, not query it from the contract.
						const nextEthBidPrice = await cosmicSignatureGameProxyForSigner.getNextEthBidPrice(1n);
						randomNumber = generateRandomUInt256();
						const ethPriceToPayMaxLimit = randomNumber % (nextEthBidPrice * 2n + 1n);
						let isSuccess = false;
						const transaction = await cosmicSignatureGameProxyForSigner.bidWithEth((-1n), "", {value: ethPriceToPayMaxLimit});
						if (ethPriceToPayMaxLimit <  nextEthBidPrice) {
							await expect(transaction).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "InsufficientReceivedBidAmount");
						} else if(cosmicSignatureGameState.lastBidderAddress == hre.ethers.ZeroAddress) {
							if (latestBlock.timestamp + 1 < cosmicSignatureGameState.roundActivationTime) {
								await expect(transaction).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "RoundIsInactive");
							} else {
								isSuccess = true;
							}
						} else {
							isSuccess = true;
						}
						if (isSuccess) {
							// todo-0 Check events instead of checking not reverted.
							await expect(transaction).not.reverted;
							// todo-0 update game and token state
						}
						break;
					}

					// #endregion
					// #region
						
					case 2n: {
						const latestBlock = await hre.ethers.provider.getBlock("latest");
						// todo-0 We really should calculate this bid price here, not query it from the contract.
						const nextCstBidPrice = await cosmicSignatureGameProxyForSigner.getNextCstBidPrice(1n);
						randomNumber = generateRandomUInt256();
						const cstPriceToPayMaxLimit = randomNumber % (nextCstBidPrice * 2n + 1n);
						let isSuccess = false;
						const transaction = await cosmicSignatureGameProxyForSigner.bidWithCst(cstPriceToPayMaxLimit, "");
						if (cstPriceToPayMaxLimit < nextCstBidPrice) {
							await expect(transaction).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "InsufficientReceivedBidAmount");
						} else if (cstPriceToPayMaxLimit > signerCstBalance) {
							await expect(transaction).revertedWithCustomError(cosmicSignatureTokenForSigner, "ERC20InsufficientBalance");
						} else if(cosmicSignatureGameState.lastBidderAddress == hre.ethers.ZeroAddress) {
							if (latestBlock.timestamp + 1 < cosmicSignatureGameState.roundActivationTime) {
								await expect(transaction).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "RoundIsInactive");
							} else {
								await expect(transaction).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "WrongBidType");
							}
						} else {
							isSuccess = true;
						}
						if (isSuccess) {
							// todo-0 Check events instead of checking not reverted.
							await expect(transaction).not.reverted;
							// todo-0 update game and token state
						}
						break;
					}

					// #endregion
					// #region

					case 3n: {
						let isSuccess = false;
						const latestBlock = await hre.ethers.provider.getBlock("latest");
						const transaction = await cosmicSignatureGameProxyForSigner.claimMainPrize();
						if (signer.address == cosmicSignatureGameState.lastBidderAddress) {
							if (latestBlock.timestamp + 1 < cosmicSignatureGameState.mainPrizeTime) {
								await expect(transaction).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "MainPrizeEarlyClaim");
							} else {
								isSuccess = true;
							}
						} else {
							if (cosmicSignatureGameState.lastBidderAddress == hre.ethers.ZeroAddress) {
								await expect(transaction).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "NoBidsPlacedInCurrentRound");
							} else if (latestBlock.timestamp + 1 < cosmicSignatureGameState.mainPrizeTime + cosmicSignatureGameState.timeoutDurationToClaimMainPrize) {
								await expect(transaction).revertedWithCustomError(cosmicSignatureGameProxyForSigner, "MainPrizeClaimDenied");
							} else {
								isSuccess = true;
							}
						}
						if (isSuccess) {
							// todo-0 Check events instead of checking not reverted.
							await expect(transaction).not.reverted;
							// todo-0 update game and token state
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

				// todo-0 Don't do this if transaction reverted.
				await assertCosmicSignatureGameState(cosmicSignatureGameProxy, cosmicSignatureGameState);
				await assertCosmicSignatureTokenState(cosmicSignatureToken, cosmicSignatureTokenState);
		
				// #endregion
			} catch (errorDetails) {
				// #region

				if (errorDetails.message.startsWith("Sender doesn't have enough funds to send tx.")) {
					// Doing nothing.
				} else {
					throw errorDetails;
				}

				// [Comment-202504043/]
				// todo-0 Validate bidAverageCountPerRoundMinLimit
				// todo-0 Don't count failed round bids
				// todo-0 Remember that all numbers are float
				if (cosmicSignatureGameState.roundNum >= roundCountMinLimit) {

					// Doing nothing.
				} else {
					// todo-0 Throw cosmicSignatureGameState.roundNum and the number of bids per round
				}

				// #endregion
			}

			// #endregion
		}

		// #endregion
	});

	// #endregion
	// #region

	// todo-1 Eventually delete this test.
	//
	// This is a stress test that executes multiple transactions per block.
	//
	// Discussion: https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1739909248214549
	//
	// todo-1 It would be nice to validate that the behavior is correct.
	//
	// todo-1 Add `claimMainPrize` calls.
	//
	// todo-1 Arbitrum mines 4 blocks per second with equal timestamps. Try to test that.
	// todo-1 There is the `allowBlocksWithSameTimestamp` parameter, but setting it would make all blocks having the same timestamp,
	// todo-1 which would break all tests and other scripts. It appears to be impossible to change it temporarily at runtime.
	// 
	// todo-1 Maybe refactor this to mine 1 transaction per block. Then Chai matchers will work to correctly show
	// todo-1 what caused transaction reversal. They re-execute the transaction in simulation to find out what went wrong.
	// todo-1 Then just review then Solidity code to make sure that
	// todo-1 regardless if `block.timestamp` or `block.number` change or don't change, the behavior will be correct.
	//
	// todo-1 Develop a separate test and/or refactor this one to test `bidWithEth` reentrancy. They can bid by reentering.
	// todo-1 But see ToDo-202502186-1.
	//
	// todo-1 Nick wrote:
	// todo-1 As this is not really a unit test anymore, but an integration test, it should be done as standalone script
	// todo-1 (and maybe go in "scripts" directory, and probably in its own folder) .
	// todo-1 So you could run it over local-chain geth instance
	// todo-1 with its own genesis.json and account balances for this particular test.
	it("Long-term aggressive bidding behaves correctly", async function () {
		if (SKIP_LONG_TESTS) return;

		const {
			signers,
			cosmicSignatureToken,
			cosmicSignatureGameProxy,
		} = await loadFixture(deployContractsForUnitTesting);
		
		// Comment-202501192 applies.
		await hre.ethers.provider.send("evm_mine");

		// {
		// 	let latestBlockTimeStamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
		// 	console.log(latestBlockTimeStamp);
		// 	// await hre.ethers.provider.send("evm_increaseTime", [0]);
		// 	await hre.ethers.provider.send("evm_setNextBlockTimestamp", [latestBlockTimeStamp]);
		// 	await hre.ethers.provider.send("evm_mine");
		// 	latestBlockTimeStamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
		// 	console.log(latestBlockTimeStamp);
		// 	// await hre.ethers.provider.send("evm_mine");
		// 	latestBlockTimeStamp = (await hre.ethers.provider.getBlock("latest")).timestamp;
		// 	console.log(latestBlockTimeStamp);
		// 	console.log();
		// }

		const transactions = [];
		let randomNumber;

		const mineBlockIfNeeded = async (force) => {
			let timeIncrease = force ? 1 : ((randomNumber & 0xFF) - 0xB0);
			if (timeIncrease > 0) {
				if (timeIncrease >= 10) {
					timeIncrease *= 40;
				}
				if (timeIncrease > 1) {
					await hre.ethers.provider.send("evm_increaseTime", [timeIncrease]);
				}

				// todo-1 Bug. Even if `timeIncrease` is zero the next block timestamp will still be incremented.
				// todo-1 Sending "evm_increaseTime" of zero won't help.
				await hre.ethers.provider.send("evm_mine");

				let errorDetails;
				for (const transaction of transactions) {
					try {
						// console.log(transaction);

						// // todo-1 This can throw an error, but the error doesn't appear to contain usable info on what caused the error.
						// await transaction.wait();

						// await expect(transaction).not.reverted;
						// await expect(transaction).fulfilled;

						// We are going to also be OK with the transaction not reverting.
						// todo-1 This fails to detect the actual error, if any, and always throws that the transaction didn't revert,
						// todo-1 probably for the same reason `transaction.wait` doesn't throw a usable error.
						await expect(transaction).revertedWithCustomError(cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");

						// console.log("Success 1.", transactions.length);
					} catch (error2Details) {
						// console.log("Error.", transactions.length);

						// console.log();
						// console.log(error2Details.message);
						// console.log(error2Details);

						// // ChatGPT recommended this approach, but it doesn't work.
						// const revertData = error2Details.data;
						// // const revertData = error2Details;
						// if (revertData) {
						// 	const decodedError = cosmicSignatureGameProxy.interface.parseError(revertData);
						// 	console.log("Custom Error Name:", decodedError.name);
						// } else {
						// 	console.error("Error data not found.");
						// }

						if (error2Details.message.endsWith(", but it didn't revert")) {
							// console.log("Success 2.", transactions.length);
						} else if ( errorDetails === undefined ||
										errorDetails.message.startsWith("Sender doesn't have enough funds to send tx.") &&
										( ! error2Details.message.startsWith("Sender doesn't have enough funds to send tx.") )
									) {
							errorDetails = error2Details;
						}
					}
				}
				transactions.length = 0;
				if (errorDetails !== undefined) {
					// console.log(errorDetails.message);
					throw errorDetails;
				}
			}
		};

		await hre.ethers.provider.send("evm_setAutomine", [false]);
		try {
			// This loop will keep spinning until an error is thrown due to a signer running out of ETH,
			// or any other error.
			for ( let counter = 0; /*counter < 300*/; ++ counter ) {
				randomNumber = generateRandomUInt32();
				const signer = signers[(randomNumber & 0xFFFF) % signers.length];
				// if ((counter & 0xFF) == 0) {
				// 	console.log((
				// 		await hre.ethers.provider.getBlock("latest")).timestamp,
				// 		((await hre.ethers.provider.getBalance(signer.address)) + 10n ** 18n / 2n) / (10n ** 18n),
				// 		Number(await cosmicSignatureGameProxy.getNextEthBidPrice(1n)) / (10 ** 18)
				// 	);
				// }
				let transactionQueued = false;
				if (await cosmicSignatureGameProxy.lastBidderAddress() != hre.ethers.ZeroAddress) {
					const cstBalanceAmount_ = await cosmicSignatureToken.balanceOf(signer.address);
					const nextCstBidPrice_ = await cosmicSignatureGameProxy.getNextCstBidPrice(1n);

					// [Comment-202502193]
					// This is (likely) going to be enough for each of up to 2 CST bids. Further bids within the same block will (likely) fail.
					// [/Comment-202502193]
					// todo-0 Magic numbe hardcoded.
					const nextCstBidPrice2_ = nextCstBidPrice_ * 2n;

					if (cstBalanceAmount_ >= nextCstBidPrice2_) {
						transactions.push(await cosmicSignatureGameProxy.connect(signer).bidWithCst(nextCstBidPrice2_, "", {gasLimit: 450_000}));
						transactionQueued = true;
					}
				}
				if ( ! transactionQueued ) {
					const nextEthBidPrice_ = await cosmicSignatureGameProxy.getNextEthBidPrice(1n);
					// const nextEthBidPrice2_ = 11n;

					// [Comment-202502191]
					// This is going to be enough for each of up to 4 ETH bids. Further bids within the same block will fail.
					// [/Comment-202502191]
					const nextEthBidPrice2_ = nextEthBidPrice_ * 1041n / 1000n;

					transactions.push(await cosmicSignatureGameProxy.connect(signer).bidWithEth((-1n), "", {value: nextEthBidPrice2_, gasLimit: 450_000}));
				}
				randomNumber >>= 16;
				await mineBlockIfNeeded(false);
			}
		} catch (errorDetails) {
			// console.log(errorDetails.message);
			let error2Details;
			try {
				// Mining whatever was queued.
				await mineBlockIfNeeded(true);
			} catch (error2Details2) {
				error2Details = error2Details2;
			}
			await hre.ethers.provider.send("evm_setAutomine", [true]);
			if ( ! errorDetails.message.startsWith("Sender doesn't have enough funds to send tx.") ) {
				throw errorDetails;
			}
			if (error2Details !== undefined && ( ! error2Details.message.startsWith("Sender doesn't have enough funds to send tx.") )) {
				throw error2Details;
			}
		}
	});

	// #endregion
});

// #endregion
// #region `createCosmicSignatureGameState`

/// todo-1 Add similar states for other contracts.
///
/// todo-1 For ERC-20 and ERC-721 tokens, we need to store and assert balances.
/// todo-1 Although maybe it's OK to only check if respective events have been emitted.
async function createCosmicSignatureGameState(cosmicSignatureGameProxy) {
	const cosmicSignatureGameState = {
		// todo-0 balance: 0n,

		lastBidderAddress: hre.ethers.ZeroAddress,

		// todo-0 For now, this contains the number of bids in each round. To be revisited.
		bidderAddresses: [0n],

		roundNum: 0n,
		delayDurationBeforeRoundActivation: 30 * 60,
		roundActivationTime: await cosmicSignatureGameProxy.roundActivationTime(),
		ethDutchAuctionDurationDivisor: (1_000_000n + 24n) / (2n * 24n) - 0n,
		mainPrizeTime: 0n,
		mainPrizeTimeIncrementInMicroSeconds: 60n * 60n * 1_000_000n,
		mainPrizeTimeIncrementIncreaseDivisor: 100n,
		timeoutDurationToClaimMainPrize: 24n * 60n * 60n,
	};
	return cosmicSignatureGameState;
}

// #endregion
// #region `assertCosmicSignatureGameState`

async function assertCosmicSignatureGameState(cosmicSignatureGameProxy, cosmicSignatureGameState) {
	expect(await cosmicSignatureGameProxy.lastBidderAddress()).equal(cosmicSignatureGameState.lastBidderAddress);
	expect(cosmicSignatureGameState.bidderAddresses.length).equal(cosmicSignatureGameState.roundNum + 1);
	expect((await cosmicSignatureGameProxy.bidderAddresses(cosmicSignatureGameState.roundNum))[0]).equal(cosmicSignatureGameState.bidderAddresses[cosmicSignatureGameState.roundNum]);
	expect(await cosmicSignatureGameProxy.roundNum()).equal(cosmicSignatureGameState.roundNum);
	expect(await cosmicSignatureGameProxy.delayDurationBeforeRoundActivation()).equal(cosmicSignatureGameState.delayDurationBeforeRoundActivation);
	expect(await cosmicSignatureGameProxy.roundActivationTime()).equal(cosmicSignatureGameState.roundActivationTime);
	expect(await cosmicSignatureGameProxy.ethDutchAuctionDurationDivisor()).equal(cosmicSignatureGameState.ethDutchAuctionDurationDivisor);
	expect(await cosmicSignatureGameProxy.mainPrizeTime()).equal(cosmicSignatureGameState.mainPrizeTime);
	expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds()).equal(cosmicSignatureGameState.mainPrizeTimeIncrementInMicroSeconds);
	expect(await cosmicSignatureGameProxy.mainPrizeTimeIncrementIncreaseDivisor()).equal(cosmicSignatureGameState.mainPrizeTimeIncrementIncreaseDivisor);
	expect(await cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize()).equal(cosmicSignatureGameState.timeoutDurationToClaimMainPrize);
}

// #endregion
// #region `createCosmicSignatureTokenState`

async function createCosmicSignatureTokenState(signerCount) {
	const cosmicSignatureTokenState = {
		// todo-0 Add properties.

		// todo-0 array: signerBalances. its length is signerCount
	};
	return cosmicSignatureTokenState;
}

// #endregion
// #region `assertCosmicSignatureTokenState`

async function assertCosmicSignatureTokenState(cosmicSignatureToken, cosmicSignatureTokenState) {
	// todo-0
}

// #endregion
