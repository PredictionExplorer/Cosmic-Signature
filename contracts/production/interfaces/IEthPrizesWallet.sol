// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

/// @title A wallet to hold ETH winnings in the Cosmic Game.
/// @author Cosmic Game Development Team.
/// @notice A contract implementing this interface supports depositing ETH prizes and allows prize winners to withdraw their funds.
interface IEthPrizesWallet {
	/// @notice Emitted when a prize is received for a winner.
	/// @param winner Winner address.
	/// @param prizeAmount Prize ETH amount.
	event PrizeReceived(address indexed winner, uint256 prizeAmount);

	/// @notice Emitted when a winner withdraws their balance.
	/// @param winner Winner address.
	/// @param prizeAmount Balance ETH amount.
	event PrizeWithdrawn(address indexed winner, uint256 prizeAmount);

	/// @notice Receives a prize for a winner.
	/// @param winner_ Winner address.
	/// @dev Only callable by the `CosmicGame` contract.
	function deposit(address winner_) external payable;

	/// @notice Allows a winner to withdraw their balance.
	/// @dev Transfers the entire caller's balance to their address.
	function withdraw() external;

	/// @param winner_ Winner address.
	/// @return ETH balance belonging to the given address.
	function getWinnerBalance(address winner_) external view returns(uint256);
}
