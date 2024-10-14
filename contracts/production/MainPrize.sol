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
import { StakingWalletRWalk } from "./StakingWalletRWalk.sol";
import { RaffleWallet } from "./RaffleWallet.sol";
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
			if ( ! (/*winner*/ msg.sender == lastBidder || block.timestamp - prizeTime >= timeoutClaimPrize) ) {
				revert
					CosmicGameErrors.LastBidderOnly(
						"Only the last bidder may claim the prize until a timeout expires.",
						lastBidder,
						/*winner*/ msg.sender,
						timeoutClaimPrize - (block.timestamp - prizeTime)
					);
			}

			_updateEnduranceChampion();

			// // Prevent reentrancy
			// // todo-1 Reentrancy is no longer possible. Moved to `_roundEndResets`.
			// // todo-1 Remove this garbage soon.
			// lastBidder = address(0);

			winners[roundNum] = /*winner*/ msg.sender;

			uint256 prizeAmount_ = prizeAmount();
			uint256 charityAmount_ = charityAmount();
			uint256 raffleAmount_ = raffleAmount();
			uint256 stakingAmount_ = stakingAmount();

			// Distribute prizes
			_distributePrizes(/*winner,*/ prizeAmount_, charityAmount_, raffleAmount_, stakingAmount_);

			_roundEndResets();
			emit PrizeClaimEvent(roundNum, /*winner*/ msg.sender, prizeAmount_);
			++ roundNum;
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

		// Charity
		// If this fails we won't revert the transaction. The funds would simply stay in the game.
		(bool success, ) = charity.call{ value: charityAmount_ }("");
		if (success) {
			emit CosmicGameEvents.FundsTransferredToCharity(charity, charityAmount_);
		} else {
			emit CosmicGameEvents.FundTransferFailed("Transfer to charity failed.", charity, charityAmount_);
		}

		// Sending main prize at the end. Otherwise a malitios winner could attempt to exploit the 63/64 rule
		// by crafting an amount of gas that would result is the last external call, possibly a fund transfer, failing,
		// which would inflict damage if we ignore that error.
		// todo-1 Can/should we specify how much gas an untrusted external call is allowed to use?
		// todo-1 Can/should we forward all gas to trusted external calls?
		// todo-1 But a malitios winner also can exploit stack overflow. Can we find out what error happened?
		(success, ) = /*winner*/ msg.sender.call{ value: prizeAmount_ }("");
		require(success, CosmicGameErrors.FundTransferFailed("Transfer to the winner failed.", /*winner*/ msg.sender, prizeAmount_));
	}

	/// @notice Distribute special prizes to Endurance Champion and Stellar Spender
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
			// todo-0 Make `raffleWallet` strongly typed.
			RaffleWallet(raffleWallet).deposit{ value: perWinnerAmount }(raffleWinner);
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
		// uint256 numStakedTokensRWalk = StakingWalletRWalk(stakingWalletRWalk).numStakedNfts();
		// if (numStakedTokensRWalk > 0)
		{
			for (uint256 i = 0; i < numRaffleNFTWinnersStakingRWalk; i++) {
				_updateEntropy();
				address rwalkWinner = StakingWalletRWalk(stakingWalletRWalk).pickRandomStakerIfPossible(raffleEntropy);

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
		lastBidder = address(0);
		// todo-0 Maybe better reset this to zero? Review uses.
		lastCSTBidTime = block.timestamp;
		lastBidType = CosmicGameConstants.BidType.ETH;
		// The auction should last 12 hours longer than the amount of time we add after every bid
		// todo-0 Magic number hardcoded. I added a relevant constant. Use it.
		CSTAuctionLength = uint256(12) * nanoSecondsExtra / CosmicGameConstants.NANOSECONDS_PER_SECOND;
		bidPrice = address(this).balance / initialBidAmountFraction;
		stellarSpender = address(0);
		stellarSpenderAmount = 0;
		enduranceChampion = address(0);
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
