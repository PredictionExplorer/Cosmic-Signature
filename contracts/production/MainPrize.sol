// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

// #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
// import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureEvents } from "./libraries/CosmicSignatureEvents.sol";
import { RandomNumberHelpers } from "./libraries/RandomNumberHelpers.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";
// import { CosmicSignatureNft } from "./CosmicSignatureNft.sol";
import { IPrizesWallet } from "./interfaces/IPrizesWallet.sol";
// import { StakingWalletRandomWalkNft } from "./StakingWalletRandomWalkNft.sol";
// import { StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
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

	/// @dev We don't need `_onlyRoundIsActive` here, which we `assert` near Comment-202411169.
	/// todo-1 For all contracts and all methods, think what modifiers it might need,
	/// todo-1 who and under what conditions is permitted to call it.
	/// todo-1 It could be possible to not require `nonReentrant` if we transferred main prize ETH
	/// todo-1 to `_msgSender()` after all other logic, provided it's safe to assume that ETH transfer to charity can't reenter us,
	/// todo-1 although we could execute that transfer at the very end as well.
	/// todo-1 But let's leave it alone.
	/// todo-1 Comment and reference Comment-202411078.
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
			require(lastBidderAddress != address(0), CosmicSignatureErrors.NoBidsPlacedInCurrentRound("There have been no bids in the current bidding round yet."));
			
			int256 durationUntilOperationIsPermitted_ = getDurationUntilMainPrize() + int256(timeoutDurationToClaimMainPrize);
			require(
				durationUntilOperationIsPermitted_ <= int256(0),
				CosmicSignatureErrors.MainPrizeClaimDenied(
					"Only the last bidder is permitted to claim the bidding round main prize until a timeout expires.",
					lastBidderAddress,
					_msgSender(),
					uint256(durationUntilOperationIsPermitted_)
				)
			);
		}

		// [Comment-202411169]
		// We `assert`ed or `require`d that `lastBidderAddress` is a nonzero.
		// Therefore we know that the current bidding round is active.
		// [/Comment-202411169]
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

		// [Comment-202501161]
		// It's important to calculate this before ETH transfers change our ETH balance.
		// [/Comment-202501161]
		uint256 mainEthPrizeAmount_ = getMainEthPrizeAmount();

		// #endregion
		// #region

		{
			// #region

			// Issue. It appears that the optimization idea described in Comment-202502077 would be difficult to implement here.
			RandomNumberHelpers.RandomNumberSeedWrapper memory randomNumberSeedWrapper_ =
				RandomNumberHelpers.RandomNumberSeedWrapper(RandomNumberHelpers.generateRandomNumberSeed());

			BidderAddresses storage bidderAddressesReference_ = bidderAddresses[roundNum];

			// todo-1 We are supposed to declare this near ToDo-202502065-1.
			ICosmicSignatureToken.MintSpec[] memory cosmicSignatureTokenMintSpecs_;

			// #endregion
			// #region

			{
				// #region

				// [ToDo-202502065-1]
				// To eliminate compile errors, I had to move this declaration elsewhere.
				// To be revisited.
				// ToDo-202502067-1 relates.
				// [/ToDo-202502065-1]
				// // CST minting specs.
				// // Items:
				// //    [0] for `marketingWallet`.
				// //    [1] for `enduranceChampionAddress`.
				// //    [2] for `lastCstBidderAddress`. This item is not guaranteed to exist.
				// ICosmicSignatureToken.MintSpec[] memory cosmicSignatureTokenMintSpecs_;

				// #endregion
				// #region

				{
					// #region

					uint256 cstRewardAmount_ = bidderAddressesReference_.numItems * cstRewardAmountMultiplier;

					// Addresses for which to mint CS NFTs.
					// Items:
					//    0 or `numRaffleCosmicSignatureNftsForRandomWalkNftStakers` items. RandomWalk NFT stakers.
					//    0 or 1 items. `lastCstBidderAddress`.
					//    1 item. `_msgSender()`, that's the main prize beneficiary.
					//    1 item. `enduranceChampionAddress`.
					//    `numRaffleCosmicSignatureNftsForBidders` items. Bidders.
					address[] memory cosmicSignatureNftOwnerAddresses_;

					// This will remain zero.
					// In some cases, we assume that this is zero, without using this explicitly.
					uint256 cosmicSignatureNftOwnerRandomWalkNftStakerAddressIndex_ = 0;

					uint256 cosmicSignatureNftOwnerLastCstBidderAddressIndex_;
					uint256 cosmicSignatureNftOwnerMainPrizeBeneficiaryAddressIndex_;
					uint256 cosmicSignatureNftOwnerEnduranceChampionAddressIndex_;
					uint256 cosmicSignatureNftOwnerBidderAddressIndex_;

					// #endregion
					// #region CS NFTs for random RandomWalk NFT stakers.

					{
						// #enable_asserts assert(numRaffleCosmicSignatureNftsForRandomWalkNftStakers > 0);
						uint256 randomNumberSeed_;
						unchecked { randomNumberSeed_ = randomNumberSeedWrapper_.value + 0x7c6eeb003d4a6dc5ebf549935c6ffb814ba1f060f1af8a0b11c2aa94a8e716e4; }
						address[] memory luckyStakerAddresses_ =
							stakingWalletRandomWalkNft.pickRandomStakerAddressesIfPossible
								(numRaffleCosmicSignatureNftsForRandomWalkNftStakers, randomNumberSeed_);
						cosmicSignatureNftOwnerLastCstBidderAddressIndex_ = cosmicSignatureNftOwnerRandomWalkNftStakerAddressIndex_ + luckyStakerAddresses_.length;
						cosmicSignatureNftOwnerMainPrizeBeneficiaryAddressIndex_ = cosmicSignatureNftOwnerLastCstBidderAddressIndex_;
						if (lastCstBidderAddress != address(0)) {
							++ cosmicSignatureNftOwnerMainPrizeBeneficiaryAddressIndex_;
						}
						cosmicSignatureNftOwnerEnduranceChampionAddressIndex_ = cosmicSignatureNftOwnerMainPrizeBeneficiaryAddressIndex_ + 1;
						cosmicSignatureNftOwnerBidderAddressIndex_ = cosmicSignatureNftOwnerEnduranceChampionAddressIndex_ + 1;
						uint256 numCosmicSignatureNfts_ = cosmicSignatureNftOwnerBidderAddressIndex_ + numRaffleCosmicSignatureNftsForBidders;
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
					// #region CST and CS NFT for the last CST bidder.

					if (lastCstBidderAddress != address(0)) {
						cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftOwnerLastCstBidderAddressIndex_] = lastCstBidderAddress;
						cosmicSignatureTokenMintSpecs_ = new ICosmicSignatureToken.MintSpec[](3);
						cosmicSignatureTokenMintSpecs_[2].account = lastCstBidderAddress;
						cosmicSignatureTokenMintSpecs_[2].value = cstRewardAmount_;
					} else {
						cosmicSignatureTokenMintSpecs_ = new ICosmicSignatureToken.MintSpec[](2);
					}

					// #endregion
					// #region CS NFT for the Main Prize Beneficiary.

					cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftOwnerMainPrizeBeneficiaryAddressIndex_] = _msgSender();

					// #endregion
					// #region CST and CS NFT for Endurance Champion.

					// #enable_asserts assert(enduranceChampionAddress != address(0));
					cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftOwnerEnduranceChampionAddressIndex_] = enduranceChampionAddress;
					cosmicSignatureTokenMintSpecs_[1].account = enduranceChampionAddress;
					cosmicSignatureTokenMintSpecs_[1].value = cstRewardAmount_;

					// #endregion
					// #region CS NFTs for random bidders.

					// #enable_asserts assert(numRaffleCosmicSignatureNftsForBidders > 0);
					// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_.length == cosmicSignatureNftOwnerBidderAddressIndex_ + numRaffleCosmicSignatureNftsForBidders);
					for (uint256 cosmicSignatureNftOwnerIndex_ = cosmicSignatureNftOwnerAddresses_.length; ; ) {
						uint256 randomNumber_ = RandomNumberHelpers.generateRandomNumber(randomNumberSeedWrapper_);
						address raffleWinnerAddress_ = bidderAddressesReference_.items[randomNumber_ % bidderAddressesReference_.numItems];
						// #enable_asserts assert(raffleWinnerAddress_ != address(0));
						-- cosmicSignatureNftOwnerIndex_;
						cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftOwnerIndex_] = raffleWinnerAddress_;
						if (cosmicSignatureNftOwnerIndex_ <= cosmicSignatureNftOwnerBidderAddressIndex_) {
							break;
						}
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

						// #enable_asserts assert(numRaffleCosmicSignatureNftsForBidders > 0);
						// #enable_asserts assert(cosmicSignatureNftIndex_ - cosmicSignatureNftOwnerBidderAddressIndex_ == numRaffleCosmicSignatureNftsForBidders);
						for (uint256 winnerIndex_ = cosmicSignatureNftIndex_ - cosmicSignatureNftOwnerBidderAddressIndex_; ; ) {
							-- cosmicSignatureNftIndex_;
							address raffleWinnerAddress_ = cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_];
							// #enable_asserts assert(raffleWinnerAddress_ != address(0));
							-- winnerIndex_;
							-- cosmicSignatureNftId_;
							emit RaffleWinnerCosmicSignatureNftAwarded(roundNum, false, winnerIndex_, raffleWinnerAddress_, cosmicSignatureNftId_);
							if (winnerIndex_ <= 0) {
								break;
							}
						}

						// #endregion
						// #region CST and CS NFT for Endurance Champion.

						// #enable_asserts assert(enduranceChampionAddress != address(0));
						-- cosmicSignatureNftIndex_;
						// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_] == enduranceChampionAddress);
						// #enable_asserts assert(cosmicSignatureTokenMintSpecs_[1].account == enduranceChampionAddress);
						// #enable_asserts assert(cosmicSignatureTokenMintSpecs_[1].value == cstRewardAmount_);
						-- cosmicSignatureNftId_;
						emit EnduranceChampionPrizePaid(roundNum, cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_], cstRewardAmount_, cosmicSignatureNftId_);

						// #endregion
						// #region ETH and CS NFT for the Main Prize Beneficiary.

						-- cosmicSignatureNftIndex_;
						// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_] == _msgSender());
						-- cosmicSignatureNftId_;
						emit MainPrizeClaimed(roundNum, _msgSender(), mainEthPrizeAmount_, cosmicSignatureNftId_);

						// #endregion
						// #region CST and CS NFT for the last CST bidder.

						if (cosmicSignatureTokenMintSpecs_.length > 2) {
							// #enable_asserts assert(lastCstBidderAddress != address(0));
							-- cosmicSignatureNftIndex_;
							// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_] == lastCstBidderAddress);
							// #enable_asserts assert(cosmicSignatureTokenMintSpecs_[2].account == lastCstBidderAddress);
							// #enable_asserts assert(cosmicSignatureTokenMintSpecs_[2].value == cstRewardAmount_);
							-- cosmicSignatureNftId_;
							emit LastCstBidderPrizePaid(roundNum, cosmicSignatureTokenMintSpecs_[2].account, cstRewardAmount_, cosmicSignatureNftId_);
						} else {
							// #enable_asserts assert(lastCstBidderAddress == address(0));
						}

						// #endregion
						// #region CS NFTs for random RandomWalk NFT stakers.

						// #enable_asserts assert(numRaffleCosmicSignatureNftsForRandomWalkNftStakers > 0);
						// #enable_asserts assert(cosmicSignatureNftOwnerLastCstBidderAddressIndex_ == 0 || cosmicSignatureNftOwnerLastCstBidderAddressIndex_ == numRaffleCosmicSignatureNftsForRandomWalkNftStakers);
						// #enable_asserts assert(cosmicSignatureNftIndex_ == cosmicSignatureNftOwnerLastCstBidderAddressIndex_);
						while (cosmicSignatureNftIndex_ > 0) {
							-- cosmicSignatureNftIndex_;
							address luckyStakerAddress_ = cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_];
							// #enable_asserts assert(luckyStakerAddress_ != address(0));
							-- cosmicSignatureNftId_;
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

				// [ToDo-202502067-1]
				// To eliminate compile errors, I had to move this action elsewhere.
				// To be revisited.
				// ToDo-202502065-1 relates.
				// [/ToDo-202502067-1]
				// token.mintMany(cosmicSignatureTokenMintSpecs_);

				// #endregion
			}

			// #endregion
			// #region

			{
				// #region

				// Comment-202501161 applies.
				uint256 charityEthDonationAmount_ = getCharityEthDonationAmount();

				// #endregion
				// #region

				{
					// #region

					// Comment-202501161 applies.
					uint256 cosmicSignatureNftStakingTotalEthRewardAmount_ = getCosmicSignatureNftStakingTotalEthRewardAmount();

					// #endregion
					// #region

					{
						// #region

						// ETH deposits to make to `prizesWallet`.
						// Some of these can be equal `_msgSender()`, in which case one might want
						// instead of sending the funds to `prizesWallet` to send them directly to `_msgSender()` near Comment-202501183.
						// But keeping it simple.
						// Items:
						//    `numRaffleEthPrizesForBidders` items. Bidders.
						//    1 item. `chronoWarriorAddress`.
						IPrizesWallet.EthDeposit[] memory ethDeposits_ = new IPrizesWallet.EthDeposit[](numRaffleEthPrizesForBidders + 1);

						uint256 ethDepositsTotalAmount_ = 0;

						// #endregion
						// #region ETH for Chrono-Warrior.

						{
							// #enable_asserts assert(chronoWarriorAddress != address(0));
							IPrizesWallet.EthDeposit memory ethDepositReference_ = ethDeposits_[numRaffleEthPrizesForBidders];
							ethDepositReference_.prizeWinnerAddress = chronoWarriorAddress;

							// Comment-202501161 applies.
							uint256 chronoWarriorEthPrizeAmount_ = getChronoWarriorEthPrizeAmount();

							ethDepositReference_.amount = chronoWarriorEthPrizeAmount_;
							ethDepositsTotalAmount_ += chronoWarriorEthPrizeAmount_;
							emit ChronoWarriorPrizeAllocated(roundNum, chronoWarriorAddress, chronoWarriorEthPrizeAmount_);
						}

						// #endregion
						// #region ETH for random bidders.

						{
							// #enable_asserts assert(numRaffleEthPrizesForBidders > 0);

							// Comment-202501161 applies.
							uint256 raffleTotalEthPrizeAmountForBidders_ = getRaffleTotalEthPrizeAmountForBidders();

							uint256 winnerIndex_ = numRaffleEthPrizesForBidders;
							uint256 raffleEthPrizeAmountForBidder_ = raffleTotalEthPrizeAmountForBidders_ / winnerIndex_;
							ethDepositsTotalAmount_ += raffleEthPrizeAmountForBidder_ * winnerIndex_;
							do {
								-- winnerIndex_;
								IPrizesWallet.EthDeposit memory ethDepositReference_ = ethDeposits_[winnerIndex_];
								uint256 randomNumber_ = RandomNumberHelpers.generateRandomNumber(randomNumberSeedWrapper_);
								address raffleWinnerAddress_ = bidderAddressesReference_.items[randomNumber_ % bidderAddressesReference_.numItems];
								// #enable_asserts assert(raffleWinnerAddress_ != address(0));
								ethDepositReference_.prizeWinnerAddress = raffleWinnerAddress_;
								ethDepositReference_.amount = raffleEthPrizeAmountForBidder_;
								emit RaffleWinnerBidderEthPrizeAllocated(roundNum, winnerIndex_, raffleWinnerAddress_, raffleEthPrizeAmountForBidder_);
							} while (winnerIndex_ > 0);
						}

						// #endregion
						// #region Minting CSTs.

						// todo-1 We are supposed to do this near ToDo-202502067-1.
						token.mintMany(cosmicSignatureTokenMintSpecs_);

						// #endregion
						// #region

						// All calculations marked with Comment-202501161 must be made before this.
						prizesWallet.registerRoundEndAndDepositEthMany{value: ethDepositsTotalAmount_}(roundNum, _msgSender(), ethDeposits_);

						// #endregion
					}

					// #endregion
					// #region ETH for CosmicSignature NFT stakers.

					try stakingWalletCosmicSignatureNft.depositIfPossible{value: cosmicSignatureNftStakingTotalEthRewardAmount_}(roundNum) {
					} catch (bytes memory errorDetails_) {
						// [ToDo-202409226-1]
						// Nick, you might want to develop tests for all possible cases that set `unexpectedErrorOccurred_` to `true` or `false`.
						// Then remove this ToDo and all mentionings of it elsewhere in the codebase.
						// [/ToDo-202409226-1]
						bool unexpectedErrorOccurred_;
						
						// [Comment-202410149/]
						if (errorDetails_.length == 100) {

							bytes4 errorSelector_;
							assembly { errorSelector_ := mload(add(errorDetails_, 0x20)) }
							unexpectedErrorOccurred_ = errorSelector_ != CosmicSignatureErrors.NoStakedNfts.selector;
						} else {
							// [Comment-202410299/]
							// #enable_asserts // #disable_smtchecker console.log("Error 202410303.", errorDetails_.length);

							unexpectedErrorOccurred_ = true;
						}
						if (unexpectedErrorOccurred_) {
							// todo-1 Investigate under what conditions we can possibly reach this point.
							// todo-1 The same applies to other external calls and internal logic that can result in a failure to claim the main prize.
							// todo-1 Discussed at https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1734565291159669
							revert
								CosmicSignatureErrors.FundTransferFailed(
									"ETH deposit to StakingWalletCosmicSignatureNft failed.",
									address(stakingWalletCosmicSignatureNft),
									cosmicSignatureNftStakingTotalEthRewardAmount_
								);
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
				// If this fails we won't revert the transaction. The funds would simply stay in the game.
				// Comment-202411078 relates.
				// [/Comment-202411077]
				{
					// I don't want to spend gas to `require` this.
					// But if I did, this would be a wrong place for that `require`.
					// The deployment script must recheck that `charityAddress` is a nonzero.
					// todo-1 Remember about the above. Cross-ref that rechecking with this comment.
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
		// Making this transfer at the end. Otherwise a hacker could attempt to exploit the 63/64 rule
		// by crafting an amount of gas that would result is the last external call, possibly a fund transfer, failing,
		// which would result in incorrect behavior if we ignore that error.
		// If this fails, we could transfer the funds to `prizesWallet`.
		// Another option would be to transfer funds there unconditionally. It's likely not the only prize for this address anyway.
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

	/// @notice Updates state for the next bidding round.
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
		// // to use `nextRoundFirstCstDutchAuctionBeginningBidPrice` for the 1st CST Dutch auction in each bidding round.
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
	// #region // `tryGetMainPrizeWinnerAddress`

	// function tryGetMainPrizeWinnerAddress(uint256 roundNum_) external view override returns (address) {
	// 	return winners[roundNum_];
	// }

	// #endregion
}

// #endregion
