"use strict";

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { generateRandomUInt32 } = require("../src/Helpers.js");
const { deployContractsForUnitTesting } = require("../src/ContractUnitTestingHelpers.js");

const SKIP_LONG_TESTS = false;

describe("Bidding-1", function () {
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

		const {signers, cosmicSignatureGameProxy, cosmicSignatureToken,} = await loadFixture(deployContractsForUnitTesting);
		
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
});
