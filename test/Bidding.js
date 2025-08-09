"use strict";

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt32, generateRandomUInt256, waitForTransactionReceipt } = require("../src/Helpers.js");
const { setRoundActivationTimeIfNeeded } = require("../src/ContractDeploymentHelpers.js");
const { SKIP_LONG_TESTS, loadFixtureDeployContractsForTesting, makeNextBlockTimeDeterministic } = require("../src/ContractTestingHelpers.js");

// let latestTimeStamp = 0;
// let latestBlock = undefined;
// 
// async function logLatestBlock(tag_) {
// 	const latestTimeStamp_ = Date.now();
// 	const latestBlock_ = await hre.ethers.provider.getBlock("latest");
// 	if (latestTimeStamp <= 0) {
// 		console.info(
// 			tag_,
// 			latestTimeStamp_.toString(),
// 			latestBlock_.number.toString(),
// 			latestBlock_.timestamp.toString(),
// 			(latestBlock_.timestamp - Math.floor(latestTimeStamp_ / 1000)).toString()
// 		);
// 	} else {
// 		console.info(
// 			tag_,
// 			latestTimeStamp_.toString(),
// 			(latestTimeStamp_ - latestTimeStamp).toString(),
// 			latestBlock_.number.toString(),
// 			(latestBlock_.number - latestBlock.number).toString(),
// 			latestBlock_.timestamp.toString(),
// 			(latestBlock_.timestamp - latestBlock.timestamp).toString(),
// 			(latestBlock_.timestamp - Math.floor(latestTimeStamp_ / 1000)).toString()
// 		);
// 	}
// 	latestTimeStamp = latestTimeStamp_;
// 	latestBlock = latestBlock_;
// }

describe("Bidding", function () {
	it("Smoke-test", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const [ethDutchAuctionDuration_, ethDutchAuctionElapsedDuration_,] = await contracts_.cosmicSignatureGameProxy.getEthDutchAuctionDurations();
		expect(ethDutchAuctionDuration_).equal(2n * 24n * 60n * 60n + 2n);
		expect(ethDutchAuctionElapsedDuration_).equal(-1n);
		const [cstDutchAuctionDuration_, /*cstDutchAuctionElapsedDuration_,*/] = await contracts_.cosmicSignatureGameProxy.getCstDutchAuctionDurations();
		expect(cstDutchAuctionDuration_).equal(1n * 24n * 60n * 60n / 2n);
	});

	it("The getDurationUntilRoundActivation and getDurationElapsedSinceRoundActivation methods", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const roundActivationTime_ = await contracts_.cosmicSignatureGameProxy.roundActivationTime();

		for ( let counter_ = -1; counter_ <= 1; ++ counter_ ) {
			const latestBlock_ = await hre.ethers.provider.getBlock("latest");
			expect(latestBlock_.timestamp).equal(Number(roundActivationTime_) + counter_);
			const durationUntilRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilRoundActivation();
			expect(durationUntilRoundActivation_).equal( - counter_ );
			const durationElapsedSinceRoundActivation_ = await contracts_.cosmicSignatureGameProxy.getDurationElapsedSinceRoundActivation();
			expect(durationElapsedSinceRoundActivation_).equal(counter_);
			await hre.ethers.provider.send("evm_mine");
		}
	});

	it("The halveEthDutchAuctionEndingBidPrice method", async function () {
		// #region

		if (SKIP_LONG_TESTS) {
			console.warn("Warning 202508151. Skipping a long test.");
			// return;
		}

		// #endregion
		// #region

		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		// #endregion
		// #region

		const ethDutchAuctionDurationDivisor_ = await contracts_.cosmicSignatureGameProxy.ethDutchAuctionDurationDivisor();
		const ethDutchAuctionEndingBidPriceDivisor_ = await contracts_.cosmicSignatureGameProxy.ethDutchAuctionEndingBidPriceDivisor();

		// #endregion
		// #region

		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).halveEthDutchAuctionEndingBidPrice())
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "OwnableUnauthorizedAccount");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).halveEthDutchAuctionEndingBidPrice())
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FirstRound");

		// #endregion
		// #region

		// Given Comment-202508134, skipping the 1st bidding round.
		{
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
			const mainPrizeTime_ = await contracts_.cosmicSignatureGameProxy.mainPrizeTime();
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime_),]);
			// await hre.ethers.provider.send("evm_mine");
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize());
		}

		// #endregion
		// #region

		{
			const [ethDutchAuctionDuration_, /*ethDutchAuctionElapsedDuration_,*/] = await contracts_.cosmicSignatureGameProxy.getEthDutchAuctionDurations();
			const roundActivationTime_ = await contracts_.cosmicSignatureGameProxy.roundActivationTime();

			// Sleeping for a random duration to randomize the initial ETH bid price,
			// which, in turn, will randomize the next block initial ETH bid price.
			const nextBlockTime_ = Number(roundActivationTime_) + generateRandomUInt32() % (Number(ethDutchAuctionDuration_) + 1);
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(nextBlockTime_),]);
			// await hre.ethers.provider.send("evm_mine");

			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: 10n ** 18n,}));
			await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).halveEthDutchAuctionEndingBidPrice())
				.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "BidHasBeenPlacedInCurrentRound");
			const mainPrizeTime_ = await contracts_.cosmicSignatureGameProxy.mainPrizeTime();
			await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime_),]);
			// await hre.ethers.provider.send("evm_mine");
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).claimMainPrize());
		}

		// #endregion
		// #region

		let totalIteration1Counter_ = 0;
		let totalIteration2Counter_ = 0;

		// #endregion
		// #region

		for ( let iteration1Counter_ = 1; ; ++ iteration1Counter_ ) {
			// #region

			let ethDutchAuctionDurationDivisor2_;

			// #endregion
			// #region

			{
				// #region

				let [ethDutchAuctionDuration_, /*ethDutchAuctionElapsedDuration_,*/] = await contracts_.cosmicSignatureGameProxy.getEthDutchAuctionDurations();

				{
					const roundActivationTime_ = await contracts_.cosmicSignatureGameProxy.roundActivationTime();
					const nextBlockTime_ = Number(roundActivationTime_) + Number(ethDutchAuctionDuration_) - 1;
					await hre.ethers.provider.send("evm_setNextBlockTimestamp", [nextBlockTime_,]);
					// await hre.ethers.provider.send("evm_mine");
				}

				await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).halveEthDutchAuctionEndingBidPrice())
					.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidOperationInCurrentState")
					.withArgs("Too early.");

				// #endregion
				// #region

				let ethDutchAuctionRemainingDuration2_ = 1n;

				// [Comment-202508153]
				// Similar magic numbers exist in multiple places.
				// [/Comment-202508153]
				let iteration2CounterMaxLimit_ = generateRandomUInt32() % 6;

				if (iteration2CounterMaxLimit_ <= 0) {
					// This is effectively unlimited.
					iteration2CounterMaxLimit_ = 999_999_999;
				}

				// #endregion
				// #region

				for ( let iteration2Counter_ = 1; ; ++ iteration2Counter_ ) {
					// #region

					// This is the same condition as the one near Comment-202508157.
					if (ethDutchAuctionRemainingDuration2_ > 0n) {

						// let latestBlock_ = await hre.ethers.provider.getBlock("latest");
						// console.info(`202508161 ${latestBlock_.timestamp}`);

						// [Comment-202508158]
						// The next call to this method will succeed, even if we do not sleep after this one.
						// [/Comment-202508158]
						await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).halveEthDutchAuctionEndingBidPrice())
							.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InvalidOperationInCurrentState")
							.withArgs("Too early.");

						// latestBlock_ = await hre.ethers.provider.getBlock("latest");
						// console.info(`202508162 ${latestBlock_.timestamp}`);
					} else {
						// console.info("202508163");
					}

					// #endregion
					// #region

					// Sleeping for an exponentially increasing duration, so that we could eventually end the test near Comment-202508144.
					const nextBlockTimeExtraIncrease_ = generateRandomUInt256() % (((24n + 2n) * 60n * 60n) << BigInt(iteration1Counter_)) - ((2n * 60n * 60n) << BigInt(iteration1Counter_));
					if (nextBlockTimeExtraIncrease_ > 0n) {
						if (nextBlockTimeExtraIncrease_ > 1n) {
							// console.info("202508204");
							await hre.ethers.provider.send("evm_increaseTime", [Number(nextBlockTimeExtraIncrease_),]);
						} else {
							// console.info("202508205");
						}
						await hre.ethers.provider.send("evm_mine");
					} else {
						// console.info("202508206");
					}

					// #endregion
					// #region

					const nextEthBidPrice1_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
					expect(nextEthBidPrice1_).greaterThan(0n);

					// #endregion
					// #region

					/** @type {Promise<hre.ethers.TransactionResponse>} */
					const transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).halveEthDutchAuctionEndingBidPrice();
					const transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);

					// #endregion
					// #region

					ethDutchAuctionDurationDivisor2_ = await contracts_.cosmicSignatureGameProxy.ethDutchAuctionDurationDivisor();
					expect(ethDutchAuctionDurationDivisor2_).greaterThan(0n);
					const [ethDutchAuctionDuration2_, ethDutchAuctionElapsedDuration2_,] = await contracts_.cosmicSignatureGameProxy.getEthDutchAuctionDurations();
					const ethDutchAuctionDurationIncrease_ = ethDutchAuctionDuration2_ - ethDutchAuctionDuration_;

					// Given that the assertions near Comment-202508135 are known to succeed, this one is also supposed to.
					expect(ethDutchAuctionDurationIncrease_).greaterThanOrEqual(0n);

					ethDutchAuctionRemainingDuration2_ = ethDutchAuctionDuration2_ - ethDutchAuctionElapsedDuration2_;
					const nextEthBidPrice2_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(0n);
					expect(nextEthBidPrice2_).greaterThan(0n);
					const nextEthBidPrice3_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
					expect(nextEthBidPrice3_).greaterThan(0n);
					const nextEthBidPrices21SimilarityScore_ =
						// Number(nextEthBidPrice2_ - nextEthBidPrice1_) * 2.0 / Number(nextEthBidPrice1_ + nextEthBidPrice2_);
						Number(nextEthBidPrice2_) / Number(nextEthBidPrice1_);
					expect(nextEthBidPrices21SimilarityScore_).lessThanOrEqual(1.0);
					const nextEthBidPrices32SimilarityScore_ =
						// Number(nextEthBidPrice3_ - nextEthBidPrice2_) * 2.0 / Number(nextEthBidPrice2_ + nextEthBidPrice3_);
						Number(nextEthBidPrice3_) / Number(nextEthBidPrice2_);
					expect(nextEthBidPrices32SimilarityScore_).lessThanOrEqual(1.0);
					// console.info(
					// 	`${iteration1Counter_} ` +
					// 	`${iteration2Counter_} ` +
					// 	`${nextBlockTimeExtraIncrease_} ` +
					// 	`${ethDutchAuctionDurationDivisor2_} ` +
					// 	`${ethDutchAuctionDurationIncrease_} ` +
					// 	`${ethDutchAuctionRemainingDuration2_} ` +
					// 	`${nextEthBidPrice1_} ` +
					// 	`${nextEthBidPrice2_} ` +
					// 	`${nextEthBidPrices21SimilarityScore_} ` +
					// 	// `${nextEthBidPrice3_} ` +
					// 	`${nextEthBidPrices32SimilarityScore_} `
					// );

					// #endregion
					// #region

					// If this condition is `true`, it makes no sense to double `ethDutchAuctionEndingBidPriceDivisor` again.
					if (nextEthBidPrice1_ <= 1n) {
						// console.info("202508145");
						totalIteration2Counter_ += iteration2Counter_;
						break;
					}

					if (iteration2Counter_ >= iteration2CounterMaxLimit_) {
						// console.info("202508146");
						totalIteration2Counter_ += iteration2Counter_;
						break;
					}

					// #endregion
					// #region

					// This condition is similar to the one near Comment-202508157.
					if (ethDutchAuctionRemainingDuration2_ > 1n) {

						// console.info("202508167");
						const transactionBlock_ = await transactionReceipt_.getBlock();

						// Creating the right conditions for the call near Comment-202508158.
						// That call can still happen even if we don't reach this point because the condition to make that call is looser.
						await hre.ethers.provider.send("evm_setNextBlockTimestamp", [transactionBlock_.timestamp + Number(ethDutchAuctionRemainingDuration2_),]);
						// await hre.ethers.provider.send("evm_mine");
					} else {
						// console.info("202508168");
					}

					ethDutchAuctionDuration_ = ethDutchAuctionDuration2_;

					// #endregion
				}

				// #endregion
			}

			// #endregion
			// #region

			{
				let configurationRestored_ = false;
				for (let roundCounter_ = generateRandomUInt32() % 40; ; ) {
					let nextEthBidPrice_;
					for (let bidCounter_ = generateRandomUInt32() % 5; ; ) {
						// console.info("202508169");
						const signer_ = contracts_.signers[generateRandomUInt32() % contracts_.signers.length];
						nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
						await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(signer_).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
						if (( -- bidCounter_ ) < 0) {
							// console.info("202508171");
							const mainPrizeTime_ = await contracts_.cosmicSignatureGameProxy.mainPrizeTime();
							await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(mainPrizeTime_),]);
							// await hre.ethers.provider.send("evm_mine");
							await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(signer_).claimMainPrize());
							break;
						}
					}
					if ( ! configurationRestored_ ) {
						// console.info("202508172");
						configurationRestored_ = true;

						// Comment-202508102 relates and/or applies.
						await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).setEthDutchAuctionDurationDivisor(ethDutchAuctionDurationDivisor_));
						await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).setEthDutchAuctionEndingBidPriceDivisor(ethDutchAuctionEndingBidPriceDivisor_));

						if ( // [Comment-202508144]
						     // According to Comment-202508142, this cannot be smaller.
						     // It takes like 10K years to reach this state.
						     // So it's time to end the test.
						     // [/Comment-202508144]
						     ethDutchAuctionDurationDivisor2_ <= 1n ||

						     // [Comment-202508155]
						     // Similar magic numbers exist in multiple places.
						     // [/Comment-202508155]
						     (SKIP_LONG_TESTS && iteration1Counter_ >= 2)
						) {
							// console.info("202508173");
							break;
						}
					} else {
						// console.info("202508174");
					}

					// Preventing exponential growth of ETH bid price.
					if (nextEthBidPrice_ >= 10n ** (18n - 1n)) {
						// console.info("202508159");
						break;
					}

					if (( -- roundCounter_ ) < 0) {
						// console.info("202508175");
						break;
					}
					const roundActivationTime_ = await contracts_.cosmicSignatureGameProxy.roundActivationTime();
					const nextBlockTime_ = Number(roundActivationTime_) + generateRandomUInt32() % (60 * 60);
					await hre.ethers.provider.send("evm_setNextBlockTimestamp", [Number(nextBlockTime_),]);
					// await hre.ethers.provider.send("evm_mine");
				}
			}

			// #endregion
			// #region

			// {
			// 	const latestBlock_ = await hre.ethers.provider.getBlock("latest");
			// 	let latestBlockTimeStampAsString_;
			// 	try {
			// 		// This will throw an error if the timestamp is too big.
			// 		latestBlockTimeStampAsString_ = (new Date(latestBlock_.timestamp * 1000)).toISOString();
			// 	} catch {
			// 		console.info("202508176");
			// 		latestBlockTimeStampAsString_ = latestBlock_.timestamp.toString();
			// 	}
			// 	console.info(`202508148 ${latestBlockTimeStampAsString_}`);
			// }
			if ( // Comment-202508144 applies.
			     ethDutchAuctionDurationDivisor2_ <= 1n ||

			     // Comment-202508155 applies.
			     (SKIP_LONG_TESTS && iteration1Counter_ >= 2)
			) {
				// console.info("202508149");

				// At this point, `totalIteration1Counter_` is zero, right?
				// So we could simply assign this here or event eliminate `totalIteration1Counter_` and use `iteration1Counter_` instead.
				// But it's OK.
				totalIteration1Counter_ += iteration1Counter_;

				break;
			}

			// #endregion
		}

		// #endregion
		// #region

		// console.info(`202508150 ${totalIteration1Counter_} ${totalIteration2Counter_}`);
		if ( ! SKIP_LONG_TESTS ) {
			// console.info("202508177");
			expect(totalIteration1Counter_).greaterThanOrEqual(10);

			// Comment-202508153 applies.
			expect(totalIteration2Counter_).greaterThanOrEqual(2 * totalIteration1Counter_);
		} else {
			// console.info("202508178");

			// Comment-202508155 applies.
			expect(totalIteration1Counter_).equal(2);
			expect(totalIteration2Counter_).greaterThanOrEqual(2);
		}

		// #endregion
	});

	it("Bidding-related durations", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		let randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: randomWalkNftMintPrice_,}));
		let randomWalkNftId_ = 0n;
		await makeNextBlockTimeDeterministic();
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		let nextEthPlusRandomWalkNftBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(randomWalkNftId_, "rwalk bid", {value: nextEthPlusRandomWalkNftBidPrice_,}));
		let [cstDutchAuctionDuration_, cstDutchAuctionElapsedDuration_] = await contracts_.cosmicSignatureGameProxy.getCstDutchAuctionDurations();

		// Making CST bid price almost zero.
		await hre.ethers.provider.send("evm_increaseTime", [Number(cstDutchAuctionDuration_ - cstDutchAuctionElapsedDuration_) - 2 - await makeNextBlockTimeDeterministic(),]);
		// await hre.ethers.provider.send("evm_mine");

		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithCst(0n, "cst bid")).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithCst(0n, "cst bid")).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithCst(0n, "cst bid"));
	});

	it("Bidding with ETH + Random Walk NFT", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		let randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[1]).mint({value: randomWalkNftMintPrice_,}));
		let randomWalkNftId_ = 0n;
		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(2n);
		let nextEthPlusRandomWalkNftBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(0, "hello", {value: nextEthPlusRandomWalkNftBidPrice_,})).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CallerIsNotNftOwner");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(0, "hello", {value: nextEthPlusRandomWalkNftBidPrice_,}));

		randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: randomWalkNftMintPrice_,}));
		++ randomWalkNftId_;
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(randomWalkNftId_, "", {value: 0n,})).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InsufficientReceivedBidAmount");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		nextEthPlusRandomWalkNftBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(randomWalkNftId_, "", {value: nextEthPlusRandomWalkNftBidPrice_,}));
		expect(await contracts_.cosmicSignatureGameProxy.usedRandomWalkNfts(randomWalkNftId_)).equal(1n);
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		nextEthPlusRandomWalkNftBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEth(randomWalkNftId_, "", {value: nextEthPlusRandomWalkNftBidPrice_,})).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "UsedRandomWalkNft");
	});

	it("Each bidder bids with ETH + Random Walk NFT", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		for ( let signerIndex_ = 0; signerIndex_ <= 9; ++ signerIndex_ ) {
			const randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
			await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[signerIndex_]).mint({value: randomWalkNftMintPrice_,}));
			const randomWalkNftId_ = BigInt(signerIndex_);
			const nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
			const nextEthPlusRandomWalkNftBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
			await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[signerIndex_]).bidWithEth(randomWalkNftId_, "bidWithRWalk", {value: nextEthPlusRandomWalkNftBidPrice_,}));
		}

		let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_),]);
		// await hre.ethers.provider.send("evm_mine");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[9]).claimMainPrize());
	});

	it("ETH bid refund", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		// Comment-202506033 applies.
		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerSigner);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
		await bidderContract_.waitForDeployment();
		const bidderContractAddress_ = await bidderContract_.getAddress();

		const ethAmountSent_ = 10n ** (18n - 2n);
		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[0]).doBidWithEth({value: ethAmountSent_,}));
		let bidderContractBalanceAmountAfter_ = await hre.ethers.provider.getBalance(bidderContractAddress_);
		let bidderContractExpectedBalanceAmountAfter_ = ethAmountSent_ - nextEthBidPrice_;
		expect(bidderContractBalanceAmountAfter_).equal(bidderContractExpectedBalanceAmountAfter_);
	});

	it("ETH + Random Walk NFT bid refund", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		// Comment-202506033 applies.
		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerSigner);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
		await bidderContract_.waitForDeployment();
		const bidderContractAddress_ = await bidderContract_.getAddress();

		// await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[0]).setApprovalForAll(contracts_.cosmicSignatureGameProxyAddress, true));
		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[0]).setApprovalForAll(bidderContractAddress_, true));

		let randomWalkNftMintPrice_ = await contracts_.randomWalkNft.getMintPrice();
		await waitForTransactionReceipt(contracts_.randomWalkNft.connect(contracts_.signers[0]).mint({value: randomWalkNftMintPrice_,}));
		let randomWalkNftId_ = 0n;
		const ethAmountSent_ = 10n ** (18n - 2n);
		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[0]).doBidWithEthPlusRandomWalkNft(randomWalkNftId_, {value: ethAmountSent_,}));
		let bidderContractBalanceAmountAfter_ = await hre.ethers.provider.getBalance(bidderContractAddress_);
		let discountedBidPrice_ = await contracts_.cosmicSignatureGameProxy.getEthPlusRandomWalkNftBidPrice(nextEthBidPrice_);
		expect(discountedBidPrice_).equal((nextEthBidPrice_ + 1n) / 2n);
		let bidderContractExpectedBalanceAmountAfter_ = ethAmountSent_ - discountedBidPrice_;
		expect(bidderContractBalanceAmountAfter_).equal(bidderContractExpectedBalanceAmountAfter_);
	});

	it("ETH refund receive by bidder reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const bidderContractFactory_ = await hre.ethers.getContractFactory("BidderContract", contracts_.deployerSigner);
		const bidderContract_ = await bidderContractFactory_.deploy(contracts_.cosmicSignatureGameProxyAddress);
		await bidderContract_.waitForDeployment();
		const bidderContractAddress_ = await bidderContract_.getAddress();

		const ethBidAmount_ = 10n ** 18n;

		// When `rounfNum == 0`, this doesn't depend on time.
		// Otherwise this test would probably fail.
		const requiredEthBidAmount_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);

		const ethRefundAmount_ = ethBidAmount_ - requiredEthBidAmount_;
		expect(ethRefundAmount_).greaterThan(0n);
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[1]).setEthDepositAcceptanceModeCode(2n));
		await expect(bidderContract_.connect(contracts_.signers[1]).doBidWithEth({value: ethBidAmount_,}))
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
			.withArgs("ETH refund transfer failed.", bidderContractAddress_, ethRefundAmount_);
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[1]).setEthDepositAcceptanceModeCode(1n));
		await expect(bidderContract_.connect(contracts_.signers[1]).doBidWithEth({value: ethBidAmount_,}))
			.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "FundTransferFailed")
			.withArgs("ETH refund transfer failed.", bidderContractAddress_, ethRefundAmount_);
		await waitForTransactionReceipt(bidderContract_.connect(contracts_.signers[1]).setEthDepositAcceptanceModeCode(0n));
		await expect(bidderContract_.connect(contracts_.signers[1]).doBidWithEth({value: ethBidAmount_,}))
			.emit(contracts_.cosmicSignatureGameProxy, "BidPlaced");
		const bidderContractEthBalanceAmountAfterTransaction_ = await hre.ethers.provider.getBalance(bidderContractAddress_);
		expect(bidderContractEthBalanceAmountAfterTransaction_).equal(ethRefundAmount_);
	});

	it("Bidding with CST", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);

		const cosmicSignatureGameProxyBidPlacedTopicHash_ = contracts_.cosmicSignatureGameProxy.interface.getEvent("BidPlaced").topicHash;
		const delayDurationBeforeRoundActivation_ = await contracts_.cosmicSignatureGameProxy.delayDurationBeforeRoundActivation();

		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[2]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[3]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		// console.info();
		// latestTimeStamp = 0;
		// await logLatestBlock("202506230");
		await makeNextBlockTimeDeterministic();
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		// await logLatestBlock("202506233");
		let durationUntilMainPrize_ = await contracts_.cosmicSignatureGameProxy.getDurationUntilMainPrizeRaw();
		await hre.ethers.provider.send("evm_increaseTime", [Number(durationUntilMainPrize_) - await makeNextBlockTimeDeterministic(300),]);
		// await hre.ethers.provider.send("evm_mine");
		// await logLatestBlock("202506235");
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).claimMainPrize());
		// await logLatestBlock("202506237");

		await hre.ethers.provider.send("evm_increaseTime", [Number(delayDurationBeforeRoundActivation_) - 1 - await makeNextBlockTimeDeterministic(),]);
		// await logLatestBlock("202506239");
		await hre.ethers.provider.send("evm_mine");
		// await logLatestBlock("202506240");
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		// await logLatestBlock("202506241");

		// Reducing CST bid price.
		await hre.ethers.provider.send("evm_increaseTime", [20000 - await makeNextBlockTimeDeterministic(),]);
		await hre.ethers.provider.send("evm_mine");

		// await logLatestBlock("202506242");
		let nextRoundFirstCstDutchAuctionBeginningBidPrice_ = await contracts_.cosmicSignatureGameProxy.nextRoundFirstCstDutchAuctionBeginningBidPrice();
		expect(nextRoundFirstCstDutchAuctionBeginningBidPrice_).equal(200n * 10n ** 18n);
		let cstDutchAuctionBeginningTimeStamp_ = await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningTimeStamp();
		expect(cstDutchAuctionBeginningTimeStamp_).equal(await contracts_.cosmicSignatureGameProxy.roundActivationTime());
		let [cstDutchAuctionDuration_, cstDutchAuctionElapsedDuration_,] = await contracts_.cosmicSignatureGameProxy.getCstDutchAuctionDurations();
		// await logLatestBlock("202506243");
		expect(cstDutchAuctionElapsedDuration_).equal(20000n);
		++ cstDutchAuctionElapsedDuration_;
		let cstDutchAuctionRemainingDuration_ = cstDutchAuctionDuration_ - cstDutchAuctionElapsedDuration_;
		let nextCstBidExpectedPrice_ = nextRoundFirstCstDutchAuctionBeginningBidPrice_ * cstDutchAuctionRemainingDuration_ / cstDutchAuctionDuration_;
		let nextCstBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextCstBidPrice(1n);
		expect(nextCstBidPrice_).equal(nextCstBidExpectedPrice_);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithCst(nextCstBidPrice_, "cst bid"));
		let cstDutchAuctionBeginningBidPrice_ = await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningBidPrice();
		expect(cstDutchAuctionBeginningBidPrice_).equal(nextCstBidPrice_ * 2n);

		cstDutchAuctionRemainingDuration_ = cstDutchAuctionDuration_ - 1n;
		nextCstBidExpectedPrice_ = cstDutchAuctionBeginningBidPrice_ * cstDutchAuctionRemainingDuration_ / cstDutchAuctionDuration_;
		/** @type {Promise<hre.ethers.TransactionResponse>} */
		let transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithCst(nextCstBidExpectedPrice_ * 10n, "cst bid");
		let transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
		let log_ = transactionReceipt_.logs.find((log_) => (log_.topics.indexOf(cosmicSignatureGameProxyBidPlacedTopicHash_) >= 0));
		let parsedLog_ = contracts_.cosmicSignatureGameProxy.interface.parseLog(log_);
		expect(parsedLog_.args.lastBidderAddress).equal(contracts_.signers[1].address);
		expect(parsedLog_.args.paidEthPrice).equal(-1n);
		expect(parsedLog_.args.paidCstPrice).equal(nextCstBidExpectedPrice_);
		expect(parsedLog_.args.randomWalkNftId).equal(-1n);
		expect(parsedLog_.args.message).equal("cst bid");
		cstDutchAuctionBeginningBidPrice_ = await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningBidPrice();
		expect(cstDutchAuctionBeginningBidPrice_).equal(nextCstBidExpectedPrice_ * 2n);
	});

	it("Cosmic Signature Token first mint reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const brokenCosmicSignatureTokenFactory_ = await hre.ethers.getContractFactory("BrokenCosmicSignatureToken", contracts_.deployerSigner);
		const brokenCosmicSignatureToken_ = await brokenCosmicSignatureTokenFactory_.deploy(0n);
		await brokenCosmicSignatureToken_.waitForDeployment();
		const brokenCosmicSignatureTokenAddress_ = await brokenCosmicSignatureToken_.getAddress();

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).setCosmicSignatureToken(brokenCosmicSignatureTokenAddress_));
		await setRoundActivationTimeIfNeeded(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner), 2n);

		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).revertedWith("Test mint failed.");
	});

	it("Cosmic Signature Token second mint reversal", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(-1_000_000_000n);

		const numTokenMintsPerBid_ = 1n;
		const brokenCosmicSignatureTokenFactory_ = await hre.ethers.getContractFactory("BrokenCosmicSignatureToken", contracts_.deployerSigner);
		const brokenCosmicSignatureToken_ = await brokenCosmicSignatureTokenFactory_.deploy(numTokenMintsPerBid_);
		await brokenCosmicSignatureToken_.waitForDeployment();
		const brokenCosmicSignatureTokenAddress_ = await brokenCosmicSignatureToken_.getAddress();

		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).setCosmicSignatureToken(brokenCosmicSignatureTokenAddress_));
		await setRoundActivationTimeIfNeeded(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner), 2n);

		let nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await waitForTransactionReceipt(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,}));
		nextEthBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextEthBidPrice(1n);
		await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[1]).bidWithEth(-1n, "", {value: nextEthBidPrice_,})).revertedWith("Test mint failed.");
	});

	// [Comment-202507055]
	// Similar tests exist in multiple places.
	// [/Comment-202507055]
	// [Comment-202507057/]
	it("Reentries by donated ERC-20 and ERC-721 token contracts", async function () {
		const contracts_ = await loadFixtureDeployContractsForTesting(2n);
	
		const maliciousTokenFactory_ = await hre.ethers.getContractFactory("MaliciousToken", contracts_.deployerSigner);
		const maliciousToken_ = await maliciousTokenFactory_.deploy(hre.ethers.ZeroAddress, contracts_.cosmicSignatureGameProxyAddress);
		await maliciousToken_.waitForDeployment();
		const maliciousTokenAddress_ = await maliciousToken_.getAddress();

		const ethPriceToPayMaxLimit_ = 10n ** (18n - 2n);
		const ethDonationAmount_ = ethPriceToPayMaxLimit_ * 1_000n;
		let ethBidPlaced_ = false;

		const ensureSignerCstBalanceIsSufficientToPlaceCstBid_ = async () => {
			let nextCstBidPrice_;
			for (;;) {
				nextCstBidPrice_ = await contracts_.cosmicSignatureGameProxy.getNextCstBidPrice(1n);
				if (await contracts_.cosmicSignatureToken.balanceOf(contracts_.signers[0].address) >= nextCstBidPrice_) {
					// console.info("202507052", hre.ethers.formatEther(nextCstBidPrice_));
					break;
				}
				// console.info("202507046");

				// Reducing next CST bid price.
				await hre.ethers.provider.send("evm_increaseTime", [60 * 60]);
				// await hre.ethers.provider.send("evm_mine");

				// Placing an ETH bid to get some CST.
				await waitForTransactionReceipt(contracts_.signers[0].sendTransaction({to: contracts_.cosmicSignatureGameProxyAddress, value: ethPriceToPayMaxLimit_,}));
			}
			return nextCstBidPrice_;
		};

		await waitForTransactionReceipt(contracts_.signers[0].sendTransaction({to: maliciousTokenAddress_, value: ethDonationAmount_,}));

		for ( let counter_ = 0; counter_ < 200; ++ counter_ ) {
			let randomNumber_ = generateRandomUInt32();

			// Comment-202507062 applies.
			const maliciousTokenModeCode_ = BigInt(randomNumber_ % (10 * 2) + 1);

			// console.info(`202507155 ${maliciousTokenModeCode_}`);
			await waitForTransactionReceipt(maliciousToken_.connect(contracts_.signers[0]).setModeCode(maliciousTokenModeCode_));
			/** @type {Promise<hre.ethers.TransactionResponse>} */
			let transactionResponsePromise_;
			randomNumber_ = generateRandomUInt32();
			const choiceCode_ = randomNumber_ % (( ! ethBidPlaced_ ) ? 2 : 4);
			switch (choiceCode_) {
				case 0: {
					// console.info("202507047");
					transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEthAndDonateToken(-1n, "", maliciousTokenAddress_, 1n, {value: ethPriceToPayMaxLimit_,});
					break;
				}
				case 1: {
					// console.info("202507048");
					transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithEthAndDonateNft(-1n, "", maliciousTokenAddress_, 0n, {value: ethPriceToPayMaxLimit_,})
					break;
				}
				case 2: {
					// console.info("202507049");
					const nextCstBidPrice_ = await ensureSignerCstBalanceIsSufficientToPlaceCstBid_();
					transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithCstAndDonateToken(nextCstBidPrice_, "", maliciousTokenAddress_, 1n)
					break;
				}
				default: {
					// console.info("202507050");
					const nextCstBidPrice_ = await ensureSignerCstBalanceIsSufficientToPlaceCstBid_();
					transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.signers[0]).bidWithCstAndDonateNft(nextCstBidPrice_, "", maliciousTokenAddress_, 0n);
					break;
				}
			}

			// Comment-202507062 applies.
			if (maliciousTokenModeCode_ <= 10n) {

				// console.info("202507044");
				await expect(transactionResponsePromise_).revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "ReentrancyGuardReentrantCall");
			} else {
				// console.info("202507045");
				await waitForTransactionReceipt(transactionResponsePromise_);
				if (choiceCode_ <= 1) {
					// console.info("202507051");
					ethBidPlaced_ = true;
				}
			}
		}
	});
});
