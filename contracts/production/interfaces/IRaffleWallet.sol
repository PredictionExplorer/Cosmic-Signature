// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

/// @title A wallet for managing raffle winnings in the Cosmic Game
/// @author Cosmic Game Development Team
/// @notice A contract implementing this interface handles deposits of raffle winnings and allows winners to withdraw their prizes
interface IRaffleWallet {
	/// @notice Emitted when a raffle prize is deposited for a winner
	/// @param winner Address of the raffle winner
	/// @param amount Amount of ETH deposited as the prize
	event RaffleDepositEvent(address indexed winner, uint256 amount);

	/// @notice Emitted when a winner withdraws their raffle prize
	/// @param destination Address of the prize recipient
	/// @param amount Amount of ETH withdrawn
	event RaffleWithdrawalEvent(address indexed destination, uint256 amount);

	/// @notice Deposits a raffle prize for a winner
	/// @dev Only callable by the CosmicGame contract.
	/// @param winner Address of the raffle winner
   function deposit(address winner) external payable;

	/// @notice Allows a winner to withdraw their raffle prize
	/// @dev Transfers the entire balance of the caller to their address
   function withdraw() external;
}
