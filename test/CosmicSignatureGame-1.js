// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256, generateRandomUInt256FromSeedWrapper, generateRandomUInt256FromSeed, uint256ToPaddedHexString } = require("../src/Helpers.js");
const { createFairRandomNumberGenerator } = require("../src/FairRandomNumberGenerator.js");
const { loadFixtureDeployContractsForUnitTesting, assertAddressIsValid, checkTransactionErrorObject, assertEvent, generateRandomUInt256Seed } = require("../src/ContractUnitTestingHelpers.js");

// #endregion
// #region

const SKIP_LONG_TESTS = false;

// #endregion
// #region `describe`

// todo-1 +++ Make sure we use `await` to call `async` functions.
// todo-1 +++ Make sure all branches have been tested.
describe("CosmicSignatureGame-1", function () {
	// #region

	it("Integration test over multiple bidding rounds", async function () {
		// #region

		if (SKIP_LONG_TESTS) {
			// todo-1 Log this everywhere.
			console.warn("Warning 202505015. Skipping a long test.");
			return;
		}

		// #endregion
		// #region

		// This must be relatively big so that the logic near Comment-202505117 sometimes got a chance
		// to reduce ETH bid price to 1 Wei.
		const numRoundsToRunMinLimit_ = 20;

		const bidAverageCountPerRoundMinLimit_ = 10.0;

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
			const fairRandomNumberGenerator1_ = createFairRandomNumberGenerator(fairRandomNumberGenerator1N_, 3, randomNumberSeedWrapper_);
			let randomNumber_;

			// #endregion
			// #region

			randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
			const roundActivationTimeOffset_ = randomNumber_ % 4096n - 1024n;
			const contracts_ = await loadFixtureDeployContractsForUnitTesting(roundActivationTimeOffset_);
			const blockchainPropertyGetterFactory_ = await hre.ethers.getContractFactory("BlockchainPropertyGetter", contracts_.deployerAcct);
			const blockchainPropertyGetter_ = await blockchainPropertyGetterFactory_.deploy();
			await blockchainPropertyGetter_.waitForDeployment();
			// const blockchainPropertyGetterAddr_ = await blockchainPropertyGetter_.getAddress();

			// #endregion
			// #region `findSignerIndex_`

			const findSignerIndex_ = (signerAddress_) => {
				for (let signerIndex_ = contracts_.signers.length; ( -- signerIndex_ ) >= 0; ) {
					if (contracts_.signers[signerIndex_].address == signerAddress_) {
						return signerIndex_;
					}
				}
				expect(false);
			};

			// #endregion
			// #region

			// const timeStamp1_ = Date.now();
			// todo-1 Test separately that it fails correctly if this has not been done.
			// todo-1 Mention that test here.
			for (const signer5_ of contracts_.signers) {
				const randomWalkNftForSigner5_ = contracts_.randomWalkNft.connect(signer5_);
				await expect(randomWalkNftForSigner5_.setApprovalForAll(contracts_.stakingWalletRandomWalkNftAddr, true)).not.reverted;
				const cosmicSignatureNftForSigner5_ = contracts_.cosmicSignatureNft.connect(signer5_);
				await expect(cosmicSignatureNftForSigner5_.setApprovalForAll(contracts_.stakingWalletCosmicSignatureNftAddr, true)).not.reverted;
			}
			// const timeStamp2_ = Date.now();
			// console.info((timeStamp2_ - timeStamp1_).toString());

			// #endregion
			// #region

			const cosmicSignatureTokenState_ = /*await*/ createCosmicSignatureTokenState();
			const randomWalkNftState_ = /*await*/ createRandomWalkNftState();
			const cosmicSignatureNftState_ = /*await*/ createCosmicSignatureNftState();
			const prizesWalletState_ = /*await*/ createPrizesWalletState();
			const stakingWalletRandomWalkNftState_ = /*await*/ createStakingWalletRandomWalkNftState(randomWalkNftState_);
			const stakingWalletCosmicSignatureNftState_ = /*await*/ createStakingWalletCosmicSignatureNftState(cosmicSignatureNftState_);
			const charityWalletState_ = /*await*/ createCharityWalletState();
			const cosmicSignatureGameProxyState_ = await createCosmicSignatureGameProxyState(contracts_, cosmicSignatureTokenState_, randomWalkNftState_, cosmicSignatureNftState_, prizesWalletState_, stakingWalletRandomWalkNftState_, stakingWalletCosmicSignatureNftState_, charityWalletState_);

			// #endregion
			// #region `assertContractState_`

			const assertContractState_ = async () => {
				await assertCosmicSignatureTokenState(cosmicSignatureTokenState_, contracts_, randomNumberSeedWrapper_);
				await assertRandomWalkNftState(randomWalkNftState_, contracts_, randomNumberSeedWrapper_);
				await assertCosmicSignatureNftState(cosmicSignatureNftState_, contracts_, randomNumberSeedWrapper_);
				await assertPrizesWalletState(prizesWalletState_, contracts_, randomNumberSeedWrapper_);
				await assertStakingWalletRandomWalkNftState(stakingWalletRandomWalkNftState_, contracts_, randomNumberSeedWrapper_);
				await assertStakingWalletCosmicSignatureNftState(stakingWalletCosmicSignatureNftState_, contracts_, randomNumberSeedWrapper_);
				await assertCharityWalletState(charityWalletState_, contracts_);
				await assertCosmicSignatureGameProxyState(cosmicSignatureGameProxyState_, contracts_, randomNumberSeedWrapper_);
			};

			// #endregion
			// #region

			await assertContractState_();

			// Remember to re-query this after every block mining.
			// todo-1 +++ See above.
			let latestBlock_ = await hre.ethers.provider.getBlock("latest");

			// This is not `bigint`.
			let totalNumBids_ = 0;

			// #endregion
			// #region

			for(;;) {
				// #region

				const fairRandomNumber1_ = fairRandomNumberGenerator1_.getNext();
				let signerIndex_ = -1;
				if (fairRandomNumber1_ == 6 && cosmicSignatureGameProxyState_.getTotalNumBids() > 0n) {
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					if ((randomNumber_ & 0xFn) != 0n) {
						signerIndex_ = findSignerIndex_(cosmicSignatureGameProxyState_.lastBidderAddress);
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
				let transactionBlock_;

				// Comment-202505051 applies.
				// A value other than `undefined` indicates that the transaction succeeded.
				let transactionReceipt_;

				const eventIndexWrapper_ = {value: 0,};
				let tryBreakLoop_ = false;

				// #endregion
				// #region `tryFindUnusedRandomWalkNft_`

				/// [Comment-202504222]
				/// Makes a reasonble effort to find an unused NFT that belongs to `signer_`.
				/// [/Comment-202504222]
				/// `isForStaking_`: `true` for staking; `false` for bidding.
				const tryFindUnusedRandomWalkNft_ = (isForStaking_) => {
					// If this is zero `randomWalkNftId_` will stay `-1n`.
					const randomWalkNftTotalSupply_ = randomWalkNftState_.totalSupply();

					for (let counter_ = Math.min(contracts_.signers.length, Number(randomWalkNftTotalSupply_)); ( -- counter_ ) >= 0; ) {
						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);

						// [Comment-202504224]
						// This NFT ID is guaranteed to be valid.
						// Issue. We do not test an invalid NFT ID. In that case `ERC721.ownerOf`, which our contract calls,
						// would revert with a different error.
						// todo-1 Develop a separate test for that?
						// [/Comment-202504224]
						randomWalkNftId_ = randomNumber_ % randomWalkNftTotalSupply_;

						const nftWasUsed_ =
							isForStaking_ ?
							stakingWalletRandomWalkNftState_.usedNfts[randomWalkNftId_] :
							cosmicSignatureGameProxyState_.usedRandomWalkNfts[randomWalkNftId_];
						if (( ! nftWasUsed_ ) && randomWalkNftState_.ownerOf(randomWalkNftId_) == signer_.address) {
							return true;
						}
					}
					return false;
				};

				// #endregion
				// #region `tryFindUnusedCosmicSignatureNft_`

				// Comment-202504222 applies.
				const tryFindUnusedCosmicSignatureNft_ = () => {
					// If this is zero `cosmicSignatureNftId_` will stay `-1n`.
					const cosmicSignatureNftTotalSupply_ = cosmicSignatureNftState_.totalSupply()

					for (let counter_ = Math.min(contracts_.signers.length, Number(cosmicSignatureNftTotalSupply_)); ( -- counter_ ) >= 0; ) {
						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);

						// Comment-202504224 applies.
						cosmicSignatureNftId_ = randomNumber_ % cosmicSignatureNftTotalSupply_;

						if ( ( ! stakingWalletCosmicSignatureNftState_.usedNfts[cosmicSignatureNftId_] ) &&
								cosmicSignatureNftState_.ownerOf(cosmicSignatureNftId_) == signer_.address
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
					bidMessageLength_ = randomNumber_ % (cosmicSignatureGameProxyState_.bidMessageLengthMaxLimit * 17n / 16n + 1n);
					bidMessage_ = "x".repeat(Number(bidMessageLength_));
				};

				// #endregion
				// #region `advanceNextBlockTime_`

				// Issue. This logic is a bit of a hack, not precise science.
				// What we need is that the logic near Comment-202504043 allowed us to break the loop
				// and the behavior was generally close to what will be happening in the production.
				const advanceNextBlockTime_ = async () => {
					// Increasing block time increase as the number of bids in the current bidding round increases.
					// Doing so ensures that block time will eventually reach main prize time.
					let timeIncrementMaxLimit_ =
						(cosmicSignatureGameProxyState_.mainPrizeTimeIncrementInMicroSeconds + (20n * 60n) * cosmicSignatureGameProxyState_.getTotalNumBids()) / 2_000_000n;

					// This logic increases the chance that:
					// 1. The first bidder or a non-last bidder claims the main prize.
					// 2. The logic near Comment-202505117 causes ETH bid price to become very small, down to 1 Wei.
					{
						const totalNumBidsCopy_ = cosmicSignatureGameProxyState_.getTotalNumBids();
						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
						if ((randomNumber_ & ((totalNumBidsCopy_ == 1n || (fairRandomNumber1_ == 6 && totalNumBidsCopy_ > 0n && signer_.address != cosmicSignatureGameProxyState_.lastBidderAddress)) ? 0x7n : 0x1Fn)) == 0n) {
							timeIncrementMaxLimit_ <<= 10n;
						}
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
				};

				// #endregion
				// #region

				// todo-1 Calling only some contract methods for now. We need to call some others as well.
				// todo-1 Or maybe develop separate tests for those.
				switch (fairRandomNumber1_) {
					// #region Minting a Random Walk NFT.

					case 0: {
						// console.info("202505106");
						blockBeforeTransaction_ = latestBlock_;

						// It would be nice to implement this method in `createRandomWalkNftState`, but keeping it simple.
						const randomWalkNftMintPrice_ = await randomWalkNftForSigner_.getMintPrice();

						const transactionResponseFuture_ = randomWalkNftForSigner_.mint({value: randomWalkNftMintPrice_,});
						const transactionResponse_ = await transactionResponseFuture_;
						transactionReceipt_ = await transactionResponse_.wait();
						latestBlock_ = await hre.ethers.provider.getBlock("latest");
						transactionBlock_ = latestBlock_;
						randomWalkNftId_ = randomWalkNftState_.mint(signer_.address, contracts_, transactionReceipt_, eventIndexWrapper_);
						// console.info("Minted RW NFT " + randomWalkNftId_.toString() + ".");
						break;
					}

					// #endregion
					// #region Trying to find and if found staking a Random Walk NFT.

					case 1: {
						const found_ = tryFindUnusedRandomWalkNft_(true);
						if (found_) {
							// console.info("202505107 Staking RW NFT " + randomWalkNftId_.toString() + ".");
							blockBeforeTransaction_ = latestBlock_;
							const transactionResponseFuture_ = stakingWalletRandomWalkNftForSigner_.stake(randomWalkNftId_);
							const transactionResponse_ = await transactionResponseFuture_;
							transactionReceipt_ = await transactionResponse_.wait();
							latestBlock_ = await hre.ethers.provider.getBlock("latest");
							transactionBlock_ = latestBlock_;
							stakingWalletRandomWalkNftState_.stake(signer_.address, randomWalkNftId_, contracts_, transactionReceipt_, eventIndexWrapper_);
						} else {
							// console.info("202505143 Cannot find an RW NFT to stake.");
						}
						break;
					}

					// #endregion
					// #region Trying to find and if found staking a Cosmic Signature NFT.

					case 2: {
						const found_ = tryFindUnusedCosmicSignatureNft_();
						if (found_) {
							// console.info("202505108 Staking CS NFT " + cosmicSignatureNftId_.toString() + ".");
							blockBeforeTransaction_ = latestBlock_;
							const transactionResponseFuture_ = stakingWalletCosmicSignatureNftForSigner_.stake(cosmicSignatureNftId_);
							const transactionResponse_ = await transactionResponseFuture_;
							transactionReceipt_ = await transactionResponse_.wait();
							latestBlock_ = await hre.ethers.provider.getBlock("latest");
							transactionBlock_ = latestBlock_;
							stakingWalletCosmicSignatureNftState_.stake(signer_.address, cosmicSignatureNftId_, contracts_, transactionReceipt_, eventIndexWrapper_);
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
						const ethDonationAmount_ = ((randomNumber_ & (0xFn << 128n)) == 0n) ? 0n : (randomNumber_ & ((1n << 40n) - 1n));
						if ((randomNumber_ & (1n << 136n)) == 0n) {
							// console.info("Donating " + hre.ethers.formatEther(ethDonationAmount_) + " ETH.");
							const transactionResponseFuture_ = cosmicSignatureGameProxyForSigner_.donateEth({value: ethDonationAmount_,});
							const transactionResponse_ = await transactionResponseFuture_;
							transactionReceipt_ = await transactionResponse_.wait();
							cosmicSignatureGameProxyState_.donateEth(signer_.address, ethDonationAmount_, contracts_, transactionReceipt_, eventIndexWrapper_);
						} else {
							// console.info("Donating " + hre.ethers.formatEther(ethDonationAmount_) + " ETH with info.");

							// Comment-202505061 applies.
							generateBidMessage_();

							const transactionResponseFuture_ = cosmicSignatureGameProxyForSigner_.donateEthWithInfo(bidMessage_, {value: ethDonationAmount_,});
							const transactionResponse_ = await transactionResponseFuture_;
							transactionReceipt_ = await transactionResponse_.wait();
							cosmicSignatureGameProxyState_.donateEthWithInfo(signer_.address, ethDonationAmount_, bidMessage_, contracts_, transactionReceipt_, eventIndexWrapper_);
						}
						latestBlock_ = await hre.ethers.provider.getBlock("latest");
						transactionBlock_ = latestBlock_;
						break;
					}

					// #endregion
					// #region Calling `CosmicSignatureGame.bidWithEth`

					// todo-1 Here and when calling bidWithCst, sometimes bid with donating an NFT.
					// todo-1 Maybe deploy 2 more RW NFT contracts to be used for donations.
					// todo-1 But maybe develop a separate test for that.
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
								randomWalkNftId_ = ( ~ randomWalkNftId_ );
							}
						} else {
							// console.info("There are no RW NFTs yet.");
						}
						generateBidMessage_();
						blockBeforeTransaction_ = latestBlock_;

						// Comment-202503162 applies.
						const ethBidPrice_ = cosmicSignatureGameProxyState_.getNextEthBidPrice(blockBeforeTransaction_, 1n);
						const paidEthPrice_ =
							(randomWalkNftId_ < 0n) ?
							ethBidPrice_ :
							cosmicSignatureGameProxyState_.getEthPlusRandomWalkNftBidPrice(ethBidPrice_);

						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
						const ethPriceToPayMaxLimit_ = randomNumber_ % (paidEthPrice_ * 16n);
						const signerEthBalanceAmountBeforeTransaction_ = await hre.ethers.provider.getBalance(signer_.address);
						let transactionResponseFuture_;
						try {
							transactionResponseFuture_ = cosmicSignatureGameProxyForSigner_.bidWithEth(randomWalkNftId_, bidMessage_, {value: ethPriceToPayMaxLimit_,});
							const transactionResponse_ = await transactionResponseFuture_;
							transactionReceipt_ = await transactionResponse_.wait();
						} catch (transactionErrorObject_) {
							// console.warn(transactionErrorObject_.message);
							checkTransactionErrorObject(transactionErrorObject_);
						}
						latestBlock_ = await hre.ethers.provider.getBlock("latest");
						transactionBlock_ = latestBlock_;

						// #endregion
						// #region

						const transactionShouldHaveSucceeded_ =
							await cosmicSignatureGameProxyState_.canBidWithEth
								(transactionBlock_, signer_.address, ethPriceToPayMaxLimit_, randomWalkNftId_, bidMessage_, paidEthPrice_, contracts_, transactionResponseFuture_);
						expect(transactionShouldHaveSucceeded_ === (transactionReceipt_ !== undefined));
						if (transactionShouldHaveSucceeded_) {
							// console.info("202505111", signerIndex_.toString());
							await cosmicSignatureGameProxyState_.bidWithEth
								(transactionBlock_, signer_.address, signerEthBalanceAmountBeforeTransaction_, ethPriceToPayMaxLimit_, randomWalkNftId_, bidMessage_, ethBidPrice_, paidEthPrice_, contracts_, transactionReceipt_, eventIndexWrapper_);
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
						const paidCstPrice_ = cosmicSignatureGameProxyState_.getNextCstBidPrice(blockBeforeTransaction_, 1n);

						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);

						// Adding 1 to avoid a possible division by zero.
						// Comment-202503162 relates.
						const cstPriceToPayMaxLimit_ = randomNumber_ % (paidCstPrice_ * 16n + 1n);

						let transactionResponseFuture_;
						try {
							transactionResponseFuture_ = cosmicSignatureGameProxyForSigner_.bidWithCst(cstPriceToPayMaxLimit_, bidMessage_);
							const transactionResponse_ = await transactionResponseFuture_;
							transactionReceipt_ = await transactionResponse_.wait();
						} catch (transactionErrorObject_) {
							// console.warn(transactionErrorObject_.message);
							checkTransactionErrorObject(transactionErrorObject_);
						}
						latestBlock_ = await hre.ethers.provider.getBlock("latest");
						transactionBlock_ = latestBlock_;

						// #endregion
						// #region

						const transactionShouldHaveSucceeded_ =
							await cosmicSignatureGameProxyState_.canBidWithCst
								(transactionBlock_, signer_.address, cstPriceToPayMaxLimit_, bidMessage_, paidCstPrice_, contracts_, transactionResponseFuture_);
						expect(transactionShouldHaveSucceeded_ === (transactionReceipt_ !== undefined));
						if (transactionShouldHaveSucceeded_) {
							// console.info("202505112", signerIndex_.toString());
							/*await*/ cosmicSignatureGameProxyState_.bidWithCst
								(transactionBlock_, signer_.address, bidMessage_, paidCstPrice_, contracts_, transactionReceipt_, eventIndexWrapper_);
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
						let transactionResponseFuture_;
						try {
							// const timeStamp1_ = Date.now();
							transactionResponseFuture_ = cosmicSignatureGameProxyForSigner_.claimMainPrize();
							// const timeStamp2_ = Date.now();
							const transactionResponse_ = await transactionResponseFuture_;
							// const timeStamp3_ = Date.now();
							transactionReceipt_ = await transactionResponse_.wait();
							// const timeStamp4_ = Date.now();
							// console.info(
							// 	(timeStamp2_ - timeStamp1_).toString(),
							// 	(timeStamp3_ - timeStamp2_).toString(),
							// 	(timeStamp4_ - timeStamp3_).toString()
							// );
						} catch (transactionErrorObject_) {
							// console.warn(transactionErrorObject_.message);
							checkTransactionErrorObject(transactionErrorObject_);
						}
						latestBlock_ = await hre.ethers.provider.getBlock("latest");
						transactionBlock_ = latestBlock_;
						
						// #endregion
						// #region

						// const timeStamp1_ = Date.now();
						const transactionShouldHaveSucceeded_ =
							await cosmicSignatureGameProxyState_.canClaimMainPrize
								(transactionBlock_, signer_.address, contracts_, transactionResponseFuture_);
						// const timeStamp2_ = Date.now();
						expect(transactionShouldHaveSucceeded_ === (transactionReceipt_ !== undefined));
						if (transactionShouldHaveSucceeded_) {
							// console.info("202505113", signerIndex_.toString());
							// console.info("202505142", cosmicSignatureGameProxyState_.getTotalNumBids().toString());
							totalNumBids_ += Number(cosmicSignatureGameProxyState_.getTotalNumBids());
							// const timeStamp3_ = Date.now();
							await cosmicSignatureGameProxyState_.claimMainPrize
								(transactionBlock_, signer_.address, signerEthBalanceAmountBeforeTransaction_, contracts_, transactionReceipt_, eventIndexWrapper_, blockchainPropertyGetter_);
							// const timeStamp4_ = Date.now();
							// console.info(
							// 	(timeStamp2_ - timeStamp1_).toString(),
							// 	(timeStamp4_ - timeStamp3_).toString()
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

				if (blockBeforeTransaction_ !== undefined) {
					expect(transactionBlock_.number).equal(blockBeforeTransaction_.number + 1);
					{
						const adjacentBlockTimeStampDifference_ = transactionBlock_.timestamp - blockBeforeTransaction_.timestamp;

						// Issue. Given Comment-202501193, this condition is supposed to always be `true`, but sometimes it's not.
						// Therefore not asserting it.
						if (adjacentBlockTimeStampDifference_ != 1) {

							console.warn("Warning 202505017. Adjacent block timestamp difference is " + adjacentBlockTimeStampDifference_.toString() + ".");
						}
					}
					if (transactionReceipt_ !== undefined) {
						// console.info("202505075");
						expect(transactionReceipt_.logs.length).equals(eventIndexWrapper_.value);
						await assertContractState_();
					} else {
						// console.info("202505076");
					}
				}

				// #endregion
				// #region

				if (tryBreakLoop_) {
					// {
					// 	const averageNumBidsPerRound_ = totalNumBids_ / Number(cosmicSignatureGameProxyState_.roundNum);
					// 	console.info("202505118 averageNumBidsPerRound_ = " + averageNumBidsPerRound_.toString());
					// }
					if (cosmicSignatureGameProxyState_.roundNum >= numRoundsToRunMinLimit_) {
						const averageNumBidsPerRound_ = totalNumBids_ / Number(cosmicSignatureGameProxyState_.roundNum);
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
					//    todo-1 Reference relevant comments, such as those near `ethBidRefundAmountInGasMinLimit` in Solidity.
					//    todo-1 I wrote a todo to reference this comment near `DEFAULT_ETH_BID_REFUND_AMOUNT_IN_GAS_MIN_LIMIT`.
					// [/Comment-202505117]
					if (cosmicSignatureGameProxyState_.ethDutchAuctionEndingBidPriceDivisor < 10n ** 30n) {
						cosmicSignatureGameProxyState_.ethDutchAuctionEndingBidPriceDivisor *= 10n;
						await expect(contracts_.cosmicSignatureGameProxy.connect(contracts_.ownerAcct).setEthDutchAuctionEndingBidPriceDivisor(cosmicSignatureGameProxyState_.ethDutchAuctionEndingBidPriceDivisor)).not.reverted;
						latestBlock_ = await hre.ethers.provider.getBlock("latest");
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
			console.error(errorObject_.stack);
			throw errorObject_;

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

		totalSupply: 0n,
		accountBalanceAmounts: {},

		// #endregion
		// #region `balanceOf`

		balanceOf: function(account_) {
			// assertAddressIsValid(account_);
			expect(account_).properAddress;
			return this.accountBalanceAmounts[account_] ?? 0n;
		},

		// #endregion
		// #region `transfer`
		
		transfer: function(callerAddress_, to_, value_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			// assertAddressIsValid(callerAddress_);
			expect(callerAddress_).not.equal(hre.ethers.ZeroAddress);
			// assertAddressIsValid(to_);
			expect(to_).not.equal(hre.ethers.ZeroAddress);
			expect(typeof value_ === "bigint");
			expect(value_ >= 0n);
			{
				const msgSenderNewBalanceAmount_ = this.balanceOf(callerAddress_) - value_;
				expect(msgSenderNewBalanceAmount_ >= 0n);
				this.accountBalanceAmounts[callerAddress_] = msgSenderNewBalanceAmount_;
			}
			{
				const toNewBalanceAmount_ = this.balanceOf(to_) + value_;
				this.accountBalanceAmounts[to_] = toNewBalanceAmount_;
			}
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureToken,
				"Transfer",
				[callerAddress_, to_, value_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `mint`

		mint: function(account_, value_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			// assertAddressIsValid(account_);
			expect(account_).not.equal(hre.ethers.ZeroAddress);
			expect(typeof value_ === "bigint");
			expect(value_ >= 0n);
			{
				const newTotalSupply_ = this.totalSupply + value_;

				// We want the total supply to be far away from the point of overflow.
				// It would be a concern if we observe it to be bigger than this.
				// Comment-202412033 relates and/or applies.
				expect(newTotalSupply_ <= (1n << 128n) - 1n);

				this.totalSupply = newTotalSupply_;
			}
			{
				const accountNewBalanceAmount_ = this.balanceOf(account_) + value_;
				this.accountBalanceAmounts[account_] = accountNewBalanceAmount_;
			}
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureToken,
				"Transfer",
				[hre.ethers.ZeroAddress, account_, value_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `burn`

		burn: function(account_, value_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			// assertAddressIsValid(account_);
			expect(account_).not.equal(hre.ethers.ZeroAddress);
			expect(typeof value_ === "bigint");
			expect(value_ >= 0n);
			{
				const newTotalSupply_ = this.totalSupply - value_;
				this.totalSupply = newTotalSupply_;
			}
			{
				const accountNewBalanceAmount_ = this.balanceOf(account_) - value_;
				expect(accountNewBalanceAmount_ >= 0n);
				this.accountBalanceAmounts[account_] = accountNewBalanceAmount_;
			}
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureToken,
				"Transfer",

				// Issue. If we burned a zero value, this event parameters make it appear that it was a mint, rather than a burn.
				(value_ > 0n) ? [account_, hre.ethers.ZeroAddress, value_,] : [hre.ethers.ZeroAddress, account_, value_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `mintMany`

		mintMany: function(specs_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			for (let index_ = specs_.length; ( -- index_ ) >= 0; ) {
				const spec_ = specs_[index_];
				this.mint(spec_.account, spec_.value, contracts_, transactionReceipt_, eventIndexWrapper_);
			}
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

async function assertCosmicSignatureTokenState(cosmicSignatureTokenState_, contracts_, randomNumberSeedWrapper_) {
	expect(await contracts_.cosmicSignatureToken.totalSupply()).equal(cosmicSignatureTokenState_.totalSupply);
	await assertCosmicSignatureTokenBalanceAmountsOfRandomAccount(cosmicSignatureTokenState_, contracts_, randomNumberSeedWrapper_);
}

// #endregion
// #region `assertCosmicSignatureTokenBalanceAmountsOfRandomAccount`

async function assertCosmicSignatureTokenBalanceAmountsOfRandomAccount(cosmicSignatureTokenState_, contracts_, randomNumberSeedWrapper_) {
	// Assuming that only signers and marketing wallet can hold a CST balance.
	const numCstHolders_ = contracts_.signers.length + 1;

	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const cstHolderIndex_ = Number(randomNumber_ % BigInt(numCstHolders_));
	const cstHolderAddress_ = (cstHolderIndex_ < contracts_.signers.length) ? contracts_.signers[cstHolderIndex_].address : contracts_.marketingWalletAddr;
	await assertCosmicSignatureTokenBalanceAmountOf(cosmicSignatureTokenState_, contracts_, cstHolderAddress_);
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

		/// For each NFT ID, stores an object that contains: `ownerAddress`.
		/// Each item index equals respective NFT ID.
		nftsInfo: [],

		// #endregion
		// #region `assertNftIdIsValid`

		assertNftIdIsValid: function(nftId_) {
			expect(this.isNftIdValid(nftId_));
		},

		// #endregion
		// #region `isNftIdValid`

		isNftIdValid: function(nftId_) {
			expect(typeof nftId_ === "bigint");
			return nftId_ >= 0n && nftId_ < this.totalSupply();
		},

		// #endregion
		// #region `totalSupply`

		totalSupply: function() {
			return BigInt(this.nftsInfo.length);
		},

		// #endregion
		// #region `ownerOf`

		ownerOf: function(nftId_) {
			this.assertNftIdIsValid(nftId_);
			return this.nftsInfo[Number(nftId_)].ownerAddress;
		},

		// #endregion
		// #region `transferFrom`

		transferFrom: function(from_, to_, nftId_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(from_ === this.ownerOf(nftId_));
			assertAddressIsValid(to_);
			this.nftsInfo[Number(nftId_)].ownerAddress = to_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.randomWalkNft,
				"Transfer",
				[from_, to_, nftId_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `mint`

		mint: function(callerAddress_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			assertAddressIsValid(callerAddress_);
			const nftId_ = this.totalSupply();
			this.nftsInfo.push({ownerAddress: callerAddress_,});
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.randomWalkNft,
				"Transfer",
				[hre.ethers.ZeroAddress, callerAddress_, nftId_,]
			);
			++ eventIndexWrapper_.value;

			// To keep it simple, not asserting event arguments.
			expect(transactionReceipt_.logs[eventIndexWrapper_.value].fragment.name === "MintEvent");

			++ eventIndexWrapper_.value;
			return nftId_;
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

async function assertRandomWalkNftState(randomWalkNftState_, contracts_, randomNumberSeedWrapper_) {
	expect(await contracts_.randomWalkNft.totalSupply()).equal(randomWalkNftState_.totalSupply());
	await assertRandomRandomWalkNftInfoIfPossible(randomWalkNftState_, contracts_, randomNumberSeedWrapper_);
}

// #endregion
// #region `assertRandomRandomWalkNftInfoIfPossible`

async function assertRandomRandomWalkNftInfoIfPossible(randomWalkNftState_, contracts_, randomNumberSeedWrapper_) {
	const nftTotalSupplyCopy_ = randomWalkNftState_.totalSupply()
	if (nftTotalSupplyCopy_ === 0n) {
		return;
	}
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const nftId_ = randomNumber_ % nftTotalSupplyCopy_;
	await assertRandomWalkNftInfo(randomWalkNftState_, contracts_, nftId_);
}

// #endregion
// #region `assertRandomWalkNftInfo`

async function assertRandomWalkNftInfo(randomWalkNftState_, contracts_, nftId_) {
	expect(await contracts_.randomWalkNft.ownerOf(nftId_)).equal(randomWalkNftState_.ownerOf(nftId_));
}

// #endregion

// #region `createCosmicSignatureNftState`

/*async*/ function createCosmicSignatureNftState() {
	// #region

	const cosmicSignatureNftState_ = {
		// #region Data

		/// For each NFT ID, stores an object that contains: `ownerAddress`, `name`, `seed`.
		/// Each item index equals respective NFT ID.
		nftsInfo: [],

		// #endregion
		// #region `assertNftIdIsValid`

		assertNftIdIsValid: function(nftId_) {
			expect(this.isNftIdValid(nftId_));
		},

		// #endregion
		// #region `isNftIdValid`

		isNftIdValid: function(nftId_) {
			expect(typeof nftId_ === "bigint");
			return nftId_ >= 0n && nftId_ < this.totalSupply();
		},

		// #endregion
		// #region `totalSupply`

		totalSupply: function() {
			return BigInt(this.nftsInfo.length);
		},

		// #endregion
		// #region `ownerOf`

		ownerOf: function(nftId_) {
			this.assertNftIdIsValid(nftId_);
			return this.nftsInfo[Number(nftId_)].ownerAddress;
		},

		// #endregion
		// #region `getNftName`

		getNftName: function(nftId_) {
			this.assertNftIdIsValid(nftId_);
			return this.nftsInfo[Number(nftId_)].name;
		},

		// #endregion
		// #region `setNftName`

		setNftName: function(nftId_, nftName_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			this.assertNftIdIsValid(nftId_);
			expect(typeof nftName_ === "string");
			this.nftsInfo[Number(nftId_)].name = nftName_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureNft,
				"NftNameChanged",
				[nftId_, nftName_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `getNftSeed`

		getNftSeed: function(nftId_) {
			this.assertNftIdIsValid(nftId_);
			return this.nftsInfo[Number(nftId_)].seed;
		},

		// #endregion
		// #region `transferFrom`

		transferFrom: function(from_, to_, nftId_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(from_ === this.ownerOf(nftId_));
			assertAddressIsValid(to_);
			this.nftsInfo[Number(nftId_)].ownerAddress = to_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureNft,
				"Transfer",
				[from_, to_, nftId_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `mint`

		mint: function(roundNum_, nftOwnerAddress_, randomNumberSeed_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(typeof roundNum_ === "bigint");
			expect(roundNum_ >= 0n);
			assertAddressIsValid(nftOwnerAddress_);
			const nftSeed_ = generateRandomUInt256FromSeed(randomNumberSeed_);
			const nftId_ = this.totalSupply();
			this.nftsInfo.push({ownerAddress: nftOwnerAddress_, name: "", seed: nftSeed_,});
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureNft,
				"Transfer",
				[hre.ethers.ZeroAddress, nftOwnerAddress_, nftId_,]
			);
			++ eventIndexWrapper_.value;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureNft,
				"NftMinted",
				[roundNum_, nftOwnerAddress_, nftSeed_, nftId_,]
			);
			++ eventIndexWrapper_.value;
			return nftId_;
		},

		// #endregion
		// #region `mintMany`

		mintMany: function(roundNum_, nftOwnerAddresses_, randomNumberSeed_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			let firstNftId_ = 0n;
			if (nftOwnerAddresses_.length > 0) {
				firstNftId_ = this.mint(roundNum_, nftOwnerAddresses_[0], randomNumberSeed_, contracts_, transactionReceipt_, eventIndexWrapper_);
				for ( let index_ = 1; index_ < nftOwnerAddresses_.length; ++ index_ ) {
					randomNumberSeed_ = BigInt.asUintN(256, randomNumberSeed_ + 1n);
					this.mint(roundNum_, nftOwnerAddresses_[index_], randomNumberSeed_, contracts_, transactionReceipt_, eventIndexWrapper_);
				}
			}
			return firstNftId_;
		},

		// #endregion
	};

	// #endregion
	// #region

	return cosmicSignatureNftState_;

	// #endregion
}

// #endregion
// #region `assertCosmicSignatureNftState`

async function assertCosmicSignatureNftState(cosmicSignatureNftState_, contracts_, randomNumberSeedWrapper_) {
	expect(await contracts_.cosmicSignatureNft.totalSupply()).equal(cosmicSignatureNftState_.totalSupply());
	await assertRandomCosmicSignatureNftInfoIfPossible(cosmicSignatureNftState_, contracts_, randomNumberSeedWrapper_);
	/*await*/ assertRandomCosmicSignatureNftSeedsAreUnequalIfPossible(cosmicSignatureNftState_, randomNumberSeedWrapper_);
}

// #endregion
// #region `assertRandomCosmicSignatureNftInfoIfPossible`

async function assertRandomCosmicSignatureNftInfoIfPossible(cosmicSignatureNftState_, contracts_, randomNumberSeedWrapper_) {
	const nftTotalSupplyCopy_ = cosmicSignatureNftState_.totalSupply()
	if (nftTotalSupplyCopy_ === 0n) {
		return;
	}
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const nftId_ = randomNumber_ % nftTotalSupplyCopy_;
	await assertCosmicSignatureNftInfo(cosmicSignatureNftState_, contracts_, nftId_);
}

// #endregion
// #region `assertCosmicSignatureNftInfo`

async function assertCosmicSignatureNftInfo(cosmicSignatureNftState_, contracts_, nftId_) {
	expect(await contracts_.cosmicSignatureNft.ownerOf(nftId_)).equal(cosmicSignatureNftState_.ownerOf(nftId_));
	expect(await contracts_.cosmicSignatureNft.getNftName(nftId_)).equal(cosmicSignatureNftState_.getNftName(nftId_));
	expect(await contracts_.cosmicSignatureNft.getNftSeed(nftId_)).equal(cosmicSignatureNftState_.getNftSeed(nftId_));
}

// #endregion
// #region `assertRandomCosmicSignatureNftSeedsAreUnequalIfPossible`

/*async*/ function assertRandomCosmicSignatureNftSeedsAreUnequalIfPossible(cosmicSignatureNftState_, randomNumberSeedWrapper_) {
	const nftTotalSupplyCopy_ = cosmicSignatureNftState_.totalSupply()
	if (nftTotalSupplyCopy_ < 2n) {
		return;
	}
	let randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const nft1Id_ = randomNumber_ % nftTotalSupplyCopy_;
	randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	let nft2Id_ = randomNumber_ % nftTotalSupplyCopy_;
	if (nft2Id_ === nft1Id_) {
		nft2Id_ = (randomNumber_ ^ 1n) % nftTotalSupplyCopy_;
	}
	expect(cosmicSignatureNftState_.getNftSeed(nft1Id_) != cosmicSignatureNftState_.getNftSeed(nft2Id_));
}

// #endregion

// #region `createPrizesWalletState`

/// todo-1 For now, this is a simplified design. To be revisited.
/// todo-1 Later add the ability to donate tokens and NFTs. Add those features to prizes wallet state.
/*async*/ function createPrizesWalletState() {
	// #region

	const prizesWalletState_ = {
		// #region Data

		ethBalanceAmount: 0n,
		// mainPrizeBeneficiaryAddress: hre.ethers.ZeroAddress,
		accountEthBalanceAmounts: {},

		// #endregion
		// #region `depositEthMany`

		depositEthMany: function(value_, roundNum_, ethDeposits_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(typeof value_ === "bigint");
			expect(value_).equal(ethDeposits_.reduce((amountSum_, ethDeposit_) => (amountSum_ + ethDeposit_.amount), 0n));
			for (let ethDepositIndex_ = ethDeposits_.length; ( -- ethDepositIndex_ ) >= 0; ) {
				const ethDeposit_ = ethDeposits_[ethDepositIndex_];
				this.depositEth(roundNum_, ethDeposit_.prizeWinnerAddress, ethDeposit_.amount, contracts_, transactionReceipt_, eventIndexWrapper_);
			}
		},

		// #endregion
		// #region `depositEth`

		depositEth: function(roundNum_, prizeWinnerAddress_, amount_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(typeof roundNum_ === "bigint");
			expect(roundNum_ >= 0n);
			// assertAddressIsValid(prizeWinnerAddress_);
			expect(prizeWinnerAddress_ !== hre.ethers.ZeroAddress);
			expect(typeof amount_ === "bigint");
			expect(amount_ >= 0n);
			{
				const newEthBalanceAmount_ = this.ethBalanceAmount + amount_;
				expect(newEthBalanceAmount_ <= (1n << 128n) - 1n);
				this.ethBalanceAmount = newEthBalanceAmount_;
			}
			{
				const prizeWinnerNewEthBalanceAmount_ = this.ethBalanceOf(prizeWinnerAddress_) + amount_;
				this.accountEthBalanceAmounts[prizeWinnerAddress_] = prizeWinnerNewEthBalanceAmount_;
			}
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.prizesWallet,
				"EthReceived",
				[roundNum_, prizeWinnerAddress_, amount_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `ethBalanceOf`

		/// In the contract, there is a similar method named `getEthBalanceInfo`. But we don't seem to need one here.
		ethBalanceOf: function(prizeWinnerAddress_) {
			expect(prizeWinnerAddress_).properAddress;
			return this.accountEthBalanceAmounts[prizeWinnerAddress_] ?? 0n;
		},

		// #endregion
	};

	// #endregion
	// #region

	return prizesWalletState_;

	// #endregion
}

// #endregion
// #region `assertPrizesWalletState`

async function assertPrizesWalletState(prizesWalletState_, contracts_, randomNumberSeedWrapper_) {
	expect(await hre.ethers.provider.getBalance(contracts_.prizesWalletAddr)).equal(prizesWalletState_.ethBalanceAmount);
	await assertPrizesWalletStateOfRandomSigner(prizesWalletState_, contracts_, randomNumberSeedWrapper_);
}

// #endregion
// #region `assertPrizesWalletStateOfRandomSigner`

async function assertPrizesWalletStateOfRandomSigner(prizesWalletState_, contracts_, randomNumberSeedWrapper_) {
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const signerIndex_ = Number(randomNumber_ % BigInt(contracts_.signers.length));
	await assertPrizesWalletStateOf(prizesWalletState_, contracts_, contracts_.signers[signerIndex_].address);
}

// #endregion
// #region `assertPrizesWalletStateOf`

async function assertPrizesWalletStateOf(prizesWalletState_, contracts_, prizeWinnerAddress_) {
	expect((await contracts_.prizesWallet["getEthBalanceInfo(address)"](prizeWinnerAddress_))[1]).equal(prizesWalletState_.ethBalanceOf(prizeWinnerAddress_));
}

// #endregion

// #region `createStakingWalletRandomWalkNftState`

/// todo-1 For now, this is a simplified design. To be revisited.
/*async*/ function createStakingWalletRandomWalkNftState(randomWalkNftState_) {
	// #region

	const stakingWalletRandomWalkNftState_ = {
		// #region Data

		randomWalkNftState: randomWalkNftState_,

		/// Comment-202504221 applies.
		usedNfts: {},

		actionCounter: 0n,

		/// todo-1 If I implement `unstake` this would need to be sparse.
		/// todo-1 Actually this is already sparse, given that the item at the index of 0 is missing.
		stakeActions: [undefined,],

		// #endregion
		// #region `stake`

		/// todo-1 Do we need `unstake`?
		stake: function(nftOwnerAddress_, nftId_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect( ! this.usedNfts[nftId_] );
			this.usedNfts[nftId_] = true;
			const newActionCounter_ = this.actionCounter + 1n;
			this.actionCounter = newActionCounter_;
			const newStakeActionId_ = newActionCounter_;

			// Comment-202504011 applies.
			this.stakeActions[Number(newStakeActionId_)] = {nftId: nftId_, nftOwnerAddress: nftOwnerAddress_,};

			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.stakingWalletRandomWalkNft,
				"NftStaked",
				[newStakeActionId_, nftId_, nftOwnerAddress_, newStakeActionId_,]
			);
			++ eventIndexWrapper_.value;
			this.randomWalkNftState.transferFrom(nftOwnerAddress_, contracts_.stakingWalletRandomWalkNftAddr, nftId_, contracts_, transactionReceipt_, eventIndexWrapper_);
		},

		// #endregion
		// #region `numStakedNfts`

		numStakedNfts: function() {
			return BigInt(this.stakeActions.length - 1);
		},

		// #endregion
		// #region `pickRandomStakerAddressesIfPossible`

		pickRandomStakerAddressesIfPossible: function(numStakerAddresses_, randomNumberSeed_) {
			expect(typeof numStakerAddresses_ === "bigint");
			expect(numStakerAddresses_ >= 0n);
			let luckyStakerAddresses_;
			{
				const numStakedNftsCopy_ = this.numStakedNfts();
				if (numStakedNftsCopy_ !== 0n) {
					luckyStakerAddresses_ = new Array(Number(numStakerAddresses_));
					for (let luckyStakerIndex_ = Number(numStakerAddresses_); ( -- luckyStakerIndex_ ) >= 0; ) {
						randomNumberSeed_ = BigInt.asUintN(256, randomNumberSeed_ + 1n);
						const randomNumber_ = generateRandomUInt256FromSeed(randomNumberSeed_);
						const luckyStakeActionIndex_ = randomNumber_ % numStakedNftsCopy_ + 1n;
						const luckyStakerAddress_ = this.stakeActions[Number(luckyStakeActionIndex_)].nftOwnerAddress;
						// console.info("202504297", luckyStakerAddress_);
						luckyStakerAddresses_[luckyStakerIndex_] = luckyStakerAddress_;
					}
				} else {
					luckyStakerAddresses_ = [];
				}
			}
			return luckyStakerAddresses_;
		},

		// #endregion
	};

	// #endregion
	// #region

	return stakingWalletRandomWalkNftState_;

	// #endregion
}

// #endregion
// #region `assertStakingWalletRandomWalkNftState`

async function assertStakingWalletRandomWalkNftState(stakingWalletRandomWalkNftState_, contracts_, randomNumberSeedWrapper_) {
	expect(await contracts_.stakingWalletRandomWalkNft.numStakedNfts()).equal(stakingWalletRandomWalkNftState_.numStakedNfts());
	await assertIfRandomRandomWalkNftWasUsedForStakingIfPossible(stakingWalletRandomWalkNftState_, contracts_, randomNumberSeedWrapper_);
	expect(await contracts_.stakingWalletRandomWalkNft.actionCounter()).equal(stakingWalletRandomWalkNftState_.actionCounter);
	await assertRandomRandomWalkNftStakeAction(stakingWalletRandomWalkNftState_, contracts_, randomNumberSeedWrapper_);
}

// #endregion
// #region `assertIfRandomRandomWalkNftWasUsedForStakingIfPossible`

async function assertIfRandomRandomWalkNftWasUsedForStakingIfPossible(stakingWalletRandomWalkNftState_, contracts_, randomNumberSeedWrapper_) {
	const nftTotalSupplyCopy_ = stakingWalletRandomWalkNftState_.randomWalkNftState.totalSupply()
	if (nftTotalSupplyCopy_ === 0n) {
		return;
	}
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const nftId_ = randomNumber_ % nftTotalSupplyCopy_;
	await assertIfRandomWalkNftWasUsedForStaking(stakingWalletRandomWalkNftState_, contracts_, nftId_);
}

// #endregion
// #region `assertIfRandomWalkNftWasUsedForStaking`

async function assertIfRandomWalkNftWasUsedForStaking(stakingWalletRandomWalkNftState_, contracts_, nftId_) {
	expect(await contracts_.stakingWalletRandomWalkNft.usedNfts(nftId_) === stakingWalletRandomWalkNftState_.usedNfts[nftId_] ? 1n : 0n);
}

// #endregion
// #region `assertRandomRandomWalkNftStakeAction`

async function assertRandomRandomWalkNftStakeAction(stakingWalletRandomWalkNftState_, contracts_, randomNumberSeedWrapper_) {
	const numStakedNftsCopy_ = stakingWalletRandomWalkNftState_.numStakedNfts();
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const stakeActionId_ = randomNumber_ % (numStakedNftsCopy_ + 1n);
	await assertRandomWalkNftStakeAction(stakingWalletRandomWalkNftState_, contracts_, stakeActionId_);
}

// #endregion
// #region `assertRandomWalkNftStakeAction`

async function assertRandomWalkNftStakeAction(stakingWalletRandomWalkNftState_, contracts_, stakeActionId_) {
	const stakeActionFromContract_ = await contracts_.stakingWalletRandomWalkNft.stakeActions(stakeActionId_);
	const stakeActionFromState_ = stakingWalletRandomWalkNftState_.stakeActions[Number(stakeActionId_)];
	if (stakeActionId_ === 0n) {
		expect(stakeActionFromContract_[0] === 0n);
		expect(stakeActionFromContract_[1] === hre.ethers.ZeroAddress);
		expect(stakeActionFromContract_[2] === 0n);
		expect(stakeActionFromState_ === undefined);
	} else {
		expect(stakeActionFromContract_[0] === stakeActionFromState_.nftId);
		expect(stakeActionFromContract_[1] === stakeActionFromState_.nftOwnerAddress);
		// todo-1 expect(stakeActionFromContract_[2] === stakeActionFromState_.index);
	}
}

// #endregion

// #region `createStakingWalletCosmicSignatureNftState`

/// todo-1 For now, this is a simplified design. To be revisited.
/*async*/ function createStakingWalletCosmicSignatureNftState(cosmicSignatureNftState_) {
	// #region

	const stakingWalletCosmicSignatureNftState_ = {
		// #region Data

		cosmicSignatureNftState: cosmicSignatureNftState_,
		ethBalanceAmount: 0n,
		numStakedNfts: 0n,

		/// Comment-202504221 applies.
		usedNfts: {},

		actionCounter: 0n,
		stakeActions: [undefined,],
		rewardAmountPerStakedNft: 0n,

		// #endregion
		// #region `stake`

		/// todo-1 Do we need `unstake`?
		stake: function(nftOwnerAddress_, nftId_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect( ! this.usedNfts[nftId_] );
			this.usedNfts[nftId_] = true;
			const newActionCounter_ = this.actionCounter + 1n;
			this.actionCounter = newActionCounter_;
			const newStakeActionId_ = newActionCounter_;

			// Comment-202504011 applies.
			this.stakeActions[Number(newStakeActionId_)] = {nftId: nftId_, nftOwnerAddress: nftOwnerAddress_, initialRewardAmountPerStakedNft: this.rewardAmountPerStakedNft,};

			const newNumStakedNfts_ = this.numStakedNfts + 1n;
			this.numStakedNfts = newNumStakedNfts_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.stakingWalletCosmicSignatureNft,
				"NftStaked",
				[newStakeActionId_, nftId_, nftOwnerAddress_, newNumStakedNfts_, this.rewardAmountPerStakedNft,]
			);
			++ eventIndexWrapper_.value;
			this.cosmicSignatureNftState.transferFrom(nftOwnerAddress_, contracts_.stakingWalletCosmicSignatureNftAddr, nftId_, contracts_, transactionReceipt_, eventIndexWrapper_);
		},

		// #endregion
		// #region // `numStakedNfts`

		// numStakedNfts: function() {
		// 	return BigInt(this.stakeActions.length - 1);
		// },

		// #endregion
		// #region `tryDeposit`

		tryDeposit: function(value_, roundNum_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(typeof value_ === "bigint");
			expect(value_ >= 0n);
			expect(typeof roundNum_ === "bigint");
			expect(roundNum_ >= 0n);
			const numStakedNftsCopy_ = this.numStakedNfts;
			if (numStakedNftsCopy_ === 0n) {
				// console.info("202505104");
				return false;
			}
			// console.info("202505105");
			this.ethBalanceAmount += value_;
			const newRewardAmountPerStakedNft_ = this.rewardAmountPerStakedNft + value_ / numStakedNftsCopy_;
			this.rewardAmountPerStakedNft = newRewardAmountPerStakedNft_;
			const newActionCounter_ = this.actionCounter + 1n;
			this.actionCounter = newActionCounter_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.stakingWalletCosmicSignatureNft,
				"EthDepositReceived",
				[roundNum_, newActionCounter_, value_, newRewardAmountPerStakedNft_, numStakedNftsCopy_,]
			);
			++ eventIndexWrapper_.value;
			return true;
		},

		// #endregion
	};

	// #endregion
	// #region

	return stakingWalletCosmicSignatureNftState_;

	// #endregion
}

// #endregion
// #region `assertStakingWalletCosmicSignatureNftState`

async function assertStakingWalletCosmicSignatureNftState(stakingWalletCosmicSignatureNftState_, contracts_, randomNumberSeedWrapper_) {
	expect(await hre.ethers.provider.getBalance(contracts_.stakingWalletCosmicSignatureNftAddr)).equal(stakingWalletCosmicSignatureNftState_.ethBalanceAmount);
	expect(await contracts_.stakingWalletCosmicSignatureNft.numStakedNfts()).equal(stakingWalletCosmicSignatureNftState_.numStakedNfts);
	await assertIfRandomCosmicSignatureNftWasUsedForStakingIfPossible(stakingWalletCosmicSignatureNftState_, contracts_, randomNumberSeedWrapper_);
	expect(await contracts_.stakingWalletCosmicSignatureNft.actionCounter()).equal(stakingWalletCosmicSignatureNftState_.actionCounter);
	await assertRandomCosmicSignatureNftStakeAction(stakingWalletCosmicSignatureNftState_, contracts_, randomNumberSeedWrapper_);
	expect(await contracts_.stakingWalletCosmicSignatureNft.rewardAmountPerStakedNft()).equal(stakingWalletCosmicSignatureNftState_.rewardAmountPerStakedNft);
}

// #endregion
// #region `assertIfRandomCosmicSignatureNftWasUsedForStakingIfPossible`

async function assertIfRandomCosmicSignatureNftWasUsedForStakingIfPossible(stakingWalletCosmicSignatureNftState_, contracts_, randomNumberSeedWrapper_) {
	const nftTotalSupplyCopy_ = stakingWalletCosmicSignatureNftState_.cosmicSignatureNftState.totalSupply()
	if (nftTotalSupplyCopy_ === 0n) {
		return;
	}
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const nftId_ = randomNumber_ % nftTotalSupplyCopy_;
	await assertIfCosmicSignatureNftWasUsedForStaking(stakingWalletCosmicSignatureNftState_, contracts_, nftId_);
}

// #endregion
// #region `assertIfCosmicSignatureNftWasUsedForStaking`

async function assertIfCosmicSignatureNftWasUsedForStaking(stakingWalletCosmicSignatureNftState_, contracts_, nftId_) {
	expect(await contracts_.stakingWalletCosmicSignatureNft.usedNfts(nftId_) === stakingWalletCosmicSignatureNftState_.usedNfts[nftId_] ? 1n : 0n);
}

// #endregion
// #region `assertRandomCosmicSignatureNftStakeAction`

async function assertRandomCosmicSignatureNftStakeAction(stakingWalletCosmicSignatureNftState_, contracts_, randomNumberSeedWrapper_) {
	// This includes gaps.
	const numStakeActions_ = BigInt(stakingWalletCosmicSignatureNftState_.stakeActions.length);

	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const stakeActionId_ = randomNumber_ % numStakeActions_;
	await assertCosmicSignatureNftStakeAction(stakingWalletCosmicSignatureNftState_, contracts_, stakeActionId_);
}

// #endregion
// #region `assertCosmicSignatureNftStakeAction`

async function assertCosmicSignatureNftStakeAction(stakingWalletCosmicSignatureNftState_, contracts_, stakeActionId_) {
	const stakeActionFromContract_ = await contracts_.stakingWalletCosmicSignatureNft.stakeActions(stakeActionId_);
	const stakeActionFromState_ = stakingWalletCosmicSignatureNftState_.stakeActions[Number(stakeActionId_)];
	if (stakeActionFromState_ === undefined) {
		expect(stakeActionFromContract_[0] === 0n);
		expect(stakeActionFromContract_[1] === hre.ethers.ZeroAddress);
		expect(stakeActionFromContract_[2] === 0n);
	} else {
		expect(stakeActionFromContract_[0] === stakeActionFromState_.nftId);
		expect(stakeActionFromContract_[1] === stakeActionFromState_.nftOwnerAddress);
		expect(stakeActionFromContract_[2] === stakeActionFromState_.initialRewardAmountPerStakedNft);
	}
}

// #endregion

// #region `createMarketingWalletState`

// We don't need this.

// #endregion

// #region `createCharityWalletState`

/*async*/ function createCharityWalletState() {
	// #region

	const charityWalletState_ = {
		// #region Data

		ethBalanceAmount: 0n,

		// #endregion
		// #region `receive`

		receive: function(callerAddress_, value_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			assertAddressIsValid(callerAddress_);
			expect(typeof value_ === "bigint");
			expect(value_ >= 0n);
			this.ethBalanceAmount += value_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.charityWallet,
				"DonationReceived",
				[callerAddress_, value_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
	};

	// #endregion
	// #region

	return charityWalletState_;

	// #endregion
}

// #endregion
// #region `assertCharityWalletState`

async function assertCharityWalletState(charityWalletState_, contracts_) {
	expect(await hre.ethers.provider.getBalance(contracts_.charityWalletAddr)).equal(charityWalletState_.ethBalanceAmount);
}

// #endregion

// #region `createCosmicSignatureDaoState`

// We don't need this.

// #endregion

// #region `createCosmicSignatureGameProxyState`

/// todo-1 Another test would be to populate this with some random values.
async function createCosmicSignatureGameProxyState(contracts_, cosmicSignatureTokenState_, randomWalkNftState_, cosmicSignatureNftState_, prizesWalletState_, stakingWalletRandomWalkNftState_, stakingWalletCosmicSignatureNftState_, charityWalletState_) {
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
		/// An item:
		///    Property key is bidder address.
		///    Property value is an object equivalent to `ICosmicSignatureGameStorage.BidderInfo` in Solidity.
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
		roundActivationTime: await contracts_.cosmicSignatureGameProxy.roundActivationTime(),
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

		/// [Comment-202504221]
		/// Property key is NFT ID.
		/// Property value is `bool`.
		/// [/Comment-202504221]
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
		cosmicSignatureTokenState: cosmicSignatureTokenState_,
		randomWalkNftState: randomWalkNftState_,
		cosmicSignatureNftState: cosmicSignatureNftState_,
		prizesWalletState: prizesWalletState_,
		stakingWalletRandomWalkNftState: stakingWalletRandomWalkNftState_,
		stakingWalletCosmicSignatureNftState: stakingWalletCosmicSignatureNftState_,
		// marketingWalletState:
		marketingWalletCstContributionAmount: 300n * 10n ** 18n,
		charityWalletState: charityWalletState_,
		charityEthDonationAmountPercentage: 10n,

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
			const initialDurationUntilMainPrize_ = this.mainPrizeTimeIncrementInMicroSeconds / this.initialDurationUntilMainPrizeDivisor;
			return initialDurationUntilMainPrize_;
		},

		// #endregion
		// #region `getDurationUntilMainPrize`

		getDurationUntilMainPrize: function(latestBlock_) {
			return this.mainPrizeTime - BigInt(latestBlock_.timestamp);
		},

		// #endregion
		// #region `getMainPrizeTimeIncrement`

		getMainPrizeTimeIncrement: function() {
			const mainPrizeTimeIncrement_ = this.mainPrizeTimeIncrementInMicroSeconds / 1_000_000n;
			return mainPrizeTimeIncrement_;
		},

		// #endregion
		// #region `_extendMainPrizeTime`

		_extendMainPrizeTime: function(transactionBlock_) {
			const mainPrizeCorrectedTime_ = BigInt(Math.max(Number(this.mainPrizeTime), transactionBlock_.timestamp));
			const mainPrizeTimeIncrement_ = this.getMainPrizeTimeIncrement();
			this.mainPrizeTime = mainPrizeCorrectedTime_ + mainPrizeTimeIncrement_;
		},

		// #endregion
		// #region `setRoundActivationTime`

		setRoundActivationTime: function(newValue_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(typeof newValue_ === "bigint");
			expect(newValue_ >= 0n);
			this.roundActivationTime = newValue_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureGameProxy,
				"RoundActivationTimeChanged",
				[newValue_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `donateEth`

		donateEth: function(donorAddress_, amount_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			assertAddressIsValid(donorAddress_);
			expect(typeof amount_ === "bigint");
			expect(amount_ >= 0n);
			this.ethBalanceAmount += amount_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureGameProxy,
				"EthDonated",
				[this.roundNum, donorAddress_, amount_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `donateEthWithInfo`

		donateEthWithInfo: function(donorAddress_, amount_, data_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			assertAddressIsValid(donorAddress_);
			expect(typeof amount_ === "bigint");
			expect(amount_ >= 0n);
			expect(typeof data_ === "string");
			this.ethBalanceAmount += amount_;
			const newEthDonationWithInfoRecordIndex_ = this.numEthDonationWithInfoRecords();
			this.ethDonationWithInfoRecords.push(
				{ roundNum: this.roundNum,
					donorAddress: donorAddress_,
					amount: amount_,
					data: data_,
				}
			);
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureGameProxy,
				"EthDonatedWithInfo",
				[this.roundNum, donorAddress_, amount_, newEthDonationWithInfoRecordIndex_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `numEthDonationWithInfoRecords`

		numEthDonationWithInfoRecords: function() {
			return BigInt(this.ethDonationWithInfoRecords.length);
		},

		// #endregion
		// #region `getEthDonationWithInfoRecord`

		getEthDonationWithInfoRecord: function(index_) {
			expect(typeof index_ === "bigint");
			const ethDonationWithInfoRecord_ = this.ethDonationWithInfoRecords[Number(index_)];
			return ethDonationWithInfoRecord_;
		},

		// #endregion
		// #region `getTotalNumBids`

		getTotalNumBids: function() {
			return BigInt(this.bidderAddresses.length);
		},

		// #endregion
		// #region `getBidderAddressAt`

		getBidderAddressAt: function(bidIndex_) {
			expect(typeof bidIndex_ === "bigint");
			const bidderAddress_ = this.bidderAddresses[Number(bidIndex_)];
			return bidderAddress_;
		},

		// #endregion
		// #region `getBidderInfo`

		/// Solidity autogenerates a similar method.
		/// In the contarct, a remotely similar method is named `getBidderTotalSpentAmounts`.
		getBidderInfo: function(bidderAddress_) {
			// expect(bidderAddress_).properAddress;
			const bidderInfo_ = this.biddersInfo[bidderAddress_];
			expect(bidderInfo_ !== undefined);
			return bidderInfo_;
		},

		// #endregion
		// #region `_updateChampionsIfNeeded`

		_updateChampionsIfNeeded: function(transactionBlock_) {
			const lastBidTimeStampCopy_ = this.biddersInfo[this.lastBidderAddress].lastBidTimeStamp;
			const lastBidDuration_ = BigInt(transactionBlock_.timestamp) - lastBidTimeStampCopy_;
			if (this.enduranceChampionAddress === hre.ethers.ZeroAddress) {
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
			expect(typeof chronoEndTimeStamp_ === "bigint");
			expect(chronoEndTimeStamp_ > 0n);
			const chronoStartTimeStamp_ = this.enduranceChampionStartTimeStamp + this.prevEnduranceChampionDuration;
			const chronoDuration_ = chronoEndTimeStamp_ - chronoStartTimeStamp_;
			if (chronoDuration_ > this.chronoWarriorDuration) {
				this.chronoWarriorAddress = this.enduranceChampionAddress;
				this.chronoWarriorDuration = chronoDuration_;
			}
		},

		// #endregion
		// todo-1 Do we need `bidWithEthAndDonateToken`?
		// todo-1 Do we need  `bidWithEthAndDonateNft`?
		// #region `canBidWithEth`

		/// Issue. To keep it simple, this method doesn't assert that the bidder has enough ETH.
		/// If they don't the test would fail.
		canBidWithEth: async function(transactionBlock_, bidderAddress_, value_, randomWalkNftId_, message_, paidEthPrice_, contracts_, transactionResponseFuture_) {
			assertAddressIsValid(bidderAddress_);
			expect(typeof value_ === "bigint");
			expect(value_ >= 0n);
			expect(typeof randomWalkNftId_ === "bigint");
			expect(typeof message_ === "string");
			expect(typeof paidEthPrice_ === "bigint");
			expect(paidEthPrice_ > 0n);
			const overpaidEthPrice_ = value_ - paidEthPrice_;
			if ( ! (overpaidEthPrice_ >= 0n) ) {
				// console.info("202504151");
				await expect(transactionResponseFuture_)
					.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InsufficientReceivedBidAmount")
					.withArgs("The current ETH bid price is greater than the amount you transferred.", paidEthPrice_, value_);
				return false;
			}
			if (randomWalkNftId_ < 0n) {
				// console.info("202505125");
			} else {
				if (this.usedRandomWalkNfts[randomWalkNftId_]) {
					// console.info("202504152");
					await expect(transactionResponseFuture_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "UsedRandomWalkNft")
						.withArgs("This Random Walk NFT has already been used for bidding.", randomWalkNftId_);
					return false;
				}
				if ( ! (bidderAddress_ === this.randomWalkNftState.ownerOf(randomWalkNftId_)) ) {
					// console.info("202504153");
					await expect(transactionResponseFuture_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CallerIsNotNftOwner")
						.withArgs("You are not the owner of this Random Walk NFT.", contracts_.randomWalkNftAddr, randomWalkNftId_, bidderAddress_);
					return false;
				}
			}
			if ( ! (message_.length <= this.bidMessageLengthMaxLimit) ) {
				// console.info("202504154");
				await expect(transactionResponseFuture_)
					.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "TooLongBidMessage")
					.withArgs("Message is too long.", message_.length);
				return false;
			}
			if (this.lastBidderAddress == hre.ethers.ZeroAddress) {
				if ( ! (BigInt(transactionBlock_.timestamp) >= this.roundActivationTime) ) {
					// console.info("202504155");
					await expect(transactionResponseFuture_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsInactive")
						.withArgs("The current bidding round is not active yet.", this.roundActivationTime, BigInt(transactionBlock_.timestamp));
					return false;
				}
			}
			return true;
		},

		// #endregion
		// #region `bidWithEth`

		/// Assuming that `canBidWithEth` returned `true`.
		bidWithEth: async function(transactionBlock_, bidderAddress_, bidderEthBalanceAmountBeforeTransaction_, value_, randomWalkNftId_, message_, ethBidPrice_, paidEthPrice_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			// // [Comment-202505093]
			// // We will assert this near Comment-202505086.
			// // [/Comment-202505093]
			// assertAddressIsValid(bidderAddress_);

			expect(typeof bidderEthBalanceAmountBeforeTransaction_ === "bigint");

			// If this was zero the transaction would fail.
			expect(bidderEthBalanceAmountBeforeTransaction_ > 0n);

			expect(typeof value_ === "bigint");
			expect(value_ >= 0n);
			expect(typeof randomWalkNftId_ === "bigint");
			expect(typeof message_ === "string");
			expect(typeof ethBidPrice_ === "bigint");
			expect(ethBidPrice_ > 0n);
			expect(typeof paidEthPrice_ === "bigint");
			expect(paidEthPrice_ > 0n);
			let overpaidEthPrice_ = value_ - paidEthPrice_;
			// console.info("bidWithEth succeeded.", hre.ethers.formatEther(ethBidPrice_), hre.ethers.formatEther(paidEthPrice_), hre.ethers.formatEther(value_), hre.ethers.formatEther(overpaidEthPrice_));
			if (overpaidEthPrice_ == 0n) {
				// console.info("202505081");
			} else if (overpaidEthPrice_ > 0n) {
				// Comment-202505117 relates.
				// const blockBaseFeePerGas_ = await blockchainPropertyGetter_.getBlockBaseFeePerGas();
				const transactionBlockBaseFeePerGas_ = transactionBlock_.baseFeePerGas;
				expect(transactionBlockBaseFeePerGas_ > 0n);
				const ethBidRefundAmountMinLimit_ = this.ethBidRefundAmountInGasMinLimit * transactionBlockBaseFeePerGas_;
				if (overpaidEthPrice_ < ethBidRefundAmountMinLimit_) {
					overpaidEthPrice_ = 0n;
					paidEthPrice_ = value_;
					// ethBidPrice_ = value_;
					// if (randomWalkNftId_ < 0n) {
					// 	console.info("202505094", hre.ethers.formatEther(ethBidPrice_), hre.ethers.formatEther(paidEthPrice_));
					// } else {
					// 	ethBidPrice_ *= this.RANDOMWALK_NFT_BID_PRICE_DIVISOR;
					// 	console.info("202505095", hre.ethers.formatEther(ethBidPrice_), hre.ethers.formatEther(paidEthPrice_));
					// }
					// console.info("202505145");
				} else {
					// console.info("202505087");
				}
			} else {
				expect(false);
			}
			if (randomWalkNftId_ < 0n) {
				// console.info("202505088");
			} else {
				// console.info("202505089");
				this.usedRandomWalkNfts[randomWalkNftId_] = true;
			}
			this.biddersInfo[bidderAddress_].totalSpentEthAmount += paidEthPrice_;
			if (this.lastBidderAddress == hre.ethers.ZeroAddress) {
				// console.info("202505115", hre.ethers.formatEther(ethBidPrice_));
				this.ethDutchAuctionBeginningBidPrice = ethBidPrice_ * this.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
			} else {
				// console.info("202505126");
			}
			this.nextEthBidPrice = ethBidPrice_ + ethBidPrice_ / this.ethBidPriceIncreaseDivisor + 1n;

			// [Comment-202505086/]
			this.cosmicSignatureTokenState.mint(bidderAddress_, this.cstRewardAmountForBidding, contracts_, transactionReceipt_, eventIndexWrapper_);

			if (this.lastBidderAddress == hre.ethers.ZeroAddress) {
				this.cstDutchAuctionBeginningTimeStamp = BigInt(transactionBlock_.timestamp);
				this.mainPrizeTime = BigInt(transactionBlock_.timestamp) + this.getInitialDurationUntilMainPrize();
				assertEvent(
					transactionReceipt_.logs[eventIndexWrapper_.value],
					contracts_.cosmicSignatureGameProxy,
					"FirstBidPlacedInRound",
					[this.roundNum, BigInt(transactionBlock_.timestamp),]
				);
				++ eventIndexWrapper_.value;
			} else {
				this._updateChampionsIfNeeded(transactionBlock_);
				this._extendMainPrizeTime(transactionBlock_);
			}
			this.lastBidderAddress = bidderAddress_;
			this.bidderAddresses.push(bidderAddress_);
			this.biddersInfo[bidderAddress_].lastBidTimeStamp = BigInt(transactionBlock_.timestamp);
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureGameProxy,
				"BidPlaced",
				[this.roundNum, bidderAddress_, paidEthPrice_, (-1n), randomWalkNftId_, message_, this.mainPrizeTime,]
			);
			++ eventIndexWrapper_.value;

			// todo-1 Not testing refund transfer error.
			// todo-1 Reference where we test it.
			this.ethBalanceAmount += paidEthPrice_;
			const transactionFeeInEth_ =
				transactionReceipt_.gasUsed * (transactionReceipt_.effectiveGasPrice ?? transactionReceipt_.gasPrice);
			expect(transactionFeeInEth_ > 0n);
			const bidderEthBalanceAmountAfterTransaction_ = await hre.ethers.provider.getBalance(bidderAddress_);
			expect(bidderEthBalanceAmountAfterTransaction_).equal(bidderEthBalanceAmountBeforeTransaction_ - paidEthPrice_ - transactionFeeInEth_);
		},

		// #endregion
		// #region `getNextEthBidPrice`

		getNextEthBidPrice: function(blockBeforeTransaction_, currentTimeOffset_) {
			expect(typeof currentTimeOffset_ === "bigint");
			let nextEthBidPrice_;
			if (this.lastBidderAddress === hre.ethers.ZeroAddress) {
				nextEthBidPrice_ = this.ethDutchAuctionBeginningBidPrice;
				if (nextEthBidPrice_ === 0n) {
					// console.info("202505127");
					nextEthBidPrice_ = this.FIRST_ROUND_INITIAL_ETH_BID_PRICE;
				} else {
					const ethDutchAuctionElapsedDuration_ = this.getDurationElapsedSinceRoundActivation(blockBeforeTransaction_) + currentTimeOffset_;
					if (ethDutchAuctionElapsedDuration_ <= 0n) {
						// console.info("202505128");
					} else {
						// Comment-202501301 applies.
						const ethDutchAuctionEndingBidPrice_ = nextEthBidPrice_ / this.ethDutchAuctionEndingBidPriceDivisor + 1n;

						const ethDutchAuctionDuration_ = this._getEthDutchAuctionDuration();
						if (ethDutchAuctionElapsedDuration_ < ethDutchAuctionDuration_) {
							// console.info("202505129");
							const ethDutchAuctionBidPriceDifference_ = nextEthBidPrice_ - ethDutchAuctionEndingBidPrice_;
							nextEthBidPrice_ -= ethDutchAuctionBidPriceDifference_ * ethDutchAuctionElapsedDuration_ / ethDutchAuctionDuration_;
						} else {
							// console.info("202505131");
							nextEthBidPrice_ = ethDutchAuctionEndingBidPrice_;
						}
					}
				}
			} else {
				// console.info("202505132");
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
		// #region `getEthDutchAuctionDurations`

		// We don't need this.

		// #endregion
		// #region `_getEthDutchAuctionDuration`

		_getEthDutchAuctionDuration: function() {
			const ethDutchAuctionDuration_ = this.mainPrizeTimeIncrementInMicroSeconds / this.ethDutchAuctionDurationDivisor;
			return ethDutchAuctionDuration_;
		},

		// #endregion
		// todo-1 Do we need  `bidWithCstAndDonateToken`?
		// todo-1 Do we need  `bidWithCstAndDonateNft`?
		// #region `canBidWithCst`

		canBidWithCst: async function(transactionBlock_, bidderAddress_, cstPriceToPayMaxLimit_, message_, paidCstPrice_, contracts_, transactionResponseFuture_) {
			// assertAddressIsValid(bidderAddress_);
			expect(bidderAddress_ !== hre.ethers.ZeroAddress);
			expect(typeof cstPriceToPayMaxLimit_ === "bigint");
			expect(cstPriceToPayMaxLimit_ >= 0n);
			expect(typeof message_ === "string");
			expect(typeof paidCstPrice_ === "bigint");
			expect(paidCstPrice_ >= 0n);
			if ( ! (paidCstPrice_ <= cstPriceToPayMaxLimit_) ) {
				// console.info("202504166");
				await expect(transactionResponseFuture_)
					.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InsufficientReceivedBidAmount")
					.withArgs("The current CST bid price is greater than the maximum you allowed.", paidCstPrice_, cstPriceToPayMaxLimit_);
				return false;
			}
			const bidderCstBalanceBeforeTransaction_ = this.cosmicSignatureTokenState.balanceOf(bidderAddress_);
			if ( ! (paidCstPrice_ <= bidderCstBalanceBeforeTransaction_) ) {
				// console.info("202504167");
				await expect(transactionResponseFuture_)
					.revertedWithCustomError(contracts_.cosmicSignatureToken, "ERC20InsufficientBalance")
					.withArgs(bidderAddress_, bidderCstBalanceBeforeTransaction_, paidCstPrice_);
				return false;
			}
			if ( ! (message_.length <= this.bidMessageLengthMaxLimit) ) {
				// console.info("202504168");
				await expect(transactionResponseFuture_)
					.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "TooLongBidMessage")
					.withArgs("Message is too long.", message_.length);
				return false;
			}
			if (this.lastBidderAddress == hre.ethers.ZeroAddress) {
				if ( ! (BigInt(transactionBlock_.timestamp) >= this.roundActivationTime) ) {
					// console.info("202504169");
					await expect(transactionResponseFuture_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsInactive")
						.withArgs("The current bidding round is not active yet.", this.roundActivationTime, BigInt(transactionBlock_.timestamp));
					return false;
				}
				// console.info("202504171");
				await expect(transactionResponseFuture_)
					.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "WrongBidType")
					.withArgs("The first bid in a bidding round shall be ETH.");
				return false;
			}
			return true;
		},

		// #endregion
		// #region `bidWithCst`

		/// Assuming that `canBidWithCst` returned `true`.
		bidWithCst: /*async*/ function(transactionBlock_, bidderAddress_, message_, paidCstPrice_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			// // Comment-202505093 applies..
			// assertAddressIsValid(bidderAddress_);

			expect(typeof message_ === "string");
			expect(typeof paidCstPrice_ === "bigint");
			expect(paidCstPrice_ >= 0n);
			// console.info("bidWithCst succeeded.", hre.ethers.formatEther(paidCstPrice_));

			// Comment-202505086 applies.
			this.cosmicSignatureTokenState.burn(bidderAddress_, paidCstPrice_, contracts_, transactionReceipt_, eventIndexWrapper_);
			this.cosmicSignatureTokenState.mint(bidderAddress_, this.cstRewardAmountForBidding, contracts_, transactionReceipt_, eventIndexWrapper_);

			this.biddersInfo[bidderAddress_].totalSpentCstAmount += paidCstPrice_;
			this.cstDutchAuctionBeginningTimeStamp = BigInt(transactionBlock_.timestamp);
			let newCstDutchAuctionBeginningBidPrice_ = paidCstPrice_ * this.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
			if (newCstDutchAuctionBeginningBidPrice_ < this.cstDutchAuctionBeginningBidPriceMinLimit) {
				newCstDutchAuctionBeginningBidPrice_ = this.cstDutchAuctionBeginningBidPriceMinLimit;
			}
			this.cstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;
			if (this.lastCstBidderAddress == hre.ethers.ZeroAddress) {
				// Comment-202504212 applies.
				this.nextRoundFirstCstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;
			}
			this.lastCstBidderAddress = bidderAddress_;
			expect(this.lastBidderAddress != hre.ethers.ZeroAddress);
			this._updateChampionsIfNeeded(transactionBlock_);
			this._extendMainPrizeTime(transactionBlock_);
			this.lastBidderAddress = bidderAddress_;
			this.bidderAddresses.push(bidderAddress_);
			this.biddersInfo[bidderAddress_].lastBidTimeStamp = BigInt(transactionBlock_.timestamp);
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureGameProxy,
				"BidPlaced",
				[this.roundNum, bidderAddress_, (-1n), paidCstPrice_, (-1n), message_, this.mainPrizeTime,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `getNextCstBidPrice`

		getNextCstBidPrice: function(blockBeforeTransaction_, currentTimeOffset_) {
			expect(typeof currentTimeOffset_ === "bigint");
			/*const*/ let [cstDutchAuctionDuration_, cstDutchAuctionRemainingDuration_] = this._getCstDutchAuctionTotalAndRemainingDurations(blockBeforeTransaction_);
			cstDutchAuctionRemainingDuration_ -= currentTimeOffset_;
			if (cstDutchAuctionRemainingDuration_ <= 0n) {
				// console.info("202505133");
				return 0n;
			}
			// console.info("202505134");

			// Comment-202501307 relates and/or applies.
			const cstDutchAuctionBeginningBidPrice_ =
				(this.lastCstBidderAddress === hre.ethers.ZeroAddress) ? this.nextRoundFirstCstDutchAuctionBeginningBidPrice : this.cstDutchAuctionBeginningBidPrice;

			const nextCstBidPrice_ = cstDutchAuctionBeginningBidPrice_ * cstDutchAuctionRemainingDuration_ / cstDutchAuctionDuration_;
			return nextCstBidPrice_;
		},

		// #endregion
		// #region `getCstDutchAuctionDurations`

		// We don't need this.

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
		// #region `resetBiddersInfo`

		resetBiddersInfo: function(contracts_) {
			for (const signer_ of contracts_.signers) {
				this.biddersInfo[signer_.address] = {
					totalSpentEthAmount: 0n,
					totalSpentCstAmount: 0n,
					lastBidTimeStamp: 0n,
				};
			}
		},

		// #endregion
		// #region // `updateBidderInfo`

		// updateBidderInfo: function(bidderAddress_, transactionBlock_) {
		// 	assertAddressIsValid(bidderAddress_);
		// 	this.biddersInfo[bidderAddress_] = BigInt(transactionBlock_.timestamp);
		// },

		// #endregion
		// #region `getChronoWarriorEthPrizeAmount`

		getChronoWarriorEthPrizeAmount: function() {
			return this.ethBalanceAmount * this.chronoWarriorEthPrizeAmountPercentage / 100n;
		},

		// #endregion
		// #region `getRaffleTotalEthPrizeAmountForBidders`

		getRaffleTotalEthPrizeAmountForBidders: function() {
			return this.ethBalanceAmount * this.raffleTotalEthPrizeAmountForBiddersPercentage / 100n;
		},

		// #endregion
		// #region `getCosmicSignatureNftStakingTotalEthRewardAmount`

		getCosmicSignatureNftStakingTotalEthRewardAmount: function() {
			return this.ethBalanceAmount * this.cosmicSignatureNftStakingTotalEthRewardAmountPercentage / 100n;
		},

		// #endregion
		// #region `canClaimMainPrize`
		
		canClaimMainPrize: async function(transactionBlock_, callerAddress_, contracts_, transactionResponseFuture_) {
			assertAddressIsValid(callerAddress_);
			if (callerAddress_ == this.lastBidderAddress) {
				if ( ! (BigInt(transactionBlock_.timestamp) >= this.mainPrizeTime) ) {
					// console.info("202504252");
					await expect(transactionResponseFuture_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeEarlyClaim")
						.withArgs("Not enough time has elapsed.", this.mainPrizeTime, BigInt(transactionBlock_.timestamp));
					return false;
				}
			} else {
				if ( ! (this.lastBidderAddress != hre.ethers.ZeroAddress) ) {
					// console.info("202504253");
					await expect(transactionResponseFuture_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "NoBidsPlacedInCurrentRound")
						.withArgs("There have been no bids in the current bidding round yet.");
					return false;
				}
				const durationUntilOperationIsPermitted_ =
					this.getDurationUntilMainPrize(transactionBlock_) + this.timeoutDurationToClaimMainPrize;
				if ( ! (durationUntilOperationIsPermitted_ <= 0n) ) {
					// console.info("202504254");
					await expect(transactionResponseFuture_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeClaimDenied")
						.withArgs(
							"Only the last bidder is permitted to claim the bidding round main prize before a timeout expires.",
							this.lastBidderAddress,
							callerAddress_,
							durationUntilOperationIsPermitted_
						);
					return false;
				}
			}
			return true;
		},

		// #endregion
		// #region `claimMainPrize`
		
		/// Assuming that `canClaimMainPrize` returned `true`.
		claimMainPrize: async function(transactionBlock_, callerAddress_, bidderEthBalanceAmountBeforeTransaction_, contracts_, transactionReceipt_, eventIndexWrapper_, blockchainPropertyGetter_) {
			// console.info((callerAddress_ == this.lastBidderAddress) ? "202505138 The last bidder claims the main prize." : "202505139 Someone else claims the main prize.");
			this._updateChampionsIfNeeded(transactionBlock_);
			this._updateChronoWarriorIfNeeded(BigInt(transactionBlock_.timestamp));
			await this._distributePrizes(transactionBlock_, callerAddress_, bidderEthBalanceAmountBeforeTransaction_, contracts_, transactionReceipt_, eventIndexWrapper_, blockchainPropertyGetter_);
			this._prepareNextRound(transactionBlock_, contracts_, transactionReceipt_, eventIndexWrapper_);
		},

		// #endregion
		// #region `_distributePrizes`
		
		_distributePrizes: async function(transactionBlock_, callerAddress_, bidderEthBalanceAmountBeforeTransaction_, contracts_, transactionReceipt_, eventIndexWrapper_, blockchainPropertyGetter_) {
			// #region

			// assertAddressIsValid(callerAddress_);
			expect(callerAddress_ !== hre.ethers.ZeroAddress);

			expect(typeof bidderEthBalanceAmountBeforeTransaction_ === "bigint");

			// If this was zero the transaction would fail.
			expect(bidderEthBalanceAmountBeforeTransaction_ > 0n);

			// #endregion
			// #region

			let mainEthPrizeAmount_;

			// #endregion
			// #region

			{
				// #region

				// [Comment-202504265]
				// This random number is named "blockchain based" -- to distinquish it from truly random numbers.
				// [/Comment-202504265]
				const blockchainBasedRandomNumberSeedWrapper_ = {/*value: 0n,*/};

				// #endregion
				// #region

				{
					// #region

					let cosmicSignatureTokenMintSpecs_;

					// #endregion
					// #region

					{
						// #region

						let cosmicSignatureNftOwnerAddresses_;
						const cosmicSignatureNftOwnerRandomWalkNftStakerAddressIndex_ = 0;
						let cosmicSignatureNftOwnerLastCstBidderAddressIndex_;
						let cosmicSignatureNftOwnerMainPrizeBeneficiaryAddressIndex_;
						let cosmicSignatureNftOwnerEnduranceChampionAddressIndex_;
						let cosmicSignatureNftOwnerBidderAddressIndex_;
				
						// #endregion
						// #region

						blockchainBasedRandomNumberSeedWrapper_.value = await generateRandomUInt256Seed(transactionBlock_, blockchainPropertyGetter_);

						// #endregion
						// #region CS NFTs for random Random Walk NFT stakers.

						{
							// Comment-202504265 applies.
							const blockchainBasedRandomNumberSeed_ = BigInt.asUintN(256, blockchainBasedRandomNumberSeedWrapper_.value + 0x7c6eeb003d4a6dc5ebf549935c6ffb814ba1f060f1af8a0b11c2aa94a8e716e4n);

							const luckyStakerAddresses_ =
								this.stakingWalletRandomWalkNftState.pickRandomStakerAddressesIfPossible
									(this.numRaffleCosmicSignatureNftsForRandomWalkNftStakers, blockchainBasedRandomNumberSeed_);
							let cosmicSignatureNftIndex_ = cosmicSignatureNftOwnerRandomWalkNftStakerAddressIndex_ + luckyStakerAddresses_.length;
							cosmicSignatureNftOwnerLastCstBidderAddressIndex_ = cosmicSignatureNftIndex_;
							if (this.lastCstBidderAddress != hre.ethers.ZeroAddress) {
								++ cosmicSignatureNftIndex_;
							}
							cosmicSignatureNftOwnerMainPrizeBeneficiaryAddressIndex_ = cosmicSignatureNftIndex_;
							++ cosmicSignatureNftIndex_;
							cosmicSignatureNftOwnerEnduranceChampionAddressIndex_ = cosmicSignatureNftIndex_;
							++ cosmicSignatureNftIndex_;
							cosmicSignatureNftOwnerBidderAddressIndex_ = cosmicSignatureNftIndex_;
							const numCosmicSignatureNfts_ = cosmicSignatureNftIndex_ + Number(this.numRaffleCosmicSignatureNftsForBidders);
							cosmicSignatureNftOwnerAddresses_ = new Array(numCosmicSignatureNfts_);
							for (let luckyStakerIndex_ = luckyStakerAddresses_.length; ( -- luckyStakerIndex_ ) >= 0; ) {
								const luckyStakerAddress_ = luckyStakerAddresses_[luckyStakerIndex_];
								// console.info("202504295", luckyStakerAddress_);
								cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftOwnerRandomWalkNftStakerAddressIndex_ + luckyStakerIndex_] = luckyStakerAddress_;
							}
						}

						// #endregion
						// #region

						const cstPrizeAmount_ = this.getTotalNumBids() * this.cstPrizeAmountMultiplier;

						// #endregion
						// #region CST and CS NFT for the last CST bidder.

						if (this.lastCstBidderAddress != hre.ethers.ZeroAddress) {
							// console.info("202505102");
							cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftOwnerLastCstBidderAddressIndex_] = this.lastCstBidderAddress;
							cosmicSignatureTokenMintSpecs_ = Array(3);
							cosmicSignatureTokenMintSpecs_[2] = {account: this.lastCstBidderAddress, value: cstPrizeAmount_,};
						} else {
							// console.info("202505103");
							cosmicSignatureTokenMintSpecs_ = Array(2);
						}
	
						// #endregion
						// #region CS NFT for the Main Prize Beneficiary.

						cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftOwnerMainPrizeBeneficiaryAddressIndex_] = callerAddress_;

						// #endregion
						// #region CST and CS NFT for Endurance Champion.

						cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftOwnerEnduranceChampionAddressIndex_] = this.enduranceChampionAddress;
						cosmicSignatureTokenMintSpecs_[1] = {account: this.enduranceChampionAddress, value: cstPrizeAmount_,};

						// #endregion
						// #region CS NFTs for random bidders.

						{
							let cosmicSignatureNftIndex_ = cosmicSignatureNftOwnerAddresses_.length;
							do {
								// Comment-202504265 applies.
								const blockchainBasedRandomNumber_ = generateRandomUInt256FromSeedWrapper(blockchainBasedRandomNumberSeedWrapper_);

								const raffleWinnerAddress_ = this.bidderAddresses[Number(blockchainBasedRandomNumber_ % this.getTotalNumBids())];
								-- cosmicSignatureNftIndex_;
								cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_] = raffleWinnerAddress_;
							} while (cosmicSignatureNftIndex_ > cosmicSignatureNftOwnerBidderAddressIndex_);
						}

						// #endregion
						// #region

						let firstCosmicSignatureNftId_;

						// #endregion
						// #region Minting CS NFTs.

						{
							// Comment-202504265 applies.
							const blockchainBasedRandomNumberSeed_ = BigInt.asUintN(256, blockchainBasedRandomNumberSeedWrapper_.value + 0x2a8612ecb5cb17da87f8befda0480288e2d053de55d9d7d4dc4899077cf5aedan);

							firstCosmicSignatureNftId_ = this.cosmicSignatureNftState.mintMany(this.roundNum, cosmicSignatureNftOwnerAddresses_, blockchainBasedRandomNumberSeed_, contracts_, transactionReceipt_, eventIndexWrapper_);
						}

						// #endregion
						// #region Processing CS NFTs.

						{
							// #region

							let cosmicSignatureNftIndex_ = cosmicSignatureNftOwnerAddresses_.length;
							let cosmicSignatureNftId_ = firstCosmicSignatureNftId_ + BigInt(cosmicSignatureNftIndex_);
	
							// #endregion
							// #region CS NFTs for random bidders.

							{
								let winnerIndex_ = cosmicSignatureNftIndex_ - cosmicSignatureNftOwnerBidderAddressIndex_;
								do {
									-- winnerIndex_;
									-- cosmicSignatureNftId_;
									-- cosmicSignatureNftIndex_;
									const raffleWinnerAddress_ = cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_];
									assertEvent(
										transactionReceipt_.logs[eventIndexWrapper_.value],
										contracts_.cosmicSignatureGameProxy,
										"RaffleWinnerCosmicSignatureNftAwarded",
										[this.roundNum, false, BigInt(winnerIndex_), raffleWinnerAddress_, cosmicSignatureNftId_,]
									);
									++ eventIndexWrapper_.value;
								} while (winnerIndex_ > 0);
							}

							// #endregion
							// #region CST and CS NFT for Endurance Champion.

							-- cosmicSignatureNftIndex_;
							-- cosmicSignatureNftId_;
							assertEvent(
								transactionReceipt_.logs[eventIndexWrapper_.value],
								contracts_.cosmicSignatureGameProxy,
								"EnduranceChampionPrizePaid",
								[this.roundNum, cosmicSignatureTokenMintSpecs_[1].account, cstPrizeAmount_, cosmicSignatureNftId_,]
							);
							++ eventIndexWrapper_.value;

							// #endregion
							// #region ETH and CS NFT for the Main Prize Beneficiary.

							mainEthPrizeAmount_ = this.getMainEthPrizeAmount();
							-- cosmicSignatureNftIndex_;
							-- cosmicSignatureNftId_;
							assertEvent(
								transactionReceipt_.logs[eventIndexWrapper_.value],
								contracts_.cosmicSignatureGameProxy,
								"MainPrizeClaimed",
								[this.roundNum, callerAddress_, mainEthPrizeAmount_, cosmicSignatureNftId_,]
							);
							++ eventIndexWrapper_.value;

							// #endregion
							// #region CST and CS NFT for the last CST bidder.

							if (cosmicSignatureTokenMintSpecs_.length > 2) {
								-- cosmicSignatureNftIndex_;
								-- cosmicSignatureNftId_;
								assertEvent(
									transactionReceipt_.logs[eventIndexWrapper_.value],
									contracts_.cosmicSignatureGameProxy,
									"LastCstBidderPrizePaid",
									[this.roundNum, cosmicSignatureTokenMintSpecs_[2].account, cstPrizeAmount_, cosmicSignatureNftId_,]
								);
								++ eventIndexWrapper_.value;
							}

							// #endregion
							// #region CS NFTs for random Random Walk NFT stakers.

							while (cosmicSignatureNftIndex_ > 0) {
								-- cosmicSignatureNftId_;
								-- cosmicSignatureNftIndex_;
								const luckyStakerAddress_ = cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_];
								assertEvent(
									transactionReceipt_.logs[eventIndexWrapper_.value],
									contracts_.cosmicSignatureGameProxy,
									"RaffleWinnerCosmicSignatureNftAwarded",
									[this.roundNum, true, BigInt(cosmicSignatureNftIndex_), luckyStakerAddress_, cosmicSignatureNftId_,]
								);
								++ eventIndexWrapper_.value;
							}

							// #endregion
						}

						// #endregion
					}

					// #endregion
					// #region CST for Marketing Wallet.

					cosmicSignatureTokenMintSpecs_[0] = {account: contracts_.marketingWalletAddr, value: this.marketingWalletCstContributionAmount,};

					// #endregion
					// #region Minting CSTs.

					this.cosmicSignatureTokenState.mintMany(cosmicSignatureTokenMintSpecs_, contracts_, transactionReceipt_, eventIndexWrapper_);

					// #endregion
				}

				// #endregion
				// #region

				{
					// #region

					let charityEthDonationAmount_;

					// #endregion
					// #region

					{
						// #region

						let cosmicSignatureNftStakingTotalEthRewardAmount_;

						// #endregion
						// #region

						{
							// #region

							let ethDepositIndex_ = Number(this.numRaffleEthPrizesForBidders);
							const ethDeposits_ = new Array(ethDepositIndex_ + 1);
							let ethDepositsTotalAmount_ = 0n;

							// #endregion
							// #region ETH for Chrono-Warrior.

							{
								const chronoWarriorEthPrizeAmount_ = this.getChronoWarriorEthPrizeAmount();
								ethDeposits_[ethDepositIndex_] =
									{ prizeWinnerAddress: this.chronoWarriorAddress,
									  amount: chronoWarriorEthPrizeAmount_,
									};
								ethDepositsTotalAmount_ += chronoWarriorEthPrizeAmount_;
								assertEvent(
									transactionReceipt_.logs[eventIndexWrapper_.value],
									contracts_.cosmicSignatureGameProxy,
									"ChronoWarriorEthPrizeAllocated",
									[this.roundNum, this.chronoWarriorAddress, chronoWarriorEthPrizeAmount_,]
								);
								++ eventIndexWrapper_.value;
							}

							// #endregion
							// #region ETH for random bidders.

							{
								const raffleTotalEthPrizeAmountForBidders_ = this.getRaffleTotalEthPrizeAmountForBidders();
								const raffleEthPrizeAmountForBidder_ = raffleTotalEthPrizeAmountForBidders_ / BigInt(ethDepositIndex_);
								ethDepositsTotalAmount_ += raffleEthPrizeAmountForBidder_ * BigInt(ethDepositIndex_);
								do {
									-- ethDepositIndex_;

									// Comment-202504265 applies.
									const blockchainBasedRandomNumber_ = generateRandomUInt256FromSeedWrapper(blockchainBasedRandomNumberSeedWrapper_);

									const raffleWinnerAddress_ = this.bidderAddresses[Number(blockchainBasedRandomNumber_ % this.getTotalNumBids())];
									ethDeposits_[ethDepositIndex_] = {prizeWinnerAddress: raffleWinnerAddress_, amount: raffleEthPrizeAmountForBidder_,};
									assertEvent(
										transactionReceipt_.logs[eventIndexWrapper_.value],
										contracts_.cosmicSignatureGameProxy,
										"RaffleWinnerBidderEthPrizeAllocated",
										[this.roundNum, BigInt(ethDepositIndex_), raffleWinnerAddress_, raffleEthPrizeAmountForBidder_,]
									);
									++ eventIndexWrapper_.value;
								} while (ethDepositIndex_ > 0);
							}

							// #endregion
							// #region

							charityEthDonationAmount_ = this.getCharityEthDonationAmount();
							cosmicSignatureNftStakingTotalEthRewardAmount_ = this.getCosmicSignatureNftStakingTotalEthRewardAmount();
							this.depositEthToPrizesWalletMany(ethDepositsTotalAmount_, ethDeposits_, contracts_, transactionReceipt_, eventIndexWrapper_);

							// #endregion
						}

						// #endregion
						// #region ETH for Cosmic Signature NFT stakers.

						if (this.tryDepositEthToStakingWalletCosmicSignatureNft(cosmicSignatureNftStakingTotalEthRewardAmount_, contracts_, transactionReceipt_, eventIndexWrapper_)) {
							// Doing nothing.
						} else {
							charityEthDonationAmount_ += cosmicSignatureNftStakingTotalEthRewardAmount_;

							// Comment-202504262 applies.
						}

						// #endregion
					}

					// #endregion
					// #region ETH for charity.

					this.depositEthToCharityWallet(charityEthDonationAmount_, contracts_, transactionReceipt_, eventIndexWrapper_);
					assertEvent(
						transactionReceipt_.logs[eventIndexWrapper_.value],
						contracts_.cosmicSignatureGameProxy,
						"FundsTransferredToCharity",
						[contracts_.charityWalletAddr, charityEthDonationAmount_,]
					);
					++ eventIndexWrapper_.value;

					// #endregion
				}

				// #endregion
			}

			// #endregion
			// #region Main ETH prize for main prize beneficiary.

			this.ethBalanceAmount -= mainEthPrizeAmount_;
			// expect(this.ethBalanceAmount >= 0n);
			const bidderEthBalanceAmountAfterTransaction_ = await hre.ethers.provider.getBalance(callerAddress_);
			const transactionFeeInEth_ =
				transactionReceipt_.gasUsed * (transactionReceipt_.effectiveGasPrice ?? transactionReceipt_.gasPrice);
			expect(transactionFeeInEth_ > 0n);
			expect(bidderEthBalanceAmountAfterTransaction_).equal(bidderEthBalanceAmountBeforeTransaction_ - transactionFeeInEth_ + mainEthPrizeAmount_);

			// #endregion
		},

		// #endregion
		// #region `_prepareNextRound`

		_prepareNextRound: /*async*/ function(transactionBlock_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			this.lastBidderAddress = hre.ethers.ZeroAddress;
			this.lastCstBidderAddress = hre.ethers.ZeroAddress;
			this.bidderAddresses.length = 0;
			this.resetBiddersInfo(contracts_);
			this.enduranceChampionAddress = hre.ethers.ZeroAddress;
			this.prevEnduranceChampionDuration = 0n;
			this.chronoWarriorAddress = hre.ethers.ZeroAddress;
			this.chronoWarriorDuration = (-1n);
			++ this.roundNum;
			this.mainPrizeTimeIncrementInMicroSeconds += this.mainPrizeTimeIncrementInMicroSeconds / this.mainPrizeTimeIncrementIncreaseDivisor;
			this.setRoundActivationTime(BigInt(transactionBlock_.timestamp) + this.delayDurationBeforeRoundActivation, contracts_, transactionReceipt_, eventIndexWrapper_);
		},

		// #endregion
		// #region `getMainEthPrizeAmount`

		getMainEthPrizeAmount: function() {
			return this.ethBalanceAmount * this.mainEthPrizeAmountPercentage / 100n;
		},

		// #endregion
		// #region `getCharityEthDonationAmount`

		getCharityEthDonationAmount: function() {
			return this.ethBalanceAmount * this.charityEthDonationAmountPercentage / 100n;
		},

		// #endregion
		// #region `depositEthToPrizesWalletMany`

		depositEthToPrizesWalletMany: function(value_, ethDeposits_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			const newEthBalanceAmount_ = this.ethBalanceAmount - value_;
			expect(newEthBalanceAmount_ >= 0n);
			this.ethBalanceAmount = newEthBalanceAmount_;
			this.prizesWalletState.depositEthMany(value_, this.roundNum, ethDeposits_, contracts_, transactionReceipt_, eventIndexWrapper_);
		},

		// #endregion
		// #region `tryDepositEthToStakingWalletCosmicSignatureNft`

		tryDepositEthToStakingWalletCosmicSignatureNft: function(value_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			const isSuccess_ = this.stakingWalletCosmicSignatureNftState.tryDeposit(value_, this.roundNum, contracts_, transactionReceipt_, eventIndexWrapper_);
			if (isSuccess_) {
				const newEthBalanceAmount_ = this.ethBalanceAmount - value_;
				expect(newEthBalanceAmount_ >= 0n);
				this.ethBalanceAmount = newEthBalanceAmount_;
			}
			return isSuccess_;
		},

		// #endregion
		// #region `depositEthToCharityWallet`

		depositEthToCharityWallet: function(value_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			const newEthBalanceAmount_ = this.ethBalanceAmount - value_;
			expect(newEthBalanceAmount_ >= 0n);
			this.ethBalanceAmount = newEthBalanceAmount_;
			this.charityWalletState.receive(contracts_.cosmicSignatureGameProxyAddr, value_, contracts_, transactionReceipt_, eventIndexWrapper_);
		},

		// #endregion
		// #region `initialize`

		initialize: function(contracts_) {
			this.resetBiddersInfo(contracts_);
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

async function assertCosmicSignatureGameProxyState(cosmicSignatureGameProxyState_, contracts_, randomNumberSeedWrapper_) {
	expect(await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddr)).equal(cosmicSignatureGameProxyState_.ethBalanceAmount);
	expect(await contracts_.cosmicSignatureGameProxy.numEthDonationWithInfoRecords()).equal(cosmicSignatureGameProxyState_.numEthDonationWithInfoRecords());
	await assertCosmicSignatureGameProxyStateOfRandomEthDonationWithInfoRecordIfPossible(cosmicSignatureGameProxyState_, contracts_, randomNumberSeedWrapper_);
	expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(cosmicSignatureGameProxyState_.lastBidderAddress);
	expect(await contracts_.cosmicSignatureGameProxy.lastCstBidderAddress()).equal(cosmicSignatureGameProxyState_.lastCstBidderAddress);
	expect(await contracts_.cosmicSignatureGameProxy.getTotalNumBids(cosmicSignatureGameProxyState_.roundNum)).equal(cosmicSignatureGameProxyState_.getTotalNumBids());
	await assertCosmicSignatureGameProxyStateOfRandomBidIfPossible(cosmicSignatureGameProxyState_, contracts_, randomNumberSeedWrapper_);
	await assertCosmicSignatureGameProxyStateOfRandomSigner(cosmicSignatureGameProxyState_, contracts_, randomNumberSeedWrapper_);
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
	await assertCosmicSignatureGameProxyStateRandomRandomWalkNftIfPossible(cosmicSignatureGameProxyState_, contracts_, randomNumberSeedWrapper_);
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
	expect(await contracts_.cosmicSignatureGameProxy.mainEthPrizeAmountPercentage()).equal(cosmicSignatureGameProxyState_.mainEthPrizeAmountPercentage);
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
// #region `assertCosmicSignatureGameProxyStateOfRandomEthDonationWithInfoRecordIfPossible`

async function assertCosmicSignatureGameProxyStateOfRandomEthDonationWithInfoRecordIfPossible(cosmicSignatureGameProxyState_, contracts_, randomNumberSeedWrapper_) {
	const numEthDonationWithInfoRecordsCopy_ = cosmicSignatureGameProxyState_.numEthDonationWithInfoRecords();
	if (numEthDonationWithInfoRecordsCopy_ === 0n) {
		return;
	}
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const ethDonationWithInfoRecordIndex_ = randomNumber_ % numEthDonationWithInfoRecordsCopy_;
	await assertCosmicSignatureGameProxyStateOfEthDonationWithInfoRecord(cosmicSignatureGameProxyState_, contracts_, ethDonationWithInfoRecordIndex_);
}

// #endregion
// #region `assertCosmicSignatureGameProxyStateOfEthDonationWithInfoRecord`

async function assertCosmicSignatureGameProxyStateOfEthDonationWithInfoRecord(cosmicSignatureGameProxyState_, contracts_, ethDonationWithInfoRecordIndex_) {
	const ethDonationWithInfoInfoRecordFromContract_ = await contracts_.cosmicSignatureGameProxy.ethDonationWithInfoRecords(ethDonationWithInfoRecordIndex_);
	const ethDonationWithInfoInfoRecordFromState_ = cosmicSignatureGameProxyState_.getEthDonationWithInfoRecord(ethDonationWithInfoRecordIndex_);
	expect(ethDonationWithInfoInfoRecordFromContract_[0]).equal(ethDonationWithInfoInfoRecordFromState_.roundNum);
	expect(ethDonationWithInfoInfoRecordFromContract_[1]).equal(ethDonationWithInfoInfoRecordFromState_.donorAddress);
	expect(ethDonationWithInfoInfoRecordFromContract_[2]).equal(ethDonationWithInfoInfoRecordFromState_.amount);
	expect(ethDonationWithInfoInfoRecordFromContract_[3]).equal(ethDonationWithInfoInfoRecordFromState_.data);
}

// #endregion
// #region `assertCosmicSignatureGameProxyStateOfRandomBidIfPossible`

async function assertCosmicSignatureGameProxyStateOfRandomBidIfPossible(cosmicSignatureGameProxyState_, contracts_, randomNumberSeedWrapper_) {
	const totalNumBidsCopy_ = cosmicSignatureGameProxyState_.getTotalNumBids();
	if (totalNumBidsCopy_ === 0n) {
		return;
	}
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const bidIndex_ = randomNumber_ % totalNumBidsCopy_;
	await assertCosmicSignatureGameProxyStateOfBid(cosmicSignatureGameProxyState_, contracts_, bidIndex_);
}

// #endregion
// #region `assertCosmicSignatureGameProxyStateOfBid`

async function assertCosmicSignatureGameProxyStateOfBid(cosmicSignatureGameProxyState_, contracts_, bidIndex_) {
	const bidderAddressFromContract_ = await contracts_.cosmicSignatureGameProxy.getBidderAddressAt(cosmicSignatureGameProxyState_.roundNum, bidIndex_);
	const bidderAddressFromState_ = cosmicSignatureGameProxyState_.getBidderAddressAt(bidIndex_);
	expect(bidderAddressFromContract_).equal(bidderAddressFromState_);
}

// #endregion
// #region `assertCosmicSignatureGameProxyStateOfRandomSigner`

async function assertCosmicSignatureGameProxyStateOfRandomSigner(cosmicSignatureGameProxyState_, contracts_, randomNumberSeedWrapper_) {
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const signerIndex_ = randomNumber_ % BigInt(contracts_.signers.length);
	const signer_ = contracts_.signers[Number(signerIndex_)];
	await assertCosmicSignatureGameProxyStateOfBidder(cosmicSignatureGameProxyState_, contracts_, signer_.address);
}

// #endregion
// #region `assertCosmicSignatureGameProxyStateOfBidder`

async function assertCosmicSignatureGameProxyStateOfBidder(cosmicSignatureGameProxyState_, contracts_, bidderAddress_) {
	const bidderInfoFromContract_ = await contracts_.cosmicSignatureGameProxy.biddersInfo(cosmicSignatureGameProxyState_.roundNum, bidderAddress_);
	const bidderInfoFromState_ = cosmicSignatureGameProxyState_.getBidderInfo(bidderAddress_);
	expect(bidderInfoFromContract_[0]).equal(bidderInfoFromState_.totalSpentEthAmount);
	expect(bidderInfoFromContract_[1]).equal(bidderInfoFromState_.totalSpentCstAmount);
	expect(bidderInfoFromContract_[2]).equal(bidderInfoFromState_.lastBidTimeStamp);
}

// #endregion
// #region `assertCosmicSignatureGameProxyStateRandomRandomWalkNftIfPossible`

async function assertCosmicSignatureGameProxyStateRandomRandomWalkNftIfPossible(cosmicSignatureGameProxyState_, contracts_, randomNumberSeedWrapper_) {
	const randomWalkNftTotalSupplyCopy_ = cosmicSignatureGameProxyState_.randomWalkNftState.totalSupply();
	if (randomWalkNftTotalSupplyCopy_ === 0n) {
		return;
	}
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const randomWalkNftId_ = randomNumber_ % randomWalkNftTotalSupplyCopy_;
	await assertCosmicSignatureGameProxyStateRandomWalkNft(cosmicSignatureGameProxyState_, contracts_, randomWalkNftId_);
}

// #endregion
// #region `assertCosmicSignatureGameProxyStateRandomWalkNft`

async function assertCosmicSignatureGameProxyStateRandomWalkNft(cosmicSignatureGameProxyState_, contracts_, randomWalkNftId_) {
	expect(typeof randomWalkNftId_ === "bigint");
	expect(await contracts_.cosmicSignatureGameProxy.usedRandomWalkNfts(randomWalkNftId_) === cosmicSignatureGameProxyState_.usedRandomWalkNfts[Number(randomWalkNftId_)] ? 1n : 0n);
}

// #endregion
