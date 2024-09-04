// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { StakingWalletCST } from "./StakingWalletCST.sol";
import { StakingWalletRWalk } from "./StakingWalletRWalk.sol";
import { RaffleWallet } from "./RaffleWallet.sol";
import { CosmicGameStorage } from "./CosmicGameStorage.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { IMainPrize } from "./interfaces/IMainPrize.sol";

abstract contract MainPrize is ReentrancyGuardUpgradeable, CosmicGameStorage, BidStatistics, IMainPrize {
	function claimPrize() external override nonReentrant {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		require(
			prizeTime <= block.timestamp,
			CosmicGameErrors.EarlyClaim("Not enough time has elapsed.", prizeTime, block.timestamp)
		);
		require(lastBidder != address(0), CosmicGameErrors.NoLastBidder("There is no last bidder."));

		address winner;
		// ToDo-202408116-0 applies.
		if (block.timestamp/*.sub*/ - (prizeTime) < timeoutClaimPrize) {
			// Only the last bidder can claim within the timeoutClaimPrize period
			require(
				msg.sender == lastBidder,
				CosmicGameErrors.LastBidderOnly(
					"Only the last bidder can claim the prize during the first 24 hours.",
					lastBidder,
					msg.sender,
					// ToDo-202408116-0 applies.
					timeoutClaimPrize/*.sub*/ - (block.timestamp/*.sub*/ - (prizeTime))
				)
			);
			winner = msg.sender;
		} else {
			// After the timeout, anyone can claim the prize
			winner = msg.sender;
		}

		_updateEnduranceChampion();

		// Prevent reentrancy
		lastBidder = address(0);
		winners[roundNum] = winner;

		uint256 prizeAmount_ = prizeAmount();
		uint256 charityAmount_ = charityAmount();
		uint256 raffleAmount_ = raffleAmount();
		uint256 stakingAmount_ = stakingAmount();

		// Distribute prizes
		_distributePrizes(winner, prizeAmount_, charityAmount_, raffleAmount_, stakingAmount_);

		_roundEndResets();
		emit PrizeClaimEvent(roundNum, winner, prizeAmount_);
		// ToDo-202408116-0 applies.
		roundNum = roundNum/*.add*/ + (1);
	}

	/// @notice Distribute prizes to various recipients
	/// @dev This function handles the distribution of ETH and NFT prizes
	/// @param winner Address of the round winner
	/// @param prizeAmount_ Amount of ETH for the main prize
	/// @param charityAmount_ Amount of ETH for charity
	/// @param raffleAmount_ Amount of ETH for raffle winners
	/// @param stakingAmount_ Amount of ETH for staking rewards
	function _distributePrizes(
		address winner,
		uint256 prizeAmount_,
		uint256 charityAmount_,
		uint256 raffleAmount_,
		uint256 stakingAmount_
	) internal {
		// Main prize
		(bool success, ) = winner.call{ value: prizeAmount_ }("");
		require(success, CosmicGameErrors.FundTransferFailed("Transfer to the winner failed.", prizeAmount_, winner));

		// Endurance Champion and Stellar Spender prizes
		_distributeSpecialPrizes();

		// Charity
		(success, ) = charity.call{ value: charityAmount_ }("");
		require(success, CosmicGameErrors.FundTransferFailed("Transfer to charity failed.", charityAmount_, charity));

		// Staking
		// if (IERC721Upgradeable(nft).totalSupply() > 0) {
		if (IERC721Enumerable(nft).totalSupply() > 0) {
			(success, ) = stakingWalletCST.call{ value: stakingAmount_ }(
				abi.encodeWithSelector(StakingWalletCST.deposit.selector)
			);
			require(
				success,
				CosmicGameErrors.FundTransferFailed(
					"Transfer to staking wallet failed.",
					stakingAmount_,
					stakingWalletCST
				)
			);
		}

		// Raffle
		_distributeRafflePrizes(raffleAmount_);
	}

	/// @notice Distribute special prizes to Endurance Champion and Stellar Spender
	/// @dev This function mints NFTs and distributes CST tokens to special winners
	function _distributeSpecialPrizes() internal {
		// Endurance Champion Prize
		if (enduranceChampion != address(0)) {
			uint256 tokenId = CosmicSignature(nft).mint(enduranceChampion, roundNum);
			// ToDo-202408116-0 applies.
			uint256 erc20TokenReward = erc20RewardMultiplier/*.mul*/ * (numRaffleParticipants[roundNum]);
			try token.mint(enduranceChampion, erc20TokenReward) {
			} catch  {
			}
			emit EnduranceChampionWinnerEvent(enduranceChampion, roundNum, tokenId, erc20TokenReward, 0);
		}

		// Stellar Spender Prize
		if (stellarSpender != address(0)) {
			uint256 tokenId = CosmicSignature(nft).mint(stellarSpender, roundNum);
			// ToDo-202408116-0 applies.
			uint256 erc20TokenReward = erc20RewardMultiplier/*.mul*/ * (numRaffleParticipants[roundNum]);
			try token.mint(stellarSpender, erc20TokenReward) {
			} catch  {
			}
			emit StellarSpenderWinnerEvent(
				stellarSpender,
				roundNum,
				tokenId,
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
		// ToDo-202408116-0 applies.
		uint256 perWinnerAmount = raffleAmount_/*.div*/ / (numRaffleETHWinnersBidding);
		for (uint256 i = 0; i < numRaffleETHWinnersBidding; i++) {
			_updateEntropy();
			address raffleWinner = raffleParticipants[roundNum][
				uint256(raffleEntropy) % numRaffleParticipants[roundNum]
			];

			RaffleWallet(raffleWallet).deposit{ value: perWinnerAmount }(raffleWinner);
			emit RaffleETHWinnerEvent(raffleWinner, roundNum, i, perWinnerAmount);
		}

		// Distribute NFT prizes to bidders
		for (uint256 i = 0; i < numRaffleNFTWinnersBidding; i++) {
			_updateEntropy();
			address raffleWinner = raffleParticipants[roundNum][
				uint256(raffleEntropy) % numRaffleParticipants[roundNum]
			];

			uint256 tokenId = CosmicSignature(nft).mint(raffleWinner, roundNum);
			emit RaffleNFTWinnerEvent(raffleWinner, roundNum, tokenId, i, false, false);
		}

		// Distribute NFTs to random RandomWalkNFT stakers
		uint256 numStakedTokensRWalk = StakingWalletRWalk(stakingWalletRWalk).numTokensStaked();
		if (numStakedTokensRWalk > 0) {
			for (uint256 i = 0; i < numRaffleNFTWinnersStakingRWalk; i++) {
				_updateEntropy();
				address rwalkWinner = StakingWalletRWalk(stakingWalletRWalk).pickRandomStaker(raffleEntropy);

				uint256 tokenId = CosmicSignature(nft).mint(rwalkWinner, roundNum);
				emit RaffleNFTWinnerEvent(rwalkWinner, roundNum, tokenId, i, true, true);
			}
		}
	}

	/// @notice Update the entropy used for random selection
	/// @dev This function updates the entropy using the current block information
	function _updateEntropy() internal {
		raffleEntropy = keccak256(abi.encode(raffleEntropy, block.timestamp, blockhash(block.number - 1)));
	}

	/// @notice Reset various parameters at the end of a bidding round
	/// @dev This function is called after a prize is claimed to prepare for the next round
	function _roundEndResets() internal {
		lastCSTBidTime = block.timestamp;
		lastBidType = CosmicGameConstants.BidType.ETH;
		// The auction should last 12 hours longer than the amount of time we add after every bid
		// ToDo-202408116-0 applies.
		CSTAuctionLength = uint256(12)/*.mul*/ * (nanoSecondsExtra)/*.div*/ / (1_000_000_000);
		// ToDo-202408116-0 applies.
		bidPrice = address(this).balance/*.div*/ / (initialBidAmountFraction);
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
		// ToDo-202408116-0 applies.
		return address(this).balance/*.mul*/ * (prizePercentage)/*.div*/ / (100);
	}

	function charityAmount() public view override returns (uint256) {
		// ToDo-202408116-0 applies.
		return address(this).balance/*.mul*/ * (charityPercentage)/*.div*/ / (100);
	}

	function raffleAmount() public view override returns (uint256) {
		// ToDo-202408116-0 applies.
		return address(this).balance/*.mul*/ * (rafflePercentage)/*.div*/ / (100);
	}

	function stakingAmount() public view override returns (uint256) {
		// ToDo-202408116-0 applies.
		return address(this).balance/*.mul*/ * (stakingPercentage)/*.div*/ / (100);
	}

   /// todo-0 Does this function belong to `SytemManagement`?
	function timeUntilActivation() external view override returns (uint256) {
		if (activationTime < block.timestamp) return 0;
		// ToDo-202408116-0 applies.
		return activationTime/*.sub*/ - (block.timestamp);
	}

	function timeUntilPrize() external view override returns (uint256) {
		if (prizeTime < block.timestamp) return 0;
		// ToDo-202408116-0 applies.
		return prizeTime/*.sub*/ - (block.timestamp);
	}

	function getWinnerByRound(uint256 round) public view override returns (address) {
		return winners[round];
	}
}
