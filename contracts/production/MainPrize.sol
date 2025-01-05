// #region

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// #endregion
// #region

// #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
// import { Context } from "@openzeppelin/contracts/utils/Context.sol";
// import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureEvents } from "./libraries/CosmicSignatureEvents.sol";
import { CosmicSignatureHelpers } from "./libraries/CosmicSignatureHelpers.sol";
// import { CosmicSignatureToken } from "./CosmicSignatureToken.sol";
// import { CosmicSignatureNft } from "./CosmicSignatureNft.sol";
// import { StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
// import { StakingWalletRandomWalkNft } from "./StakingWalletRandomWalkNft.sol";
// import { PrizesWallet } from "./PrizesWallet.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { IMainPrize } from "./interfaces/IMainPrize.sol";

// #endregion
// #region

abstract contract MainPrize is
	ReentrancyGuardTransientUpgradeable,
	CosmicSignatureGameStorage,
	SystemManagement,
	BidStatistics,
	IMainPrize {
	// #region `claimMainPrize`

	/// @dev We don't need `onlyActive` here, which we `assert` near Comment-202411169.
	/// todo-1 For all contracts and all methods, think what modifiers it might need,
	/// todo-1 who and under what conditions is permitted to call it.
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
				CosmicSignatureErrors.LastBidderOnly(
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

		// One might want to pass `lastBidderAddress` to `prizesWallet.registerRoundEnd` here.
		// As a result, even if the last bidder fails to claim the main prize, we would still record them as the winner,
		// which would allow them to claim donated NFTs and ERC-20 tokens.
		// But we feel that it's better to simply treat the guy who clicked "Claim" as the winner.
		// winners[roundNum] = msg.sender;
		prizesWallet.registerRoundEnd(roundNum, msg.sender);

		_distributePrizes();
		// ToDo-202409245-0 applies.
		token.mint(marketingWallet, marketingWalletCstContributionAmount);
		_prepareNextRound();

		// #endregion
	}

	// #endregion
	// #region `_distributePrizes`

	/// @notice Distributes ETH, CST, and CS NFT prizes to main and secondary prize winners.
	function _distributePrizes() internal {
		// #region

		// It's important to calculate all these before ETH transfers change our ETH balance.
		uint256 mainEthPrizeAmount_ = getMainEthPrizeAmount();
		uint256 chronoWarriorEthPrizeAmount_ = getChronoWarriorEthPrizeAmount();
		uint256 raffleTotalEthPrizeAmount_ = getRaffleTotalEthPrizeAmount();
		uint256 stakingTotalEthRewardAmount_ = getStakingTotalEthRewardAmount();
		uint256 charityEthDonationAmount_ = getCharityEthDonationAmount();

		// #endregion
		// #region

		// Distributing the last CST bidder, Endurance Champion, Chrono-Warrior prizes.
		CosmicSignatureHelpers.RandomNumberSeed memory randomNumberSeed_ = _distributeSpecialPrizes(chronoWarriorEthPrizeAmount_);

		// todo-1 Test that `randomNumberSeed_` changes after this call.
		_distributeRafflePrizes(raffleTotalEthPrizeAmount_, randomNumberSeed_);

		// #endregion
		// #region

		// Depositing CosmicSignature NFT staking rewards to `stakingWalletCosmicSignatureNft`.
		try stakingWalletCosmicSignatureNft.depositIfPossible{ value: stakingTotalEthRewardAmount_ }(roundNum) {
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
						"Transfer to StakingWalletCosmicSignatureNft failed.",
						address(stakingWalletCosmicSignatureNft),
						stakingTotalEthRewardAmount_
					);
			}
			charityEthDonationAmount_ += stakingTotalEthRewardAmount_;

			// One might want to reset `stakingTotalEthRewardAmount_` to zero here, but it's unnecessary.
		}

		// #endregion
		// #region

		// [Comment-202411077]
		// Transferring ETH to charity.
		// If this fails we won't revert the transaction. The funds would simply stay in the game.
		// Comment-202411078 relates.
		// [/Comment-202411077]
		{
			// I don't want to spend gas to `require` this.
			// But if I did, this would be a wrong place for that `require`.
			// The deployment script must recheck that `charityAddress` is a nonzero.
			// todo-1 Remember about the above. Cross-ref that rechecking with this comment.
			// #enable_asserts assert(charityAddress != address(0));

			(bool isSuccess_, ) = charityAddress.call{ value: charityEthDonationAmount_ }("");
			if (isSuccess_) {
				emit CosmicSignatureEvents.FundsTransferredToCharity(charityAddress, charityEthDonationAmount_);
			} else {
				emit CosmicSignatureEvents.FundTransferFailed("Transfer to charity failed.", charityAddress, charityEthDonationAmount_);
			}
		}

		// #endregion
		// #region

		// Awarding the main prize.
		// Doing it at the end. Otherwise a malitios winner could attempt to exploit the 63/64 rule
		// by crafting an amount of gas that would result is the last external call, possibly a fund transfer, failing,
		// which would result in incorrect behavior if we ignore that error.
		{
			uint256 randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
			uint256 nftId_ = nft.mint(roundNum, msg.sender, randomNumber_);
			emit MainPrizeClaimed(roundNum, msg.sender, mainEthPrizeAmount_, nftId_);
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
			(bool isSuccess_, ) = msg.sender.call{ value: mainEthPrizeAmount_ }("");
			require(isSuccess_, CosmicSignatureErrors.FundTransferFailed("Transfer to bidding round main prize beneficiary failed.", msg.sender, mainEthPrizeAmount_));
		}

		// #endregion
	}

	// #endregion
	// #region `_distributeSpecialPrizes`

	/// @notice Distributes so called "special" prizes to the last CST bidder, Endurance Champion, and Chrono-Warrior.
	/// This method pays ETH, mints CSTs and CS NFTs to the winners.
	function _distributeSpecialPrizes(uint256 chronoWarriorEthPrizeAmount_) internal returns(CosmicSignatureHelpers.RandomNumberSeed memory randomNumberSeed_) {
		// #region

		// todo-1 Optimize: use the initial value as is; then calculate and use its hash and assign the result to itself;
		// todo-1 only then start incrementing it and calculating its hash.
		// todo-1 Preserve the above comment to explain things.
		randomNumberSeed_ = CosmicSignatureHelpers.generateInitialRandomNumberSeed();

		uint256 cstRewardAmount_ = numRaffleParticipants[roundNum] * cstRewardAmountMultiplier;

		// #endregion
		// #region //

		// // Stellar Spender prize.
		// if (stellarSpender != address(0)) {
		//		// todo-9 Update and/or use `randomNumberSeed_` here.
		// 	uint256 nftId_ = nft.mint(roundNum, stellarSpender);
		// 	// try
		// 	// ToDo-202409245-0 applies.
		// 	// todo-1 But if we have to handle errors here, on error, we should emit an error event instead of the success event.
		// 	token.mint(stellarSpender, cstRewardAmount_);
		// 	// {
		// 	// } catch {
		// 	// }
		// 	emit StellarSpenderPrizePaid(stellarSpender, roundNum, nftId_, cstRewardAmount_, stellarSpenderTotalSpentCst /* , 1 */);
		// }

		// #endregion
		// #region

		// The last CST bidder CST and CS NFT prizes.
		if (lastCstBidderAddress != address(0)) {
		 	// ToDo-202409245-0 applies.
			token.mint(lastCstBidderAddress, cstRewardAmount_);
			uint256 randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
			uint256 nftId_ = nft.mint(roundNum, lastCstBidderAddress, randomNumber_);
			emit LastCstBidderPrizePaid(roundNum, lastCstBidderAddress, cstRewardAmount_, nftId_);
		}

		// #endregion
		// #region

		// Endurance Champion CST and CS NFT prizes.
		{
			// #enable_asserts assert(enduranceChampionAddress != address(0));
			// try
			// ToDo-202409245-0 applies.
			// todo-1 But if we have to handle errors here, on error, we should emit an error event instead of the success event.
			token.mint(enduranceChampionAddress, cstRewardAmount_);
			// {
			// } catch {
			// }
			uint256 randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
			// todo-1 Here and elsewhere, we should call each external contract and send funds to each external address only once.
			// todo-1 Remember that transfer to charity near Comment-202411077 is allowed to fail;
			// todo-1 other calls are not (to be discussed with Nick and Taras again).
			uint256 nftId_ = nft.mint(roundNum, enduranceChampionAddress, randomNumber_);
			emit EnduranceChampionPrizePaid(roundNum, enduranceChampionAddress, cstRewardAmount_, nftId_);
		}

		// #endregion
		// #region

		// Chrono-Warrior prize.
		// #enable_asserts assert(chronoWarriorAddress != address(0));
		emit ChronoWarriorPrizeAllocated(roundNum, chronoWarriorAddress, chronoWarriorEthPrizeAmount_);
		// todo-1 Here and elsewhere, if this address happends to be the same as the main prize winner, don't deposit here,
		// todo-1 but later send this to the main prize winner directly.
		prizesWallet.depositEth{value: chronoWarriorEthPrizeAmount_}(roundNum, chronoWarriorAddress);

		// #endregion
	}

	// #endregion
	// #region `_distributeRafflePrizes`

	/// @notice Distribute raffle ETH and CosmicSignature NFT prizes.
	/// @param raffleTotalEthPrizeAmount_ The total amount of ETH to distribute in the raffle.
	/// @param randomNumberSeed_ Random number seed reference.
	function _distributeRafflePrizes(
		uint256 raffleTotalEthPrizeAmount_,
		CosmicSignatureHelpers.RandomNumberSeed memory randomNumberSeed_
	) internal {
		// #region

		// Distributing ETH prizes to random bidders.
		{
			// #enable_asserts assert(numRaffleEthPrizesForBidders > 0);
			uint256 winnerIndex_ = numRaffleEthPrizesForBidders;
			uint256 raffleEthPrizeAmount_ = raffleTotalEthPrizeAmount_ / winnerIndex_;
			do {
				uint256 randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
				address raffleWinnerAddress_ = raffleParticipants[roundNum][/*uint256(raffleEntropy)*/ randomNumber_ % numRaffleParticipants[roundNum]];
				prizesWallet.depositEth{value: raffleEthPrizeAmount_}(roundNum, raffleWinnerAddress_);
				-- winnerIndex_;
				emit RaffleWinnerEthPrizeAllocated(roundNum, winnerIndex_, raffleWinnerAddress_, raffleEthPrizeAmount_);
			} while (winnerIndex_ > 0);
		}

		// #endregion
		// #region

		// Minting and distributing CosmicSignature NFTs to random bidders.
		// #enable_asserts assert(numRaffleCosmicSignatureNftsForBidders > 0);
		for (uint256 winnerIndex_ = numRaffleCosmicSignatureNftsForBidders; ; ) {
			uint256 randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
			address raffleWinnerAddress_ = raffleParticipants[roundNum][/*uint256(raffleEntropy)*/ randomNumber_ % numRaffleParticipants[roundNum]];
			randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
			uint256 nftId_ = nft.mint(roundNum, raffleWinnerAddress_, randomNumber_);
			-- winnerIndex_;
			emit RaffleWinnerCosmicSignatureNftAwarded(roundNum, false, winnerIndex_, raffleWinnerAddress_, nftId_);
			if (winnerIndex_ == 0) {
				break;
			}
		}

		// #endregion
		// #region

		// Minting and distributing CosmicSignature NFTs to random RandomWalk NFT stakers.
		// #enable_asserts assert(numRaffleCosmicSignatureNftsForRandomWalkNftStakers > 0);
		for (uint256 winnerIndex_ = numRaffleCosmicSignatureNftsForRandomWalkNftStakers; ; ) {
			uint256 randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
			address luckyStakerAddress_ = stakingWalletRandomWalkNft.pickRandomStakerAddressIfPossible(/*uint256(raffleEntropy)*/ randomNumber_);
			if (luckyStakerAddress_ == address(0)) {
				break;
			}
			randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
			uint256 nftId_ = nft.mint(roundNum, luckyStakerAddress_, randomNumber_);
			-- winnerIndex_;
			emit RaffleWinnerCosmicSignatureNftAwarded(roundNum, true, winnerIndex_, luckyStakerAddress_, nftId_);
			if (winnerIndex_ == 0) {
				break;
			}
		}

		// #endregion
	}

	// #endregion
	// #region // `_updateRaffleEntropy`

	// /// @notice Update the entropy used for random selection
	// /// @dev This function updates the entropy using the current block information
	// function _updateRaffleEntropy() internal {
	// 	// #enable_smtchecker /*
	// 	unchecked
	// 	// #enable_smtchecker */
	// 	{
	// 		// todo-1 A better conversion to `bytes`: https://stackoverflow.com/questions/49231267/how-to-convert-uint256-to-bytes-and-bytes-convert-to-uint256
	// 		// todo-1 But ChatGPT is saying that it's a bit less gas efficient than `abi.encodePacked`.
	// 		raffleEntropy = keccak256(abi.encode(raffleEntropy, block.timestamp, blockhash(block.number - 1)));
	// 	}
	// }

	// #endregion
	// #region `_prepareNextRound`

	/// @notice Updates state for the next bidding round.
	/// This method is called after the main prize has been claimed.
	function _prepareNextRound() internal {
		// todo-1 Consider to not reset some variables.

		mainPrizeTimeIncrementInMicroSeconds += mainPrizeTimeIncrementInMicroSeconds / mainPrizeTimeIncrementIncreaseDivisor;
		++ roundNum;
		cstDutchAuctionBeginningBidPrice = nextRoundCstDutchAuctionBeginningBidPrice;
		lastBidderAddress = address(0);
		lastCstBidderAddress = address(0);
		// lastBidType = CosmicSignatureConstants.BidType.ETH;

		// // Assuming this will neither overflow nor underflow.
		// // todo-0 Take a closer look at this and other similar formulas.
		// // todo-0 Should we use this formula before the 1st round too?
		// // todo-0 Should `setRoundStartCstAuctionLength` and `setMainPrizeTimeIncrementInMicroSeconds` use it too?
		// cstAuctionLength =
		// 	roundStartCstAuctionLength +
		// 	// todo-0 This formula is now incorrect.
		// 	((mainPrizeTimeIncrementInMicroSeconds - CosmicSignatureConstants.INITIAL_MAIN_PRIZE_TIME_INCREMENT) / CosmicSignatureConstants.NANOSECONDS_PER_SECOND);

		// todo-1 Maybe add 1 to ensure that the result is a nonzero.
		nextEthBidPrice = address(this).balance / roundInitialEthBidPriceDivisor;
		// stellarSpender = address(0);
		// stellarSpenderTotalSpentCst = 0;
		enduranceChampionAddress = address(0);
		enduranceChampionStartTimeStamp = 0;
		enduranceChampionDuration = 0;
		prevEnduranceChampionDuration = 0;
		chronoWarriorAddress = address(0);
		chronoWarriorDuration = uint256(int256(-1));

		// if (systemMode == CosmicSignatureConstants.MODE_PREPARE_MAINTENANCE) {
		// 	systemMode = CosmicSignatureConstants.MODE_MAINTENANCE;
		// 	emit SystemModeChanged(systemMode);
		// }

		_setActivationTime(block.timestamp + delayDurationBeforeNextRound);
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
	// #region `getDurationUntilMainPrize`

	function getDurationUntilMainPrize() public view override returns(int256) {
		// todo-1 Review all `unchecked`.
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 durationUntilMainPrize_ = int256(mainPrizeTime) - int256(block.timestamp);
			return durationUntilMainPrize_;
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
