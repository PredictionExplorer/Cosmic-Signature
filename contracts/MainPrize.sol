// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import "./CosmicGameStorage.sol";
import { CosmicGameErrors } from "./CosmicGameErrors.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { StakingWalletCST } from "./StakingWalletCST.sol";
import { StakingWalletRWalk } from "./StakingWalletRWalk.sol";
import { RaffleWallet } from "./RaffleWallet.sol";
import { IERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "./interfaces/SystemEvents.sol";

contract MainPrize is ReentrancyGuardUpgradeable,CosmicGameStorage,BidStatistics,SystemEvents {
	/// @notice Emitted when a prize is claimed
	/// @param prizeNum The number of the prize being claimed
	/// @param destination The address receiving the prize
	/// @param amount The amount of the prize
	event PrizeClaimEvent(uint256 indexed prizeNum, address indexed destination, uint256 amount);
	/// @notice Emitted when an ETH raffle winner is selected
	/// @param winner The address of the winner
	/// @param round The round number
	/// @param winnerIndex The index of the winner
	/// @param amount The amount won
	event RaffleETHWinnerEvent(address indexed winner, uint256 indexed round, uint256 winnerIndex, uint256 amount);

	/// @notice Emitted when an NFT raffle winner is selected
	/// @param winner The address of the winner
	/// @param round The round number
	/// @param tokenId The ID of the NFT won
	/// @param winnerIndex The index of the winner
	/// @param isStaker Whether the winner is a staker
	/// @param isRWalk Whether the NFT is a RandomWalk NFT
	event RaffleNFTWinnerEvent(
		address indexed winner,
		uint256 indexed round,
		uint256 indexed tokenId,
		uint256 winnerIndex,
		bool isStaker,
		bool isRWalk
	);
	/// @notice Emitted when the Endurance Champion winner is determined
	/// @param winner The address of the Endurance Champion
	/// @param round The round number
	/// @param erc721TokenId The ID of the ERC721 token awarded
	/// @param erc20TokenAmount The amount of ERC20 tokens awarded
	/// @param winnerIndex The index of the winner
	event EnduranceChampionWinnerEvent(
		address indexed winner,
		uint256 indexed round,
		uint256 indexed erc721TokenId,
		uint256 erc20TokenAmount,
		uint256 winnerIndex
	);
	/// @notice Emitted when the Stellar Spender winner is determined
	/// @param winner The address of the Stellar Spender
	/// @param round The round number
	/// @param erc721TokenId The ID of the ERC721 token awarded
	/// @param erc20TokenAmount The amount of ERC20 tokens awarded
	/// @param totalSpent The total amount spent by the winner
	/// @param winnerIndex The index of the winner
	event StellarSpenderWinnerEvent(
		address indexed winner,
		uint256 indexed round,
		uint256 indexed erc721TokenId,
		uint256 erc20TokenAmount,
		uint256 totalSpent,
		uint256 winnerIndex
	);


	/// @notice Claim the prize for the current round
	/// @dev This function distributes prizes, updates game state, and starts a new round
	function claimPrize() external nonReentrant {
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
				_msgSender() == lastBidder,
				CosmicGameErrors.LastBidderOnly(
					"Only the last bidder can claim the prize during the first 24 hours.",
					lastBidder,
					_msgSender(),
					// ToDo-202408116-0 applies.
					timeoutClaimPrize/*.sub*/ - (block.timestamp/*.sub*/ - (prizeTime))
				)
			);
			winner = _msgSender();
		} else {
			// After the timeout, anyone can claim the prize
			winner = _msgSender();
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
			CosmicToken(token).transfer(enduranceChampion, erc20TokenReward);
			emit EnduranceChampionWinnerEvent(enduranceChampion, roundNum, tokenId, erc20TokenReward, 0);
		}

		// Stellar Spender Prize
		if (stellarSpender != address(0)) {
			uint256 tokenId = CosmicSignature(nft).mint(stellarSpender, roundNum);
			// ToDo-202408116-0 applies.
			uint256 erc20TokenReward = erc20RewardMultiplier/*.mul*/ * (numRaffleParticipants[roundNum]);
			CosmicToken(token).transfer(stellarSpender, erc20TokenReward);
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
	/// @notice Get the current prize amount
	/// @return The current prize amount in wei
	function prizeAmount() public view returns (uint256) {
		// ToDo-202408116-0 applies.
		return address(this).balance/*.mul*/ * (prizePercentage)/*.div*/ / (100);
	}

	/// @notice Get the current charity amount
	/// @return The current charity amount in wei
	function charityAmount() public view returns (uint256) {
		// ToDo-202408116-0 applies.
		return address(this).balance/*.mul*/ * (charityPercentage)/*.div*/ / (100);
	}

	/// @notice Get the current raffle amount
	/// @return The current raffle amount in wei
	function raffleAmount() public view returns (uint256) {
		// ToDo-202408116-0 applies.
		return address(this).balance/*.mul*/ * (rafflePercentage)/*.div*/ / (100);
	}

	/// @notice Get the current staking amount
	/// @return The current staking amount in wei
	function stakingAmount() public view returns (uint256) {
		// ToDo-202408116-0 applies.
		return address(this).balance/*.mul*/ * (stakingPercentage)/*.div*/ / (100);
	}

	/// @notice Get the time until the game activates
	/// @return The number of seconds until activation, or 0 if already activated
	function timeUntilActivation() external view returns (uint256) {
		if (activationTime < block.timestamp) return 0;
		// ToDo-202408116-0 applies.
		return activationTime/*.sub*/ - (block.timestamp);
	}

	/// @notice Get the time until the next prize can be claimed
	/// @return The number of seconds until the prize can be claimed, or 0 if claimable now
	function timeUntilPrize() external view returns (uint256) {
		if (prizeTime < block.timestamp) return 0;
		// ToDo-202408116-0 applies.
		return prizeTime/*.sub*/ - (block.timestamp);
	}

	/// @notice Get the winner of a specific round
	/// @param round The round number
	/// @return The address of the winner for the specified round
	function getWinnerByRound(uint256 round) public view returns (address) {
		return winners[round];
	}
}
