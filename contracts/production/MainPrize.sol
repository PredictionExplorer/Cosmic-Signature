// #region

// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

// #endregion
// #region

// #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
// import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicGameEvents } from "./libraries/CosmicGameEvents.sol";
// import { PrizesWallet } from "./PrizesWallet.sol";
// import { CosmicToken } from "./CosmicToken.sol";
// import { CosmicSignature } from "./CosmicSignature.sol";
// import { StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
import { StakingWalletRandomWalkNft } from "./StakingWalletRandomWalkNft.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { IMainPrize } from "./interfaces/IMainPrize.sol";

// #endregion
// #region

// ToDo-202411179-1 relates and/or applies.
abstract contract MainPrize is ReentrancyGuardUpgradeable, CosmicSignatureGameStorage, SystemManagement, BidStatistics, IMainPrize {
	// #region `claimPrize`

	/// @dev We don't need `onlyActive` here, which we `assert` near Comment-202411169.
	function claimPrize() external override nonReentrant /*onlyActive*/ {
		// todo-1 Maybe remove this `unchecked` here. It complicates things, but doesn't add a lot of value.
		// todo-1 Review all `unchecked`.
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			require(lastBidderAddress != address(0), CosmicGameErrors.NoLastBidder("There is no last bidder."));

			// [Comment-202411169/]
			// #enable_asserts assert(block.timestamp >= activationTime);

			require(
				block.timestamp >= prizeTime,
				CosmicGameErrors.EarlyClaim("Not enough time has elapsed.", prizeTime, block.timestamp)
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
			// todo-0 Throw `CosmicGameErrors.EarlyClaim` if not.
			// todo-0 Eliminate `CosmicGameErrors.LastBidderOnly`.
			//
			// todo-0 But I can eliminate the prev `require` too and check it only if `msg.sender != lastBidderAddress`.
			// todo-0 Otherwie only assert it.
			if ( ! (/*winner*/ msg.sender == lastBidderAddress || block.timestamp - prizeTime >= timeoutDurationToClaimMainPrize) ) {
				revert
					CosmicGameErrors.LastBidderOnly(
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

			// todo-0 Assign `lastBidderAddress` here.
			// todo-0 Comment: Even if `lastBidderAddress` forgets to claim the prize, we will still record them as the winner.
			// todo-0 This will allow them to claim donated NFTs.
			// todo-0 But I have now moved NFT donations to `PrizesWallet`. ToDo-202411257-1 relates.
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
			// emit MainPrizeClaimed(roundNum, /*winner*/ msg.sender, mainPrizeAmount_);
			// ++ roundNum;
		}
	}

	// #endregion
	// #region `_distributePrizes`

	/// @notice Distribute prizes to various recipients
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
		// Paying Stellar Spender, Endurance Champion, Chrono-Warrior prizes.
		_distributeSpecialPrizes();

		// Paying raffle winner prizes.
		_distributeRafflePrizes(raffleAmount_);

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
				unexpectedErrorOccurred = errorSelector != CosmicGameErrors.NoStakedNfts.selector;
			} else {
				// [Comment-202410299/]
				// #enable_asserts // #disable_smtchecker console.log("Error 202410303.", errorDetails.length);

				unexpectedErrorOccurred = true;
			}
			if (unexpectedErrorOccurred) {
				revert
					CosmicGameErrors.FundTransferFailed(
						"Transfer to StakingWalletCosmicSignatureNft failed.",
						address(stakingWalletCosmicSignatureNft),
						stakingAmount_
					);
			}
			charityAmount_ += stakingAmount_;
			// stakingAmount_ = 0;
		}

		// [Comment-202411077]
		// Transferring ETH to charity.
		// If this fails we won't revert the transaction. The funds would simply stay in the game.
		// Comment-202411078 relates.
		// [/Comment-202411077]
		(bool isSuccess, ) = charity.call{ value: charityAmount_ }("");
		if (isSuccess) {
			emit CosmicGameEvents.FundsTransferredToCharity(charity, charityAmount_);
		} else {
			emit CosmicGameEvents.FundTransferFailed("Transfer to charity failed.", charity, charityAmount_);
		}

		emit MainPrizeClaimed(roundNum, /*winner*/ msg.sender, mainPrizeAmount_);

		// Paying main prize.
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
		(isSuccess, ) = /*winner*/ msg.sender.call{ value: mainPrizeAmount_ }("");
		require(isSuccess, CosmicGameErrors.FundTransferFailed("Transfer to bidding round main prize claimer failed.", /*winner*/ msg.sender, mainPrizeAmount_));
	}

	// #endregion
	// #region `_distributeSpecialPrizes`

	/// @notice Distributes so called "special" prizes to Stellar Spender, Endurance Champion, and Chrono-Warrior.
	/// @dev This function mints NFTs and distributes CST tokens and ETH to the winners.
	function _distributeSpecialPrizes() internal {
		// Stellar Spender prize.
		if (stellarSpender != address(0)) {
			// todo-1 Here and elsewhere, we should call each external contract and send funds to each external address only once.
			// todo-1 Remember that payment to charity is allowed to fail; other calls are not (to be discussed with Nick and Taras again).
			uint256 nftId = nft.mint(stellarSpender, roundNum);
			// todo-1 `erc20RewardMultiplier` shold already be multiplied by `1 ether`.
			uint256 cstReward_ = erc20RewardMultiplier * numRaffleParticipants[roundNum] * 1 ether;
			// try
			// ToDo-202409245-0 applies.
			// todo-0 But if we have to handle errors here, on error, we should emit an error event instead of the success event.
			token.mint(stellarSpender, cstReward_);
			// {
			// } catch {
			// }
			emit StellarSpenderPrizePaid(stellarSpender, roundNum, nftId, cstReward_, stellarSpenderTotalSpentCst /* , 1 */);
		}

		// Endurance Champion prize.
		// todo-1 Can this address really be zero? Maybe just assert this? Done. Make sure this is correct.
		// if (enduranceChampion != address(0))
		// #enable_asserts assert(enduranceChampion != address(0));
		{
			uint256 nftId = nft.mint(enduranceChampion, roundNum);
			uint256 cstReward_ = erc20RewardMultiplier * numRaffleParticipants[roundNum] * 1 ether;
			// try
			// ToDo-202409245-0 applies.
			// todo-0 But if we have to handle errors here, on error, we should emit an error event instead of the success event.
			token.mint(enduranceChampion, cstReward_);
			// {
			// } catch {
			// }
			emit EnduranceChampionPrizePaid(enduranceChampion, roundNum, nftId, cstReward_ /* , 0 */);
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
	function _distributeRafflePrizes(uint256 raffleAmount_) internal {
		// Distribute ETH prizes
		uint256 perWinnerAmount = raffleAmount_ / numRaffleETHWinnersBidding;
		for (uint256 i = 0; i < numRaffleETHWinnersBidding; i++) {
			_updateRaffleEntropy();
			address raffleWinnerAddress_ = raffleParticipants[roundNum][uint256(raffleEntropy) % numRaffleParticipants[roundNum]];
			prizesWallet.depositEth{value: perWinnerAmount}(roundNum, raffleWinnerAddress_);
			emit RaffleETHWinnerEvent(raffleWinnerAddress_, roundNum, i, perWinnerAmount);
		}

		// Distribute NFT prizes to bidders
		for (uint256 i = 0; i < numRaffleNFTWinnersBidding; i++) {
			_updateRaffleEntropy();
			address raffleWinnerAddress_ = raffleParticipants[roundNum][uint256(raffleEntropy) % numRaffleParticipants[roundNum]];
			uint256 nftId = nft.mint(raffleWinnerAddress_, roundNum);
			emit RaffleNFTWinnerEvent(raffleWinnerAddress_, roundNum, nftId, i, false, false);
		}

		// Distribute CosmicSignature NFTs to random RandomWalk NFT stakers
		// uint256 numStakedTokensRWalk = StakingWalletRandomWalkNft(stakingWalletRandomWalkNft).numStakedNfts();
		// if (numStakedTokensRWalk > 0)
		{
			for (uint256 i = 0; i < numRaffleNFTWinnersStakingRWalk; i++) {
				_updateRaffleEntropy();
				address luckyStakerAddress_ = StakingWalletRandomWalkNft(stakingWalletRandomWalkNft).pickRandomStakerAddressIfPossible(raffleEntropy);

				if (luckyStakerAddress_ == address(0)) {
					break;
				}

				uint256 nftId = nft.mint(luckyStakerAddress_, roundNum);
				emit RaffleNFTWinnerEvent(luckyStakerAddress_, roundNum, nftId, i, true, true);
			}
		}
	}

	// #endregion
	// #region `_updateRaffleEntropy`

	/// @notice Update the entropy used for random selection
	/// @dev This function updates the entropy using the current block information
	/// todo-1 Ideally, this should return the updated value so that the caller didn't have to spend gas to read it from the storage.
	/// todo-1 Or better add a function to a library: `generateRandomNumber(uint256 seed_) returns(uint256 randomNumber_)`.
	/// todo-1 Call it in loops. Load and save `raffleEntropy` only once.
	function _updateRaffleEntropy() internal {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// todo-1 Everywhere, better do this:
			// todo-1 raffleEntropy = keccak256(abi.encodePacked(/* block.prevrandao ^ */ block.timestamp ^ raffleEntropy));
			// todo-1 `block.prevrandao` belongs to the previous block, meaning it's already known.
			// todo-1 So if we use it alone, a user can initiate a transaction to be executed within the current block,
			// todo-1 while knowing what random number is going to be generated.
			// todo-1 The same applies to `blockhash(block.number - 1)`.
			// todo-1 On the other hand, `block.timestamp` belongs to the currently being built block,
			// todo-1 which makes it less predictable by the user, even though it's predictable to some degree,
			// todo-1 but the block proposer can manipulate it within a range.
			// todo-1 So let's use `block.timestamp` alone. Mixing it with `block.prevrandao` would make the result
			// todo-1 neither less predictable nor less resistant to manipulation.
			// todo-1 A better conversion to `bytes`: https://stackoverflow.com/questions/49231267/how-to-convert-uint256-to-bytes-and-bytes-convert-to-uint256
			// todo-1 But ChatGPT is saying that it a bit less gas efficient.
			raffleEntropy = keccak256(abi.encode(raffleEntropy, block.timestamp, blockhash(block.number - 1)));
		}
	}

	// #endregion
	// #region `_roundEndResets`

	/// @notice Reset various parameters at the end of a bidding round
	/// @dev This function is called after a prize is claimed to prepare for the next round
	function _roundEndResets() internal {
		++ roundNum;
		lastBidderAddress = address(0);
		lastBidType = CosmicGameConstants.BidType.ETH;

		// // todo-0 Incorrect! Remove!
		// cstAuctionLength =
		// 	roundStartCstAuctionLength *
		// 	(nanoSecondsExtra + CosmicGameConstants.DEFAULT_AUCTION_HOUR) /
		// 	CosmicGameConstants.DEFAULT_AUCTION_HOUR;

		// // todo-0 Incorrect! Remove!
		// cstAuctionLength =
		// 	roundStartCstAuctionLength *
		// 	(nanoSecondsExtra + CosmicGameConstants.DEFAULT_AUCTION_LENGTH) /
		// 	CosmicGameConstants.DEFAULT_AUCTION_LENGTH;

		// // todo-0 Incorrect! Remove!
		// cstAuctionLength = roundStartCstAuctionLength + nanoSecondsExtra;

		// // todo-0 Incorrect! Remove!
		// cstAuctionLength = roundStartCstAuctionLength * nanoSecondsExtra / CosmicGameConstants.INITIAL_NANOSECONDS_EXTRA;

		// todo-0 Nick has confirmed that this is correct.
		// Assuming this will neither overflow nor underflow.
		// todo-0 Should we use this formula before the 1st round too?
		// todo-0 Should `setRoundStartCstAuctionLength` and `setNanoSecondsExtra` use it too?
		cstAuctionLength = roundStartCstAuctionLength + (nanoSecondsExtra - CosmicGameConstants.INITIAL_NANOSECONDS_EXTRA) / CosmicGameConstants.NANOSECONDS_PER_SECOND;

		// todo-1 Add 1 to ensure that the result is a nonzero?
		bidPrice = address(this).balance / initialBidAmountFraction;
		stellarSpender = address(0);
		stellarSpenderTotalSpentCst = 0;
		enduranceChampion = address(0);
		enduranceChampionStartTimeStamp = 0;
		enduranceChampionDuration = 0;
		prevEnduranceChampionDuration = 0;
		chronoWarrior = address(0);
		chronoWarriorDuration = uint256(int256(-1));

		// if (systemMode == CosmicGameConstants.MODE_PREPARE_MAINTENANCE) {
		// 	systemMode = CosmicGameConstants.MODE_MAINTENANCE;
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
