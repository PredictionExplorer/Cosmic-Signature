// #region

"use strict";

// #endregion
// #region

const { describe, it } = require("mocha");
const { expect } = require("chai");
const hre = require("hardhat");
const { generateRandomUInt256, generateRandomUInt256FromSeedWrapper } = require("../src/Helpers.js");
const { SKIP_LONG_TESTS, loadFixtureDeployContractsForUnitTesting, checkTransactionErrorObject } = require("../src/ContractUnitTestingHelpers.js");

// #endregion
// #region

describe("PrizesWallet-1", function () {
	// #region

	it("Workflow", async function () {
		// #region

		if (SKIP_LONG_TESTS) {
			console.warn("Warning 202506083. Skipping a long test.");
			// return;
		}

		// #endregion
		// #region

		// // Comment-202506169 applies.
		// let testCounter1_ = 0.0;
		// let testCounter2_ = 0.0;
		// let testCounter3_ = 0.0;
		// let testCounter4_ = 0.0;
		// let testCounter5_ = 0.0;
		// let testCounter6_ = 0.0;

		// #endregion
		// #region

		const randomNumberSeed_ = generateRandomUInt256();
		const randomNumberSeedWrapper_ = {value: randomNumberSeed_,};
		let randomNumber_;

		// #endregion
		// #region

		randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);

		// Signers 0 through `numBidders_ - 1` will act as bidders.
		const numBidders_ = 5 + Number(randomNumber_ % 3n);

		randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
		const numTokens_ = 5 + Number(randomNumber_ % 3n);
		randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
		const numNftContracts_ = 5 + Number(randomNumber_ % 3n);

		// [Comment-202506082]
		// The bigger is this value the higher is the chance that that Solidity coverage will be 100%.
		// [/Comment-202506082]
		const numIterations_ = ( ! SKIP_LONG_TESTS ) ? 3000 : 200;

		// #endregion
		// #region

		const contracts_ = await loadFixtureDeployContractsForUnitTesting(-1_000_000_000n);

		const fakeGame_ = contracts_.signers[19];

		// ERC-20 tokens to be donated.
		const tokens_ = [];
		const tokensAddr_ = [];
		for (let tokenIndex_ = numTokens_; ( -- tokenIndex_ ) >= 0; ) {
			const token_ = await contracts_.cosmicSignatureTokenFactory.deploy(fakeGame_.address);
			await token_.waitForDeployment();
			tokens_.push(token_);
			const tokenAddr_ = await token_.getAddress();
			tokensAddr_.push(tokenAddr_);
			// await expect(token_.transferOwnership(contracts_.ownerAcct.address)).not.reverted;
		}

		// NFTs to be donated.
		const nftContracts_ = [];
		const nftContractsAddr_ = [];
		for (let nftContractIndex_ = numNftContracts_; ( -- nftContractIndex_ ) >= 0; ) {
			const nftContract_ = await contracts_.randomWalkNftFactory.deploy();
			await nftContract_.waitForDeployment();
			nftContracts_.push(nftContract_);
			const nftContractAddr_ = await nftContract_.getAddress();
			nftContractsAddr_.push(nftContractAddr_);
			await expect(nftContract_.transferOwnership(contracts_.ownerAcct.address)).not.reverted;
		}

		// We will not use `contracts_.prizesWallet`.
		// todo-1 +++ See above.
		const newPrizesWallet_ = await contracts_.prizesWalletFactory.deploy(fakeGame_.address);
		await newPrizesWallet_.waitForDeployment();
		const newPrizesWalletAddr_ = await newPrizesWallet_.getAddress();
		await expect(newPrizesWallet_.transferOwnership(contracts_.ownerAcct.address)).not.reverted;

		// #endregion
		// #region

		for (let bidderIndex_ = numBidders_; ( -- bidderIndex_ ) >= 0; ) {
			for (const token_ of tokens_) {
				await expect(token_.connect(contracts_.signers[bidderIndex_]).approve(newPrizesWalletAddr_, (1n << 256n) - 1n)).not.reverted;
			}
			for (const nftContract_ of nftContracts_) {
				await expect(nftContract_.connect(contracts_.signers[bidderIndex_]).setApprovalForAll(newPrizesWalletAddr_, true)).not.reverted;
			}
		}

		// #endregion
		// #region Simulated ERC-20 Token Contracts State.

		// This array contains `numTokens_` items, an item for each ERC-20 token contract.
		// Each item is an object in which each property key is an address as `string`
		// and value is ERC-20 token balance amount as `bigint`.
		const allTokenBalanceAmounts_ = [];

		for (let tokenIndex_ = numTokens_; ( -- tokenIndex_ ) >= 0; ) {
			const tokenBalanceAmounts_ = {};

			// [Comment-202507161/]
			tokenBalanceAmounts_[hre.ethers.ZeroAddress] = 0n;

			// tokenBalanceAmounts_[newPrizesWalletAddr_] = 0n;
			for (let bidderIndex_ = numBidders_; ( -- bidderIndex_ ) >= 0; ) {
				tokenBalanceAmounts_[contracts_.signers[bidderIndex_].address] = 0n;
			}
			allTokenBalanceAmounts_.push(tokenBalanceAmounts_);
		}

		// #endregion
		// #region Simulated NFT Contracts State.

		const allNfts_ = [];
		for (let nftContractIndex_ = numNftContracts_; ( -- nftContractIndex_ ) >= 0; ) {
			allNfts_.push([]);
		}

		// #endregion
		// #region Simulated `PrizesWallet` State.

		let ethBalanceAmount_ = 0n;

		// It could make sense to keep signer indexes here, which could be more efficient, but it's OK to keep their addresses too.
		const mainPrizeBeneficiaryAddresses_ = [];

		const timeoutDurationToWithdrawPrizes_ = await newPrizesWallet_.timeoutDurationToWithdrawPrizes();
		const roundTimeoutTimesToWithdrawPrizes_ = [];
		const ethBalancesInfo_ = [];
		for (let bidderIndex_ = numBidders_; ( -- bidderIndex_ ) >= 0; ) {
			ethBalancesInfo_.push({roundNum: 0n, amount: 0n,});
		}

		// This array contains an item for each bidding round.
		// Each item is a `string` representing donated token holder address. It can be zero.
		const donatedTokens_ = [];

		const donatedNfts_ = [];

		// #endregion
		// #region Simulated `CosmicSignatureGame` State.

		let roundNum_ = -1n;

		// #endregion
		// #region `prepareNextRound_`

		const prepareNextRound_ = async () => {
			mainPrizeBeneficiaryAddresses_.push(hre.ethers.ZeroAddress);
			roundTimeoutTimesToWithdrawPrizes_.push(0n);
			donatedTokens_.push(hre.ethers.ZeroAddress);
			++ roundNum_;
			// console.log(`202507165 ${roundNum_}`);
		};

		// #endregion
		// #region

		prepareNextRound_();

		// #endregion
		// #region

		for ( let iterationCounter_ = 1; iterationCounter_ <= numIterations_; ++ iterationCounter_ ) {
			// #region

			// This time increase gives strangers a chance to claim someone's unclaimed prizes.
			// The logic near Comment-202506169 allows to observe the effect of this action.
			{
				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				if ((randomNumber_ & 0xFn) == 0n) {
					// console.info("202506195");
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					await hre.ethers.provider.send("evm_increaseTime", [Number(randomNumber_ % (timeoutDurationToWithdrawPrizes_ * 3n / 2n))]);
					await hre.ethers.provider.send("evm_mine");
				} else {
					// console.info("202506196");
				}
			}

			// #endregion
			// #region

			randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
			const numChoice1s_ = 14;
			let choice1Code_ = Number(randomNumber_ % BigInt(numChoice1s_));

			// #endregion
			// #region

			if ((choice1Code_ -= 2) < 0) {
				// #region Minting an ERC-20 token amount.

				// console.info("202506104");
				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				const bidderIndex_ = Number(randomNumber_ % BigInt(numBidders_));
				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				const tokenIndex_ = Number(randomNumber_ % BigInt(numTokens_));
				let tokenAmount_;
				if (choice1Code_ == -1) {
					// console.info("202506142");
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);

					// [Comment-202506191/]
					tokenAmount_ = randomNumber_ % 10n ** 18n;
				} else {
					// console.info("202506143");
					tokenAmount_ = 0n;
				}
				await expect(tokens_[tokenIndex_].connect(fakeGame_).mint(contracts_.signers[bidderIndex_].address, tokenAmount_))
					.emit(tokens_[tokenIndex_], "Transfer")
					.withArgs(hre.ethers.ZeroAddress, contracts_.signers[bidderIndex_].address, tokenAmount_);
				allTokenBalanceAmounts_[tokenIndex_][contracts_.signers[bidderIndex_].address] += tokenAmount_;
				expect(await tokens_[tokenIndex_].balanceOf(contracts_.signers[bidderIndex_].address)).equal(allTokenBalanceAmounts_[tokenIndex_][contracts_.signers[bidderIndex_].address]);

				// #endregion
			} else if ((choice1Code_ -= 1) < 0) {
				// #region Minting an NFT.

				// console.info("202506141");
				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				const bidderIndex_ = Number(randomNumber_ % BigInt(numBidders_));
				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				const nftContractIndex_ = Number(randomNumber_ % BigInt(numNftContracts_));
				const nftId_ = BigInt(allNfts_[nftContractIndex_].length);
				await expect(nftContracts_[nftContractIndex_].connect(contracts_.signers[bidderIndex_]).mint({value: 10n ** (18n + 1n),}))
					.emit(nftContracts_[nftContractIndex_], "Transfer")
					.withArgs(hre.ethers.ZeroAddress, contracts_.signers[bidderIndex_].address, nftId_);
				allNfts_[nftContractIndex_].push(contracts_.signers[bidderIndex_].address);

				// #endregion
			} else if ((choice1Code_ -= 1) < 0) {
				// #region `registerRoundEnd`

				// console.info("202506084");
				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				const mainPrizeBeneficiaryIndex_ = Number(randomNumber_ % BigInt(numBidders_));
				await expect(newPrizesWallet_.connect(fakeGame_).registerRoundEnd(roundNum_, contracts_.signers[mainPrizeBeneficiaryIndex_].address)).not.reverted;
				const transactionBlock_ = await hre.ethers.provider.getBlock("latest");
				mainPrizeBeneficiaryAddresses_[Number(roundNum_)] = contracts_.signers[mainPrizeBeneficiaryIndex_].address;
				roundTimeoutTimesToWithdrawPrizes_[Number(roundNum_)] = BigInt(transactionBlock_.timestamp) + timeoutDurationToWithdrawPrizes_;
				expect(await newPrizesWallet_.mainPrizeBeneficiaryAddresses(roundNum_)).equal(mainPrizeBeneficiaryAddresses_[Number(roundNum_)]);
				expect(await newPrizesWallet_.roundTimeoutTimesToWithdrawPrizes(roundNum_)).equal(roundTimeoutTimesToWithdrawPrizes_[Number(roundNum_)]);
				prepareNextRound_();

				// #endregion
			} else if ((choice1Code_ -= 2) < 0) {
				// #region `depositEth`

				// console.info("202506144");
				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				const prizeWinnerIndex_ = Number(randomNumber_ % BigInt(numBidders_));
				let ethAmount_;
				if (choice1Code_ == -1) {
					// console.info("202506145");
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					ethAmount_ = randomNumber_ % 10n ** (18n - 3n);
				} else {
					// console.info("202506146");
					ethAmount_ = 0n;
				}
				await expect(newPrizesWallet_.connect(fakeGame_).depositEth(roundNum_, contracts_.signers[prizeWinnerIndex_].address, {value: ethAmount_,}))
					.emit(newPrizesWallet_, "EthReceived")
					.withArgs(roundNum_, contracts_.signers[prizeWinnerIndex_].address, ethAmount_);
				ethBalanceAmount_ += ethAmount_;
				ethBalancesInfo_[prizeWinnerIndex_].roundNum = roundNum_;
				ethBalancesInfo_[prizeWinnerIndex_].amount += ethAmount_;
				expect(await hre.ethers.provider.getBalance(newPrizesWalletAddr_)).equal(ethBalanceAmount_);
				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				// console.info("202506197", (randomNumber_ & 1n).toString());
				const ethBalanceInfoFromContract_ =
					((randomNumber_ & 1n) == 0n) ?
					await newPrizesWallet_.connect(contracts_.signers[prizeWinnerIndex_])["getEthBalanceInfo()"]() :
					await newPrizesWallet_["getEthBalanceInfo(address)"](contracts_.signers[prizeWinnerIndex_].address);
				expect(ethBalanceInfoFromContract_[0]).equal(ethBalancesInfo_[prizeWinnerIndex_].roundNum);
				expect(ethBalanceInfoFromContract_[1]).equal(ethBalancesInfo_[prizeWinnerIndex_].amount);

				// #endregion
			} else if ((choice1Code_ -= 1) < 0) {
				// #region `withdrawEth()`

				// console.info("202506088");
				let prizeWinnerIndex_;
				for (let counter_ = numBidders_; ; ) {
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					prizeWinnerIndex_ = Number(randomNumber_ % BigInt(numBidders_));
					if (ethBalancesInfo_[prizeWinnerIndex_].amount > 0n) {
						// console.info("202506175", counter_.toString(), "/", numBidders_.toString());
						break;
					}
					if (( -- counter_ ) <= 0) {
						// console.info("202506176");
						break;
					}
				}
				const prizeWinnerEthBalanceAmountBeforeTransaction_ = await hre.ethers.provider.getBalance(contracts_.signers[prizeWinnerIndex_].address);
				/** @type {Promise<import("ethers").TransactionResponse>} */
				const transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[prizeWinnerIndex_])["withdrawEth()"]();
				await expect(transactionResponsePromise_)
					.emit(newPrizesWallet_, "EthWithdrawn")
					.withArgs(contracts_.signers[prizeWinnerIndex_].address, contracts_.signers[prizeWinnerIndex_].address, ethBalancesInfo_[prizeWinnerIndex_].amount);
				const transactionResponse_ = await transactionResponsePromise_;
				const transactionReceipt_ = await transactionResponse_.wait();
				ethBalanceAmount_ -= ethBalancesInfo_[prizeWinnerIndex_].amount;
				expect(await hre.ethers.provider.getBalance(newPrizesWalletAddr_)).equal(ethBalanceAmount_);
				const transactionFeeInEth_ = transactionReceipt_.fee;
				expect(transactionFeeInEth_).greaterThan(0n);
				expect(await hre.ethers.provider.getBalance(contracts_.signers[prizeWinnerIndex_].address)).equal(prizeWinnerEthBalanceAmountBeforeTransaction_ - transactionFeeInEth_ + ethBalancesInfo_[prizeWinnerIndex_].amount);
				ethBalancesInfo_[prizeWinnerIndex_].roundNum = 0n;
				ethBalancesInfo_[prizeWinnerIndex_].amount = 0n;
				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				// console.info("202506198", (randomNumber_ & 1n).toString());
				const ethBalanceInfoFromContract_ =
					((randomNumber_ & 1n) == 0n) ?
					await newPrizesWallet_.connect(contracts_.signers[prizeWinnerIndex_])["getEthBalanceInfo()"]() :
					await newPrizesWallet_["getEthBalanceInfo(address)"](contracts_.signers[prizeWinnerIndex_].address);
				expect(ethBalanceInfoFromContract_[0]).equal(ethBalancesInfo_[prizeWinnerIndex_].roundNum);
				expect(ethBalanceInfoFromContract_[1]).equal(ethBalancesInfo_[prizeWinnerIndex_].amount);

				// #endregion
			} else if ((choice1Code_ -= 1) < 0) {
				// #region `withdrawEth(address prizeWinnerAddress_)`

				// console.info("202506089");
				const blockBeforeTransaction_ = await hre.ethers.provider.getBlock("latest");
				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				const strangerIndex_ = Number(randomNumber_ % BigInt(numBidders_));
				let prizeWinnerIndex_;
				let roundTimeoutTimeToWithdrawPrizes_;
				for (let counter_ = numBidders_; ; ) {
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					prizeWinnerIndex_ = Number(randomNumber_ % BigInt(numBidders_));
					roundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes_[Number(ethBalancesInfo_[prizeWinnerIndex_].roundNum)];
					if ( ethBalancesInfo_[prizeWinnerIndex_].amount > 0n &&
					     (blockBeforeTransaction_.timestamp + 1 >= Number(roundTimeoutTimeToWithdrawPrizes_) && roundTimeoutTimeToWithdrawPrizes_ > 0n)
					) {
						// console.info("202506177", counter_.toString(), "/", numBidders_.toString());
						break;
					}
					if (( -- counter_ ) <= 0) {
						// console.info("202506178");
						break;
					}
				}
				const strangerEthBalanceAmountBeforeTransaction_ = await hre.ethers.provider.getBalance(contracts_.signers[strangerIndex_].address);
				/** @type {Promise<import("ethers").TransactionResponse>} */
				const transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[strangerIndex_])["withdrawEth(address)"](contracts_.signers[prizeWinnerIndex_].address);
				/** @type {import("ethers").TransactionReceipt} */
				let transactionReceipt_ = undefined;
				try {
					const transactionResponse_ = await transactionResponsePromise_;
					transactionReceipt_ = await transactionResponse_.wait();
				} catch (transactionErrorObject_) {
					checkTransactionErrorObject(transactionErrorObject_);
				}
				const transactionBlock_ = await hre.ethers.provider.getBlock("latest");

				// // Comment-202506169 applies.
				// if (ethBalancesInfo_[prizeWinnerIndex_].amount > 0) {
				// 	++ testCounter5_;
				// }

				if ( ! (transactionBlock_.timestamp >= Number(roundTimeoutTimeToWithdrawPrizes_) && roundTimeoutTimeToWithdrawPrizes_ > 0n) ) {
					// console.info("202506094");
					expect(transactionReceipt_ != undefined).equal(false);
					await expect(transactionResponsePromise_)
						.revertedWithCustomError(newPrizesWallet_, "EthWithdrawalDenied")
						.withArgs(
							"Only the ETH prize winner is permitted to withdraw their balance before a timeout expires.",
							contracts_.signers[prizeWinnerIndex_].address,
							contracts_.signers[strangerIndex_].address,
							roundTimeoutTimeToWithdrawPrizes_,
							BigInt(transactionBlock_.timestamp)
						);
				} else {
					// console.info("202506095");

					// // Comment-202506169 applies.
					// if (ethBalancesInfo_[prizeWinnerIndex_].amount > 0) {
					// 	console.info("202506174", (( ++ testCounter6_ ) / testCounter5_).toPrecision(2));
					// }

					expect(transactionReceipt_ != undefined).equal(true);
					await expect(transactionResponsePromise_)
						.emit(newPrizesWallet_, "EthWithdrawn")
						.withArgs(contracts_.signers[prizeWinnerIndex_].address, contracts_.signers[strangerIndex_].address, ethBalancesInfo_[prizeWinnerIndex_].amount);
					ethBalanceAmount_ -= ethBalancesInfo_[prizeWinnerIndex_].amount;
					expect(await hre.ethers.provider.getBalance(newPrizesWalletAddr_)).equal(ethBalanceAmount_);
					const transactionFeeInEth_ = transactionReceipt_.fee;
					expect(transactionFeeInEth_).greaterThan(0n);
					expect(await hre.ethers.provider.getBalance(contracts_.signers[strangerIndex_].address)).equal(strangerEthBalanceAmountBeforeTransaction_ - transactionFeeInEth_ + ethBalancesInfo_[prizeWinnerIndex_].amount);
					ethBalancesInfo_[prizeWinnerIndex_].roundNum = 0n;
					ethBalancesInfo_[prizeWinnerIndex_].amount = 0n;
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					// console.info("202506199", (randomNumber_ & 1n).toString());
					const ethBalanceInfoFromContract_ =
						((randomNumber_ & 1n) == 0n) ?
						await newPrizesWallet_.connect(contracts_.signers[prizeWinnerIndex_])["getEthBalanceInfo()"]() :
						await newPrizesWallet_["getEthBalanceInfo(address)"](contracts_.signers[prizeWinnerIndex_].address);
					expect(ethBalanceInfoFromContract_[0]).equal(ethBalancesInfo_[prizeWinnerIndex_].roundNum);
					expect(ethBalanceInfoFromContract_[1]).equal(ethBalancesInfo_[prizeWinnerIndex_].amount);
				}

				// #endregion
			} else if ((choice1Code_ -= 2) < 0) {
				// #region `donateToken`

				// console.info("202506097");
				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				const donorIndex_ = Number(randomNumber_ % BigInt(numBidders_));
				randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
				const tokenIndex_ = Number(randomNumber_ % BigInt(numTokens_));
				let tokenAmount_;
				if (choice1Code_ == -1) {
					// console.info("202506149");
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);

					// [Comment-202506102/]
					tokenAmount_ = randomNumber_ % 10n ** 18n;
				} else {
					// console.info("202506151");
					tokenAmount_ = 0n;
				}
				/** @type {Promise<import("ethers").TransactionResponse>} */
				const transactionResponsePromise_ =
					newPrizesWallet_.connect(fakeGame_).donateToken(
						roundNum_,
						contracts_.signers[donorIndex_].address,
						tokensAddr_[tokenIndex_],
						tokenAmount_
					);

				// Over time, the probability of this condition being `true` declines.
				// It's because ERC-20 token balance of each bidder tends to increase.
				// To prevent a too fast decline of this probability, it could make sense to mint less near Comment-202506191
				// than donate near Comment-202506102, but the current logic appears to work OK as is.
				// One factor that helps is that some donations or their parts never get claimed.
				if ( ! (tokenAmount_ <= allTokenBalanceAmounts_[tokenIndex_][contracts_.signers[donorIndex_].address]) ) {

					// console.info("202506107", iterationCounter_.toString());
					await expect(transactionResponsePromise_)
						.revertedWithCustomError(tokens_[tokenIndex_], "ERC20InsufficientBalance");
				} else {
					// console.info("202506154", iterationCounter_.toString(), roundNum_.toString(), tokenIndex_.toString(), hre.ethers.formatEther(tokenAmount_));
					await(await transactionResponsePromise_).wait();

					// Because near Comment-202507161 we have added the zero addresses to `allTokenBalanceAmounts_`,
					// near Comment-202507163 we will implicitly validates that this is a nonzero.
					const donatedTokenHolderAddr_ = await newPrizesWallet_.donatedTokens(roundNum_);

					if (donatedTokens_[Number(roundNum_)] == hre.ethers.ZeroAddress) {
						// console.log("202507154", donatedTokenHolderAddr_, typeof donatedTokenHolderAddr_);
						donatedTokens_[Number(roundNum_)] = donatedTokenHolderAddr_;
						for (const tokenBalanceAmounts_ of allTokenBalanceAmounts_) {
							// console.log("202507157");

							// [Comment-202507163/]
							expect(Object.hasOwn(tokenBalanceAmounts_, donatedTokenHolderAddr_)).equal(false);

							tokenBalanceAmounts_[donatedTokenHolderAddr_] = 0n;
						}
					} else {
						// console.log("202507159");
						expect(donatedTokenHolderAddr_).equal(donatedTokens_[Number(roundNum_)]);
					}
					allTokenBalanceAmounts_[tokenIndex_][contracts_.signers[donorIndex_].address] -= tokenAmount_;
					allTokenBalanceAmounts_[tokenIndex_][donatedTokenHolderAddr_] += tokenAmount_;
					await expect(transactionResponsePromise_)
						.emit(tokens_[tokenIndex_], "Approval")
						.withArgs(donatedTokenHolderAddr_, newPrizesWalletAddr_, (1n << 256n) - 1n)
						.and.emit(newPrizesWallet_, "TokenDonated")
						.withArgs(roundNum_, contracts_.signers[donorIndex_].address, tokensAddr_[tokenIndex_], tokenAmount_)
						.and.emit(tokens_[tokenIndex_], "Transfer")
						.withArgs(contracts_.signers[donorIndex_].address, donatedTokenHolderAddr_, tokenAmount_);
					expect(await tokens_[tokenIndex_].balanceOf(contracts_.signers[donorIndex_].address)).equal(allTokenBalanceAmounts_[tokenIndex_][contracts_.signers[donorIndex_].address]);
					expect(await tokens_[tokenIndex_].balanceOf(donatedTokenHolderAddr_)).equal(allTokenBalanceAmounts_[tokenIndex_][donatedTokenHolderAddr_]);
				}

				// This will work even if `donatedTokens_[Number(roundNum_)]` is still zero.
				expect(await newPrizesWallet_.getDonatedTokenBalanceAmount(roundNum_, tokensAddr_[tokenIndex_])).equal(allTokenBalanceAmounts_[tokenIndex_][donatedTokens_[Number(roundNum_)]]);

				// #endregion
			} else if ((choice1Code_ -= 2) < 0) {
				// #region `claimDonatedToken`

				{
					// #region

					// console.info("202506114");
					const blockBeforeTransaction_ = await hre.ethers.provider.getBlock("latest");
					let mainPrizeBeneficiaryIndex_;
					let tokenIndex_;
					let donationRoundNum_;
					let donationRoundTimeoutTimeToWithdrawPrizes_;

					// #endregion
					// #region

					for (let counter_ = Math.min(numBidders_, Number(roundNum_) + 1); ; ) {
						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
						mainPrizeBeneficiaryIndex_ = Number(randomNumber_ % BigInt(numBidders_));
						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
						tokenIndex_ = Number(randomNumber_ % BigInt(numTokens_));
						randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
						donationRoundNum_ = roundNum_ -  randomNumber_ % BigInt(Math.min(Number(roundNum_) + 1, 10));
						donationRoundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes_[Number(donationRoundNum_)];
						if ( allTokenBalanceAmounts_[tokenIndex_][donatedTokens_[Number(donationRoundNum_)]] > 0n &&
						     ( contracts_.signers[mainPrizeBeneficiaryIndex_].address == mainPrizeBeneficiaryAddresses_[Number(donationRoundNum_)] ||
						       (blockBeforeTransaction_.timestamp + 1 >= Number(donationRoundTimeoutTimeToWithdrawPrizes_) && donationRoundTimeoutTimeToWithdrawPrizes_ > 0n)
						     )
						) {
							// console.info("202506182");
							break;
						}
						if (( -- counter_ ) <= 0) {
							// console.info("202506183");
							break;
						}
					}

					// #endregion
					// #region

					let donatedTokenAmountToClaim_;

					// #endregion
					// #region

					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					if (choice1Code_ == -1) {
						// console.info("202507166");
						donatedTokenAmountToClaim_ = randomNumber_ % ((allTokenBalanceAmounts_[tokenIndex_][donatedTokens_[Number(donationRoundNum_)]] << 1n) + 1n);
					} else {
						// console.info("202507167");
						donatedTokenAmountToClaim_ =
							((randomNumber_ & 1n) == 0n) ?
							0n :
							allTokenBalanceAmounts_[tokenIndex_][donatedTokens_[Number(donationRoundNum_)]];
					}

					// #endregion
					// #region

					/** @type {Promise<import("ethers").TransactionResponse>} */
					const transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[mainPrizeBeneficiaryIndex_]).claimDonatedToken(donationRoundNum_, tokensAddr_[tokenIndex_], donatedTokenAmountToClaim_);
					/** @type {import("ethers").TransactionReceipt} */
					let transactionReceipt_ = undefined;
					try {
						const transactionResponse_ = await transactionResponsePromise_;
						transactionReceipt_ = await transactionResponse_.wait();
						// console.info("202507168");
					} catch (transactionErrorObject_) {
						// console.error("202507169", transactionErrorObject_.message);
						checkTransactionErrorObject(transactionErrorObject_);
					}

					// #endregion
					// #region //

					// {
					// 	const transactionBlock_ = await hre.ethers.provider.getBlock("latest");
					// 	console.info(
					// 		"202506186",
					// 		donationRoundNum_.toString(),
					// 		tokenIndex_.toString(),
					// 		hre.ethers.formatEther(allTokenBalanceAmounts_[tokenIndex_][donatedTokens_[Number(donationRoundNum_)]]),
					// 		contracts_.signers[mainPrizeBeneficiaryIndex_].address,
					// 		mainPrizeBeneficiaryAddresses_[Number(donationRoundNum_)],
					// 		transactionBlock_.timestamp.toString(),
					// 		donationRoundTimeoutTimeToWithdrawPrizes_.toString()
					// 	);
					// }

					// #endregion
					// #region

					let transactionShouldHaveSucceeded_ = true;

					// #endregion
					// #region

					if (transactionShouldHaveSucceeded_) {
						if (contracts_.signers[mainPrizeBeneficiaryIndex_].address != mainPrizeBeneficiaryAddresses_[Number(donationRoundNum_)]) {
							// console.info("202506202");

							// // [Comment-202506169/]
							// if (allTokenBalanceAmounts_[tokenIndex_][donatedTokens_[Number(donationRoundNum_)]] > 0n) {
							// 	++ testCounter1_;
							// }

							const transactionBlock_ = await hre.ethers.provider.getBlock("latest");
							if (transactionBlock_.timestamp >= Number(donationRoundTimeoutTimeToWithdrawPrizes_) && donationRoundTimeoutTimeToWithdrawPrizes_ > 0n) {
								// console.info("202506173");

								// // Comment-202506169 applies.
								// if (allTokenBalanceAmounts_[tokenIndex_][donatedTokens_[Number(donationRoundNum_)]] > 0n) {
								// 	console.info("202506115", (( ++ testCounter2_ ) / testCounter1_).toPrecision(2));
								// }
							} else {
								// console.info("202506116");
								await expect(transactionResponsePromise_)
									.revertedWithCustomError(newPrizesWallet_, "DonatedTokenClaimDenied")
									.withArgs(
										"Only the bidding round main prize beneficiary is permitted to claim this ERC-20 token donation before a timeout expires.",
										donationRoundNum_,
										contracts_.signers[mainPrizeBeneficiaryIndex_].address,
										tokensAddr_[tokenIndex_],
										donationRoundTimeoutTimeToWithdrawPrizes_,
										BigInt(transactionBlock_.timestamp)
									);
								transactionShouldHaveSucceeded_ = false;
							}
						} else {
							// console.info("202506117");
						}
					}

					// #endregion
					// #region

					if (transactionShouldHaveSucceeded_) {
						if (donatedTokens_[Number(donationRoundNum_)] == hre.ethers.ZeroAddress) {
							// console.info("202507171");
							await expect(transactionResponsePromise_).revertedWithCustomError(tokens_[tokenIndex_], "ERC20InvalidApprover");
							transactionShouldHaveSucceeded_ = false;
						}
					}

					// #endregion
					// #region

					if (transactionShouldHaveSucceeded_) {
						if (donatedTokenAmountToClaim_ == 0n) {
							// console.info("202507172");
							donatedTokenAmountToClaim_ = allTokenBalanceAmounts_[tokenIndex_][donatedTokens_[Number(donationRoundNum_)]];
						} else {
							// console.info("202507173");
						}
						if (donatedTokenAmountToClaim_ > allTokenBalanceAmounts_[tokenIndex_][donatedTokens_[Number(donationRoundNum_)]]) {
							// console.info("202507174");
							await expect(transactionResponsePromise_).revertedWithCustomError(tokens_[tokenIndex_], "ERC20InsufficientBalance");
							transactionShouldHaveSucceeded_ = false;
						}
					}

					// #endregion
					// #region

					expect(transactionShouldHaveSucceeded_).equal(transactionReceipt_ != undefined);

					// #endregion
					// #region

					if (transactionShouldHaveSucceeded_) {
						// console.info("202506124");
						allTokenBalanceAmounts_[tokenIndex_][donatedTokens_[Number(donationRoundNum_)]] -= donatedTokenAmountToClaim_;
						allTokenBalanceAmounts_[tokenIndex_][contracts_.signers[mainPrizeBeneficiaryIndex_].address] += donatedTokenAmountToClaim_;
						await expect(transactionResponsePromise_)
							.emit(newPrizesWallet_, "DonatedTokenClaimed")
							.withArgs(
								donationRoundNum_,
								contracts_.signers[mainPrizeBeneficiaryIndex_].address,
								tokensAddr_[tokenIndex_],
								donatedTokenAmountToClaim_
							)
							.and.emit(tokens_[tokenIndex_], "Transfer")
							.withArgs(
								donatedTokens_[Number(donationRoundNum_)],
								contracts_.signers[mainPrizeBeneficiaryIndex_].address,
								donatedTokenAmountToClaim_
							);
						expect(await tokens_[tokenIndex_].balanceOf(donatedTokens_[Number(donationRoundNum_)])).equal(allTokenBalanceAmounts_[tokenIndex_][donatedTokens_[Number(donationRoundNum_)]]);
						expect(await tokens_[tokenIndex_].balanceOf(contracts_.signers[mainPrizeBeneficiaryIndex_].address)).equal(allTokenBalanceAmounts_[tokenIndex_][contracts_.signers[mainPrizeBeneficiaryIndex_].address]);
					}

					// #endregion
					// #region

					// This will work even if `donatedTokens_[Number(donationRoundNum_)]` is still zero.
					expect(await newPrizesWallet_.getDonatedTokenBalanceAmount(donationRoundNum_, tokensAddr_[tokenIndex_])).equal(allTokenBalanceAmounts_[tokenIndex_][donatedTokens_[Number(donationRoundNum_)]]);

					// #endregion
				}

				// #endregion
			} else if ((choice1Code_ -= 1) < 0) {
				// #region `donateNft`

				// console.info("202506127");
				let donorIndex_;
				let nftContractIndex_;
				let nftId_;
				for (let counter_ = numBidders_; ; ) {
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					donorIndex_ = Number(randomNumber_ % BigInt(numBidders_));
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					nftContractIndex_ = Number(randomNumber_ % BigInt(numNftContracts_));
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					nftId_ = randomNumber_ % BigInt(allNfts_[nftContractIndex_].length + 1);
					if ( Number(nftId_) < allNfts_[nftContractIndex_].length &&
					     allNfts_[nftContractIndex_][Number(nftId_)] == contracts_.signers[donorIndex_].address
					) {
						// console.info("202506156");
						break;
					}
					if (( -- counter_ ) <= 0) {
						// console.info("202506157");
						break;
					}
				}
				/** @type {Promise<import("ethers").TransactionResponse>} */
				const transactionResponsePromise_ =
					newPrizesWallet_.connect(fakeGame_).donateNft(
						roundNum_,
						contracts_.signers[donorIndex_].address,
						nftContractsAddr_[nftContractIndex_],
						nftId_
					);
				if ( ! (Number(nftId_) < allNfts_[nftContractIndex_].length) ) {
					// console.info("202506131");
					await expect(transactionResponsePromise_).revertedWithCustomError(nftContracts_[nftContractIndex_], "ERC721NonexistentToken");
				} else if ( ! (allNfts_[nftContractIndex_][Number(nftId_)] == contracts_.signers[donorIndex_].address) ) {
					// console.info("202506132");
					await expect(transactionResponsePromise_).revertedWithCustomError(nftContracts_[nftContractIndex_], "ERC721IncorrectOwner");
				} else {
					// console.info("202506135");
					await expect(transactionResponsePromise_)
						.emit(newPrizesWallet_, "NftDonated")
						.withArgs(roundNum_, contracts_.signers[donorIndex_].address, nftContractsAddr_[nftContractIndex_], nftId_, BigInt(donatedNfts_.length))
						.and.emit(nftContracts_[nftContractIndex_], "Transfer")
						.withArgs(contracts_.signers[donorIndex_].address, newPrizesWalletAddr_, nftId_);
					const newDonatedNft_ = {roundNum: roundNum_, nftContractIndex: nftContractIndex_, nftId: nftId_,};
					donatedNfts_.push(newDonatedNft_);
					allNfts_[nftContractIndex_][Number(nftId_)] = newPrizesWalletAddr_;
					expect(await newPrizesWallet_.nextDonatedNftIndex()).equal(BigInt(donatedNfts_.length));
					const newDonatedNftFromContract_ = await newPrizesWallet_.donatedNfts(BigInt(donatedNfts_.length - 1));
					expect(newDonatedNftFromContract_[0]).equal(newDonatedNft_.roundNum);
					expect(newDonatedNftFromContract_[1]).equal(nftContractsAddr_[newDonatedNft_.nftContractIndex]);
					expect(newDonatedNftFromContract_[2]).equal(newDonatedNft_.nftId);
				}

				// #endregion
			} else {
				// #region `claimDonatedNft`

				// console.info("202506159");
				expect(choice1Code_ -= 1).equal(-1);
				const blockBeforeTransaction_ = await hre.ethers.provider.getBlock("latest");
				let mainPrizeBeneficiaryIndex_;
				let donatedNftIndex_;
				let donationRoundTimeoutTimeToWithdrawPrizes_ = undefined;
				for (let counter_ = Math.min(numBidders_, donatedNfts_.length + 1); ; ) {
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					mainPrizeBeneficiaryIndex_ = Number(randomNumber_ % BigInt(numBidders_));
					randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
					donatedNftIndex_ = donatedNfts_.length - Number(randomNumber_ % BigInt(Math.min(donatedNfts_.length + 1, 10)));
					if (donatedNftIndex_ < donatedNfts_.length && donatedNfts_[donatedNftIndex_].nftContractIndex >= 0) {
						if (contracts_.signers[mainPrizeBeneficiaryIndex_].address == mainPrizeBeneficiaryAddresses_[Number(donatedNfts_[donatedNftIndex_].roundNum)]) {
							// console.info("202506187", iterationCounter_.toString());
							break;
						}
						donationRoundTimeoutTimeToWithdrawPrizes_ = roundTimeoutTimesToWithdrawPrizes_[Number(donatedNfts_[donatedNftIndex_].roundNum)];
						if (blockBeforeTransaction_.timestamp + 1 >= Number(donationRoundTimeoutTimeToWithdrawPrizes_) && donationRoundTimeoutTimeToWithdrawPrizes_ > 0n) {
							// console.info("202506188", iterationCounter_.toString());
							break;
						}
					}
					if (( -- counter_ ) <= 0) {
						// console.info("202506204", iterationCounter_.toString());
						break;
					}
				}
				/** @type {Promise<import("ethers").TransactionResponse>} */
				const transactionResponsePromise_ = newPrizesWallet_.connect(contracts_.signers[mainPrizeBeneficiaryIndex_]).claimDonatedNft(BigInt(donatedNftIndex_));
				/** @type {import("ethers").TransactionReceipt} */
				let transactionReceipt_ = undefined;
				try {
					const transactionResponse_ = await transactionResponsePromise_;
					transactionReceipt_ = await transactionResponse_.wait();
				} catch (transactionErrorObject_) {
					checkTransactionErrorObject(transactionErrorObject_);
				}
				let transactionShouldHaveSucceeded_ = true;
				if (transactionShouldHaveSucceeded_) {
					if ( ! (donatedNftIndex_ < donatedNfts_.length) ) {
						// console.info("202506167");
						await expect(transactionResponsePromise_)
							.revertedWithCustomError(newPrizesWallet_, "InvalidDonatedNftIndex")
							.withArgs("Invalid donated NFT index.", contracts_.signers[mainPrizeBeneficiaryIndex_].address, BigInt(donatedNftIndex_));
						transactionShouldHaveSucceeded_ = false;
					}
				}
				if (transactionShouldHaveSucceeded_) {
					if ( ! (donatedNfts_[donatedNftIndex_].nftContractIndex >= 0) ) {
						// console.info("202506168");
						await expect(transactionResponsePromise_)
							.revertedWithCustomError(newPrizesWallet_, "DonatedNftAlreadyClaimed")
							.withArgs("Donated NFT already claimed.", contracts_.signers[mainPrizeBeneficiaryIndex_].address, BigInt(donatedNftIndex_));
						transactionShouldHaveSucceeded_ = false;
					}
				}
				if (transactionShouldHaveSucceeded_) {
					if (contracts_.signers[mainPrizeBeneficiaryIndex_].address != mainPrizeBeneficiaryAddresses_[Number(donatedNfts_[donatedNftIndex_].roundNum)]) {
						// console.info("202506203");

						// // Comment-202506169 applies.
						// ++ testCounter3_;

						const transactionBlock_ = await hre.ethers.provider.getBlock("latest");
						if (transactionBlock_.timestamp >= Number(donationRoundTimeoutTimeToWithdrawPrizes_) && donationRoundTimeoutTimeToWithdrawPrizes_ > 0n) {
							// console.info("202506205");

							// // Comment-202506169 applies.
							// console.info("202506171", (( ++ testCounter4_ ) / testCounter3_).toPrecision(2));
						} else {
							// console.info("202506162");
							await expect(transactionResponsePromise_)
								.revertedWithCustomError(newPrizesWallet_, "DonatedNftClaimDenied")
								.withArgs(
									"Only the bidding round main prize beneficiary is permitted to claim this NFT before a timeout expires.",
									contracts_.signers[mainPrizeBeneficiaryIndex_].address,
									BigInt(donatedNftIndex_),
									donationRoundTimeoutTimeToWithdrawPrizes_,
									BigInt(transactionBlock_.timestamp)
								);
							transactionShouldHaveSucceeded_ = false;
						}
					} else {
						// console.info("202506163");
					}
				}
				expect(transactionShouldHaveSucceeded_).equal(transactionReceipt_ != undefined);
				if (transactionShouldHaveSucceeded_) {
					// console.info("202506164");
					await expect(transactionResponsePromise_)
						.emit(newPrizesWallet_, "DonatedNftClaimed")
						.withArgs(
							donatedNfts_[donatedNftIndex_].roundNum,
							contracts_.signers[mainPrizeBeneficiaryIndex_].address,
							nftContractsAddr_[donatedNfts_[donatedNftIndex_].nftContractIndex],
							donatedNfts_[donatedNftIndex_].nftId,
							BigInt(donatedNftIndex_)
						)
						.and.emit(nftContracts_[donatedNfts_[donatedNftIndex_].nftContractIndex], "Transfer")
						.withArgs(newPrizesWalletAddr_, contracts_.signers[mainPrizeBeneficiaryIndex_].address, donatedNfts_[donatedNftIndex_].nftId);
					allNfts_[donatedNfts_[donatedNftIndex_].nftContractIndex][Number(donatedNfts_[donatedNftIndex_].nftId)] = contracts_.signers[mainPrizeBeneficiaryIndex_].address;
					donatedNfts_[donatedNftIndex_].roundNum = 0n;
					donatedNfts_[donatedNftIndex_].nftContractIndex = -1;
					donatedNfts_[donatedNftIndex_].nftId = 0n;
					const donatedNftFromContract_ = await newPrizesWallet_.donatedNfts(BigInt(donatedNftIndex_));
					expect(donatedNftFromContract_[0]).equal(donatedNfts_[donatedNftIndex_].roundNum);
					expect(donatedNftFromContract_[1]).equal(hre.ethers.ZeroAddress);
					expect(donatedNftFromContract_[2]).equal(donatedNfts_[donatedNftIndex_].nftId);
				}

				// #endregion
			}

			// #endregion
		}

		// #endregion
	});

	// #endregion
});

// #endregion
