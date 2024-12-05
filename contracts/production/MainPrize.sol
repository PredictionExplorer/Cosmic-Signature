// #region

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// #endregion
// #region

// #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
// import { Context } from "@openzeppelin/contracts/utils/Context.sol";
// import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureEvents } from "./libraries/CosmicSignatureEvents.sol";
import { CosmicSignatureHelpers } from "./libraries/CosmicSignatureHelpers.sol";
// import { PrizesWallet } from "./PrizesWallet.sol";
// import { CosmicSignatureToken } from "./CosmicSignatureToken.sol";
// import { CosmicSignatureNft } from "./CosmicSignatureNft.sol";
// import { StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
// import { StakingWalletRandomWalkNft } from "./StakingWalletRandomWalkNft.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { IMainPrize } from "./interfaces/IMainPrize.sol";

// #endregion
// #region

// ToDo-202411179-1 relates and/or applies.
abstract contract MainPrize is
	ReentrancyGuardUpgradeable,
	CosmicSignatureGameStorage,
	SystemManagement,
	BidStatistics,
	IMainPrize {
	// #region `claimPrize`

	/// @dev We don't need `onlyActive` here, which we `assert` near Comment-202411169.
	function claimPrize() external override nonReentrant /*onlyActive*/ {
		// todo-1 Maybe remove this `unchecked` here. It complicates things, but doesn't add a lot of value.
		// todo-1 Review all `unchecked`.
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			require(lastBidderAddress != address(0), CosmicSignatureErrors.NoLastBidder("There is no last bidder."));

			// [Comment-202411169/]
			// #enable_asserts assert(block.timestamp >= activationTime);

			require(
				block.timestamp >= prizeTime,
				CosmicSignatureErrors.EarlyClaim("Not enough time has elapsed.", prizeTime, block.timestamp)
			);

			// // toto-1 We don't need this. `msg.sender` is the winner.
			// // toto-1 Remove this garbage soon.
			// address winner = msg.sender;

			// Only the last bidder may claim the prize.
			// But after the timeout expires, anyone is welcomed to.
			// todo-1 Here and elsewhere, use respective functions from `Context`.
			// todo-1 Make sure this can't overflow.
			//
			// todo-0 Eliminate the above `require`.
			// todo-0 Rewrite this:
			// todo-0 (msg.sender == lastBidderAddress) ? (block.timestamp >= prizeTime) : (block.timestamp >= prizeTime + timeoutDurationToClaimMainPrize)
			// todo-0 Throw `CosmicSignatureErrors.EarlyClaim` if not.
			// todo-0 Eliminate `CosmicSignatureErrors.LastBidderOnly`.
			//
			// todo-0 But I can eliminate the prev `require` too and check it only if `msg.sender != lastBidderAddress`.
			// todo-0 Otherwie only assert it.
			if ( ! (/*winner*/ msg.sender == lastBidderAddress || block.timestamp - prizeTime >= timeoutDurationToClaimMainPrize) ) {
				revert
					CosmicSignatureErrors.LastBidderOnly(
						// todo-1 Rephrase: the bidding round main prize
						"Only the last bidder may claim the prize until a timeout expires.",
						lastBidderAddress,
						/*winner*/ msg.sender,
						// todo-1 Make sure this can't overflow.
						timeoutDurationToClaimMainPrize - (block.timestamp - prizeTime)
					);
			}

			_updateChampionsIfNeeded();
			_updateChronoWarriorIfNeeded(block.timestamp);

			// // Prevent reentrancy
			// // todo-1 Reentrancy is no longer possible. Moved to `_roundEndResets`.
			// // todo-1 Remove this garbage soon.
			// lastBidderAddress = address(0);

			// One might want to pass `lastBidderAddress` to `prizesWallet.registerRoundEnd` here.
			// As a result, even if the last bidder fails to claim the main prize, we would still record them as the winner,
			// which would allow them to claim donated NFTs and ERC-20 tokens.
			// But we feel that the definition of the main prize winner should be the guy who clicks "claim".
			// todo-0 I still want to remove `winners`.
			// todo-0 Being discussed at https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1729697863762659
			winners[roundNum] = /*winner*/ msg.sender /*lastBidderAddress*/;
			// todo-1 Think if this is the best place to call this method. Maybe call it after disrtibuting prizes. Or maybe leave it alone.
			prizesWallet.registerRoundEnd(roundNum, /*winner*/ msg.sender /*lastBidderAddress*/);

			// todo-1 Calculate these at the point where we need these, not here.
			uint256 mainPrizeAmount_ = mainPrizeAmount();
			uint256 charityAmount_ = charityAmount();
			uint256 raffleAmount_ = raffleAmount();
			uint256 stakingAmount_ = stakingAmount();

			// Distribute prizes
			_distributePrizes(/*winner,*/ mainPrizeAmount_, charityAmount_, raffleAmount_, stakingAmount_);

			_roundEndResets();
			// emit MainPrizeClaimed(roundNum, /*winner*/ msg.sender, mainPrizeAmount_, ???);
			// ++ roundNum;
		}
	}

	// #endregion
	// #region `_distributePrizes`

	/// @notice Distribute prizes to various winners.
	/// @dev This function handles the distribution of ETH and NFT prizes
	/// // param winner Bidding round main prize winner address.
	/// @param mainPrizeAmount_ ETH main prize amount.
	/// @param charityAmount_ Amount of ETH for charity
	/// @param raffleAmount_ Amount of ETH for raffle winners
	/// @param stakingAmount_ Amount of ETH for staking rewards
	function _distributePrizes(
		// address winner,
		uint256 mainPrizeAmount_,
		uint256 charityAmount_,
		uint256 raffleAmount_,
		uint256 stakingAmount_
	) internal {
		// Paying the last CST bidder, Endurance Champion, Chrono-Warrior prizes.
		CosmicSignatureHelpers.RandomNumberSeed memory randomNumberSeed_ = _distributeSpecialPrizes();

		// Paying raffle winner prizes.
		// todo-1 Test that `randomNumberSeed_` changes after this call.
		_distributeRafflePrizes(raffleAmount_, randomNumberSeed_);

		// Paying staking rewards.
		try stakingWalletCosmicSignatureNft.depositIfPossible{ value: stakingAmount_ }(roundNum) {
		} catch (bytes memory errorDetails) {
			// [ToDo-202409226-0]
			// Nick, you might want to develop tests for all possible cases that set `unexpectedErrorOccurred` to `true` or `false`.
			// Then remove this ToDo and all mentionings of it elsewhere in the codebase.
			// [/ToDo-202409226-0]
			bool unexpectedErrorOccurred;
			
			// [Comment-202410149/]
			if (errorDetails.length == 100) {

				bytes4 errorSelector;
				assembly { errorSelector := mload(add(errorDetails, 0x20)) }
				unexpectedErrorOccurred = errorSelector != CosmicSignatureErrors.NoStakedNfts.selector;
			} else {
				// [Comment-202410299/]
				// #enable_asserts // #disable_smtchecker console.log("Error 202410303.", errorDetails.length);

				unexpectedErrorOccurred = true;
			}
			if (unexpectedErrorOccurred) {
				revert
					CosmicSignatureErrors.FundTransferFailed(
						"Transfer to StakingWalletCosmicSignatureNft failed.",
						address(stakingWalletCosmicSignatureNft),
						stakingAmount_
					);
			}
			charityAmount_ += stakingAmount_;

			// One might want to reset `stakingAmount_` to zero here, but it's unnecessary.
		}

		// [Comment-202411077]
		// Transferring ETH to charity.
		// If this fails we won't revert the transaction. The funds would simply stay in the game.
		// Comment-202411078 relates.
		// [/Comment-202411077]
		(bool isSuccess_, ) = charityAddress.call{ value: charityAmount_ }("");
		if (isSuccess_) {
			emit CosmicSignatureEvents.FundsTransferredToCharity(charityAddress, charityAmount_);
		} else {
			emit CosmicSignatureEvents.FundTransferFailed("Transfer to charity failed.", charityAddress, charityAmount_);
		}

		uint256 randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
		uint256 nftId_ = nft.mint(roundNum, /*winner*/ msg.sender, randomNumber_);
		emit MainPrizeClaimed(roundNum, /*winner*/ msg.sender, mainPrizeAmount_, nftId_);

		// Paying the main prize.
		// Doing it at the end. Otherwise a malitios winner could attempt to exploit the 63/64 rule
		// by crafting an amount of gas that would result is the last external call, possibly a fund transfer, failing,
		// which would inflict damage if we ignore that error.
		// todo-1 Can/should we specify how much gas an untrusted external call is allowed to use?
		// todo-1 `transfer` allows only 3500 gas, right?
		// todo-1 At the same time, can/should we forward all gas to trusted external calls?
		// todo-1 And don't limit gas when sending ETH or whatever tokens to `msg.sender`.
		// todo-1 But a malitios winner also can exploit stack overflow. Can we find out what error happened?
		// todo-1 Does an extarnal call use the same stack as the calling contract does?
		// todo-1 Really, the only potentially vulnerable external call is the one near Comment-202411077.
		// todo-1 See also: Comment-202411077, Comment-202411078.
		// todo-1 Make sure all external calls whose fails we don't ignore cannot fail.
		// todo-1 If this fails, maybe send the funds to `prizesWallet`.
		// todo-1 We really can send funds there unconditionally. It will likely be not the only prize for this address anyway.
		(isSuccess_, ) = /*winner*/ msg.sender.call{ value: mainPrizeAmount_ }("");
		// todo-1 Rephrase "claimer" to "beneficiary"?
		require(isSuccess_, CosmicSignatureErrors.FundTransferFailed("Transfer to bidding round main prize claimer failed.", /*winner*/ msg.sender, mainPrizeAmount_));
	}

	// #endregion
	// #region `_distributeSpecialPrizes`

	/// @notice Distributes so called "special" prizes to the last CST bidder, Endurance Champion, and Chrono-Warrior.
	/// This method pays ETH, mints CSTs and CS NFTs to the winners.
	function _distributeSpecialPrizes() internal returns(CosmicSignatureHelpers.RandomNumberSeed memory randomNumberSeed_) {
		// todo-1 Optimize: use the initial value as is; then calculate and use its hash and assign the result to itself;
		// todo-1 only then start incrementing it and calculating its hash.
		// todo-1 Preserve the above comment to explain things.
		randomNumberSeed_ = CosmicSignatureHelpers.generateInitialRandomNumberSeed();

		uint256 cstRewardAmount_ = numRaffleParticipants[roundNum] * cstRewardAmountMultiplier;

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

		// The last CST bidder prize.
		if (lastCstBidderAddress != address(0)) {
			uint256 randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
			uint256 nftId_ = nft.mint(roundNum, lastCstBidderAddress, randomNumber_);
		 	// ToDo-202409245-0 applies.
			token.mint(lastCstBidderAddress, cstRewardAmount_);
			emit LastCstBidderPrizePaid(roundNum, lastCstBidderAddress, nftId_, cstRewardAmount_);
		}

		// Endurance Champion prize.
		// todo-1 Can this address really be zero? Maybe just assert this? Done. Make sure this is correct.
		// if (enduranceChampion != address(0))
		// #enable_asserts assert(enduranceChampion != address(0));
		{
			uint256 randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
			// todo-1 Here and elsewhere, we should call each external contract and send funds to each external address only once.
			// todo-1 Remember that transfer to charity is allowed to fail; other calls are not (to be discussed with Nick and Taras again).
			uint256 nftId_ = nft.mint(roundNum, enduranceChampion, randomNumber_);
			// try
			// ToDo-202409245-0 applies.
			// todo-1 But if we have to handle errors here, on error, we should emit an error event instead of the success event.
			token.mint(enduranceChampion, cstRewardAmount_);
			// {
			// } catch {
			// }
			emit EnduranceChampionPrizePaid(enduranceChampion, roundNum, nftId_, cstRewardAmount_ /* , 0 */);
		}

		// Chrono-Warrior prize.
		// #enable_asserts assert(chronoWarrior != address(0));
		uint256 chronoWarriorEthPrizeAmount_ = chronoWarriorEthPrizeAmount();
		emit ChronoWarriorPrizePaid(chronoWarrior, roundNum, chronoWarriorEthPrizeAmount_);
		// todo-1 Here and elsewhere, if this address happends to be the same as the main prize winner, don't deposit here,
		// todo-1 but later send this to the main prize winner directly.
		prizesWallet.depositEth{value: chronoWarriorEthPrizeAmount_}(roundNum, chronoWarrior);
	}

	// #endregion
	// #region `_distributeRafflePrizes`

	/// @notice Distribute raffle prizes including ETH and NFTs
	/// @dev This function selects random winners for both ETH and NFT prizes
	/// @param raffleAmount_ Total amount of ETH to distribute in the raffle
	function _distributeRafflePrizes(uint256 raffleAmount_, CosmicSignatureHelpers.RandomNumberSeed memory randomNumberSeed_) internal {
		// Distribute ETH prizes
		// todo-1 How about increasing the number of raffle and/or other kinds of winnes if there are more bidders? Like 5% of bidders.
		uint256 perWinnerAmount = raffleAmount_ / numRaffleETHWinnersBidding;
		for (uint256 i = 0; i < numRaffleETHWinnersBidding; i++) {
			// _updateRaffleEntropy();
			uint256 randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
			address raffleWinnerAddress_ = raffleParticipants[roundNum][/*uint256(raffleEntropy)*/ randomNumber_ % numRaffleParticipants[roundNum]];
			prizesWallet.depositEth{value: perWinnerAmount}(roundNum, raffleWinnerAddress_);
			emit RaffleETHWinnerEvent(raffleWinnerAddress_, roundNum, i, perWinnerAmount);
		}

		// Distribute NFT prizes to bidders
		for (uint256 i = 0; i < numRaffleNftWinnersBidding; i++) {
			// _updateRaffleEntropy();
			uint256 randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
			address raffleWinnerAddress_ = raffleParticipants[roundNum][/*uint256(raffleEntropy)*/ randomNumber_ % numRaffleParticipants[roundNum]];
			randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
			uint256 nftId_ = nft.mint(roundNum, raffleWinnerAddress_, randomNumber_);
			emit RaffleNftWinnerEvent(raffleWinnerAddress_, roundNum, nftId_, i, false, false);
		}

		// Distribute CosmicSignature NFTs to random RandomWalk NFT stakers
		// uint256 numStakedTokensRWalk = stakingWalletRandomWalkNft.numStakedNfts();
		// if (numStakedTokensRWalk > 0)
		{
			for (uint256 i = 0; i < numRaffleNftWinnersStakingRWalk; i++) {
				// _updateRaffleEntropy();
				uint256 randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
				address luckyStakerAddress_ = stakingWalletRandomWalkNft.pickRandomStakerAddressIfPossible(/*uint256(raffleEntropy)*/ randomNumber_);

				if (luckyStakerAddress_ == address(0)) {
					break;
				}

				randomNumber_ = CosmicSignatureHelpers.generateRandomNumber(randomNumberSeed_);
				uint256 nftId_ = nft.mint(roundNum, luckyStakerAddress_, randomNumber_);
				emit RaffleNftWinnerEvent(luckyStakerAddress_, roundNum, nftId_, i, true, true);
			}
		}
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
	// 		// todo-1 But ChatGPT is saying that it a bit less gas efficient than `abi.encodePacked`.
	// 		raffleEntropy = keccak256(abi.encode(raffleEntropy, block.timestamp, blockhash(block.number - 1)));
	// 	}
	// }

	// #endregion
	// #region `_roundEndResets`

	/// @notice Reset various parameters at the end of a bidding round
	/// @dev This function is called after a prize is claimed to prepare for the next round
	/// todo-1 Rename this to `_prepareNextRound`.
	function _roundEndResets() internal {
		++ roundNum;
		lastBidderAddress = address(0);
		lastCstBidderAddress = address(0);
		// lastBidType = CosmicSignatureConstants.BidType.ETH;

		// // todo-0 Incorrect! Remove!
		// cstAuctionLength =
		// 	roundStartCstAuctionLength *
		// 	(nanoSecondsExtra + CosmicSignatureConstants.DEFAULT_AUCTION_HOUR) /
		// 	CosmicSignatureConstants.DEFAULT_AUCTION_HOUR;

		// // todo-0 Incorrect! Remove!
		// cstAuctionLength =
		// 	roundStartCstAuctionLength *
		// 	(nanoSecondsExtra + CosmicSignatureConstants.DEFAULT_AUCTION_LENGTH) /
		// 	CosmicSignatureConstants.DEFAULT_AUCTION_LENGTH;

		// // todo-0 Incorrect! Remove!
		// cstAuctionLength = roundStartCstAuctionLength + nanoSecondsExtra;

		// // todo-0 Incorrect! Remove!
		// cstAuctionLength = roundStartCstAuctionLength * nanoSecondsExtra / CosmicSignatureConstants.INITIAL_NANOSECONDS_EXTRA;

		// todo-0 Nick has confirmed that this is correct.
		// Assuming this will neither overflow nor underflow.
		// todo-0 Should we use this formula before the 1st round too?
		// todo-0 Should `setRoundStartCstAuctionLength` and `setNanoSecondsExtra` use it too?
		cstAuctionLength = roundStartCstAuctionLength + (nanoSecondsExtra - CosmicSignatureConstants.INITIAL_NANOSECONDS_EXTRA) / CosmicSignatureConstants.NANOSECONDS_PER_SECOND;

		// todo-1 Add 1 to ensure that the result is a nonzero?
		bidPrice = address(this).balance / initialBidAmountFraction;
		// stellarSpender = address(0);
		// stellarSpenderTotalSpentCst = 0;
		enduranceChampion = address(0);
		enduranceChampionStartTimeStamp = 0;
		enduranceChampionDuration = 0;
		prevEnduranceChampionDuration = 0;
		chronoWarrior = address(0);
		chronoWarriorDuration = uint256(int256(-1));

		// if (systemMode == CosmicSignatureConstants.MODE_PREPARE_MAINTENANCE) {
		// 	systemMode = CosmicSignatureConstants.MODE_MAINTENANCE;
		// 	emit SystemModeChanged(systemMode);
		// }

		_setActivationTime(block.timestamp + delayDurationBeforeNextRound);
	}

	// #endregion
	// #region `mainPrizeAmount`

	function mainPrizeAmount() public view override returns(uint256) {
		return address(this).balance * mainPrizePercentage / 100;
	}

	// #endregion
	// #region `chronoWarriorEthPrizeAmount`

	function chronoWarriorEthPrizeAmount() public view override returns(uint256) {
		return address(this).balance * chronoWarriorEthPrizePercentage / 100;
	}

	// #endregion
	// #region `raffleAmount`

	function raffleAmount() public view override returns(uint256) {
		return address(this).balance * rafflePercentage / 100;
	}

	// #endregion
	// #region `stakingAmount`

	function stakingAmount() public view override returns(uint256) {
		return address(this).balance * stakingPercentage / 100;
	}

	// #endregion
	// #region `charityAmount`

	function charityAmount() public view override returns(uint256) {
		return address(this).balance * charityPercentage / 100;
	}

	// #endregion
	// #region `timeUntilPrize`

	// todo-0 Slither dislikes some time comparisons.
	// todo-0 Would it make sense to subtract the times as signed `int256` in most cases?
	// todo-0 It could also make sense to do it from within an `unchecked` block.
	// todo-0 All our times are supposed to be reasonable values that are close to `block.timestamp`.
	// todo-0 `activationTime`, even though it's set externally, will also be reasonable, right?
	// todo-0 But if it's not guaranteed the contract can require that it was within 1 year around `block.timestamp`.
	function timeUntilPrize() external view override returns(uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// // #enable_asserts // #disable_smtchecker console.log(block.timestamp, prizeTime, prizeTime - block.timestamp);
			// return (block.timestamp >= prizeTime) ? 0 : (prizeTime - block.timestamp);
			uint256 durationUntilMainPrize_ = uint256(int256(prizeTime) - int256(block.timestamp));
			if(int256(durationUntilMainPrize_) < int256(0)) {
				durationUntilMainPrize_ = 0;
			}
			return durationUntilMainPrize_;
		}
	}

	// #endregion
	// #region `tryGetRoundMainPrizeWinnerAddress`

	function tryGetRoundMainPrizeWinnerAddress(uint256 roundNum_) public view override returns(address) {
		return winners[roundNum_];
	}

	// #endregion
}

// #endregion
