// #region

"use strict";

// #endregion
// #region

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256, generateRandomUInt256FromSeedWrapper, uint256ToPaddedHexString, waitForTransactionReceipt } = require("../../src/Helpers.js");
const { createFairRandomNumberGenerator } = require("../../src/FairRandomNumberGenerator.js");
const { SKIP_LONG_TESTS, loadFixtureDeployContractsForTesting, tryWaitForTransactionReceipt } = require("../../src/ContractTestingHelpers.js");
const { createCosmicSignatureTokenSimulator, assertCosmicSignatureTokenSimulator } = require("../src/contract-simulators/CosmicSignatureTokenSimulator.js");
const { createRandomWalkNftSimulator, assertRandomWalkNftSimulator } = require("../src/contract-simulators/RandomWalkNftSimulator.js");
const { createCosmicSignatureNftSimulator, assertCosmicSignatureNftSimulator } = require("../src/contract-simulators/CosmicSignatureNftSimulator.js");
const { createPrizesWalletSimulator, assertPrizesWalletSimulator } = require("../src/contract-simulators/PrizesWalletSimulator.js");
const { createStakingWalletRandomWalkNftSimulator, assertStakingWalletRandomWalkNftSimulator } = require("../src/contract-simulators/StakingWalletRandomWalkNftSimulator.js");
const { createStakingWalletCosmicSignatureNftSimulator, assertStakingWalletCosmicSignatureNftSimulator } = require("../src/contract-simulators/StakingWalletCosmicSignatureNftSimulator.js");
// const { createMarketingWalletSimulator, assertMarketingWalletSimulator } = require("../src/contract-simulators/MarketingWalletSimulator.js");
const { createCharityWalletSimulator, assertCharityWalletSimulator } = require("../src/contract-simulators/CharityWalletSimulator.js");
// const { createCosmicSignatureDaoSimulator, assertCosmicSignatureDaoSimulator } = require("../src/contract-simulators/CosmicSignatureDaoSimulator.js");
const {
	createCosmicSignatureGameProxySimulator,
	assertCosmicSignatureGameProxySimulator,
	assertCosmicSignatureGameProxySimulatorGetBidderTotalSpentAmounts,
	assertCosmicSignatureGameProxySimulatorTryGetCurrentChampions,
	assertCosmicSignatureGameProxySimulatorGetEthDutchAuctionDurations,
	assertCosmicSignatureGameProxySimulatorGetCstDutchAuctionDurations,
} =
	require("../src/contract-simulators/CosmicSignatureGameProxySimulator.js");

// #endregion
// #region `describe`

describe("CosmicSignatureGame-1", function () {
	// #region

	it("Integration test over multiple bidding rounds", async function () {
		// #region

		if (SKIP_LONG_TESTS) {
			console.warn("Warning 202505015. Skipping a long test.");
			// return;
		}

		// #endregion
		// #region

		// Comment-202506082 applies.
		// The bigger this value the higher is the chance that the logic near Comment-202505117 will reduce ETH bid price to 1 Wei.
		const numRoundsToRunMinLimit_ = ( ! SKIP_LONG_TESTS ) ? 25 : 1;

		const bidAverageCountPerRoundMinLimit_ = ( ! SKIP_LONG_TESTS ) ? 10.0 : 2.0;

		// #endregion
		// #region

		const randomNumberSeed_ = generateRandomUInt256();
		// console.info(uint256ToPaddedHexString(randomNumberSeed_));

		// #endregion
		// #region

		try {
			// #region

			const randomNumberSeedWrapper_ = {value: randomNumberSeed_,};
			const fairRandomNumberGenerator1N_ = 7;
			const fairRandomNumberGenerator1K_ = 3;
			const fairRandomNumberGenerator1_ = createFairRandomNumberGenerator(fairRandomNumberGenerator1N_, fairRandomNumberGenerator1K_, randomNumberSeedWrapper_);
			/** @type {bigint} */
			let randomNumber_;

			// #endregion
			// #region

			randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
			const roundActivationTimeOffset_ = randomNumber_ % 4096n - 1024n;
			const contracts_ = await loadFixtureDeployContractsForTesting(roundActivationTimeOffset_);
			// const blockchainPropertyGetterFactory_ = await hre.ethers.getContractFactory("BlockchainPropertyGetter", contracts_.deployerSigner);
			// const blockchainPropertyGetter_ = await blockchainPropertyGetterFactory_.deploy();
			// await blockchainPropertyGetter_.waitForDeployment();
			// // const blockchainPropertyGetterAddress_ = await blockchainPropertyGetter_.getAddress();

			// #endregion
			// #region

			{
				// const timeStamp1_ = performance.now();
				for (const signer5_ of contracts_.signers) {
					// This test sometimes requires more ETH than signers have by default.
					{
						const signer5BalanceAmount_ = await hre.ethers.provider.getBalance(signer5_.address);
						await hre.ethers.provider.send("hardhat_setBalance", [signer5_.address, "0x" + (signer5BalanceAmount_ << 2n).toString(16),]);
					}

					{
						const randomWalkNftForSigner5_ = contracts_.randomWalkNft.connect(signer5_);
						await waitForTransactionReceipt(randomWalkNftForSigner5_.setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddress, true));
					}
					{
						const cosmicSignatureNftForSigner5_ = contracts_.cosmicSignatureNft.connect(signer5_);
						await waitForTransactionReceipt(cosmicSignatureNftForSigner5_.setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddress, true));
					}
				}
				// const timeStamp2_ = performance.now();
				// console.info((timeStamp2_ - timeStamp1_).toFixed(1));
			}
			
			// #endregion
			// #region

			const cosmicSignatureTokenSimulator_ = /*await*/ createCosmicSignatureTokenSimulator();
			const randomWalkNftSimulator_ = /*await*/ createRandomWalkNftSimulator();
			const cosmicSignatureNftSimulator_ = /*await*/ createCosmicSignatureNftSimulator();
			const prizesWalletSimulator_ = /*await*/ createPrizesWalletSimulator();
			const stakingWalletRandomWalkNftSimulator_ = /*await*/ createStakingWalletRandomWalkNftSimulator(randomWalkNftSimulator_);
			const stakingWalletCosmicSignatureNftSimulator_ = /*await*/ createStakingWalletCosmicSignatureNftSimulator(cosmicSignatureNftSimulator_);
			const charityWalletSimulator_ = /*await*/ createCharityWalletSimulator();
			const cosmicSignatureGameProxySimulator_ =
				await createCosmicSignatureGameProxySimulator(
					contracts_,
					cosmicSignatureTokenSimulator_,
					randomWalkNftSimulator_,
					cosmicSignatureNftSimulator_,
					prizesWalletSimulator_,
					stakingWalletRandomWalkNftSimulator_,
					stakingWalletCosmicSignatureNftSimulator_,
					charityWalletSimulator_
				);

			// #endregion
			// #region `assertContractSimulators_`

			const assertContractSimulators_ = async () => {
				await assertCosmicSignatureTokenSimulator(cosmicSignatureTokenSimulator_, contracts_, randomNumberSeedWrapper_);
				await assertRandomWalkNftSimulator(randomWalkNftSimulator_, contracts_, randomNumberSeedWrapper_);
				await assertCosmicSignatureNftSimulator(cosmicSignatureNftSimulator_, contracts_, randomNumberSeedWrapper_);
				await assertPrizesWalletSimulator(prizesWalletSimulator_, contracts_, randomNumberSeedWrapper_, cosmicSignatureGameProxySimulator_.roundNum);
				await assertStakingWalletRandomWalkNftSimulator(stakingWalletRandomWalkNftSimulator_, contracts_, randomNumberSeedWrapper_);
				await assertStakingWalletCosmicSignatureNftSimulator(stakingWalletCosmicSignatureNftSimulator_, contracts_, randomNumberSeedWrapper_);
				await assertCharityWalletSimulator(charityWalletSimulator_, contracts_);
				await assertCosmicSignatureGameProxySimulator(cosmicSignatureGameProxySimulator_, contracts_, randomNumberSeedWrapper_);
			};

			// #endregion
			// #region

			await assertContractSimulators_();

			// #endregion
			// #region

			// Remember to re-query this after every block mining.
			let latestBlock_ = await hre.ethers.provider.getBlock("latest");

			// This is not `bigint`.
			let totalNumBids_ = 0;

			// #endregion
			// #region

			for(;;) {
				// #region

				const fairRandomNumber1_ = fairRandomNumberGenerator1_.getNext();
				let signerIndex_ = -1;
				if (fairRandomNumber1_ == 6 && cosmicSignatureGameProxySimulator_.getTotalNumBids() > 0n) {
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					if ((randomNumber_ & 0xFn) != 0n) {
						signerIndex_ = contracts_.signerAddressToIndexMapping[cosmicSignatureGameProxySimulator_.lastBidderAddress];
					}
				}
				if (signerIndex_ < 0) {
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					signerIndex_ = Number(randomNumber_ % BigInt(contracts_.signers.length));
				}
				const signer_ = contracts_.signers[signerIndex_];
				const randomWalkNftForSigner_ = contracts_.randomWalkNft.connect(signer_);
				const stakingWalletRandomWalkNftForSigner_ = contracts_.stakingWalletRandomWalkNft.connect(signer_);
				const stakingWalletCosmicSignatureNftForSigner_ = contracts_.stakingWalletCosmicSignatureNft.connect(signer_);
				const cosmicSignatureGameProxyForSigner_ = contracts_.cosmicSignatureGameProxy.connect(signer_);
				let randomWalkNftId_ = -1n;
				let cosmicSignatureNftId_ = -1n;
				let bidMessageLength_;

				// [Comment-202505061]
				// We also use this for ETH donation with info.
				// [/Comment-202505061]
				let bidMessage_;

				// [Comment-202505051]
				// This will stay `undefined` if we do not attempt a transaction.
				// [/Comment-202505051]
				// [Comment-202505141]
				// This is valid even if the transaction failed.
				// [/Comment-202505141]
				let blockBeforeTransaction_;

				// Comment-202505051 applies.
				// Comment-202505141 applies.
				/** @type {import("hardhat").ethers.Block} */
				let transactionBlock_;

				// Comment-202505051 applies.
				// A value other than `undefined` indicates that the transaction succeeded.
				/** @type {import("hardhat").ethers.TransactionReceipt} */
				let transactionReceipt_;

				const eventIndexWrapper_ = {value: 0,};
				let tryBreakLoop_ = false;

				// #endregion
				// #region `tryFindUnusedRandomWalkNft_`

				/**
				[Comment-202504222]
				Makes a reasonble effort to find an unused NFT that belongs to `signer_`.
				[/Comment-202504222]
				@param isForStaking_ `true` for staking; `false` for bidding.
				*/
				const tryFindUnusedRandomWalkNft_ = (isForStaking_) => {
					// If this is zero `randomWalkNftId_` will stay `-1n`.
					const randomWalkNftTotalSupply_ = randomWalkNftSimulator_.totalSupply();

					for (let counter_ = Math.min(contracts_.signers.length, Number(randomWalkNftTotalSupply_)); ( -- counter_ ) >= 0; ) {
						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);

						// [Comment-202504224]
						// This NFT ID is guaranteed to be valid.
						// Issue. This test does not test an invalid NFT ID. In that case `ERC721.ownerOf`, which our contract calls,
						// would revert with a different error.
						// Would it make sense to develop a separate test for that? Unnecessary. The transaction would just revert.
						// [/Comment-202504224]
						randomWalkNftId_ = randomNumber_ % randomWalkNftTotalSupply_;

						const nftWasUsed_ =
							isForStaking_ ?
							stakingWalletRandomWalkNftSimulator_.wasNftUsed(randomWalkNftId_) :
							cosmicSignatureGameProxySimulator_.wasRandomWalkNftUsed(randomWalkNftId_);
						if (( ! nftWasUsed_ ) && randomWalkNftSimulator_.ownerOf(randomWalkNftId_) == signer_.address) {
							return true;
						}
					}
					return false;
				};

				// #endregion
				// #region `tryFindUnusedCosmicSignatureNft_`

				/** Comment-202504222 applies. */
				const tryFindUnusedCosmicSignatureNft_ = () => {
					/** If this is zero `cosmicSignatureNftId_` will stay `-1n`. */
					const cosmicSignatureNftTotalSupply_ = cosmicSignatureNftSimulator_.totalSupply()

					for (let counter_ = Math.min(contracts_.signers.length, Number(cosmicSignatureNftTotalSupply_)); ( -- counter_ ) >= 0; ) {
						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);

						// Comment-202504224 applies.
						cosmicSignatureNftId_ = randomNumber_ % cosmicSignatureNftTotalSupply_;

						if ( ( ! stakingWalletCosmicSignatureNftSimulator_.wasNftUsed(cosmicSignatureNftId_) ) &&
								cosmicSignatureNftSimulator_.ownerOf(cosmicSignatureNftId_) == signer_.address
						) {
							return true;
						}
					}
					return false;
				};

				// #endregion
				// #region `generateBidMessage_`

				// Comment-202505061 applies.
				const generateBidMessage_ = () => {
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					bidMessageLength_ =
						((randomNumber_ & (0x3n << (256n - 4n))) == 0n) ?
						0n :
						(randomNumber_ >> 4n) % (cosmicSignatureGameProxySimulator_.bidMessageLengthMaxLimit * 17n / 16n + 1n);
					bidMessage_ = "x".repeat(Number(bidMessageLength_));
				};

				// #endregion
				// #region `advanceNextBlockTime_`

				/**
				Issue. This logic is a bit of a hack, not precise science.
				Its goal is that the logic near Comment-202504043 allowed us to break the loop
				and the behavior was generally close to what will be happening in the production.
				*/
				const advanceNextBlockTime_ = async () => {
					// Increasing block time increase as the number of bids in the current bidding round increases.
					// Doing so ensures that block time will eventually reach main prize time.
					let timeIncrementMaxLimit_ =
						(cosmicSignatureGameProxySimulator_.mainPrizeTimeIncrementInMicroSeconds + (20n * 60n) * cosmicSignatureGameProxySimulator_.getTotalNumBids()) / 2_000_000n;

					// This logic increases the chance that:
					// 1. The first bidder or a non-last bidder claims main prize.
					// 2. The logic near Comment-202505117 causes ETH bid price to eventually become very small, down to 1 Wei.
					//    Comment-202503162 relates.
					{
						const totalNumBidsCopy_ = cosmicSignatureGameProxySimulator_.getTotalNumBids();
						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
						if ((randomNumber_ & ((totalNumBidsCopy_ == 1n || (fairRandomNumber1_ == 6 && totalNumBidsCopy_ > 0n && signer_.address != cosmicSignatureGameProxySimulator_.lastBidderAddress)) ? 0x7n : 0x1Fn)) == 0n) {
							timeIncrementMaxLimit_ <<= 10n;
						}
					}

					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					let timeIncrement_ = Number(randomNumber_ % timeIncrementMaxLimit_);
					if (timeIncrement_ > 0) {
						if (timeIncrement_ > 1) {
							// await hre.ethers.provider.send("evm_increaseTime", [timeIncrement_,]);
							await hre.ethers.provider.send("evm_setNextBlockTimestamp", [latestBlock_.timestamp + timeIncrement_,]);
						}
						await hre.ethers.provider.send("evm_mine");
						latestBlock_ = await hre.ethers.provider.getBlock("latest");
					}
				};

				// #endregion
				// #region

				switch (fairRandomNumber1_) {
					// #region Minting A Random Walk NFT

					case 0: {
						// console.info("202505106");
						blockBeforeTransaction_ = latestBlock_;

						// It would be nice to implement this method in `createRandomWalkNftSimulator`, but keeping it simple.
						const randomWalkNftMintPrice_ = await randomWalkNftForSigner_.getMintPrice();

						/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
						const transactionResponsePromise_ = randomWalkNftForSigner_.mint({value: randomWalkNftMintPrice_,});
						// const transactionResponse_ = await transactionResponsePromise_;
						transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
						// console.info("202506257", String(transactionResponse_.timestamp));
						latestBlock_ = await transactionReceipt_.getBlock();
						transactionBlock_ = latestBlock_;
						randomWalkNftId_ = randomWalkNftSimulator_.mint(signer_.address, contracts_, transactionReceipt_, eventIndexWrapper_);
						// console.info("Minted RW NFT " + randomWalkNftId_.toString() + ".");
						break;
					}

					// #endregion
					// #region Trying To Find And If Found Staking A Random Walk NFT

					case 1: {
						const found_ = tryFindUnusedRandomWalkNft_(true);
						if (found_) {
							// console.info("202505107 Staking RW NFT " + randomWalkNftId_.toString() + ".");
							blockBeforeTransaction_ = latestBlock_;
							/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
							const transactionResponsePromise_ = stakingWalletRandomWalkNftForSigner_.stake(randomWalkNftId_);
							transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
							latestBlock_ = await transactionReceipt_.getBlock();
							transactionBlock_ = latestBlock_;
							stakingWalletRandomWalkNftSimulator_.stake(signer_.address, randomWalkNftId_, contracts_, transactionReceipt_, eventIndexWrapper_);
						} else {
							// console.info("202505143 Cannot find an RW NFT to stake.");
						}
						break;
					}

					// #endregion
					// #region Trying To Find And If Found Staking A Cosmic Signature NFT

					case 2: {
						const found_ = tryFindUnusedCosmicSignatureNft_();
						if (found_) {
							// console.info("202505108 Staking CS NFT " + cosmicSignatureNftId_.toString() + ".");
							blockBeforeTransaction_ = latestBlock_;
							/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
							const transactionResponsePromise_ = stakingWalletCosmicSignatureNftForSigner_.stake(cosmicSignatureNftId_);
							transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
							latestBlock_ = await transactionReceipt_.getBlock();
							transactionBlock_ = latestBlock_;
							stakingWalletCosmicSignatureNftSimulator_.stake(signer_.address, cosmicSignatureNftId_, contracts_, transactionReceipt_, eventIndexWrapper_);
						} else {
							// console.info("202505144 Cannot find a CS NFT to stake.");
						}
						break;
					}

					// #endregion
					// #region Calling `CosmicSignatureGame.donateEth` or `CosmicSignatureGame.donateEthWithInfo`

					case 3: {
						// console.info("202505109");
						blockBeforeTransaction_ = latestBlock_;
						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
						const ethDonationAmount_ = BigInt(Math.max(Number(BigInt.asUintN(53, randomNumber_)) - Number(1n << (53n - 4n)), 0));
						if ((randomNumber_ & (1n << 128n)) == 0n) {
							// console.info("202506038 Donating " + hre.ethers.formatEther(ethDonationAmount_) + " ETH.");
							/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
							const transactionResponsePromise_ = cosmicSignatureGameProxyForSigner_.donateEth({value: ethDonationAmount_,});
							transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
							cosmicSignatureGameProxySimulator_.donateEth(signer_.address, ethDonationAmount_, contracts_, transactionReceipt_, eventIndexWrapper_);
						} else {
							// console.info("202506039 Donating " + hre.ethers.formatEther(ethDonationAmount_) + " ETH with info.");

							// Comment-202505061 applies.
							generateBidMessage_();

							/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
							const transactionResponsePromise_ = cosmicSignatureGameProxyForSigner_.donateEthWithInfo(bidMessage_, {value: ethDonationAmount_,});
							transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
							cosmicSignatureGameProxySimulator_.donateEthWithInfo(signer_.address, ethDonationAmount_, bidMessage_, contracts_, transactionReceipt_, eventIndexWrapper_);
						}
						latestBlock_ = await transactionReceipt_.getBlock();
						transactionBlock_ = latestBlock_;
						break;
					}

					// #endregion
					// #region Calling `CosmicSignatureGame.bidWithEth`

					case 4: {
						// #region

						await advanceNextBlockTime_();
						if (tryFindUnusedRandomWalkNft_(false)) {
							// console.info("Found an RW NFT for bidding: " + randomWalkNftId_.toString() + ".");
						} else if (randomWalkNftId_ >= 0n) {
							// console.info("Cannot find an RW NFT for bidding.");
							randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);

							// Even if no appropriate NFT was found, we want in most cases the bid transaction to succeed.
							if ((randomNumber_ & 0xFn) != 0n) {
								randomWalkNftId_ = ((randomNumber_ & 0x30n) != 0n) ? ( ~ randomWalkNftId_ ) : (-1n);
							}
						} else {
							// console.info("There are no RW NFTs yet.");
						}
						generateBidMessage_();
						blockBeforeTransaction_ = latestBlock_;

						// Comment-202503162 applies.
						const ethBidPrice_ = cosmicSignatureGameProxySimulator_.getNextEthBidPriceAdvanced(blockBeforeTransaction_, 1n);
						const paidEthPrice_ =
							(randomWalkNftId_ < 0n) ?
							ethBidPrice_ :
							cosmicSignatureGameProxySimulator_.getEthPlusRandomWalkNftBidPrice(ethBidPrice_);

						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
						const ethPriceToPayMaxLimit_ = randomNumber_ % (paidEthPrice_ * 16n);
						let sendEth_ = false;
						if (randomWalkNftId_ == -1n && bidMessageLength_ <= 0n) {
							randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
							if ((randomNumber_ & 3n) != 0n) {
								// console.info("202505159");
								sendEth_ = true;
							} else {
								// console.info("202505161");
							}
						} else {
							// console.info("202505162");
						}
						const signerEthBalanceAmountBeforeTransaction_ = await hre.ethers.provider.getBalance(signer_.address);
						// console.info("202507209", hre.ethers.formatEther(signerEthBalanceAmountBeforeTransaction_), hre.ethers.formatEther(ethPriceToPayMaxLimit_));
						/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
						const transactionResponsePromise_ =
							sendEth_ ?
							signer_.sendTransaction({to: contracts_.cosmicSignatureGameProxyAddress, value: ethPriceToPayMaxLimit_,}) :
							cosmicSignatureGameProxyForSigner_.bidWithEth(randomWalkNftId_, bidMessage_, {value: ethPriceToPayMaxLimit_,});
						transactionReceipt_ = await tryWaitForTransactionReceipt(transactionResponsePromise_);
						latestBlock_ = await hre.ethers.provider.getBlock("latest");
						transactionBlock_ = latestBlock_;

						// #endregion
						// #region

						const transactionShouldHaveSucceeded_ =
							await cosmicSignatureGameProxySimulator_.canBidWithEth(
								transactionBlock_,
								signer_.address,
								ethPriceToPayMaxLimit_,
								randomWalkNftId_,
								bidMessage_,
								paidEthPrice_,
								contracts_,
								transactionResponsePromise_
							);
						expect(transactionShouldHaveSucceeded_).equal(transactionReceipt_ != undefined);
						if (transactionShouldHaveSucceeded_) {
							// console.info("202505111", signerIndex_.toString());
							await cosmicSignatureGameProxySimulator_.bidWithEth(
								transactionBlock_,
								signer_.address,
								signerEthBalanceAmountBeforeTransaction_,
								ethPriceToPayMaxLimit_,
								randomWalkNftId_,
								bidMessage_,
								ethBidPrice_,
								paidEthPrice_,
								contracts_,
								transactionReceipt_,
								eventIndexWrapper_
							);
						}

						// #endregion
						// #region

						break;

						// #endregion
					}

					// #endregion
					// #region Calling `CosmicSignatureGame.bidWithCst`

					case 5: {
						// #region

						await advanceNextBlockTime_();
						generateBidMessage_();
						blockBeforeTransaction_ = latestBlock_;

						// Comment-202503162 applies.
						const paidCstPrice_ = cosmicSignatureGameProxySimulator_.getNextCstBidPriceAdvanced(blockBeforeTransaction_, 1n);

						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);

						// Adding 1 to avoid a possible division by zero.
						// Comment-202503162 relates.
						const cstPriceToPayMaxLimit_ = randomNumber_ % (paidCstPrice_ * 16n + 1n);

						/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
						const transactionResponsePromise_ = cosmicSignatureGameProxyForSigner_.bidWithCst(cstPriceToPayMaxLimit_, bidMessage_);
						transactionReceipt_ = await tryWaitForTransactionReceipt(transactionResponsePromise_);
						latestBlock_ = await hre.ethers.provider.getBlock("latest");
						transactionBlock_ = latestBlock_;

						// #endregion
						// #region

						const transactionShouldHaveSucceeded_ =
							await cosmicSignatureGameProxySimulator_.canBidWithCst(
								transactionBlock_,
								signer_.address,
								cstPriceToPayMaxLimit_,
								bidMessage_,
								paidCstPrice_,
								contracts_,
								transactionResponsePromise_
							);
						expect(transactionShouldHaveSucceeded_).equal(transactionReceipt_ != undefined);
						if (transactionShouldHaveSucceeded_) {
							// console.info("202505112", signerIndex_.toString());
							/*await*/ cosmicSignatureGameProxySimulator_.bidWithCst(
								transactionBlock_,
								signer_.address,
								bidMessage_,
								paidCstPrice_,
								contracts_,
								transactionReceipt_,
								eventIndexWrapper_
							);
						}

						// #endregion
						// #region

						break;

						// #endregion
					}

					// #endregion
					// #region Calling `CosmicSignatureGame.claimMainPrize`

					case 6: {
						// #region

						await advanceNextBlockTime_();
						blockBeforeTransaction_ = latestBlock_;
						const signerEthBalanceAmountBeforeTransaction_ = await hre.ethers.provider.getBalance(signer_.address);
						/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
						const transactionResponsePromise_ = cosmicSignatureGameProxyForSigner_.claimMainPrize();
						transactionReceipt_ = await tryWaitForTransactionReceipt(transactionResponsePromise_);
						latestBlock_ = await hre.ethers.provider.getBlock("latest");
						transactionBlock_ = latestBlock_;
						
						// #endregion
						// #region

						// const timeStamp1_ = performance.now();
						const transactionShouldHaveSucceeded_ =
							await cosmicSignatureGameProxySimulator_.canClaimMainPrize(
								transactionBlock_,
								signer_.address,
								contracts_,
								transactionResponsePromise_
							);
						// const timeStamp2_ = performance.now();
						expect(transactionShouldHaveSucceeded_).equal(transactionReceipt_ != undefined);
						if (transactionShouldHaveSucceeded_) {
							// console.info("202505113", signerIndex_.toString());
							// console.info("202505142", cosmicSignatureGameProxySimulator_.getTotalNumBids().toString());
							totalNumBids_ += Number(cosmicSignatureGameProxySimulator_.getTotalNumBids());
							// const timeStamp3_ = performance.now();
							await cosmicSignatureGameProxySimulator_.claimMainPrize(
								blockBeforeTransaction_,
								transactionBlock_,
								signer_.address,
								signerEthBalanceAmountBeforeTransaction_,
								contracts_,
								transactionReceipt_,
								eventIndexWrapper_
								// blockchainPropertyGetter_
							);
							// const timeStamp4_ = performance.now();
							// console.info(
							// 	(timeStamp2_ - timeStamp1_).toFixed(1),
							// 	(timeStamp4_ - timeStamp3_).toFixed(1)
							// );
							tryBreakLoop_ = true;
						}

						// #endregion
						// #region

						break;

						// #endregion
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

				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				if ((randomNumber_ & (0x0Fn << (0n * 8n))) == 0n) {
					// console.info("202505265");
					await assertCosmicSignatureGameProxySimulatorGetBidderTotalSpentAmounts(cosmicSignatureGameProxySimulator_, contracts_, signer_.address);
				}
				if ((randomNumber_ & (0x0Fn << (1n * 8n))) == 0n) {
					// console.info("202505266");
					await assertCosmicSignatureGameProxySimulatorTryGetCurrentChampions(cosmicSignatureGameProxySimulator_, contracts_, latestBlock_);
				}
				if ((randomNumber_ & (0x0Fn << (2n * 8n))) == 0n) {
					// console.info("202505267");
					await assertCosmicSignatureGameProxySimulatorGetEthDutchAuctionDurations(cosmicSignatureGameProxySimulator_, contracts_, latestBlock_);
				}
				if ((randomNumber_ & (0x0Fn << (3n * 8n))) == 0n) {
					// console.info("202505268");
					await assertCosmicSignatureGameProxySimulatorGetCstDutchAuctionDurations(cosmicSignatureGameProxySimulator_, contracts_, latestBlock_);
				}

				// #endregion
				// #region

				if (blockBeforeTransaction_ != undefined) {
					expect(transactionBlock_.number).equal(blockBeforeTransaction_.number + 1);
					{
						const adjacentBlockTimeStampDifference_ = transactionBlock_.timestamp - blockBeforeTransaction_.timestamp;

						// Issue. Given Comment-202501193, it appears that this condition is not guaranteed to be `true`.
						// Therefore not asserting it.
						if (adjacentBlockTimeStampDifference_ == 1) {

							// Doing nothing.
						} else {
							console.warn("Warning 202505017. Adjacent block timestamp difference is " + adjacentBlockTimeStampDifference_.toString() + ".");
						}
					}
					if (transactionReceipt_ != undefined) {
						// console.info("202505075");
						expect(transactionReceipt_.logs.length).equal(eventIndexWrapper_.value);
						await assertContractSimulators_();
					} else {
						// console.info("202505076");
					}
				}

				// #endregion
				// #region

				if (tryBreakLoop_) {
					// {
					// 	const averageNumBidsPerRound_ = totalNumBids_ / Number(cosmicSignatureGameProxySimulator_.roundNum);
					// 	console.info("202505118 averageNumBidsPerRound_ = " + averageNumBidsPerRound_.toString());
					// }
					if (Number(cosmicSignatureGameProxySimulator_.roundNum) >= numRoundsToRunMinLimit_) {
						const averageNumBidsPerRound_ = totalNumBids_ / Number(cosmicSignatureGameProxySimulator_.roundNum);
						{
							// [Comment-202504043/]
							const okToBreakLoop_ = averageNumBidsPerRound_ >= bidAverageCountPerRoundMinLimit_;
							if (okToBreakLoop_) {
								break;
							}
						}
						// const errorDetails_ = {bidAverageCountPerRound: averageNumBidsPerRound_,};
						// throw new Error("Error 202504052. " + JSON.stringify(errorDetails_));
						console.warn("Warning 202504052. averageNumBidsPerRound_ = " + averageNumBidsPerRound_.toString());
					}

					// [Comment-202505117]
					// This serves 2 purposes:
					// 1. Increases the chance that ETH bid price becomes very small, possibly 1 Wei, which is a marginal case to test.
					//    Comment-202503162 relates.
					// 2. A consequence of a low ETH bid price is a higher chance that we will sometimes skip refunding a small ETH value.
					//    Comment-202502052 relates.
					// [/Comment-202505117]
					if (cosmicSignatureGameProxySimulator_.ethDutchAuctionEndingBidPriceDivisor < 10n ** 30n) {
						const newEthDutchAuctionEndingBidPriceDivisor_ = cosmicSignatureGameProxySimulator_.ethDutchAuctionEndingBidPriceDivisor * 10n;
						/** @type {Promise<import("hardhat").ethers.TransactionResponse>} */
						const transactionResponsePromise_ = contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerSigner).setEthDutchAuctionEndingBidPriceDivisor(newEthDutchAuctionEndingBidPriceDivisor_);
						transactionReceipt_ = await waitForTransactionReceipt(transactionResponsePromise_);
						latestBlock_ = await transactionReceipt_.getBlock();
						eventIndexWrapper_.value = 0;
						cosmicSignatureGameProxySimulator_.setEthDutchAuctionEndingBidPriceDivisor(newEthDutchAuctionEndingBidPriceDivisor_, contracts_, transactionReceipt_, eventIndexWrapper_);
					}
				}

				// #endregion
			}

			// #endregion
		} catch (errorObject_) {
			// #region

			{
				const errorContext_ = {randomNumberSeed: uint256ToPaddedHexString(randomNumberSeed_),};
				console.error("Error 202504055. " + JSON.stringify(errorContext_));
			}
			// console.error(errorObject_.stack);
			throw errorObject_;

			// #endregion
		}

		// #endregion
	});

	// #endregion
});

// #endregion
