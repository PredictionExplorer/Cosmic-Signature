// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { Panic as OpenZeppelinPanic } from "@openzeppelin/contracts/utils/Panic.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureEvents } from "./libraries/CosmicSignatureEvents.sol";
import { RandomNumberHelpers } from "./libraries/RandomNumberHelpers.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";
import { IPrizesWallet } from "./interfaces/IPrizesWallet.sol";
import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { MainPrizeV2Base } from "./MainPrizeV2Base.sol";
import { CosmicSignatureGameStorageV3Base } from "./CosmicSignatureGameStorageV3Base.sol";
import { BidStatisticsV3 } from "./BidStatisticsV3.sol";
import { IMainPrizeV3 } from "./interfaces/IMainPrizeV3.sol";

// #endregion
// #region

abstract contract MainPrizeV3 is
	MainPrizeV2Base,
	CosmicSignatureGameStorageV3Base,
	BidStatisticsV3,
	IMainPrizeV3 {
	// #region `_distributePrizes`

	function _distributePrizes() internal override /* virtual */ {
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
			address[] memory cosmicSignatureNftOwnerAddresses_ = new address[](cosmicSignatureTokenMintSpecIndex_ + (mainPrizeNumCosmicSignatureNfts - 1));

			// Comment-202606011 applies.
			// Comment-202511094 applies.
			ICosmicSignatureToken.MintSpec[] memory cosmicSignatureTokenMintSpecs_ = new ICosmicSignatureToken.MintSpec[](cosmicSignatureTokenMintSpecIndex_ + 1);

			// #endregion
			// #region Preparing To Mint CSTs And CS NFTs

			{
				// #region CST For `MarketingWallet`

				{
					// #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == cosmicSignatureTokenMintSpecs_.length - 1);
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[cosmicSignatureTokenMintSpecIndex_];
					cosmicSignatureTokenMintSpec_.account = marketingWallet;
					cosmicSignatureTokenMintSpec_.value = marketingWalletCstContributionAmount;

					// Comment-202511102 applies.
				}

				// #endregion
				// #region CST, CS NFTs For Main Prize Beneficiary

				{
					-- cosmicSignatureTokenMintSpecIndex_;
					// #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == cosmicSignatureTokenMintSpecs_.length - 2);
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[cosmicSignatureTokenMintSpecIndex_];
					cosmicSignatureTokenMintSpec_.account = _msgSender();
					cosmicSignatureTokenMintSpec_.value = cstPrizeAmount;
					// #enable_asserts assert(mainPrizeNumCosmicSignatureNfts > 0);
					// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_.length - cosmicSignatureTokenMintSpecIndex_ == mainPrizeNumCosmicSignatureNfts);

					// This makes `mainPrizeNumCosmicSignatureNfts` iterations.
					// todo-0 Test the above.
					for (uint256 cosmicSignatureNftIndex_ = cosmicSignatureNftOwnerAddresses_.length; ; ) {
						-- cosmicSignatureNftIndex_;
						cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_] = _msgSender();
						if (cosmicSignatureNftIndex_ <= cosmicSignatureTokenMintSpecIndex_) {
							// #enable_asserts assert(cosmicSignatureNftIndex_ == cosmicSignatureTokenMintSpecIndex_);
							break;
						}
					}
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

				if (cosmicSignatureTokenMintSpecIndex_ > 0) {
					// #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == 1);
					// #enable_asserts assert(lastCstBidderAddress != address(0));
					// -- cosmicSignatureTokenMintSpecIndex_;
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[0];
					cosmicSignatureTokenMintSpec_.account = lastCstBidderAddress;
					cosmicSignatureTokenMintSpec_.value = cstPrizeAmount;
					cosmicSignatureNftOwnerAddresses_[0] = lastCstBidderAddress;
				} else {
					// #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == 0);
					// #enable_asserts assert(lastCstBidderAddress == address(0));
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

				cosmicSignatureTokenMintSpecIndex_ = cosmicSignatureTokenMintSpecs_.length;
				uint256 cosmicSignatureNftId_;

				// #endregion
				// #region CST For `MarketingWallet`

				{
					-- cosmicSignatureTokenMintSpecIndex_;
					// #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == cosmicSignatureTokenMintSpecs_.length - 1);
					// #enable_asserts ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[cosmicSignatureTokenMintSpecIndex_];
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.account == marketingWallet);
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.value == marketingWalletCstContributionAmount);

					// Comment-202511102 applies.
				}

				// #endregion
				// #region ETH, CST, CS NFTs For Main Prize Beneficiary

				{
					-- cosmicSignatureTokenMintSpecIndex_;
					// #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == cosmicSignatureTokenMintSpecs_.length - 2);
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[cosmicSignatureTokenMintSpecIndex_];
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.account == _msgSender());
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.value == cstPrizeAmount);
					// #enable_asserts assert(mainPrizeNumCosmicSignatureNfts > 0);
					// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_.length - cosmicSignatureTokenMintSpecIndex_ == mainPrizeNumCosmicSignatureNfts);
					// #enable_asserts uint256 testingRandomNumber_ = RandomNumberHelpers.generateRandomNumber(randomNumberSeedWrapper_.value ^ 0xf31b8a99e26873fa8f00ea66784b5282292f4eb27ac79baa2caf1f7efd2b0e8a);
					// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_[cosmicSignatureTokenMintSpecIndex_ + testingRandomNumber_ % mainPrizeNumCosmicSignatureNfts] == _msgSender());
					cosmicSignatureNftId_ = firstCosmicSignatureNftId_ + cosmicSignatureTokenMintSpecIndex_;
					emit MainPrizeClaimed(
						roundNum,
						_msgSender(),
						mainEthPrizeAmount_,
						cosmicSignatureTokenMintSpec_.value,
						cosmicSignatureNftId_,
						cosmicSignatureNftOwnerAddresses_.length - cosmicSignatureTokenMintSpecIndex_,
						timeoutTimeToWithdrawSecondaryPrizes_
					);
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

				if (cosmicSignatureTokenMintSpecIndex_ > 0) {
					// #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == 1);
					// #enable_asserts assert(lastCstBidderAddress != address(0));
					// -- cosmicSignatureTokenMintSpecIndex_;
					ICosmicSignatureToken.MintSpec memory cosmicSignatureTokenMintSpec_ = cosmicSignatureTokenMintSpecs_[0];
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.account == lastCstBidderAddress);
					// #enable_asserts assert(cosmicSignatureTokenMintSpec_.value == cstPrizeAmount);
					// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_[0] == lastCstBidderAddress);
					// -- cosmicSignatureNftId_;
					// #enable_asserts assert(cosmicSignatureNftId_ == firstCosmicSignatureNftId_ + 1);
					emit LastCstBidderPrizePaid(
						roundNum,
						cosmicSignatureTokenMintSpec_.account,
						cosmicSignatureTokenMintSpec_.value,
						firstCosmicSignatureNftId_
					);
				} else {
					// #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == 0);
					// #enable_asserts assert(lastCstBidderAddress == address(0));
					// #enable_asserts assert(cosmicSignatureNftId_ == firstCosmicSignatureNftId_);
				}

				// #endregion
				// #region //

				// // #enable_asserts assert(cosmicSignatureTokenMintSpecIndex_ == 0);
				// // #enable_asserts assert(cosmicSignatureNftId_ == firstCosmicSignatureNftId_ + 1);

				// #endregion
			}

			// #endregion
		}

		// #endregion
	}

	// #endregion
	// #region Overrides Required By Solidity

	function _saveChampionDurations() internal override (BidStatisticsV2, BidStatisticsV3) virtual {
		super._saveChampionDurations();
	}

	// #endregion
}

// #endregion
