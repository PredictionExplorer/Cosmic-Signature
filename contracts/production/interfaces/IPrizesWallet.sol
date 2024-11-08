// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

/// @title A wallet to hold ETH, ERC20 token, ERC721 NFT winnings in the Cosmic Game.
/// @author Cosmic Game Development Team.
/// todo-1 Rephrase to Cosmic Signature Game?
/// @notice A contract implementing this interface supports depositing ETH, donating ERC20 tokens and ERC721 NFTs,
/// and allows prize winners to withdraw their prizes.
interface IPrizesWallet {
	/// @notice Emitted when an ETH prize is received for a winner.
	/// @param winner Prize winner address.
	/// @param amount Prize ETH amount.
	event EthReceived(address indexed winner, uint256 amount);

	/// @notice Emitted when a prize winner withdraws their ETH balance.
	/// @param winner Prize winner address.
	/// @param amount Balance ETH amount.
	event EthWithdrawn(address indexed winner, uint256 amount);

	/// @notice Receives an ETH prize for a winner.
	/// @param winner_ Prize winner address.
	/// @dev Only callable by the `CosmicGame` contract.
	function depositEth(address winner_) external payable;

	// todo-1 Do we need a method to deposit for multiple addresses?
	// todo-1 Ideally, it should accept an array of structs, each being 32 bytes long.

	/// @notice Allows a prize winner to withdraw their ETH balance.
	/// @dev Transfers the entire caller's balance to their address.
	function withdrawEth() external;

	// todo-1 Do we need a method to withdraw a combination of ETH, ERC20 tokens, ERC721 NFTs?

	/// @return ETH balance belonging to `msg.sender`.
	function getEthBalance() external view returns(uint256);

	/// @param winner_ Prize winner address.
	/// @return ETH balance belonging to the given address.
	function getEthBalance(address winner_) external view returns(uint256);
}