// #region

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// #endregion
// #region

// #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
// import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureEvents } from "./libraries/CosmicSignatureEvents.sol";
import { CosmicSignatureHelpers } from "./libraries/CosmicSignatureHelpers.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";
// import { CosmicSignatureNft } from "./CosmicSignatureNft.sol";
import { IPrizesWallet } from "./interfaces/IPrizesWallet.sol";
// import { StakingWalletRandomWalkNft } from "./StakingWalletRandomWalkNft.sol";
// import { StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { BiddingBase } from "./BiddingBase.sol";
import { MainPrizeBase } from "./MainPrizeBase.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { IMainPrize } from "./interfaces/IMainPrize.sol";

// #endregion
// #region

abstract contract MainPrize is
	ReentrancyGuardTransientUpgradeable,
	CosmicSignatureGameStorage,
	BiddingBase,
	MainPrizeBase,
	BidStatistics,
	IMainPrize {
	// #region `claimMainPrize`

	/// @dev We don't need `onlyActive` here, which we `assert` near Comment-202411169.
	/// todo-1 For all contracts and all methods, think what modifiers it might need,
	/// todo-1 who and under what conditions is permitted to call it.
	/// todo-1 It could be possible to not require `nonReentrant` if we transferred main prize ETH
	/// todo-1 to `msg.sender` after all other logic, provided it's safe to assume that ETH transfer to charity can't reenter us,
	/// todo-1 although we could execute that transfer at the very end as well.
	/// todo-1 But let's leave it alone.
	/// todo-1 Comment and reference Comment-202411078.
	function claimMainPrize() external override nonReentrant /*onlyActive*/ {
		// #region

		if (msg.sender == lastBidderAddress) {
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
					msg.sender,
					uint256(durationUntilOperationIsPermitted_)
				)
			);
		}

		// [Comment-202411169]
		// We `assert`ed or `require`d that `lastBidderAddress` is a nonzero.
		// Therefore we know that the current bidding round is active.
		// [/Comment-202411169]
		// #enable_asserts assert(block.timestamp >= activationTime);

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
	/// todo-1 Develop a test that checks that there are no NFTs with duplicate seeds.
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

			// todo-1 Optimize: use the initial value as is; then calculate and use its hash and assign the result to itself;
			// todo-1 only then start incrementing it and calculating its hash.
			// todo-1 Write a comment to explain things.
			CosmicSignatureHelpers.RandomNumberSeedWrapper memory randomNumberSeedWrapper_ =
				CosmicSignatureHelpers.RandomNumberSeedWrapper(CosmicSignatureHelpers.generateRandomNumberSeed());

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

					uint256 cstRewardAmount_ = numRaffleParticipants[roundNum] * cstRewardAmountMultiplier;

					// Addresses for which to mint CS NFTs.
					// Items:
					//    0 or `numRaffleCosmicSignatureNftsForRandomWalkNftStakers` items. RandomWalk NFT stakers.
					//    0 or 1 items. `lastCstBidderAddress`.
					//    1 item. `msg.sender`, that's the main prize beneficiary.
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

					cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftOwnerMainPrizeBeneficiaryAddressIndex_] = msg.sender;

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
						uint256 randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeedWrapper_);
						address raffleWinnerAddress_ = raffleParticipants[roundNum][randomNumber_ % numRaffleParticipants[roundNum]];
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
						// #enable_asserts assert(cosmicSignatureNftOwnerAddresses_[cosmicSignatureNftIndex_] == msg.sender);
						-- cosmicSignatureNftId_;
						emit MainPrizeClaimed(roundNum, msg.sender, mainEthPrizeAmount_, cosmicSignatureNftId_);

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

				token.mintMany(cosmicSignatureTokenMintSpecs_);

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
					uint256 stakingTotalEthRewardAmount_ = getStakingTotalEthRewardAmount();

					// #endregion
					// #region

					{
						// #region

						// ETH deposits to make to `prizesWallet`.
						// Some of these can be equal `msg.sender`, in which case one might want
						// instead of sending the funds to `prizesWallet` to send them directly to `msg.sender` near Comment-202501183.
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
							uint256 raffleTotalEthPrizeAmount_ = getRaffleTotalEthPrizeAmount();

							uint256 winnerIndex_ = numRaffleEthPrizesForBidders;
							uint256 raffleEthPrizeAmount_ = raffleTotalEthPrizeAmount_ / winnerIndex_;
							ethDepositsTotalAmount_ += raffleEthPrizeAmount_ * winnerIndex_;
							do {
								-- winnerIndex_;
								IPrizesWallet.EthDeposit memory ethDepositReference_ = ethDeposits_[winnerIndex_];
								uint256 randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeedWrapper_);
								address raffleWinnerAddress_ = raffleParticipants[roundNum][randomNumber_ % numRaffleParticipants[roundNum]];
								// #enable_asserts assert(raffleWinnerAddress_ != address(0));
								ethDepositReference_.prizeWinnerAddress = raffleWinnerAddress_;
								ethDepositReference_.amount = raffleEthPrizeAmount_;
								emit RaffleWinnerEthPrizeAllocated(roundNum, winnerIndex_, raffleWinnerAddress_, raffleEthPrizeAmount_);
							} while (winnerIndex_ > 0);
						}

						// #endregion
						// #region

						// All calculations marked with Comment-202501161 must be made before this.
						// One might want to pass `lastBidderAddress` instead of `msg.sender` here.
						// As a result, even if the last bidder fails to claim the main prize, we would still record them as the winner,
						// which would allow them to claim donated ERC-20 tokens and ERC-721 NFTs.
						// But we feel that it's better to simply treat the person who clicked "Claim" as the winner.
						prizesWallet.registerRoundEndAndDepositEthMany{value: ethDepositsTotalAmount_}(roundNum, msg.sender, ethDeposits_);

						// #endregion
					}

					// #endregion
					// #region ETH for CosmicSignature NFT stakers.

					try stakingWalletCosmicSignatureNft.depositIfPossible{value: stakingTotalEthRewardAmount_}(roundNum) {
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
									stakingTotalEthRewardAmount_
								);
						}
						charityEthDonationAmount_ += stakingTotalEthRewardAmount_;

						// One might want to reset `stakingTotalEthRewardAmount_` to zero here, but it's unnecessary.
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
		// [/Comment-202501183]
		{
			// todo-1 Can/should we specify how much gas an untrusted external call is allowed to use?
			// todo-1 `transfer` allows only 3500 gas, right?
			// todo-1 At the same time, can/should we forward all gas to trusted external calls?
			// todo-1 And don't limit gas when sending ETH or whatever tokens to `msg.sender`.
			// todo-1 Really, the only potentially vulnerable external call is the one near Comment-202411077.
			// todo-1 See also: Comment-202411077, Comment-202411078.
			// todo-1 Make sure all external calls whose fails we don't ignore cannot fail.
			// todo-1 If this fails, maybe send the funds to `prizesWallet`.
			// todo-1 We really can send funds there unconditionally. It will likely be not the only prize for this address anyway.
			// todo-1 Write and cross-ref comments.
			(bool isSuccess_, ) = msg.sender.call{value: mainEthPrizeAmount_}("");
			require(isSuccess_, CosmicSignatureErrors.FundTransferFailed("ETH transfer to bidding round main prize beneficiary failed.", msg.sender, mainEthPrizeAmount_));
		}

		// #endregion
	}

	// #endregion
	// #region // `_updateRaffleEntropy`

	// /// @notice Update the entropy used for random selection
	// /// @dev This function updates the entropy using the current block information
	// function _updateRaffleEntropy() private {
	// 	// #enable_smtchecker /*
	// 	unchecked
	// 	// #enable_smtchecker */
	// 	{
	// 		raffleEntropy = keccak256(abi.encode(raffleEntropy, block.timestamp, blockhash(block.number - 1)));
	// 	}
	// }

	// #endregion
	// #region `_prepareNextRound`

	/// @notice Updates state for the next bidding round.
	/// This method is called after the main prize has been claimed.
	function _prepareNextRound() private {
		// todo-1 Consider to not reset some variables.

		// It's probably unnecessary to emit an event about this change.
		mainPrizeTimeIncrementInMicroSeconds += mainPrizeTimeIncrementInMicroSeconds / mainPrizeTimeIncrementIncreaseDivisor;

		// todo-1 Remove this garbage.
		// if (roundNum == 0) {
		// 	// // #enable_asserts assert(ethDutchAuctionDurationDivisor == 1);
		// 	// ethDutchAuctionDurationDivisor = CosmicSignatureConstants.DEFAULT_ETH_DUTCH_AUCTION_DURATION_DIVISOR;
		//
		// 	// #enable_asserts assert(ethDutchAuctionEndingBidPriceDivisor == 1);
		// 	ethDutchAuctionEndingBidPriceDivisor = CosmicSignatureConstants.DEFAULT_ETH_DUTCH_AUCTION_ENDING_BID_PRICE_DIVISOR;
		// }

		++ roundNum;
		// todo-1 Consider not assigning this and instead using `nextRoundCstDutchAuctionBeginningBidPrice` on the 1st CST Dutch auction.
		cstDutchAuctionBeginningBidPrice = nextRoundCstDutchAuctionBeginningBidPrice;
		lastBidderAddress = address(0);
		lastCstBidderAddress = address(0);
		// lastBidType = CosmicSignatureConstants.BidType.ETH;

		// // Assuming this will neither overflow nor underflow.
		// // todo-1 Take a closer look at this and other similar formulas.
		// // todo-1 Should we use this formula before the 1st round too?
		// // todo-1 Should `setRoundStartCstAuctionLength` and `setMainPrizeTimeIncrementInMicroSeconds` use it too?
		// cstAuctionLength =
		// 	roundStartCstAuctionLength +
		// 	// todo-1 This formula is now incorrect.
		// 	((mainPrizeTimeIncrementInMicroSeconds - CosmicSignatureConstants.INITIAL_MAIN_PRIZE_TIME_INCREMENT) / CosmicSignatureConstants.NANOSECONDS_PER_SECOND);

		// // todo-9 Maybe add 1 to ensure that the result is a nonzero.
		// nextEthBidPrice = address(this).balance / ethDutchAuctionEndingBidPriceDivisor;
		enduranceChampionAddress = address(0);
		// todo-1 Is it really necessary to reset this?
		enduranceChampionStartTimeStamp = 0;
		// todo-1 We do need to reset this, right?
		enduranceChampionDuration = 0;
		// todo-1 We do need to reset this, right?
		prevEnduranceChampionDuration = 0;
		chronoWarriorAddress = address(0);
		chronoWarriorDuration = uint256(int256(-1));
		_setActivationTime(block.timestamp + delayDurationBeforeNextRound);

		// if (systemMode == CosmicSignatureConstants.MODE_PREPARE_MAINTENANCE) {
		// 	systemMode = CosmicSignatureConstants.MODE_MAINTENANCE;
		// 	emit SystemModeChanged(systemMode);
		// }
	}

	// #endregion
	// #region `getMainEthPrizeAmount`

	function getMainEthPrizeAmount() public view override returns(uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * mainEthPrizeAmountPercentage / 100;
		}
	}

	// #endregion
	// #region `getChronoWarriorEthPrizeAmount`

	function getChronoWarriorEthPrizeAmount() public view override returns(uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * chronoWarriorEthPrizeAmountPercentage / 100;
		}
	}

	// #endregion
	// #region `getRaffleTotalEthPrizeAmount`

	function getRaffleTotalEthPrizeAmount() public view override returns(uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * raffleTotalEthPrizeAmountPercentage / 100;
		}
	}

	// #endregion
	// #region `getStakingTotalEthRewardAmount`

	function getStakingTotalEthRewardAmount() public view override returns(uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * stakingTotalEthRewardAmountPercentage / 100;
		}
	}

	// #endregion
	// #region `getCharityEthDonationAmount`

	function getCharityEthDonationAmount() public view override returns(uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			return address(this).balance * charityEthDonationAmountPercentage / 100;
		}
	}

	// #endregion
	// #region // `tryGetMainPrizeWinnerAddress`

	// function tryGetMainPrizeWinnerAddress(uint256 roundNum_) external view override returns(address) {
	// 	return winners[roundNum_];
	// }

	// #endregion
}

// #endregion
