// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicGameEvents } from "./libraries/CosmicGameEvents.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
import { StakingWalletRandomWalkNft } from "./StakingWalletRandomWalkNft.sol";
import { EthPrizesWallet } from "./EthPrizesWallet.sol";
import { CosmicGameStorage } from "./CosmicGameStorage.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { IMainPrize } from "./interfaces/IMainPrize.sol";

abstract contract MainPrize is ReentrancyGuardUpgradeable, CosmicGameStorage, SystemManagement, BidStatistics, IMainPrize {
	function claimPrize() external override nonReentrant onlyRuntime {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			require(
				block.timestamp >= prizeTime,
				CosmicGameErrors.EarlyClaim("Not enough time has elapsed.", prizeTime, block.timestamp)
			);
			require(lastBidder != address(0), CosmicGameErrors.NoLastBidder("There is no last bidder."));

			// // toto-1 We don't need this. `msg.sender` is the winner.
			// // toto-1 Remove this garbage soon.
			// address winner = msg.sender;

			// Only the last bidder may claim the prize.
			// But after the timeout expires, anyone is welcomed to.
			// todo-1 Here and elsewhere, use respective functions from `Context`.
			// todo-1 Make sure this can't overflow.
			if ( ! (/*winner*/ msg.sender == lastBidder || block.timestamp - prizeTime >= timeoutClaimPrize) ) {
				revert
					CosmicGameErrors.LastBidderOnly(
						"Only the last bidder may claim the prize until a timeout expires.",
						lastBidder,
						/*winner*/ msg.sender,
						// todo-1 Make sure this can't overflow.
						timeoutClaimPrize - (block.timestamp - prizeTime)
					);
			}

			_updateEnduranceChampion();

			// // Prevent reentrancy
			// // todo-1 Reentrancy is no longer possible. Moved to `_roundEndResets`.
			// // todo-1 Remove this garbage soon.
			// lastBidder = address(0);

			// todo-0 Assign `lastBidder` here.
			// todo-0 Comment: Even if `lastBidder` forgets to claim the prize, we will still record them as the winner.
			// todo-0 Being discussed at https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1729697863762659
			winners[roundNum] = /*winner*/ msg.sender /*lastBidder*/;

			uint256 prizeAmount_ = prizeAmount();
			uint256 charityAmount_ = charityAmount();
			uint256 raffleAmount_ = raffleAmount();
			uint256 stakingAmount_ = stakingAmount();

			// Distribute prizes
			_distributePrizes(/*winner,*/ prizeAmount_, charityAmount_, raffleAmount_, stakingAmount_);

			_roundEndResets();
			// emit MainPrizeClaimed(roundNum, /*winner*/ msg.sender, prizeAmount_);
			// ++ roundNum;
		}
	}

	/// @notice Distribute prizes to various recipients
	/// @dev This function handles the distribution of ETH and NFT prizes
	/// // param winner Address of the round winner
	/// @param prizeAmount_ Amount of ETH for the main prize
	/// @param charityAmount_ Amount of ETH for charity
	/// @param raffleAmount_ Amount of ETH for raffle winners
	/// @param stakingAmount_ Amount of ETH for staking rewards
	function _distributePrizes(
		// address winner,
		uint256 prizeAmount_,
		uint256 charityAmount_,
		uint256 raffleAmount_,
		uint256 stakingAmount_
	) internal {
		// Endurance Champion and Stellar Spender prizes
		// todo-0 Chrono-warrior too?
		_distributeSpecialPrizes();

		// Raffle
		_distributeRafflePrizes(raffleAmount_);

		// Staking
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
		// Sending ETH to charity.
		// If this fails we won't revert the transaction. The funds would simply stay in the game.
		// Comment-202411078 relates.
		// [/Comment-202411077]
		(bool isSuccess, ) = charity.call{ value: charityAmount_ }("");
		if (isSuccess) {
			emit CosmicGameEvents.FundsTransferredToCharity(charity, charityAmount_);
		} else {
			emit CosmicGameEvents.FundTransferFailed("Transfer to charity failed.", charity, charityAmount_);
		}

		emit MainPrizeClaimed(roundNum, /*winner*/ msg.sender, prizeAmount_);

		// Sending main prize at the end. Otherwise a malitios winner could attempt to exploit the 63/64 rule
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
		(isSuccess, ) = /*winner*/ msg.sender.call{ value: prizeAmount_ }("");
		require(isSuccess, CosmicGameErrors.FundTransferFailed("Transfer to bidding round main prize claimer failed.", /*winner*/ msg.sender, prizeAmount_));
	}

	/// @notice Distribute special prizes to Endurance Champion and Stellar Spender
	/// todo-0 Chrono-warrior too?
	/// @dev This function mints NFTs and distributes CST tokens to special winners
	function _distributeSpecialPrizes() internal {
		// Endurance Champion Prize
		// todo-0 Can this address really be zero? Maybe just assert this?
		if (enduranceChampion != address(0)) {
			uint256 nftId = nft.mint(enduranceChampion, roundNum);
			uint256 erc20TokenReward = erc20RewardMultiplier * numRaffleParticipants[roundNum] * 1 ether;
			// try
			// ToDo-202409245-0 applies.
			// todo-0 But if we have to handle errors here, on error, we should emit an error event instead of the success event.
			token.mint(enduranceChampion, erc20TokenReward);
			// {
			// } catch {
			// }
			emit EnduranceChampionWinnerEvent(enduranceChampion, roundNum, nftId, erc20TokenReward, 0);
		}

		// Stellar Spender Prize
		// todo-0 Can this address really be zero? Maybe just assert this?
		if (stellarSpender != address(0)) {
			uint256 nftId = nft.mint(stellarSpender, roundNum);
			uint256 erc20TokenReward = erc20RewardMultiplier * numRaffleParticipants[roundNum] * 1 ether;
			// try
			// ToDo-202409245-0 applies.
			// todo-0 But if we have to handle errors here, on error, we should emit an error event instead of the success event.
			token.mint(stellarSpender, erc20TokenReward);
			// {
			// } catch {
			// }
			emit StellarSpenderWinnerEvent(
				stellarSpender,
				roundNum,
				nftId,
				erc20TokenReward,
				stellarSpenderAmount,
				1
			);
		}
	}

	/// @notice Distribute raffle prizes including ETH and NFTs
	/// @dev This function selects random winners for both ETH and NFT prizes
	/// @param raffleAmount_ Total amount of ETH to distribute in the raffle
	function _distributeRafflePrizes(uint256 raffleAmount_) internal {
		// Distribute ETH prizes
		uint256 perWinnerAmount = raffleAmount_ / numRaffleETHWinnersBidding;
		for (uint256 i = 0; i < numRaffleETHWinnersBidding; i++) {
			_updateEntropy();
			address raffleWinner = raffleParticipants[roundNum][uint256(raffleEntropy) % numRaffleParticipants[roundNum]];
			ethPrizesWallet.deposit{value: perWinnerAmount}(raffleWinner);
			// todo-0 I will need a similar event for Chrono-Warrior.
			emit RaffleETHWinnerEvent(raffleWinner, roundNum, i, perWinnerAmount);
		}

		// Distribute NFT prizes to bidders
		for (uint256 i = 0; i < numRaffleNFTWinnersBidding; i++) {
			_updateEntropy();
			address raffleWinner = raffleParticipants[roundNum][uint256(raffleEntropy) % numRaffleParticipants[roundNum]];
			uint256 nftId = nft.mint(raffleWinner, roundNum);
			emit RaffleNFTWinnerEvent(raffleWinner, roundNum, nftId, i, false, false);
		}

		// Distribute CosmicSignature NFTs to random RandomWalk NFT stakers
		// uint256 numStakedTokensRWalk = StakingWalletRandomWalkNft(stakingWalletRandomWalkNft).numStakedNfts();
		// if (numStakedTokensRWalk > 0)
		{
			for (uint256 i = 0; i < numRaffleNFTWinnersStakingRWalk; i++) {
				_updateEntropy();
				address rwalkWinner = StakingWalletRandomWalkNft(stakingWalletRandomWalkNft).pickRandomStakerIfPossible(raffleEntropy);

				if (rwalkWinner == address(0)) {
					break;
				}

				uint256 nftId = nft.mint(rwalkWinner, roundNum);
				emit RaffleNFTWinnerEvent(rwalkWinner, roundNum, nftId, i, true, true);
			}
		}
	}

	/// @notice Update the entropy used for random selection
	/// @dev This function updates the entropy using the current block information
	/// Issue. Ideally, this should return the updated value so that the caller didn't have to spend gas to read it from the storage.
	function _updateEntropy() internal {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			raffleEntropy = keccak256(abi.encode(raffleEntropy, block.timestamp, blockhash(block.number - 1)));
		}
	}

	/// @notice Reset various parameters at the end of a bidding round
	/// @dev This function is called after a prize is claimed to prepare for the next round
	function _roundEndResets() internal {
		++ roundNum;
		lastBidder = address(0);
		// todo-0 If we are about to enter maintenance mode don't update this, but rather update this after coming back from maintenance.
		lastCstBidTimeStamp = block.timestamp;
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
		cstAuctionLength = roundStartCstAuctionLength + nanoSecondsExtra - CosmicGameConstants.INITIAL_NANOSECONDS_EXTRA;

		bidPrice = address(this).balance / initialBidAmountFraction;
		stellarSpender = address(0);
		stellarSpenderAmount = 0;
		enduranceChampion = address(0);
		// ToDo-202411082-0 relates and/or applies.
		enduranceChampionDuration = 0;

		if (systemMode == CosmicGameConstants.MODE_PREPARE_MAINTENANCE) {
			systemMode = CosmicGameConstants.MODE_MAINTENANCE;
			emit SystemModeChanged(systemMode);
		}
	}

	function prizeAmount() public view override returns (uint256) {
		return address(this).balance * prizePercentage / 100;
	}

	function charityAmount() public view override returns (uint256) {
		return address(this).balance * charityPercentage / 100;
	}

	function raffleAmount() public view override returns (uint256) {
		return address(this).balance * rafflePercentage / 100;
	}

	function stakingAmount() public view override returns (uint256) {
		return address(this).balance * stakingPercentage / 100;
	}

   /// todo-0 Does this function belong to `SytemManagement`?
	function timeUntilActivation() external view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			if (activationTime <= block.timestamp) return 0;
			return activationTime - block.timestamp;
		}
	}

	function timeUntilPrize() external view override returns (uint256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			if (prizeTime <= block.timestamp) return 0;
			return prizeTime - block.timestamp;
		}
	}

	function getWinnerByRound(uint256 round) public view override returns (address) {
		return winners[round];
	}
}
