// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { Panic as OpenZeppelinPanic } from "@openzeppelin/contracts/utils/Panic.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureEvents } from "./libraries/CosmicSignatureEvents.sol";
import { RandomNumberHelpers } from "./libraries/RandomNumberHelpers.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";
import { IPrizesWallet } from "./interfaces/IPrizesWallet.sol";
import { CosmicSignatureGameStorageV2 } from "./CosmicSignatureGameStorageV2.sol";
import { BiddingBaseV2 } from "./BiddingBaseV2.sol";
import { MainPrizeBaseV2 } from "./MainPrizeBaseV2.sol";
import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { SecondaryPrizesV2 } from "./SecondaryPrizesV2.sol";
import { IMainPrizeV2 } from "./interfaces/IMainPrizeV2.sol";

// #endregion
// #region

abstract contract MainPrizeV2 is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	CosmicSignatureGameStorageV2,
	BiddingBaseV2,
	MainPrizeBaseV2,
	BidStatisticsV2,
	SecondaryPrizesV2,
	IMainPrizeV2 {
	// #region `claimMainPrize`

	/// @dev Comment-202411169 relates and/or applies.
	/// Comment-202411078 relates and/or applies.
	/// Comment-202605308 applies.
	function claimMainPrize() external override nonReentrant /*_onlyRoundIsActive*/ {
		// #region

		if (_msgSender() == lastBidderAddress) {
			// Comment-202411169 relates.
			// #enable_asserts assert(lastBidderAddress != address(0));

			if ( ! (block.timestamp >= mainPrizeTime) ) {
				revert CosmicSignatureErrors.MainPrizeEarlyClaim("Not enough time has elapsed.", mainPrizeTime, block.timestamp);
			}
		} else {
			// Comment-202411169 relates.
			if ( ! (lastBidderAddress != address(0)) ) {
				revert CosmicSignatureErrors.NoBidsPlacedInCurrentRound("There have been no bids in the current bidding round yet.");
			}

			int256 durationUntilOperationIsPermitted_ = getDurationUntilMainPrizeRaw() + int256(timeoutDurationToClaimMainPrize);
			if ( ! (durationUntilOperationIsPermitted_ <= int256(0)) ) {
				revert
					CosmicSignatureErrors.MainPrizeClaimDenied(
						"Only the last bidder is permitted to claim the bidding round main prize before a timeout expires.",
						lastBidderAddress,
						_msgSender(),
						uint256(durationUntilOperationIsPermitted_)
					);
			}
		}

		// Comment-202411169 applies.
		// #enable_asserts assert(block.timestamp >= roundActivationTime);

		// #endregion
		// #region

		// Comment-202605309 applies.
		_updateChampionsIfNeeded();
		_updateChronoWarriorIfNeeded(block.timestamp);

		_distributePrizes();
		_prepareNextRound();

		// #endregion
	}

	// #endregion
	// #region `_distributePrizes`

	function _distributePrizes() private {
		// #region

		// Comment-202605311 applies.
		RandomNumberHelpers.RandomNumberSeedWrapper memory randomNumberSeedWrapper_;

		// Comment-202605312 applies.
		randomNumberSeedWrapper_.value = RandomNumberHelpers.generateRandomNumberSeed();

		BidderAddresses storage bidderAddressesReference_ = bidderAddresses[roundNum];
		uint256 timeoutTimeToWithdrawSecondaryPrizes_;

		// Comment-202501161 applies.
		// This can potentially be zero.
		uint256 mainEthPrizeAmount_ = getMainEthPrizeAmount();

		// Comment-202501161 applies.
		// This can potentially be zero.
		uint256 chronoWarriorEthPrizeAmount_ = getChronoWarriorEthPrizeAmount();

		// #endregion
		// #region

		{
			// #region

			// Comment-202501161 applies.
			// This can potentially be zero.
			uint256 charityEthDonationAmount_ = getCharityEthDonationAmount();

			// Comment-202501161 applies.
			// This can potentially be zero.
			uint256 cosmicSignatureNftStakingTotalEthRewardAmount_ = getCosmicSignatureNftStakingTotalEthRewardAmount();

			// Comment-202501161 applies.
			// This can potentially be zero.
			uint256 raffleTotalEthPrizeAmountForBidders_ = getRaffleTotalEthPrizeAmountForBidders();

			// #endregion
			// #region

			{
				// #region

				uint256 ethDepositIndex_ = numRaffleEthPrizesForBidders;

				// Comment-202605313 applies.
				IPrizesWallet.EthDeposit[] memory ethDeposits_ = new IPrizesWallet.EthDeposit[](ethDepositIndex_ + 1);

				// This can potentially be zero.
				uint256 ethDepositsTotalAmount_ = 0;

				// #endregion
				// #region ETH For Chrono-Warrior

				{
					// Comment-202511097 relates.
					// #enable_asserts assert(ethDepositIndex_ == numRaffleEthPrizesForBidders);

					IPrizesWallet.EthDeposit memory ethDepositReference_ = ethDeposits_[ethDepositIndex_];
					ethDepositReference_.prizeWinnerAddress = chronoWarriorAddress;
					ethDepositReference_.amount = chronoWarriorEthPrizeAmount_;
					ethDepositsTotalAmount_ += chronoWarriorEthPrizeAmount_;
				}

				// #endregion
				// #region ETH For Random Bidders

				{
					// #enable_asserts assert(numRaffleEthPrizesForBidders > 0);
					// #enable_asserts assert(ethDepositIndex_ == numRaffleEthPrizesForBidders);

					// This can potentially be zero.
					uint256 raffleEthPrizeAmountForBidder_ = raffleTotalEthPrizeAmountForBidders_ / ethDepositIndex_;

					ethDepositsTotalAmount_ += raffleEthPrizeAmountForBidder_ * ethDepositIndex_;
					do {
						-- ethDepositIndex_;
						IPrizesWallet.EthDeposit memory ethDepositReference_ = ethDeposits_[ethDepositIndex_];
						uint256 randomNumber_ = RandomNumberHelpers.generateRandomNumber(randomNumberSeedWrapper_);
						address raffleWinnerAddress_ = bidderAddressesReference_.items[randomNumber_ % bidderAddressesReference_.numItems];
						// #enable_asserts assert(raffleWinnerAddress_ != address(0));
						ethDepositReference_.prizeWinnerAddress = raffleWinnerAddress_;
						ethDepositReference_.amount = raffleEthPrizeAmountForBidder_;
						emit RaffleWinnerBidderEthPrizeAllocated(
							roundNum,

							// Comment-202511097 applies.
							ethDepositIndex_,
							
							raffleWinnerAddress_,
							raffleEthPrizeAmountForBidder_
						);
					} while (ethDepositIndex_ > 0);
				}

				// #endregion
				// #region

				// Comment-202605314 applies.
				timeoutTimeToWithdrawSecondaryPrizes_ =
					prizesWallet.registerRoundEndAndDepositEthMany
						{value: ethDepositsTotalAmount_}
						(roundNum, _msgSender(), ethDeposits_);

				// #endregion
			}

			// #endregion
			// #region ETH For CS NFT Stakers

			try stakingWalletCosmicSignatureNft.deposit{value: cosmicSignatureNftStakingTotalEthRewardAmount_}(roundNum) {
				// Doing nothing.
				// Comment-202511102 applies.
			} catch Panic(uint256 panicCode_) {
				// Comment-202410161 relates.
				if (panicCode_ != OpenZeppelinPanic.DIVISION_BY_ZERO) {
					OpenZeppelinPanic.panic(panicCode_);
				}
			}

			// #endregion
			// #region

			// Comment-202411077 applies.
			{
				// Comment-202605315 applies.
				// #enable_asserts assert(charityAddress != address(0));

				// Comment-202502043 applies.
				(bool isSuccess_, ) = charityAddress.call{value: charityEthDonationAmount_}("");

				if (isSuccess_) {
					emit CosmicSignatureEvents.FundsTransferredToCharity(charityAddress, charityEthDonationAmount_);
				} else {
					emit CosmicSignatureEvents.FundTransferFailed("ETH transfer to charity failed.", charityAddress, charityEthDonationAmount_);
				}
			}

			// #endregion
		}

		// #endregion
		// #region

		// Comment-202501183 applies.
		{
			// Comment-202502043 applies.
			(bool isSuccess_, ) = _msgSender().call{value: mainEthPrizeAmount_}("");

			if ( ! isSuccess_ ) {
				revert CosmicSignatureErrors.FundTransferFailed("ETH transfer to bidding round main prize beneficiary failed.", _msgSender(), mainEthPrizeAmount_);
			}
		}

		// #endregion
		// #region

		{
			// #region

			// Comment-202605317 applies.
			uint256 cosmicSignatureTokenMintSpecIndex_ = (lastCstBidderAddress != address(0)) ? (4 + 1 - 1) : (4 - 1);

			cosmicSignatureTokenMintSpecIndex_ += numRaffleCosmicSignatureNftsForBidders;
			// #enable_asserts assert(numRaffleCosmicSignatureNftsForRandomWalkNftStakers > 0);

			// This can potentially be empty.
			address[] memory luckyStakerAddresses_ =
				stakingWalletRandomWalkNft.pickRandomStakerAddressesIfPossible(
					numRaffleCosmicSignatureNftsForRandomWalkNftStakers,
					randomNumberSeedWrapper_.value ^ 0x7c6eeb003d4a6dc5ebf549935c6ffb814ba1f060f1af8a0b11c2aa94a8e716e4
				);

			// Comment-202511104 applies.
			cosmicSignatureTokenMintSpecIndex_ += luckyStakerAddresses_.length;

			// Comment-202605319 applies.
			// Comment-202511094 applies.
			address[] memory cosmicSignatureNftOwnerAddresses_ = new address[](cosmicSignatureTokenMintSpecIndex_);

			// Comment-202606011 applies.
			// Comment-202511094 relates.
			ICosmicSignatureToken.MintSpec[] memory cosmicSignatureTokenMintSpecs_ = new ICosmicSignatureToken.MintSpec[](cosmicSignatureTokenMintSpecIndex_ + 1);

			// #endregion
			// #region Preparing To Mint CSTs And CS NFTs

			{
				// #region CST For `MarketingWallet`

				{
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[cosmicSignatureTokenMintSpecIndex_];
					cosmicSignatureTokenMintSpec_.account = marketingWallet;
					cosmicSignatureTokenMintSpec_.value = marketingWalletCstContributionAmount;

					// Comment-202511102 applies.
				}

				// #endregion
				// #region CSTs, CS NFTs For Random RW NFT Stakers

				// #enable_asserts assert(numRaffleCosmicSignatureNftsForRandomWalkNftStakers > 0);
				// #enable_asserts assert(
				// #enable_asserts 	luckyStakerAddresses_.length == 0 ||
				// #enable_asserts 	luckyStakerAddresses_.length == numRaffleCosmicSignatureNftsForRandomWalkNftStakers
				// #enable_asserts );
				for (uint256 luckyStakerIndex_ = luckyStakerAddresses_.length; luckyStakerIndex_ > 0; ) {
					-- luckyStakerIndex_;
					address luckyStakerAddress_ = luckyStakerAddresses_[luckyStakerIndex_];
					// #enable_asserts assert(luckyStakerAddress_ != address(0));
					-- cosmicSignatureTokenMintSpecIndex_;
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[cosmicSignatureTokenMintSpecIndex_];
					cosmicSignatureTokenMintSpec_.account = luckyStakerAddress_;
					cosmicSignatureTokenMintSpec_.value = cstPrizeAmount;
					cosmicSignatureNftOwnerAddresses_[cosmicSignatureTokenMintSpecIndex_] = luckyStakerAddress_;
				}

				// #endregion
				// #region CSTs, CS NFTs For Random Bidders

				// #enable_asserts assert(numRaffleCosmicSignatureNftsForBidders > 0);
				for (uint256 raffleWinnerIndex_ = numRaffleCosmicSignatureNftsForBidders; ; ) {
					uint256 randomNumber_ = RandomNumberHelpers.generateRandomNumber(randomNumberSeedWrapper_);
					address raffleWinnerAddress_ = bidderAddressesReference_.items[randomNumber_ % bidderAddressesReference_.numItems];
					// #enable_asserts assert(raffleWinnerAddress_ != address(0));
					-- cosmicSignatureTokenMintSpecIndex_;
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[cosmicSignatureTokenMintSpecIndex_];
					cosmicSignatureTokenMintSpec_.account = raffleWinnerAddress_;
					cosmicSignatureTokenMintSpec_.value = cstPrizeAmount;
					cosmicSignatureNftOwnerAddresses_[cosmicSignatureTokenMintSpecIndex_] = raffleWinnerAddress_;
					if (( -- raffleWinnerIndex_ ) <= 0) {
						break;
					}
				}

				// #endregion
				// #region CST, CS NFT For Chrono-Warrior

				{
					-- cosmicSignatureTokenMintSpecIndex_;
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[cosmicSignatureTokenMintSpecIndex_];
					cosmicSignatureTokenMintSpec_.account = chronoWarriorAddress;
					cosmicSignatureTokenMintSpec_.value = cstPrizeAmount;
					cosmicSignatureNftOwnerAddresses_[cosmicSignatureTokenMintSpecIndex_] = chronoWarriorAddress;
				}

				// #endregion
				// #region CST, CS NFT For Endurance Champion

				{
					-- cosmicSignatureTokenMintSpecIndex_;
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[cosmicSignatureTokenMintSpecIndex_];
					cosmicSignatureTokenMintSpec_.account = enduranceChampionAddress;
					cosmicSignatureTokenMintSpec_.value = cstPrizeAmount;
					cosmicSignatureNftOwnerAddresses_[cosmicSignatureTokenMintSpecIndex_] = enduranceChampionAddress;
				}

				// #endregion
				// #region CST, CS NFT For The Last CST Bidder

				if (cosmicSignatureTokenMintSpecIndex_ > 1) {
					// #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == 2);
					// #enable_asserts assert(lastCstBidderAddress != address(0));
					// -- cosmicSignatureTokenMintSpecIndex_;
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[1];
					cosmicSignatureTokenMintSpec_.account = lastCstBidderAddress;
					cosmicSignatureTokenMintSpec_.value = cstPrizeAmount;
					cosmicSignatureNftOwnerAddresses_[1] = lastCstBidderAddress;
				} else {
					// #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == 1);
					// #enable_asserts assert(lastCstBidderAddress == address(0));
				}

				// #endregion
				// #region CST, CS NFT For Main Prize Beneficiary

				{
					// // #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == ???);
					// -- cosmicSignatureTokenMintSpecIndex_;
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[0];
					cosmicSignatureTokenMintSpec_.account = _msgSender();
					cosmicSignatureTokenMintSpec_.value = cstPrizeAmount;
					cosmicSignatureNftOwnerAddresses_[0] = _msgSender();
				}

				// #endregion
				// #region //

				// // #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == 0);

				// #endregion
			}

			// #endregion
			// #region Minting CSTs And CS NFTs

			token.mintMany(cosmicSignatureTokenMintSpecs_);
			uint256 firstCosmicSignatureNftId_ =
				nft.mintMany(
					roundNum,
					cosmicSignatureNftOwnerAddresses_,
					randomNumberSeedWrapper_.value ^ 0x2a8612ecb5cb17da87f8befda0480288e2d053de55d9d7d4dc4899077cf5aeda
				);

			// #endregion
			// #region Processing CS NFTs, Emitting Events, Etc.

			{
				// #region

				cosmicSignatureTokenMintSpecIndex_ = cosmicSignatureNftOwnerAddresses_.length;
				uint256 cosmicSignatureNftId_ = firstCosmicSignatureNftId_ + cosmicSignatureTokenMintSpecIndex_;

				// #endregion
				// #region CST For `MarketingWallet`

				{
					// #enable_asserts ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[cosmicSignatureTokenMintSpecIndex_];
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.account == marketingWallet);
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.value == marketingWalletCstContributionAmount);

					// Comment-202511102 applies.
				}

				// #endregion
				// #region CSTs, CS NFTs For Random RW NFT Stakers

				// #enable_asserts assert(numRaffleCosmicSignatureNftsForRandomWalkNftStakers > 0);
				// #enable_asserts assert(
				// #enable_asserts 	luckyStakerAddresses_.length == 0 ||
				// #enable_asserts 	luckyStakerAddresses_.length == numRaffleCosmicSignatureNftsForRandomWalkNftStakers
				// #enable_asserts );
				for (uint256 luckyStakerIndex_ = luckyStakerAddresses_.length; luckyStakerIndex_ > 0; ) {
					-- cosmicSignatureTokenMintSpecIndex_;
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[cosmicSignatureTokenMintSpecIndex_];
					address luckyStakerAddress_ = cosmicSignatureTokenMintSpec_.account;
					// #enable_asserts assert(luckyStakerAddress_ != address(0));
					-- luckyStakerIndex_;
					// #enable_asserts assert(luckyStakerAddress_ == luckyStakerAddresses_[luckyStakerIndex_]);
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.value == cstPrizeAmount);
					// #enable_asserts assert(luckyStakerAddress_ == cosmicSignatureNftOwnerAddresses_[cosmicSignatureTokenMintSpecIndex_]);
					-- cosmicSignatureNftId_;
					emit RaffleWinnerPrizePaid(
						roundNum,
						true,
						luckyStakerIndex_,
						luckyStakerAddress_,
						cosmicSignatureTokenMintSpec_.value,
						cosmicSignatureNftId_
					);
				}

				// #endregion
				// #region CSTs, CS NFTs For Random Bidders

				// #enable_asserts assert(numRaffleCosmicSignatureNftsForBidders > 0);
				for (uint256 raffleWinnerIndex_ = numRaffleCosmicSignatureNftsForBidders; ; ) {
					-- cosmicSignatureTokenMintSpecIndex_;
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[cosmicSignatureTokenMintSpecIndex_];
					address raffleWinnerAddress_ = cosmicSignatureTokenMintSpec_.account;
					// #enable_asserts assert(raffleWinnerAddress_ != address(0));
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.value == cstPrizeAmount);
					// #enable_asserts assert(raffleWinnerAddress_ == cosmicSignatureNftOwnerAddresses_[cosmicSignatureTokenMintSpecIndex_]);
					-- raffleWinnerIndex_;
					-- cosmicSignatureNftId_;
					emit RaffleWinnerPrizePaid(
						roundNum,
						false,
						raffleWinnerIndex_,
						raffleWinnerAddress_,
						cosmicSignatureTokenMintSpec_.value,
						cosmicSignatureNftId_
					);
					if (raffleWinnerIndex_ <= 0) {
						break;
					}
				}

				// #endregion
				// #region ETH, CST, CS NFT For Chrono-Warrior

				{
					-- cosmicSignatureTokenMintSpecIndex_;
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[cosmicSignatureTokenMintSpecIndex_];
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.account == chronoWarriorAddress);
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.value == cstPrizeAmount);
					// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_[cosmicSignatureTokenMintSpecIndex_] == chronoWarriorAddress);
					-- cosmicSignatureNftId_;
					emit ChronoWarriorPrizePaid(
						roundNum,

						// Comment-202511097 applies.
						numRaffleEthPrizesForBidders,

						cosmicSignatureTokenMintSpec_.account,
						chronoWarriorEthPrizeAmount_,
						cosmicSignatureTokenMintSpec_.value,
						cosmicSignatureNftId_
					);
				}

				// #endregion
				// #region CST, CS NFT For Endurance Champion

				{
					-- cosmicSignatureTokenMintSpecIndex_;
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[cosmicSignatureTokenMintSpecIndex_];
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.account == enduranceChampionAddress);
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.value == cstPrizeAmount);
					// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_[cosmicSignatureTokenMintSpecIndex_] == enduranceChampionAddress);
					-- cosmicSignatureNftId_;
					emit EnduranceChampionPrizePaid(
						roundNum,
						cosmicSignatureTokenMintSpec_.account,
						cosmicSignatureTokenMintSpec_.value,
						cosmicSignatureNftId_
					);
				}

				// #endregion
				// #region CST, CS NFT For The Last CST Bidder

				if (cosmicSignatureTokenMintSpecIndex_ > 1) {
					// #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == 2);
					// #enable_asserts assert(lastCstBidderAddress != address(0));
					// -- cosmicSignatureTokenMintSpecIndex_;
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[1];
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.account == lastCstBidderAddress);
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.value == cstPrizeAmount);
					// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_[1] == lastCstBidderAddress);
					-- cosmicSignatureNftId_;
					emit LastCstBidderPrizePaid(
						roundNum,
						cosmicSignatureTokenMintSpec_.account,
						cosmicSignatureTokenMintSpec_.value,
						cosmicSignatureNftId_
					);
				} else {
					// #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == 1);
					// #enable_asserts assert(lastCstBidderAddress == address(0));
				}

				// #endregion
				// #region ETH, CST, CS NFT For Main Prize Beneficiary

				{
					// // #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == ???);
					// -- cosmicSignatureTokenMintSpecIndex_;
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[0];
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.account == _msgSender());
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.value == cstPrizeAmount);
					// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_[0] == _msgSender());
					// -- cosmicSignatureNftId_;
					// #enable_asserts assert(cosmicSignatureNftId_ == firstCosmicSignatureNftId_ + 1);
					emit MainPrizeClaimed(
						roundNum,
						_msgSender(),
						mainEthPrizeAmount_,
						cosmicSignatureTokenMintSpec_.value,
						firstCosmicSignatureNftId_,
						timeoutTimeToWithdrawSecondaryPrizes_
					);
				}

				// #endregion
				// #region

				// // #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == 0);
				// #enable_asserts assert(cosmicSignatureNftId_ == firstCosmicSignatureNftId_ + 1);

				// #endregion
			}

			// #endregion
		}

		// #endregion
	}

	// #endregion
	// #region `_prepareNextRound`

	function _prepareNextRound() private {
		// Comment-202606235 relates and/or applies.
		unchecked {

			// lastBidType = BidType.ETH;
			lastBidderAddress = address(0);
			lastCstBidderAddress = address(0);
			enduranceChampionAddress = address(0);

			// // Comment-202605307 applies.
			// // Comment-202501308 applies.
			// enduranceChampionStartTimeStamp = 0;

			// // Comment-202605307 applies.
			// // Comment-202501308 applies.
			// enduranceChampionDuration = 0;

			prevEnduranceChampionDuration = 0;
			chronoWarriorAddress = address(0);
			chronoWarriorDuration = uint256(int256(-1));
			++ roundNum;

			// // Comment-202501307 applies.
			// cstDutchAuctionBeginningBidPrice = nextRoundFirstCstDutchAuctionBeginningBidPrice;

			_setMainPrizeTimeIncrementInMicroSeconds(mainPrizeTimeIncrementInMicroSeconds + mainPrizeTimeIncrementInMicroSeconds / mainPrizeTimeIncrementIncreaseDivisor);

			// [Comment-202606235]
			// In V2+ (but not in V1), all code in the `_prepareNextRound` method is wrapped in an `unchecked` block.
			// Realistically, nothing can overflow around here, except, potentially,
			// the math involving `delayDurationBeforeRoundActivation`.
			// The problem is with Comment-202503106. At any time, the contract owner
			// can change `delayDurationBeforeRoundActivation` to a value that will overflow and thereby disable `claimMainPrize`.
			// Then the owner would need to wait until the main prize claim timeout expires
			// and then set `delayDurationBeforeRoundActivation` to a value that will not overflow
			// and immediately call `claimMainPrize`, all in a single transaction.
			// So the aforementioned `unchecked` block eliminates this vulnerability.
			// [/Comment-202606235]
			_setRoundActivationTime(block.timestamp + delayDurationBeforeRoundActivation);
		}
	}

	// #endregion
	// #region `getMainEthPrizeAmount`

	function getMainEthPrizeAmount() public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * mainEthPrizeAmountPercentage / 100;
		}
	}

	// #endregion
	// #region `getCharityEthDonationAmount`

	function getCharityEthDonationAmount() public view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * charityEthDonationAmountPercentage / 100;
		}
	}

	// #endregion
}

// #endregion
