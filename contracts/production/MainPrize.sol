// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

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
	// #region Data Types

	/// @dev This packs a few variables into a single 256-bit memory slot.
	/// We need this to workaround the "variable too deep in the stack" compile error.
	struct _PackedVariables1 {
		uint64 cosmicSignatureNftOwnerLastCstBidderAddressIndex;
		uint64 cosmicSignatureNftOwnerMainPrizeBeneficiaryAddressIndex;
		uint64 cosmicSignatureNftOwnerEnduranceChampionAddressIndex;
		uint64 cosmicSignatureNftOwnerBidderAddressIndex;
	}

	// #endregion
	// #region `claimMainPrize`

	/// @dev Comment-202411169 relates and/or applies.
	///
	/// It could be possible to not call `nonReentrant` if we transferred main prize ETH to `_msgSender()`
	/// after all other logic, provided it's safe to assume that ETH transfer to charity can't reenter us.
	/// Although we could execute that transfer at the very end as well.
	/// But let's leave it alone.
	/// Comment-202411078 relates.
	///
	/// Observable universe entities accessed by `claimMainPrize`, `_distributePrizes`, `_prepareNextRound`.
	///    `Panic` (from OpenZeppelin).
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
	///    `cstPrizeAmountMultiplier`.
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
	///    `_updateChampionsIfNeeded`.
	///    `_updateChronoWarriorIfNeeded`.
	///    `LastCstBidderPrizePaid`.
	///    `EnduranceChampionPrizePaid`.
	///    `ChronoWarriorEthPrizeAllocated`.
	///    `RaffleWinnerBidderEthPrizeAllocated`.
	///    `RaffleWinnerCosmicSignatureNftAwarded`.
	///    `getChronoWarriorEthPrizeAmount`.
	///    `getRaffleTotalEthPrizeAmountForBidders`.
	///    `getCosmicSignatureNftStakingTotalEthRewardAmount`.
	///    `MainPrizeClaimed`.
	///     `_PackedVariables1`.
	///    `_distributePrizes`.
	///    `_prepareNextRound`.
	///    `getMainEthPrizeAmount`.
	///    `getCharityEthDonationAmount`.
	function claimMainPrize() external override nonReentrant /*_onlyRoundIsActive*/ {
		// #region

		if (_msgSender() == lastBidderAddress) {
			// Comment-202411169 relates.
			// #enable_asserts assert(lastBidderAddress != address(0));
		
			require(
				block.timestamp >= mainPrizeTime,
				CosmicSignatureErrors.MainPrizeEarlyClaim("Not enough time has elapsed.", mainPrizeTime, block.timestamp)
			);
		} else {
			// Comment-202411169 relates.
			require(
				lastBidderAddress != address(0),
				CosmicSignatureErrors.NoBidsPlacedInCurrentRound("There have been no bids in the current bidding round yet.")
			);

			int256 durationUntilOperationIsPermitted_ = getDurationUntilMainPrize() + int256(timeoutDurationToClaimMainPrize);
			require(
				durationUntilOperationIsPermitted_ <= int256(0),
				CosmicSignatureErrors.MainPrizeClaimDenied(
					"Only the last bidder is permitted to claim the bidding round main prize before a timeout expires.",
					lastBidderAddress,
					_msgSender(),
					uint256(durationUntilOperationIsPermitted_)
				)
			);
		}

		// Comment-202411169 applies.
		// #enable_asserts assert(block.timestamp >= roundActivationTime);

		// #endregion
		// #region

		_updateChampionsIfNeeded();
		_updateChronoWarriorIfNeeded(block.timestamp);
		_distributePrizes();
		_prepareNextRound();

		// #endregion
	}

	// #endregion
	// #region `_distributePrizes`

	/// @notice Distributes ETH, CST, and CS NFT prizes to main prize beneficiary and secondary prize winners.
	/// @dev todo-1 Develop a test that checks that after a few rounds there are no NFTs with duplicate seeds.
	function _distributePrizes() private {
		// #region

		// This can potentially be zero.
		uint256 mainEthPrizeAmount_;

		// #endregion
		// #region

		{
			// #region

			// Issue. It appears that the optimization idea described in Comment-202502077 would be difficult to implement here.
			RandomNumberHelpers.RandomNumberSeedWrapper memory randomNumberSeedWrapper_;

			BidderAddresses storage bidderAddressesReference_ = bidderAddresses[roundNum];

			// #endregion
			// #region

			{
				// #region

				// CST minting specs.
				// Items:
				//    [0] for `marketingWallet`.
				//    [1] for `enduranceChampionAddress`.
				//    [2] for `lastCstBidderAddress`. This item is not guaranteed to exist.
				ICosmicSignatureToken.MintSpec[] memory cosmicSignatureTokenMintSpecs_;

				// #endregion
				// #region

				{
					// #region

					// Addresses for which to mint CS NFTs.
					// Items:
					//    0 or `numRaffleCosmicSignatureNftsForRandomWalkNftStakers` items. Random Walk NFT stakers.
					//    0 or 1 items. `lastCstBidderAddress`.
					//    1 item. `_msgSender()`, that's the main prize beneficiary.
					//    1 item. `enduranceChampionAddress`.
					//    `numRaffleCosmicSignatureNftsForBidders` items. Bidders.
					address[] memory cosmicSignatureNftOwnerAddresses_;

					// This will remain zero, so the compiler will optimize this out.
					// That's why it's unnecessary to move this to `_PackedVariables1`.
					// In some cases, we assume that this is zero, without using this explicitly.
					uint256 cosmicSignatureNftOwnerRandomWalkNftStakerAddressIndex_ = 0;

					_PackedVariables1 memory packedVariables1_;

					// #endregion
					// #region

					randomNumberSeedWrapper_ = RandomNumberHelpers.RandomNumberSeedWrapper(RandomNumberHelpers.generateRandomNumberSeed());

					// #endregion
					// #region CS NFTs for random Random Walk NFT stakers.

					{
						// #enable_asserts assert(numRaffleCosmicSignatureNftsForRandomWalkNftStakers > 0);
						uint256 randomNumberSeed_;
						unchecked { randomNumberSeed_ = randomNumberSeedWrapper_.value + 0x7c6eeb003d4a6dc5ebf549935c6ffb814ba1f060f1af8a0b11c2aa94a8e716e4; }

						// This can potentially be empty.
						address[] memory luckyStakerAddresses_ =
							stakingWalletRandomWalkNft.pickRandomStakerAddressesIfPossible
								(numRaffleCosmicSignatureNftsForRandomWalkNftStakers, randomNumberSeed_);

						uint256 cosmicSignatureNftIndex_ = cosmicSignatureNftOwnerRandomWalkNftStakerAddressIndex_ + luckyStakerAddresses_.length;
						packedVariables1_.cosmicSignatureNftOwnerLastCstBidderAddressIndex = uint64(cosmicSignatureNftIndex_);
						if (lastCstBidderAddress != address(0)) {
							++ cosmicSignatureNftIndex_;
						}
						packedVariables1_.cosmicSignatureNftOwnerMainPrizeBeneficiaryAddressIndex = uint64(cosmicSignatureNftIndex_);
						++ cosmicSignatureNftIndex_;
						packedVariables1_.cosmicSignatureNftOwnerEnduranceChampionAddressIndex = uint64(cosmicSignatureNftIndex_);
						++ cosmicSignatureNftIndex_;
						packedVariables1_.cosmicSignatureNftOwnerBidderAddressIndex = uint64(cosmicSignatureNftIndex_);
						uint256 numCosmicSignatureNfts_ = cosmicSignatureNftIndex_ + numRaffleCosmicSignatureNftsForBidders;
						cosmicSignatureNftOwnerAddresses_ = new address[](numCosmicSignatureNfts_);
						for (uint256 luckyStakerIndex_ = luckyStakerAddresses_.length; luckyStakerIndex_ > 0; ) {
							-- luckyStakerIndex_;
							address luckyStakerAddress_ = luckyStakerAddresses_[luckyStakerIndex_];
							// #enable_asserts assert(luckyStakerAddress_ != address(0));

							// One might want to optimize this code by making destination item index a single variable.
							// But `cosmicSignatureNftOwnerRandomWalkNftStakerAddressIndex_` is known at compile time to be zero.
							// So there is no inefficiency here.
							cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftOwnerRandomWalkNftStakerAddressIndex_ + luckyStakerIndex_] = luckyStakerAddress_;
						}
					}

					// #endregion
					// #region

					uint256 cstPrizeAmount_ = bidderAddressesReference_.numItems * cstPrizeAmountMultiplier;

					// #endregion
					// #region CST and CS NFT for the last CST bidder.

					if (lastCstBidderAddress != address(0)) {
						cosmicSignatureNftOwnerAddresses_[uint256(packedVariables1_.cosmicSignatureNftOwnerLastCstBidderAddressIndex)] = lastCstBidderAddress;
						cosmicSignatureTokenMintSpecs_ = new ICosmicSignatureToken.MintSpec[](3);
						cosmicSignatureTokenMintSpecs_[2].account = lastCstBidderAddress;
						cosmicSignatureTokenMintSpecs_[2].value = cstPrizeAmount_;
					} else {
						cosmicSignatureTokenMintSpecs_ = new ICosmicSignatureToken.MintSpec[](2);
					}

					// #endregion
					// #region CS NFT for the Main Prize Beneficiary.

					cosmicSignatureNftOwnerAddresses_[uint256(packedVariables1_.cosmicSignatureNftOwnerMainPrizeBeneficiaryAddressIndex)] = _msgSender();

					// #endregion
					// #region CST and CS NFT for Endurance Champion.

					// #enable_asserts assert(enduranceChampionAddress != address(0));
					cosmicSignatureNftOwnerAddresses_[uint256(packedVariables1_.cosmicSignatureNftOwnerEnduranceChampionAddressIndex)] = enduranceChampionAddress;
					cosmicSignatureTokenMintSpecs_[1].account = enduranceChampionAddress;
					cosmicSignatureTokenMintSpecs_[1].value = cstPrizeAmount_;

					// #endregion
					// #region CS NFTs for random bidders.

					{
						// #enable_asserts assert(numRaffleCosmicSignatureNftsForBidders > 0);
						uint256 cosmicSignatureNftIndex_ = cosmicSignatureNftOwnerAddresses_.length;
						// #enable_asserts assert(cosmicSignatureNftIndex_ == uint256(packedVariables1_.cosmicSignatureNftOwnerBidderAddressIndex) + numRaffleCosmicSignatureNftsForBidders);
						do {
							uint256 randomNumber_ = RandomNumberHelpers.generateRandomNumber(randomNumberSeedWrapper_);
							address raffleWinnerAddress_ = bidderAddressesReference_.items[randomNumber_ % bidderAddressesReference_.numItems];
							// #enable_asserts assert(raffleWinnerAddress_ != address(0));
							-- cosmicSignatureNftIndex_;
							cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_] = raffleWinnerAddress_;
						} while (cosmicSignatureNftIndex_ > uint256(packedVariables1_.cosmicSignatureNftOwnerBidderAddressIndex));
					}

					// #endregion
					// #region

					uint256 firstCosmicSignatureNftId_;

					// #endregion
					// #region Minting CS NFTs.

					{
						uint256 randomNumberSeed_;
						unchecked { randomNumberSeed_ = randomNumberSeedWrapper_.value + 0x2a8612ecb5cb17da87f8befda0480288e2d053de55d9d7d4dc4899077cf5aeda; }
						firstCosmicSignatureNftId_ = nft.mintMany(roundNum, cosmicSignatureNftOwnerAddresses_, randomNumberSeed_);
					}

					// #endregion
					// #region Processing CS NFTs.

					{
						// #region

						uint256 cosmicSignatureNftIndex_ = cosmicSignatureNftOwnerAddresses_.length;
						uint256 cosmicSignatureNftId_ = firstCosmicSignatureNftId_ + cosmicSignatureNftIndex_;

						// #endregion
						// #region CS NFTs for random bidders.

						{
							// #enable_asserts assert(numRaffleCosmicSignatureNftsForBidders > 0);
							// #enable_asserts assert(cosmicSignatureNftIndex_ == uint256(packedVariables1_.cosmicSignatureNftOwnerBidderAddressIndex) + numRaffleCosmicSignatureNftsForBidders);
							uint256 winnerIndex_ = cosmicSignatureNftIndex_ - uint256(packedVariables1_.cosmicSignatureNftOwnerBidderAddressIndex);
							// #enable_asserts assert(winnerIndex_ == numRaffleCosmicSignatureNftsForBidders);
							do {
								-- winnerIndex_;
								-- cosmicSignatureNftId_;
								-- cosmicSignatureNftIndex_;
								address raffleWinnerAddress_ = cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_];
								// #enable_asserts assert(raffleWinnerAddress_ != address(0));
								emit RaffleWinnerCosmicSignatureNftAwarded(roundNum, false, winnerIndex_, raffleWinnerAddress_, cosmicSignatureNftId_);
							} while (winnerIndex_ > 0);
						}

						// #endregion
						// #region CST and CS NFT for Endurance Champion.

						// #enable_asserts assert(enduranceChampionAddress != address(0));
						-- cosmicSignatureNftIndex_;
						// #enable_asserts assert(cosmicSignatureNftIndex_ == uint256(packedVariables1_.cosmicSignatureNftOwnerEnduranceChampionAddressIndex));
						// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_] == enduranceChampionAddress);
						// #enable_asserts assert(cosmicSignatureTokenMintSpecs_[1].account == enduranceChampionAddress);
						// #enable_asserts assert(cosmicSignatureTokenMintSpecs_[1].value == cstPrizeAmount_);
						-- cosmicSignatureNftId_;
						emit EnduranceChampionPrizePaid(roundNum, cosmicSignatureTokenMintSpecs_[1].account, cstPrizeAmount_, cosmicSignatureNftId_);

						// #endregion
						// #region ETH and CS NFT for the Main Prize Beneficiary.

						// [Comment-202501161]
						// It's important to calculate this before ETH transfers change our ETH balance.
						// [/Comment-202501161]
						mainEthPrizeAmount_ = getMainEthPrizeAmount();

						-- cosmicSignatureNftIndex_;
						// #enable_asserts assert(cosmicSignatureNftIndex_ == uint256(packedVariables1_.cosmicSignatureNftOwnerMainPrizeBeneficiaryAddressIndex));
						// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_] == _msgSender());
						-- cosmicSignatureNftId_;
						emit MainPrizeClaimed(roundNum, _msgSender(), mainEthPrizeAmount_, cosmicSignatureNftId_);

						// #endregion
						// #region CST and CS NFT for the last CST bidder.

						// Not asserting `cosmicSignatureNftIndex_` in this region. We will do that near Comment-202503211.

						if (cosmicSignatureTokenMintSpecs_.length > 2) {
							// #enable_asserts assert(lastCstBidderAddress != address(0));
							-- cosmicSignatureNftIndex_;
							// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_] == lastCstBidderAddress);
							// #enable_asserts assert(cosmicSignatureTokenMintSpecs_[2].account == lastCstBidderAddress);
							// #enable_asserts assert(cosmicSignatureTokenMintSpecs_[2].value == cstPrizeAmount_);
							-- cosmicSignatureNftId_;
							emit LastCstBidderPrizePaid(roundNum, cosmicSignatureTokenMintSpecs_[2].account, cstPrizeAmount_, cosmicSignatureNftId_);
						} else {
							// #enable_asserts assert(lastCstBidderAddress == address(0));
						}

						// #endregion
						// #region CS NFTs for random Random Walk NFT stakers.

						// #enable_asserts assert(numRaffleCosmicSignatureNftsForRandomWalkNftStakers > 0);
						// #enable_asserts assert(
						// #enable_asserts 	uint256(packedVariables1_.cosmicSignatureNftOwnerLastCstBidderAddressIndex) == 0 ||
						// #enable_asserts 	uint256(packedVariables1_.cosmicSignatureNftOwnerLastCstBidderAddressIndex) == numRaffleCosmicSignatureNftsForRandomWalkNftStakers
						// #enable_asserts );

						// [Comment-202503211/]
						// #enable_asserts assert(cosmicSignatureNftIndex_ == uint256(packedVariables1_.cosmicSignatureNftOwnerLastCstBidderAddressIndex));

						while (cosmicSignatureNftIndex_ > 0) {
							-- cosmicSignatureNftId_;
							-- cosmicSignatureNftIndex_;
							address luckyStakerAddress_ = cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_];
							// #enable_asserts assert(luckyStakerAddress_ != address(0));
							emit RaffleWinnerCosmicSignatureNftAwarded(roundNum, true, cosmicSignatureNftIndex_, luckyStakerAddress_, cosmicSignatureNftId_);
						}

						// #endregion
						// #region

						// #enable_asserts assert(cosmicSignatureNftIndex_ == 0);
						// #enable_asserts assert(cosmicSignatureNftId_ == firstCosmicSignatureNftId_);

						// #endregion
					}

					// #endregion
				}

				// #endregion
				// #region CST for Marketing Wallet.

				cosmicSignatureTokenMintSpecs_[0].account = marketingWallet;
				cosmicSignatureTokenMintSpecs_[0].value = marketingWalletCstContributionAmount;

				// #endregion
				// #region Minting CSTs.

				token.mintMany(cosmicSignatureTokenMintSpecs_);

				// #endregion
			}

			// #endregion
			// #region

			{
				// #region

				// This can potentially be zero.
				uint256 charityEthDonationAmount_;

				// #endregion
				// #region

				{
					// #region

					// This can potentially be zero.
					uint256 cosmicSignatureNftStakingTotalEthRewardAmount_;

					// #endregion
					// #region

					{
						// #region

						// #enable_asserts assert(numRaffleEthPrizesForBidders > 0);
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
						// #region ETH for Chrono-Warrior.

						{
							// #enable_asserts assert(chronoWarriorAddress != address(0));
							// #enable_asserts assert(ethDepositIndex_ == numRaffleEthPrizesForBidders);
							IPrizesWallet.EthDeposit memory ethDepositReference_ = ethDeposits_[ethDepositIndex_];
							ethDepositReference_.prizeWinnerAddress = chronoWarriorAddress;

							// Comment-202501161 applies.
							// This can potentially be zero.
							uint256 chronoWarriorEthPrizeAmount_ = getChronoWarriorEthPrizeAmount();

							ethDepositReference_.amount = chronoWarriorEthPrizeAmount_;
							ethDepositsTotalAmount_ += chronoWarriorEthPrizeAmount_;
							emit ChronoWarriorEthPrizeAllocated(roundNum, chronoWarriorAddress, chronoWarriorEthPrizeAmount_);
						}

						// #endregion
						// #region ETH for random bidders.

						{
							// #enable_asserts assert(numRaffleEthPrizesForBidders > 0);
							// #enable_asserts assert(ethDepositIndex_ == numRaffleEthPrizesForBidders);

							// Comment-202501161 applies.
							// This can potentially be zero.
							uint256 raffleTotalEthPrizeAmountForBidders_ = getRaffleTotalEthPrizeAmountForBidders();

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
								emit RaffleWinnerBidderEthPrizeAllocated(roundNum, ethDepositIndex_, raffleWinnerAddress_, raffleEthPrizeAmountForBidder_);
							} while (ethDepositIndex_ > 0);
						}

						// #endregion
						// #region

						// Comment-202501161 applies.
						charityEthDonationAmount_ = getCharityEthDonationAmount();
						cosmicSignatureNftStakingTotalEthRewardAmount_ = getCosmicSignatureNftStakingTotalEthRewardAmount();

						// All calculations marked with Comment-202501161 must be made before this.
						prizesWallet.registerRoundEndAndDepositEthMany{value: ethDepositsTotalAmount_}(roundNum, _msgSender(), ethDeposits_);

						// #endregion
					}

					// #endregion
					// #region ETH for Cosmic Signature NFT stakers.

					try stakingWalletCosmicSignatureNft.deposit{value: cosmicSignatureNftStakingTotalEthRewardAmount_}(roundNum) {
						// Doing nothing.
					} catch Panic(uint256 errorCode_) {
						// Comment-202410161 relates.
						if(errorCode_ != OpenZeppelinPanic.DIVISION_BY_ZERO) {

							// todo-0 Investigate under what conditions we can possibly reach this point.
							// todo-0 The same applies to other external calls and internal logic that can result in a failure to claim the main prize.
							// todo-0 Discussed at https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1734565291159669

							// todo-1 Test that this correctly rethrows other panic codes
							// todo-1 by setting fake ETH balance to a huge value to cause the sum of ETH deposits to overflow.
							// todo-1 But ETH total supply probably can't exceed `uint256` max value.
							OpenZeppelinPanic.panic(errorCode_);
						}
						charityEthDonationAmount_ += cosmicSignatureNftStakingTotalEthRewardAmount_;

						// One might want to reset `cosmicSignatureNftStakingTotalEthRewardAmount_` to zero here, but it's unnecessary.
					}

					// #endregion
				}

				// #endregion
				// #region

				// [Comment-202411077]
				// ETH for charity.
				// If ETH transfer to charity fails we won't revert the transaction. The funds would simply stay in the game.
				// Comment-202411078 relates.
				// [/Comment-202411077]
				{
					// I don't want to spend gas to `require` this.
					// But if I did, this would be a wrong place for that validation.
					// #enable_asserts assert(charityAddress != address(0));

					// [Comment-202502043]
					// In most cases, we make high level calls to strongly typed addresses --
					// to let SMTChecker know what exactly method on what contract we are calling.
					// But we make a low level call like this to make a simple ETH transfer.
					// Comment-202502057 relates.
					// [/Comment-202502043]
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
		}

		// #endregion
		// #region

		// [Comment-202501183]
		// Main ETH prize for main prize beneficiary.
		// Making this transfer at the end. Otherwise hackers could attempt to exploit the 63/64 rule
		// by crafting an amount of gas that would result is the last external call, possibly a fund transfer, failing,
		// which would result in incorrect behavior if we ignore that error.
		// If this fails, one might want to transfer the funds to `prizesWallet`.
		// Another option would be to transfer the funds there unconditionally. It's likely not the only prize for this address anyway.
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
	}

	// #endregion
	// #region `_prepareNextRound`

	/// @notice Updates state variables for the next bidding round.
	/// This method is called after the main prize has been claimed.
	function _prepareNextRound() private {
		// todo-1 +++ Consider to not reset some variables.

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

		// todo-1 +++ We do need to reset this, right?
		prevEnduranceChampionDuration = 0;
		chronoWarriorAddress = address(0);
		chronoWarriorDuration = uint256(int256(-1));
		++ roundNum;

		// // [Comment-202501307]
		// // Instead of making this assignment, it appears to be more efficient
		// // to use `nextRoundFirstCstDutchAuctionBeginningBidPrice` for the 1st CST Dutch auction in the next bidding round.
		// // [/Comment-202501307]
		// cstDutchAuctionBeginningBidPrice = nextRoundFirstCstDutchAuctionBeginningBidPrice;

		// It's probably unnecessary to emit an event about this change.
		mainPrizeTimeIncrementInMicroSeconds += mainPrizeTimeIncrementInMicroSeconds / mainPrizeTimeIncrementIncreaseDivisor;

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
