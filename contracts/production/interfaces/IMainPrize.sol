// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

// import { ICosmicGameStorage } from "./ICosmicGameStorage.sol";
import { IBidStatistics } from "./IBidStatistics.sol";
import { ISystemEvents } from "./ISystemEvents.sol";

interface IMainPrize is /*ICosmicGameStorage,*/ IBidStatistics, ISystemEvents {
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
   function claimPrize() external;

	/// @notice Get the current prize amount
	/// @return The current prize amount in wei
   function prizeAmount() external view returns (uint256);

	/// @notice Get the current charity amount
	/// @return The current charity amount in wei
   function charityAmount() external view returns (uint256);

	/// @notice Get the current raffle amount
	/// @return The current raffle amount in wei
   function raffleAmount() external view returns (uint256);

	/// @notice Get the current staking amount
	/// @return The current staking amount in wei
   function stakingAmount() external view returns (uint256);

	/// @notice Get the time until the game activates
   /// todo-0 Does this function belong to `ISytemManagement`?
	/// @return The number of seconds until activation, or 0 if already activated
   function timeUntilActivation() external view returns (uint256);

	/// @notice Get the time until the next prize can be claimed
	/// @return The number of seconds until the prize can be claimed, or 0 if claimable now
   function timeUntilPrize() external view returns (uint256);

	/// @notice Get the winner of a specific round
	/// @param round The round number
	/// @return The address of the winner for the specified round
   function getWinnerByRound(uint256 round) external view returns (address);
}
