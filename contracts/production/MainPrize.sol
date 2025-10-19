// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

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
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { BiddingBase } from "./BiddingBase.sol";
import { MainPrizeBase } from "./MainPrizeBase.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { SecondaryPrizes } from "./SecondaryPrizes.sol";
import { IMainPrize } from "./interfaces/IMainPrize.sol";

// #endregion
// #region

abstract contract MainPrize is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	CosmicSignatureGameStorage,
	BiddingBase,
	MainPrizeBase,
	BidStatistics,
	SecondaryPrizes,
	IMainPrize {
	// #region `claimMainPrize`

	/// @dev Comment-202411169 relates and/or applies.
	/// Comment-202411078 relates and/or applies.
	///
	/// Observable universe entities accessed by `claimMainPrize`, `_distributePrizes`, `_prepareNextRound`.
	///    `OpenZeppelinPanic`.
	///    `nonReentrant`.
	///    `_msgSender`.
	///    `CosmicSignatureErrors`.
	///    `CosmicSignatureEvents`.
	///    `RandomNumberHelpers.RandomNumberSeedWrapper`.
	///    `RandomNumberHelpers` methods.
	///    `ICosmicSignatureToken.MintSpec`.
	///    `IPrizesWallet.EthDeposit`.
	///    `BidderAddresses`.
	///    `lastBidderAddress`.
	///    `lastCstBidderAddress`.
	///    `bidderAddresses`.
	///    `enduranceChampionAddress`.
	///    `chronoWarriorAddress`.
	///    `roundNum`.
	///    `delayDurationBeforeRoundActivation`.
	///    `roundActivationTime`.
	///    // `cstDutchAuctionBeginningBidPrice`.
	///    // `nextRoundFirstCstDutchAuctionBeginningBidPrice`.
	///    `cstPrizeAmount`.
	///    `numRaffleEthPrizesForBidders`.
	///    `numRaffleCosmicSignatureNftsForBidders`.
	///    `numRaffleCosmicSignatureNftsForRandomWalkNftStakers`.
	///    `mainPrizeTime`.
	///    `mainPrizeTimeIncrementInMicroSeconds`.
	///    `mainPrizeTimeIncrementIncreaseDivisor`.
	///    `timeoutDurationToClaimMainPrize`.
	///    `token`.
	///    `nft`.
	///    `prizesWallet`.
	///    `stakingWalletRandomWalkNft`.
	///    `stakingWalletCosmicSignatureNft`.
	///    `marketingWallet`.
	///    `marketingWalletCstContributionAmount`.
	///    `charityAddress`.
	///    `_setRoundActivationTime`.
	///    `getDurationUntilMainPrizeRaw`.
	///    `_setMainPrizeTimeIncrementInMicroSeconds`.
	///    `_updateChampionsIfNeeded`.
	///    `_updateChronoWarriorIfNeeded`.
	///    `LastCstBidderPrizePaid`.
	///    `EnduranceChampionPrizePaid`.
	///    `ChronoWarriorPrizePaid`.
	///    `RaffleWinnerBidderEthPrizeAllocated`.
	///    `RaffleWinnerPrizePaid`.
	///    `getChronoWarriorEthPrizeAmount`.
	///    `getRaffleTotalEthPrizeAmountForBidders`.
	///    `getCosmicSignatureNftStakingTotalEthRewardAmount`.
	///    `MainPrizeClaimed`.
	///    `_distributePrizes`.
	///    `_prepareNextRound`.
	///    `getMainEthPrizeAmount`.
	///    `getCharityEthDonationAmount`.
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

		// According to Comment-202411254, `_msgSender()` can be different from `lastBidderAddress`,
		// but the champion update logic anyway uses the latter.
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

		// Issue. It appears that the optimization idea described in Comment-202502077 would be difficult to implement here.
		RandomNumberHelpers.RandomNumberSeedWrapper memory randomNumberSeedWrapper_;

		// Remember about Comment-202503254!
		randomNumberSeedWrapper_.value = RandomNumberHelpers.generateRandomNumberSeed();

		BidderAddresses storage bidderAddressesReference_ = bidderAddresses[roundNum];
		uint256 timeoutTimeToWithdrawSecondaryPrizes_;

		// [Comment-202501161]
		// It's important to calculate this before ETH transfers change our ETH balance.
		// [/Comment-202501161]
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

				// ETH deposits to make to `prizesWallet`.
				// This doesn't include `_msgSender()`, that's the main prize beneficiary, with their main ETH prize.
				// At the same time, this does include any secondary prizes `_msgSender()` has won.
				// So one might want instead of depositing those prizes to `prizesWallet`
				// to transfer them directly to `_msgSender()` near Comment-202501183.
				// But keeping it simple.
				// Items:
				//    `numRaffleEthPrizesForBidders` items. Bidders.
				//    1 item. `chronoWarriorAddress`.
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

				// All calculations marked with Comment-202501161 must be made before this.
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
				// [Comment-202511102]
				// There is no event to emit around here.
				// [/Comment-202511102]
			} catch Panic(uint256 panicCode_) {
				// Comment-202410161 relates.
				if(panicCode_ != OpenZeppelinPanic.DIVISION_BY_ZERO) {
					OpenZeppelinPanic.panic(panicCode_);
				}
			}

			// #endregion
			// #region

			// [Comment-202411077]
			// ETH For Charity.
			// If somehow ETH receive by charity reverts we won't revert the transaction.
			// It appears to be impossible to abuse this logic by something like the 63/64 rule or calling us too deep in the stack,
			// at least given that near Comment-202501183 there is similar logic to transfer main ETH prize which would revert as well.
			// Comment-202411078 relates and/or applies.
			// [/Comment-202411077]
			{
				// I don't want to spend gas to `require` this.
				// But if I did, this would be a wrong place for this validation.
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

		// [Comment-202501183]
		// Main ETH Prize For Main Prize Beneficiary.
		// If this fails, one might want to transfer the funds to `prizesWallet`.
		// Another option would be to transfer the funds there unconditionally.
		// But keeping it simple.
		// [/Comment-202501183]
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

			// This initial value counts main prize beneficiary, last CST bidder (not guaranteed to exist),
			// endurance champion, chrono-warrior, `MarketingWallet`.
			// Minus 1.
			// We are yet to add to this.
			uint256 cosmicSignatureTokenMintSpecIndex_ = (lastCstBidderAddress != address(0)) ? (4 + 1 - 1) : (4 - 1);

			cosmicSignatureTokenMintSpecIndex_ += numRaffleCosmicSignatureNftsForBidders;
			// #enable_asserts assert(numRaffleCosmicSignatureNftsForRandomWalkNftStakers > 0);

			// This can potentially be empty.
			address[] memory luckyStakerAddresses_ =
				stakingWalletRandomWalkNft.pickRandomStakerAddressesIfPossible(
					numRaffleCosmicSignatureNftsForRandomWalkNftStakers,
					randomNumberSeedWrapper_.value ^ 0x7c6eeb003d4a6dc5ebf549935c6ffb814ba1f060f1af8a0b11c2aa94a8e716e4
				);

			// [Comment-202511104]
			// Now this becomes the number of CST mints we are going to make minus 1,
			// which is the same as the number of CS NFT mints.
			// [/Comment-202511104]
			cosmicSignatureTokenMintSpecIndex_ += luckyStakerAddresses_.length;

			// Addresses for which to mint CS NFTs.
			// [Comment-202511094]
			// This contains the same items as `cosmicSignatureTokenMintSpecs_`, except its last item.
			// Comment-202511104 relates.
			// [/Comment-202511094]
			address[] memory cosmicSignatureNftOwnerAddresses_ = new address[](cosmicSignatureTokenMintSpecIndex_);

			// CST minting specs.
			// Items:
			//    1 item. `_msgSender()`, that's main prize beneficiary.
			//    0 or 1 items. `lastCstBidderAddress`.
			//    1 item. `enduranceChampionAddress`.
			//    1 item. `chronoWarriorAddress`.
			//    `numRaffleCosmicSignatureNftsForBidders` items. Bidders.
			//    0 or `numRaffleCosmicSignatureNftsForRandomWalkNftStakers` items. RW NFT stakers.
			//    1 item. `marketingWallet`.
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
		// lastBidType = BidType.ETH;
		lastBidderAddress = address(0);
		lastCstBidderAddress = address(0);
		enduranceChampionAddress = address(0);

		// // It's unnecessary to reset this.
		// // Comment-202501308 applies.
		// enduranceChampionStartTimeStamp = 0;

		// // It's unnecessary to reset this.
		// // Comment-202501308 applies.
		// enduranceChampionDuration = 0;

		prevEnduranceChampionDuration = 0;
		chronoWarriorAddress = address(0);
		chronoWarriorDuration = uint256(int256(-1));
		++ roundNum;

		// // [Comment-202501307]
		// // Instead of making this assignment, it appears to be more efficient
		// // to use `nextRoundFirstCstDutchAuctionBeginningBidPrice` for the 1st CST Dutch auction in the next bidding round.
		// // [/Comment-202501307]
		// cstDutchAuctionBeginningBidPrice = nextRoundFirstCstDutchAuctionBeginningBidPrice;

		_setMainPrizeTimeIncrementInMicroSeconds(mainPrizeTimeIncrementInMicroSeconds + mainPrizeTimeIncrementInMicroSeconds / mainPrizeTimeIncrementIncreaseDivisor);
		_setRoundActivationTime(block.timestamp + delayDurationBeforeRoundActivation);
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
