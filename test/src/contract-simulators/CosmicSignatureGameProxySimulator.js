// #region

"use strict";

// #endregion
// #region

const { expect } = require("chai");
const hre = require("hardhat");
// const { chai } = require("@nomicfoundation/hardhat-chai-matchers");
const { generateRandomUInt256FromSeedWrapper } = require("../../../src/Helpers.js");
const { assertAddressIsValid, assertEvent, generateRandomUInt256Seed } = require("../../../src/ContractTestingHelpers.js");

// #endregion
// #region `createCosmicSignatureGameProxySimulator`

/// todo-3 Another test would be to populate this with some random values. But I have no immediate plans to develop it.
async function createCosmicSignatureGameProxySimulator(contracts_, cosmicSignatureTokenSimulator_, randomWalkNftSimulator_, cosmicSignatureNftSimulator_, prizesWalletSimulator_, stakingWalletRandomWalkNftSimulator_, stakingWalletCosmicSignatureNftSimulator_, charityWalletSimulator_) {
	// #region

	const FIRST_ROUND_INITIAL_ETH_BID_PRICE = 10n ** (18n - 4n);
	const ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER = 2n;
	const DEFAULT_ETH_DUTCH_AUCTION_ENDING_BID_PRICE_DIVISOR = 10n * ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
	const RANDOMWALK_NFT_BID_PRICE_DIVISOR = 2n;
	const CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER = 2n;

	// #endregion
	// #region

	const cosmicSignatureGameProxySimulator_ = {
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
		ethDutchAuctionDurationDivisor: (60n * 60n * 1_000_000n + (2n * 24n * 60n * 60n) / 2n) / (2n * 24n * 60n * 60n),
		FIRST_ROUND_INITIAL_ETH_BID_PRICE,
		ethDutchAuctionBeginningBidPrice: 0n,
		ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER,
		ethDutchAuctionEndingBidPriceDivisor: DEFAULT_ETH_DUTCH_AUCTION_ENDING_BID_PRICE_DIVISOR,
		nextEthBidPrice: 0n,
		ethBidPriceIncreaseDivisor: 100n,
		RANDOMWALK_NFT_BID_PRICE_DIVISOR,
		ethBidRefundAmountInGasToSwallowMaxLimit: 6843n,
		cstDutchAuctionBeginningTimeStamp: 0n,
		cstDutchAuctionDurationDivisor: (60n * 60n * 1_000_000n + (24n * 60n * 60n / 2n) / 2n) / (24n * 60n * 60n / 2n),
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
		chronoWarriorEthPrizeAmountPercentage: 8n,
		raffleTotalEthPrizeAmountForBiddersPercentage: 4n,
		numRaffleEthPrizesForBidders: 3n,
		numRaffleCosmicSignatureNftsForBidders: 5n,
		numRaffleCosmicSignatureNftsForRandomWalkNftStakers: 4n,
		cosmicSignatureNftStakingTotalEthRewardAmountPercentage: 6n,
		initialDurationUntilMainPrizeDivisor: (60n * 60n * 1_000_000n + (24n * 60n * 60n) / 2n) / (24n * 60n * 60n),
		mainPrizeTime: 0n,
		mainPrizeTimeIncrementInMicroSeconds: 60n * 60n * 1_000_000n,
		mainPrizeTimeIncrementIncreaseDivisor: 100n,
		timeoutDurationToClaimMainPrize: 24n * 60n * 60n,
		mainEthPrizeAmountPercentage: 25n,
		cosmicSignatureTokenSimulator: cosmicSignatureTokenSimulator_,
		randomWalkNftSimulator: randomWalkNftSimulator_,
		cosmicSignatureNftSimulator: cosmicSignatureNftSimulator_,
		prizesWalletSimulator: prizesWalletSimulator_,
		stakingWalletRandomWalkNftSimulator: stakingWalletRandomWalkNftSimulator_,
		stakingWalletCosmicSignatureNftSimulator: stakingWalletCosmicSignatureNftSimulator_,
		// marketingWalletSimulator:
		marketingWalletCstContributionAmount: 300n * 10n ** 18n,
		charityWalletSimulator: charityWalletSimulator_,
		charityEthDonationAmountPercentage: 7n,

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
		// #region `getDurationUntilMainPrizeRaw`

		getDurationUntilMainPrizeRaw: function(latestBlock_) {
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
			expect(typeof newValue_).equal("bigint");
			expect(newValue_).greaterThan(0n);
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
		// #region `setEthDutchAuctionEndingBidPriceDivisor`

		setEthDutchAuctionEndingBidPriceDivisor: function(newValue_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			expect(typeof newValue_).equal("bigint");
			expect(newValue_).greaterThan(0n);
			this.ethDutchAuctionEndingBidPriceDivisor = newValue_;
			assertEvent(
				transactionReceipt_.logs[eventIndexWrapper_.value],
				contracts_.cosmicSignatureGameProxy,
				"EthDutchAuctionEndingBidPriceDivisorChanged",
				[newValue_,]
			);
			++ eventIndexWrapper_.value;
		},

		// #endregion
		// #region `donateEth`

		donateEth: function(donorAddress_, amount_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			assertAddressIsValid(donorAddress_);
			expect(typeof amount_).equal("bigint");
			expect(amount_).greaterThanOrEqual(0n);
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
			expect(typeof amount_).equal("bigint");
			expect(amount_).greaterThanOrEqual(0n);
			expect(typeof data_).equal("string");
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
			expect(typeof index_).equal("bigint");
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
			expect(typeof bidIndex_).equal("bigint");
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
			expect(bidderInfo_).not.equal(undefined);
			return bidderInfo_;
		},

		// #endregion
		// #region `_updateChampionsIfNeeded`

		_updateChampionsIfNeeded: function(transactionBlock_) {
			const lastBidTimeStampCopy_ = this.biddersInfo[this.lastBidderAddress].lastBidTimeStamp;
			const lastBidDuration_ = BigInt(transactionBlock_.timestamp) - lastBidTimeStampCopy_;
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
			expect(typeof chronoEndTimeStamp_).equal("bigint");
			expect(chronoEndTimeStamp_).greaterThan(0n);
			const chronoStartTimeStamp_ = this.enduranceChampionStartTimeStamp + this.prevEnduranceChampionDuration;
			const chronoDuration_ = chronoEndTimeStamp_ - chronoStartTimeStamp_;
			if (chronoDuration_ > this.chronoWarriorDuration) {
				this.chronoWarriorAddress = this.enduranceChampionAddress;
				this.chronoWarriorDuration = chronoDuration_;
			}
		},

		// #endregion
		// #region `tryGetCurrentChampions`

		tryGetCurrentChampions: function(latestBlock_) {
			// #region

			const result_ = {
				enduranceChampionAddress: hre.ethers.ZeroAddress,
				enduranceChampionDuration: 0n,
				chronoWarriorAddress: hre.ethers.ZeroAddress,
				chronoWarriorDuration: 0n,
			};

			// #endregion
			// #region

			if (this.lastBidderAddress != hre.ethers.ZeroAddress) {
				// #region

				result_.enduranceChampionAddress = this.enduranceChampionAddress;
				let enduranceChampionStartTimeStamp_ = this.enduranceChampionStartTimeStamp;
				result_.enduranceChampionDuration = this.enduranceChampionDuration;
				let prevEnduranceChampionDuration_ = this.prevEnduranceChampionDuration;
				result_.chronoWarriorAddress = this.chronoWarriorAddress;
				result_.chronoWarriorDuration = this.chronoWarriorDuration;

				// #endregion
				// #region

				const lastBidTimeStampCopy_ = this.biddersInfo[this.lastBidderAddress].lastBidTimeStamp;
				const lastBidDuration_ = BigInt(latestBlock_.timestamp) - lastBidTimeStampCopy_;

				// #endregion
				// #region

				if (result_.enduranceChampionAddress == hre.ethers.ZeroAddress) {
					// #region

					result_.enduranceChampionAddress = this.lastBidderAddress;
					enduranceChampionStartTimeStamp_ = lastBidTimeStampCopy_;
					result_.enduranceChampionDuration = lastBidDuration_;

					// #endregion
				} else if (lastBidDuration_ > result_.enduranceChampionDuration) {
					// #region

					{
						const chronoEndTimeStamp_ = lastBidTimeStampCopy_ + result_.enduranceChampionDuration;
						const chronoStartTimeStamp_ = enduranceChampionStartTimeStamp_ + prevEnduranceChampionDuration_;
						const chronoDuration_ = chronoEndTimeStamp_ - chronoStartTimeStamp_;
						if (chronoDuration_ > result_.chronoWarriorDuration) {
							result_.chronoWarriorAddress = result_.enduranceChampionAddress;
							result_.chronoWarriorDuration = chronoDuration_;
						}
					}

					// #endregion
					// #region

					prevEnduranceChampionDuration_ = result_.enduranceChampionDuration;
					result_.enduranceChampionAddress = this.lastBidderAddress;
					enduranceChampionStartTimeStamp_ = lastBidTimeStampCopy_;
					result_.enduranceChampionDuration = lastBidDuration_;

					// #endregion
				}

				// #endregion
				// #region

				{
					const chronoEndTimeStamp_ = BigInt(latestBlock_.timestamp);
					const chronoStartTimeStamp_ = enduranceChampionStartTimeStamp_ + prevEnduranceChampionDuration_;
					const chronoDuration_ = chronoEndTimeStamp_ - chronoStartTimeStamp_;
					if (chronoDuration_ > result_.chronoWarriorDuration) {
						result_.chronoWarriorAddress = result_.enduranceChampionAddress;
						result_.chronoWarriorDuration = chronoDuration_;
					}
				}

				// #endregion
			}

			// #endregion
			// #region

			return result_;

			// #endregion
		},

		// #endregion
		// We don't need `bidWithEthAndDonateToken`.
		// We don't need `bidWithEthAndDonateNft`.
		// #region `canBidWithEth`

		/// Issue. To keep it simple, this method doesn't assert that the bidder has enough ETH.
		/// If they don't the test would fail.
		canBidWithEth: async function(transactionBlock_, bidderAddress_, value_, randomWalkNftId_, message_, paidEthPrice_, contracts_, transactionResponsePromise_) {
			assertAddressIsValid(bidderAddress_);
			expect(typeof value_).equal("bigint");
			expect(value_).greaterThanOrEqual(0n);
			expect(typeof randomWalkNftId_).equal("bigint");
			expect(typeof message_).equal("string");
			expect(typeof paidEthPrice_).equal("bigint");
			expect(paidEthPrice_).greaterThan(0n);
			const overpaidEthPrice_ = value_ - paidEthPrice_;
			if ( ! (overpaidEthPrice_ >= 0n) ) {
				// console.info("202504151");
				await expect(transactionResponsePromise_)
					.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InsufficientReceivedBidAmount")
					.withArgs("The current ETH bid price is greater than the amount you transferred.", paidEthPrice_, value_);
				return false;
			}
			if (randomWalkNftId_ < 0n) {
				// console.info("202505125");
			} else {
				if (this.wasRandomWalkNftUsed(randomWalkNftId_)) {
					// console.info("202504152");
					await expect(transactionResponsePromise_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "UsedRandomWalkNft")
						.withArgs("This Random Walk NFT has already been used for bidding.", randomWalkNftId_);
					return false;
				}
				if ( ! (bidderAddress_ == this.randomWalkNftSimulator.ownerOf(randomWalkNftId_)) ) {
					// console.info("202504153");
					await expect(transactionResponsePromise_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "CallerIsNotNftOwner")
						.withArgs("You are not the owner of this Random Walk NFT.", contracts_.randomWalkNftAddress, randomWalkNftId_, bidderAddress_);
					return false;
				}
			}
			if ( ! (message_.length <= this.bidMessageLengthMaxLimit) ) {
				// console.info("202504154");
				await expect(transactionResponsePromise_)
					.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "TooLongBidMessage")
					.withArgs("Message is too long.", message_.length);
				return false;
			}
			if (this.lastBidderAddress == hre.ethers.ZeroAddress) {
				if ( ! (BigInt(transactionBlock_.timestamp) >= this.roundActivationTime) ) {
					// console.info("202504155");
					await expect(transactionResponsePromise_)
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

			expect(typeof bidderEthBalanceAmountBeforeTransaction_).equal("bigint");

			// If this was zero the transaction would have failed.
			expect(bidderEthBalanceAmountBeforeTransaction_).greaterThan(0n);

			expect(typeof value_).equal("bigint");
			expect(value_).greaterThanOrEqual(0n);
			expect(typeof randomWalkNftId_).equal("bigint");
			expect(typeof message_).equal("string");
			expect(typeof ethBidPrice_).equal("bigint");
			expect(ethBidPrice_).greaterThan(0n);
			expect(typeof paidEthPrice_).equal("bigint");
			expect(paidEthPrice_).greaterThan(0n);
			let overpaidEthPrice_ = value_ - paidEthPrice_;
			// console.info("bidWithEth succeeded.", hre.ethers.formatEther(ethBidPrice_), hre.ethers.formatEther(paidEthPrice_), hre.ethers.formatEther(value_), hre.ethers.formatEther(overpaidEthPrice_));
			if (overpaidEthPrice_ == 0n) {
				// console.info("202505081");
			} else if (overpaidEthPrice_ > 0n) {
				// Comment-202505117 relates.
				const transactionGasPrice_ = transactionReceipt_.gasPrice;
				expect(transactionGasPrice_).greaterThan(0n);
				const ethBidRefundAmountToSwallowMaxLimit_ = this.ethBidRefundAmountInGasToSwallowMaxLimit * transactionGasPrice_;

				if (overpaidEthPrice_ <= ethBidRefundAmountToSwallowMaxLimit_) {
					// console.info("202505145", hre.ethers.formatEther(overpaidEthPrice_), hre.ethers.formatEther(ethBidRefundAmountToSwallowMaxLimit_));
					overpaidEthPrice_ = 0n;
					paidEthPrice_ = value_;
					// ethBidPrice_ = value_;
					// if (randomWalkNftId_ < 0n) {
					// 	console.info("202505094", hre.ethers.formatEther(ethBidPrice_), hre.ethers.formatEther(paidEthPrice_));
					// } else {
					// 	ethBidPrice_ *= this.RANDOMWALK_NFT_BID_PRICE_DIVISOR;
					// 	console.info("202505095", hre.ethers.formatEther(ethBidPrice_), hre.ethers.formatEther(paidEthPrice_));
					// }
				} else {
					// console.info("202505087", hre.ethers.formatEther(overpaidEthPrice_), hre.ethers.formatEther(ethBidRefundAmountToSwallowMaxLimit_));
				}
			} else {
				expect(false).true;
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
			this.cosmicSignatureTokenSimulator.mint(bidderAddress_, this.cstRewardAmountForBidding, contracts_, transactionReceipt_, eventIndexWrapper_);

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
			this.ethBalanceAmount += paidEthPrice_;
			const transactionFeeInEth_ = transactionReceipt_.fee;
			expect(transactionFeeInEth_).greaterThan(0n);
			const bidderEthBalanceAmountAfterTransaction_ = await hre.ethers.provider.getBalance(bidderAddress_);
			expect(bidderEthBalanceAmountAfterTransaction_).equal(bidderEthBalanceAmountBeforeTransaction_ - paidEthPrice_ - transactionFeeInEth_);
		},

		// #endregion
		// #region `getNextEthBidPriceAdvanced`

		getNextEthBidPriceAdvanced: function(blockBeforeTransaction_, currentTimeOffset_) {
			expect(typeof currentTimeOffset_).equal("bigint");
			let nextEthBidPrice_;
			if (this.lastBidderAddress == hre.ethers.ZeroAddress) {
				nextEthBidPrice_ = this.ethDutchAuctionBeginningBidPrice;
				if (nextEthBidPrice_ == 0n) {
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

		getEthDutchAuctionDurations: function(latestBlock_) {
			const ethDutchAuctionDuration_ = this._getEthDutchAuctionDuration();
			const ethDutchAuctionElapsedDuration_ = this.getDurationElapsedSinceRoundActivation(latestBlock_);
			return {ethDutchAuctionDuration: ethDutchAuctionDuration_, ethDutchAuctionElapsedDuration: ethDutchAuctionElapsedDuration_,};
		},

		// #endregion
		// #region `_getEthDutchAuctionDuration`

		_getEthDutchAuctionDuration: function() {
			const ethDutchAuctionDuration_ = this.mainPrizeTimeIncrementInMicroSeconds / this.ethDutchAuctionDurationDivisor;
			return ethDutchAuctionDuration_;
		},

		// #endregion
		// #region `wasRandomWalkNftUsed`

		wasRandomWalkNftUsed: function(randomWalkNftId_) {
			expect(typeof randomWalkNftId_).equal("bigint");
			expect(randomWalkNftId_).greaterThanOrEqual(0n);
			const randomWalkNftWasUsed_ = Boolean(this.usedRandomWalkNfts[randomWalkNftId_]);
			return randomWalkNftWasUsed_;
		},

		// #endregion
		// We don't need `bidWithCstAndDonateToken`.
		// We don't need `bidWithCstAndDonateNft`.
		// #region `canBidWithCst`

		canBidWithCst: async function(transactionBlock_, bidderAddress_, cstPriceToPayMaxLimit_, message_, paidCstPrice_, contracts_, transactionResponsePromise_) {
			// assertAddressIsValid(bidderAddress_);
			expect(bidderAddress_).not.equal(hre.ethers.ZeroAddress);
			expect(typeof cstPriceToPayMaxLimit_).equal("bigint");
			expect(cstPriceToPayMaxLimit_).greaterThanOrEqual(0n);
			expect(typeof message_).equal("string");
			expect(typeof paidCstPrice_).equal("bigint");
			expect(paidCstPrice_).greaterThanOrEqual(0n);
			if ( ! (paidCstPrice_ <= cstPriceToPayMaxLimit_) ) {
				// console.info("202504166");
				await expect(transactionResponsePromise_)
					.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "InsufficientReceivedBidAmount")
					.withArgs("The current CST bid price is greater than the maximum you allowed.", paidCstPrice_, cstPriceToPayMaxLimit_);
				return false;
			}
			const bidderCstBalanceBeforeTransaction_ = this.cosmicSignatureTokenSimulator.balanceOf(bidderAddress_);
			if ( ! (paidCstPrice_ <= bidderCstBalanceBeforeTransaction_) ) {
				// console.info("202504167");
				await expect(transactionResponsePromise_)
					.revertedWithCustomError(contracts_.cosmicSignatureToken, "ERC20InsufficientBalance")
					.withArgs(bidderAddress_, bidderCstBalanceBeforeTransaction_, paidCstPrice_);
				return false;
			}
			if ( ! (message_.length <= this.bidMessageLengthMaxLimit) ) {
				// console.info("202504168");
				await expect(transactionResponsePromise_)
					.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "TooLongBidMessage")
					.withArgs("Message is too long.", message_.length);
				return false;
			}
			if (this.lastBidderAddress == hre.ethers.ZeroAddress) {
				if ( ! (BigInt(transactionBlock_.timestamp) >= this.roundActivationTime) ) {
					// console.info("202504169");
					await expect(transactionResponsePromise_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "RoundIsInactive")
						.withArgs("The current bidding round is not active yet.", this.roundActivationTime, BigInt(transactionBlock_.timestamp));
					return false;
				}
				// console.info("202504171");
				await expect(transactionResponsePromise_)
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

			expect(typeof message_).equal("string");
			expect(typeof paidCstPrice_).equal("bigint");
			expect(paidCstPrice_).greaterThanOrEqual(0n);
			// console.info("bidWithCst succeeded.", hre.ethers.formatEther(paidCstPrice_));

			// Comment-202505086 applies.
			this.cosmicSignatureTokenSimulator.burn(bidderAddress_, paidCstPrice_, contracts_, transactionReceipt_, eventIndexWrapper_);
			this.cosmicSignatureTokenSimulator.mint(bidderAddress_, this.cstRewardAmountForBidding, contracts_, transactionReceipt_, eventIndexWrapper_);

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
			expect(this.lastBidderAddress).not.equal(hre.ethers.ZeroAddress);
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
		// #region `getNextCstBidPriceAdvanced`

		getNextCstBidPriceAdvanced: function(blockBeforeTransaction_, currentTimeOffset_) {
			expect(typeof currentTimeOffset_).equal("bigint");
			/*const*/ let [cstDutchAuctionDuration_, cstDutchAuctionRemainingDuration_] = this._getCstDutchAuctionTotalAndRemainingDurations(blockBeforeTransaction_);
			cstDutchAuctionRemainingDuration_ -= currentTimeOffset_;
			if (cstDutchAuctionRemainingDuration_ <= 0n) {
				// console.info("202505133");
				return 0n;
			}
			// console.info("202505134");

			// Comment-202501307 relates and/or applies.
			const cstDutchAuctionBeginningBidPrice_ =
				(this.lastCstBidderAddress == hre.ethers.ZeroAddress) ? this.nextRoundFirstCstDutchAuctionBeginningBidPrice : this.cstDutchAuctionBeginningBidPrice;

			const nextCstBidPrice_ = cstDutchAuctionBeginningBidPrice_ * cstDutchAuctionRemainingDuration_ / cstDutchAuctionDuration_;
			return nextCstBidPrice_;
		},

		// #endregion
		// #region `getCstDutchAuctionDurations`

		getCstDutchAuctionDurations: function(latestBlock_) {
			const cstDutchAuctionDuration_ = this._getCstDutchAuctionDuration();
			const cstDutchAuctionElapsedDuration_ = this._getCstDutchAuctionElapsedDuration(latestBlock_);
			return {cstDutchAuctionDuration: cstDutchAuctionDuration_, cstDutchAuctionElapsedDuration: cstDutchAuctionElapsedDuration_,};
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
		
		canClaimMainPrize: async function(transactionBlock_, callerAddress_, contracts_, transactionResponsePromise_) {
			assertAddressIsValid(callerAddress_);
			if (callerAddress_ == this.lastBidderAddress) {
				if ( ! (BigInt(transactionBlock_.timestamp) >= this.mainPrizeTime) ) {
					// console.info("202504252");
					await expect(transactionResponsePromise_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "MainPrizeEarlyClaim")
						.withArgs("Not enough time has elapsed.", this.mainPrizeTime, BigInt(transactionBlock_.timestamp));
					return false;
				}
			} else {
				if ( ! (this.lastBidderAddress != hre.ethers.ZeroAddress) ) {
					// console.info("202504253");
					await expect(transactionResponsePromise_)
						.revertedWithCustomError(contracts_.cosmicSignatureGameProxy, "NoBidsPlacedInCurrentRound")
						.withArgs("There have been no bids in the current bidding round yet.");
					return false;
				}
				const durationUntilOperationIsPermitted_ =
					this.getDurationUntilMainPrizeRaw(transactionBlock_) + this.timeoutDurationToClaimMainPrize;
				if ( ! (durationUntilOperationIsPermitted_ <= 0n) ) {
					// console.info("202504254");
					await expect(transactionResponsePromise_)
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
		claimMainPrize: async function(blockBeforeTransaction_, transactionBlock_, callerAddress_, bidderEthBalanceAmountBeforeTransaction_, contracts_, transactionReceipt_, eventIndexWrapper_/*, blockchainPropertyGetter_*/) {
			// console.info((callerAddress_ == this.lastBidderAddress) ? "202505138 The last bidder claims the main prize." : "202505139 Someone else claims the main prize.");
			this._updateChampionsIfNeeded(transactionBlock_);
			this._updateChronoWarriorIfNeeded(BigInt(transactionBlock_.timestamp));
			await this._distributePrizes(blockBeforeTransaction_, transactionBlock_, callerAddress_, bidderEthBalanceAmountBeforeTransaction_, contracts_, transactionReceipt_, eventIndexWrapper_/*, blockchainPropertyGetter_*/);
			this._prepareNextRound(transactionBlock_, contracts_, transactionReceipt_, eventIndexWrapper_);
		},

		// #endregion
		// #region `_distributePrizes`
		
		_distributePrizes: async function(blockBeforeTransaction_, transactionBlock_, callerAddress_, bidderEthBalanceAmountBeforeTransaction_, contracts_, transactionReceipt_, eventIndexWrapper_/*, blockchainPropertyGetter_*/) {
			// #region

			// assertAddressIsValid(callerAddress_);
			expect(callerAddress_).not.equal(hre.ethers.ZeroAddress);

			expect(typeof bidderEthBalanceAmountBeforeTransaction_).equal("bigint");

			// If this was zero the transaction would have failed.
			expect(bidderEthBalanceAmountBeforeTransaction_).greaterThan(0n);

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

				let mainPrizeBeneficiaryCosmicSignatureNftId_;

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

						blockchainBasedRandomNumberSeedWrapper_.value = /*await*/ generateRandomUInt256Seed(blockBeforeTransaction_, transactionBlock_/*, blockchainPropertyGetter_*/);

						// #endregion
						// #region CS NFTs for random Random Walk NFT stakers.

						{
							// Comment-202504265 applies.
							const blockchainBasedRandomNumberSeed_ = blockchainBasedRandomNumberSeedWrapper_.value ^ 0x7c6eeb003d4a6dc5ebf549935c6ffb814ba1f060f1af8a0b11c2aa94a8e716e4n;

							const luckyStakerAddresses_ =
								this.stakingWalletRandomWalkNftSimulator.pickRandomStakerAddressesIfPossible(
									this.numRaffleCosmicSignatureNftsForRandomWalkNftStakers,
									blockchainBasedRandomNumberSeed_
								);
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
							const blockchainBasedRandomNumberSeed_ = blockchainBasedRandomNumberSeedWrapper_.value ^ 0x2a8612ecb5cb17da87f8befda0480288e2d053de55d9d7d4dc4899077cf5aedan;

							firstCosmicSignatureNftId_ = this.cosmicSignatureNftSimulator.mintMany(this.roundNum, cosmicSignatureNftOwnerAddresses_, blockchainBasedRandomNumberSeed_, contracts_, transactionReceipt_, eventIndexWrapper_);
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
							// #region CS NFT for the Main Prize Beneficiary.

							-- cosmicSignatureNftIndex_;
							-- cosmicSignatureNftId_;
							mainPrizeBeneficiaryCosmicSignatureNftId_ = cosmicSignatureNftId_;

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

					cosmicSignatureTokenMintSpecs_[0] = {account: contracts_.marketingWalletAddress, value: this.marketingWalletCstContributionAmount,};

					// #endregion
					// #region Minting CSTs.

					this.cosmicSignatureTokenSimulator.mintMany(cosmicSignatureTokenMintSpecs_, contracts_, transactionReceipt_, eventIndexWrapper_);

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

							mainEthPrizeAmount_ = this.getMainEthPrizeAmount();
							charityEthDonationAmount_ = this.getCharityEthDonationAmount();
							cosmicSignatureNftStakingTotalEthRewardAmount_ = this.getCosmicSignatureNftStakingTotalEthRewardAmount();
							this.depositEthToPrizesWalletMany(ethDepositsTotalAmount_, ethDeposits_, contracts_, transactionReceipt_, eventIndexWrapper_);
							const timeoutTimeToWithdrawSecondaryPrizes_ = this.prizesWalletSimulator.registerRoundEnd(transactionBlock_);
							assertEvent(
								transactionReceipt_.logs[eventIndexWrapper_.value],
								contracts_.cosmicSignatureGameProxy,
								"MainPrizeClaimed",
								[this.roundNum, callerAddress_, mainEthPrizeAmount_, mainPrizeBeneficiaryCosmicSignatureNftId_, timeoutTimeToWithdrawSecondaryPrizes_,]
							);
							++ eventIndexWrapper_.value;

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
						[contracts_.charityWalletAddress, charityEthDonationAmount_,]
					);
					++ eventIndexWrapper_.value;

					// #endregion
				}

				// #endregion
			}

			// #endregion
			// #region Main ETH prize for main prize beneficiary.

			this.ethBalanceAmount -= mainEthPrizeAmount_;
			// expect(this.ethBalanceAmount).greaterThanOrEqual(0n);
			const bidderEthBalanceAmountAfterTransaction_ = await hre.ethers.provider.getBalance(callerAddress_);
			const transactionFeeInEth_ = transactionReceipt_.fee;
			expect(transactionFeeInEth_).greaterThan(0n);
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
			expect(newEthBalanceAmount_).greaterThanOrEqual(0n);
			this.ethBalanceAmount = newEthBalanceAmount_;
			this.prizesWalletSimulator.depositEthMany(value_, this.roundNum, ethDeposits_, contracts_, transactionReceipt_, eventIndexWrapper_);
		},

		// #endregion
		// #region `tryDepositEthToStakingWalletCosmicSignatureNft`

		tryDepositEthToStakingWalletCosmicSignatureNft: function(value_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			const isSuccess_ = this.stakingWalletCosmicSignatureNftSimulator.tryDeposit(value_, this.roundNum, contracts_, transactionReceipt_, eventIndexWrapper_);
			if (isSuccess_) {
				const newEthBalanceAmount_ = this.ethBalanceAmount - value_;
				expect(newEthBalanceAmount_).greaterThanOrEqual(0n);
				this.ethBalanceAmount = newEthBalanceAmount_;
			}
			return isSuccess_;
		},

		// #endregion
		// #region `depositEthToCharityWallet`

		depositEthToCharityWallet: function(value_, contracts_, transactionReceipt_, eventIndexWrapper_) {
			const newEthBalanceAmount_ = this.ethBalanceAmount - value_;
			expect(newEthBalanceAmount_).greaterThanOrEqual(0n);
			this.ethBalanceAmount = newEthBalanceAmount_;
			this.charityWalletSimulator.receive(contracts_.cosmicSignatureGameProxyAddress, value_, contracts_, transactionReceipt_, eventIndexWrapper_);
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

	cosmicSignatureGameProxySimulator_.initialize(contracts_);
	return cosmicSignatureGameProxySimulator_;

	// #endregion
}

// #endregion
// #region `assertCosmicSignatureGameProxySimulator`

async function assertCosmicSignatureGameProxySimulator(cosmicSignatureGameProxySimulator_, contracts_, randomNumberSeedWrapper_) {
	expect(await hre.ethers.provider.getBalance(contracts_.cosmicSignatureGameProxyAddress)).equal(cosmicSignatureGameProxySimulator_.ethBalanceAmount);
	expect(await contracts_.cosmicSignatureGameProxy.numEthDonationWithInfoRecords()).equal(cosmicSignatureGameProxySimulator_.numEthDonationWithInfoRecords());
	await assertCosmicSignatureGameProxySimulatorOfRandomEthDonationWithInfoRecordIfPossible(cosmicSignatureGameProxySimulator_, contracts_, randomNumberSeedWrapper_);
	expect(await contracts_.cosmicSignatureGameProxy.lastBidderAddress()).equal(cosmicSignatureGameProxySimulator_.lastBidderAddress);
	expect(await contracts_.cosmicSignatureGameProxy.lastCstBidderAddress()).equal(cosmicSignatureGameProxySimulator_.lastCstBidderAddress);
	expect(await contracts_.cosmicSignatureGameProxy.getTotalNumBids(cosmicSignatureGameProxySimulator_.roundNum)).equal(cosmicSignatureGameProxySimulator_.getTotalNumBids());
	await assertCosmicSignatureGameProxySimulatorOfRandomBidIfPossible(cosmicSignatureGameProxySimulator_, contracts_, randomNumberSeedWrapper_);
	await assertCosmicSignatureGameProxySimulatorOfRandomSigner(cosmicSignatureGameProxySimulator_, contracts_, randomNumberSeedWrapper_);
	expect(await contracts_.cosmicSignatureGameProxy.enduranceChampionAddress()).equal(cosmicSignatureGameProxySimulator_.enduranceChampionAddress);
	expect(await contracts_.cosmicSignatureGameProxy.enduranceChampionStartTimeStamp()).equal(cosmicSignatureGameProxySimulator_.enduranceChampionStartTimeStamp);
	expect(await contracts_.cosmicSignatureGameProxy.enduranceChampionDuration()).equal(cosmicSignatureGameProxySimulator_.enduranceChampionDuration);
	expect(await contracts_.cosmicSignatureGameProxy.prevEnduranceChampionDuration()).equal(cosmicSignatureGameProxySimulator_.prevEnduranceChampionDuration);
	expect(await contracts_.cosmicSignatureGameProxy.chronoWarriorAddress()).equal(cosmicSignatureGameProxySimulator_.chronoWarriorAddress);
	expect(BigInt.asIntN(256, await contracts_.cosmicSignatureGameProxy.chronoWarriorDuration())).equal(cosmicSignatureGameProxySimulator_.chronoWarriorDuration);
	expect(await contracts_.cosmicSignatureGameProxy.roundNum()).equal(cosmicSignatureGameProxySimulator_.roundNum);
	expect(await contracts_.cosmicSignatureGameProxy.delayDurationBeforeRoundActivation()).equal(cosmicSignatureGameProxySimulator_.delayDurationBeforeRoundActivation);
	expect(await contracts_.cosmicSignatureGameProxy.roundActivationTime()).equal(cosmicSignatureGameProxySimulator_.roundActivationTime);
	expect(await contracts_.cosmicSignatureGameProxy.ethDutchAuctionDurationDivisor()).equal(cosmicSignatureGameProxySimulator_.ethDutchAuctionDurationDivisor);
	expect(await contracts_.cosmicSignatureGameProxy.ethDutchAuctionBeginningBidPrice()).equal(cosmicSignatureGameProxySimulator_.ethDutchAuctionBeginningBidPrice);
	expect(await contracts_.cosmicSignatureGameProxy.ethDutchAuctionEndingBidPriceDivisor()).equal(cosmicSignatureGameProxySimulator_.ethDutchAuctionEndingBidPriceDivisor);
	expect(await contracts_.cosmicSignatureGameProxy.nextEthBidPrice()).equal(cosmicSignatureGameProxySimulator_.nextEthBidPrice);
	expect(await contracts_.cosmicSignatureGameProxy.ethBidPriceIncreaseDivisor()).equal(cosmicSignatureGameProxySimulator_.ethBidPriceIncreaseDivisor);
	expect(await contracts_.cosmicSignatureGameProxy.ethBidRefundAmountInGasToSwallowMaxLimit()).equal(cosmicSignatureGameProxySimulator_.ethBidRefundAmountInGasToSwallowMaxLimit);
	expect(await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningTimeStamp()).equal(cosmicSignatureGameProxySimulator_.cstDutchAuctionBeginningTimeStamp);
	expect(await contracts_.cosmicSignatureGameProxy.cstDutchAuctionDurationDivisor()).equal(cosmicSignatureGameProxySimulator_.cstDutchAuctionDurationDivisor);
	expect(await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningBidPrice()).equal(cosmicSignatureGameProxySimulator_.cstDutchAuctionBeginningBidPrice);
	expect(await contracts_.cosmicSignatureGameProxy.nextRoundFirstCstDutchAuctionBeginningBidPrice()).equal(cosmicSignatureGameProxySimulator_.nextRoundFirstCstDutchAuctionBeginningBidPrice);
	expect(await contracts_.cosmicSignatureGameProxy.cstDutchAuctionBeginningBidPriceMinLimit()).equal(cosmicSignatureGameProxySimulator_.cstDutchAuctionBeginningBidPriceMinLimit);
	await assertCosmicSignatureGameProxySimulatorRandomRandomWalkNftIfPossible(cosmicSignatureGameProxySimulator_, contracts_, randomNumberSeedWrapper_);
	expect(await contracts_.cosmicSignatureGameProxy.bidMessageLengthMaxLimit()).equal(cosmicSignatureGameProxySimulator_.bidMessageLengthMaxLimit);
	expect(await contracts_.cosmicSignatureGameProxy.cstRewardAmountForBidding()).equal(cosmicSignatureGameProxySimulator_.cstRewardAmountForBidding);
	expect(await contracts_.cosmicSignatureGameProxy.cstPrizeAmountMultiplier()).equal(cosmicSignatureGameProxySimulator_.cstPrizeAmountMultiplier);
	expect(await contracts_.cosmicSignatureGameProxy.chronoWarriorEthPrizeAmountPercentage()).equal(cosmicSignatureGameProxySimulator_.chronoWarriorEthPrizeAmountPercentage);
	expect(await contracts_.cosmicSignatureGameProxy.raffleTotalEthPrizeAmountForBiddersPercentage()).equal(cosmicSignatureGameProxySimulator_.raffleTotalEthPrizeAmountForBiddersPercentage);
	expect(await contracts_.cosmicSignatureGameProxy.numRaffleEthPrizesForBidders()).equal(cosmicSignatureGameProxySimulator_.numRaffleEthPrizesForBidders);
	expect(await contracts_.cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForBidders()).equal(cosmicSignatureGameProxySimulator_.numRaffleCosmicSignatureNftsForBidders);
	expect(await contracts_.cosmicSignatureGameProxy.numRaffleCosmicSignatureNftsForRandomWalkNftStakers()).equal(cosmicSignatureGameProxySimulator_.numRaffleCosmicSignatureNftsForRandomWalkNftStakers);
	expect(await contracts_.cosmicSignatureGameProxy.cosmicSignatureNftStakingTotalEthRewardAmountPercentage()).equal(cosmicSignatureGameProxySimulator_.cosmicSignatureNftStakingTotalEthRewardAmountPercentage);
	expect(await contracts_.cosmicSignatureGameProxy.initialDurationUntilMainPrizeDivisor()).equal(cosmicSignatureGameProxySimulator_.initialDurationUntilMainPrizeDivisor);
	expect(await contracts_.cosmicSignatureGameProxy.mainPrizeTime()).equal(cosmicSignatureGameProxySimulator_.mainPrizeTime);
	expect(await contracts_.cosmicSignatureGameProxy.mainPrizeTimeIncrementInMicroSeconds()).equal(cosmicSignatureGameProxySimulator_.mainPrizeTimeIncrementInMicroSeconds);
	expect(await contracts_.cosmicSignatureGameProxy.mainPrizeTimeIncrementIncreaseDivisor()).equal(cosmicSignatureGameProxySimulator_.mainPrizeTimeIncrementIncreaseDivisor);
	expect(await contracts_.cosmicSignatureGameProxy.timeoutDurationToClaimMainPrize()).equal(cosmicSignatureGameProxySimulator_.timeoutDurationToClaimMainPrize);
	expect(await contracts_.cosmicSignatureGameProxy.mainEthPrizeAmountPercentage()).equal(cosmicSignatureGameProxySimulator_.mainEthPrizeAmountPercentage);
	expect(await contracts_.cosmicSignatureGameProxy.token()).equal(contracts_.cosmicSignatureTokenAddress);
	expect(await contracts_.cosmicSignatureGameProxy.randomWalkNft()).equal(contracts_.randomWalkNftAddress);
	expect(await contracts_.cosmicSignatureGameProxy.nft()).equal(contracts_.cosmicSignatureNftAddress);
	expect(await contracts_.cosmicSignatureGameProxy.prizesWallet()).equal(contracts_.prizesWalletAddress);
	expect(await contracts_.cosmicSignatureGameProxy.stakingWalletRandomWalkNft()).equal(contracts_.stakingWalletRandomWalkNftAddress);
	expect(await contracts_.cosmicSignatureGameProxy.stakingWalletCosmicSignatureNft()).equal(contracts_.stakingWalletCosmicSignatureNftAddress);
	expect(await contracts_.cosmicSignatureGameProxy.marketingWallet()).equal(contracts_.marketingWalletAddress);
	expect(await contracts_.cosmicSignatureGameProxy.marketingWalletCstContributionAmount()).equal(cosmicSignatureGameProxySimulator_.marketingWalletCstContributionAmount);
	expect(await contracts_.cosmicSignatureGameProxy.charityAddress()).equal(contracts_.charityWalletAddress);
	expect(await contracts_.cosmicSignatureGameProxy.charityEthDonationAmountPercentage()).equal(cosmicSignatureGameProxySimulator_.charityEthDonationAmountPercentage);
}

// #endregion
// #region `assertCosmicSignatureGameProxySimulatorOfRandomEthDonationWithInfoRecordIfPossible`

async function assertCosmicSignatureGameProxySimulatorOfRandomEthDonationWithInfoRecordIfPossible(cosmicSignatureGameProxySimulator_, contracts_, randomNumberSeedWrapper_) {
	const numEthDonationWithInfoRecordsCopy_ = cosmicSignatureGameProxySimulator_.numEthDonationWithInfoRecords();
	if (numEthDonationWithInfoRecordsCopy_ == 0n) {
		return;
	}
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const ethDonationWithInfoRecordIndex_ = randomNumber_ % numEthDonationWithInfoRecordsCopy_;
	await assertCosmicSignatureGameProxySimulatorOfEthDonationWithInfoRecord(cosmicSignatureGameProxySimulator_, contracts_, ethDonationWithInfoRecordIndex_);
}

// #endregion
// #region `assertCosmicSignatureGameProxySimulatorOfEthDonationWithInfoRecord`

async function assertCosmicSignatureGameProxySimulatorOfEthDonationWithInfoRecord(cosmicSignatureGameProxySimulator_, contracts_, ethDonationWithInfoRecordIndex_) {
	const ethDonationWithInfoInfoRecordFromContract_ = await contracts_.cosmicSignatureGameProxy.ethDonationWithInfoRecords(ethDonationWithInfoRecordIndex_);
	const ethDonationWithInfoInfoRecordFromContractSimulator_ = cosmicSignatureGameProxySimulator_.getEthDonationWithInfoRecord(ethDonationWithInfoRecordIndex_);
	expect(ethDonationWithInfoInfoRecordFromContract_[0]).equal(ethDonationWithInfoInfoRecordFromContractSimulator_.roundNum);
	expect(ethDonationWithInfoInfoRecordFromContract_[1]).equal(ethDonationWithInfoInfoRecordFromContractSimulator_.donorAddress);
	expect(ethDonationWithInfoInfoRecordFromContract_[2]).equal(ethDonationWithInfoInfoRecordFromContractSimulator_.amount);
	expect(ethDonationWithInfoInfoRecordFromContract_[3]).equal(ethDonationWithInfoInfoRecordFromContractSimulator_.data);
}

// #endregion
// #region `assertCosmicSignatureGameProxySimulatorOfRandomBidIfPossible`

async function assertCosmicSignatureGameProxySimulatorOfRandomBidIfPossible(cosmicSignatureGameProxySimulator_, contracts_, randomNumberSeedWrapper_) {
	const totalNumBidsCopy_ = cosmicSignatureGameProxySimulator_.getTotalNumBids();
	if (totalNumBidsCopy_ == 0n) {
		return;
	}
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const bidIndex_ = randomNumber_ % totalNumBidsCopy_;
	await assertCosmicSignatureGameProxySimulatorOfBid(cosmicSignatureGameProxySimulator_, contracts_, bidIndex_);
}

// #endregion
// #region `assertCosmicSignatureGameProxySimulatorOfBid`

async function assertCosmicSignatureGameProxySimulatorOfBid(cosmicSignatureGameProxySimulator_, contracts_, bidIndex_) {
	const bidderAddressFromContract_ = await contracts_.cosmicSignatureGameProxy.getBidderAddressAt(cosmicSignatureGameProxySimulator_.roundNum, bidIndex_);
	const bidderAddressFromContractSimulator_ = cosmicSignatureGameProxySimulator_.getBidderAddressAt(bidIndex_);
	expect(bidderAddressFromContract_).equal(bidderAddressFromContractSimulator_);
}

// #endregion
// #region `assertCosmicSignatureGameProxySimulatorOfRandomSigner`

async function assertCosmicSignatureGameProxySimulatorOfRandomSigner(cosmicSignatureGameProxySimulator_, contracts_, randomNumberSeedWrapper_) {
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const signerIndex_ = randomNumber_ % BigInt(contracts_.signers.length);
	const signer_ = contracts_.signers[Number(signerIndex_)];
	await assertCosmicSignatureGameProxySimulatorOfBidder(cosmicSignatureGameProxySimulator_, contracts_, signer_.address);
}

// #endregion
// #region `assertCosmicSignatureGameProxySimulatorOfBidder`

async function assertCosmicSignatureGameProxySimulatorOfBidder(cosmicSignatureGameProxySimulator_, contracts_, bidderAddress_) {
	const bidderInfoFromContract_ = await contracts_.cosmicSignatureGameProxy.biddersInfo(cosmicSignatureGameProxySimulator_.roundNum, bidderAddress_);
	const bidderInfoFromContractSimulator_ = cosmicSignatureGameProxySimulator_.getBidderInfo(bidderAddress_);
	expect(bidderInfoFromContract_[0]).equal(bidderInfoFromContractSimulator_.totalSpentEthAmount);
	expect(bidderInfoFromContract_[1]).equal(bidderInfoFromContractSimulator_.totalSpentCstAmount);
	expect(bidderInfoFromContract_[2]).equal(bidderInfoFromContractSimulator_.lastBidTimeStamp);
}

// #endregion
// #region `assertCosmicSignatureGameProxySimulatorRandomRandomWalkNftIfPossible`

async function assertCosmicSignatureGameProxySimulatorRandomRandomWalkNftIfPossible(cosmicSignatureGameProxySimulator_, contracts_, randomNumberSeedWrapper_) {
	const randomWalkNftTotalSupplyCopy_ = cosmicSignatureGameProxySimulator_.randomWalkNftSimulator.totalSupply();
	if (randomWalkNftTotalSupplyCopy_ == 0n) {
		return;
	}
	const randomNumber_ = generateRandomUInt256FromSeedWrapper(randomNumberSeedWrapper_);
	const randomWalkNftId_ = randomNumber_ % randomWalkNftTotalSupplyCopy_;
	await assertCosmicSignatureGameProxySimulatorRandomWalkNft(cosmicSignatureGameProxySimulator_, contracts_, randomWalkNftId_);
}

// #endregion
// #region `assertCosmicSignatureGameProxySimulatorRandomWalkNft`

async function assertCosmicSignatureGameProxySimulatorRandomWalkNft(cosmicSignatureGameProxySimulator_, contracts_, randomWalkNftId_) {
	// expect(typeof randomWalkNftId_).equal("bigint");
	expect(await contracts_.cosmicSignatureGameProxy.usedRandomWalkNfts(randomWalkNftId_)).equal(cosmicSignatureGameProxySimulator_.wasRandomWalkNftUsed(randomWalkNftId_) ? 1n : 0n);
}

// #endregion
// #region `assertCosmicSignatureGameProxySimulatorGetBidderTotalSpentAmounts`

async function assertCosmicSignatureGameProxySimulatorGetBidderTotalSpentAmounts(cosmicSignatureGameProxySimulator_, contracts_, bidderAddress_) {
	const bidderTotalSpentAmountsFromContract_ = await contracts_.cosmicSignatureGameProxy.getBidderTotalSpentAmounts(cosmicSignatureGameProxySimulator_.roundNum, bidderAddress_);
	// console.info(bidderTotalSpentAmountsFromContract_[0], bidderTotalSpentAmountsFromContract_[1]);
	const bidderInfoFromContractSimulator_ = cosmicSignatureGameProxySimulator_.getBidderInfo(bidderAddress_);
	expect(bidderTotalSpentAmountsFromContract_[0]).equal(bidderInfoFromContractSimulator_.totalSpentEthAmount);
	expect(bidderTotalSpentAmountsFromContract_[1]).equal(bidderInfoFromContractSimulator_.totalSpentCstAmount);
}

// #endregion
// #region `assertCosmicSignatureGameProxySimulatorTryGetCurrentChampions`

async function assertCosmicSignatureGameProxySimulatorTryGetCurrentChampions(cosmicSignatureGameProxySimulator_, contracts_, latestBlock_) {
	const currentChampionsFromContract_ = await contracts_.cosmicSignatureGameProxy.tryGetCurrentChampions();
	// console.info(currentChampionsFromContract_[0], currentChampionsFromContract_[1].toString(), currentChampionsFromContract_[2], currentChampionsFromContract_[3].toString());
	const currentChampionsFromContractSimulator_ = cosmicSignatureGameProxySimulator_.tryGetCurrentChampions(latestBlock_);
	expect(currentChampionsFromContract_[0]).equal(currentChampionsFromContractSimulator_.enduranceChampionAddress);
	expect(currentChampionsFromContract_[1]).equal(currentChampionsFromContractSimulator_.enduranceChampionDuration);
	expect(currentChampionsFromContract_[2]).equal(currentChampionsFromContractSimulator_.chronoWarriorAddress);
	expect(currentChampionsFromContract_[3]).equal(currentChampionsFromContractSimulator_.chronoWarriorDuration);
}

// #endregion
// #region `assertCosmicSignatureGameProxySimulatorGetEthDutchAuctionDurations`

async function assertCosmicSignatureGameProxySimulatorGetEthDutchAuctionDurations(cosmicSignatureGameProxySimulator_, contracts_, latestBlock_) {
	const ethDutchAuctionDurationsFromContract_ = await contracts_.cosmicSignatureGameProxy.getEthDutchAuctionDurations();
	// console.info(ethDutchAuctionDurationsFromContract_[0].toString(), ethDutchAuctionDurationsFromContract_[1].toString());
	const ethDutchAuctionDurationsFromContractSimulator_ = cosmicSignatureGameProxySimulator_.getEthDutchAuctionDurations(latestBlock_);
	expect(ethDutchAuctionDurationsFromContract_[0]).equal(ethDutchAuctionDurationsFromContractSimulator_.ethDutchAuctionDuration);
	expect(ethDutchAuctionDurationsFromContract_[1]).equal(ethDutchAuctionDurationsFromContractSimulator_.ethDutchAuctionElapsedDuration);
}

// #endregion
// #region `assertCosmicSignatureGameProxySimulatorGetCstDutchAuctionDurations`

async function assertCosmicSignatureGameProxySimulatorGetCstDutchAuctionDurations(cosmicSignatureGameProxySimulator_, contracts_, latestBlock_) {
	const cstDutchAuctionDurationsFromContract_ = await contracts_.cosmicSignatureGameProxy.getCstDutchAuctionDurations();
	// console.info(cstDutchAuctionDurationsFromContract_[0].toString(), cstDutchAuctionDurationsFromContract_[1].toString());
	const cstDutchAuctionDurationsFromContractSimulator_ = cosmicSignatureGameProxySimulator_.getCstDutchAuctionDurations(latestBlock_);
	expect(cstDutchAuctionDurationsFromContract_[0]).equal(cstDutchAuctionDurationsFromContractSimulator_.cstDutchAuctionDuration);
	expect(cstDutchAuctionDurationsFromContract_[1]).equal(cstDutchAuctionDurationsFromContractSimulator_.cstDutchAuctionElapsedDuration);
}

// #endregion
// #region

module.exports = {
	createCosmicSignatureGameProxySimulator,
	assertCosmicSignatureGameProxySimulator,
	assertCosmicSignatureGameProxySimulatorGetBidderTotalSpentAmounts,
	assertCosmicSignatureGameProxySimulatorTryGetCurrentChampions,
	assertCosmicSignatureGameProxySimulatorGetEthDutchAuctionDurations,
	assertCosmicSignatureGameProxySimulatorGetCstDutchAuctionDurations,
};

// #endregion
