// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.27;

/// @title The official token for the Cosmic Game ecosystem
/// @author Cosmic Game Development Team
/// @notice A contract implementing this interface implements the CosmicToken (CST), an ERC20 token with additional features
/// @dev This token includes burning, ownership, permit, and voting capabilities
interface ICosmicToken {
	/// @notice Mints new tokens and assigns them to the specified address
	/// @dev Only the contract owner can call this function
	/// @param to The address that will receive the minted tokens
	/// @param amount The amount of tokens to mint
	function mint(address to, uint256 amount) external;

	/// @notice Burns a specific amount of tokens from a given account
	/// @dev This function overrides the burn function from ERC20Burnable to allow burning from any account
	/// todo-0 So it looks like anybody can burn or mint our tokens. What am I missing?
	/// @param account The address from which to burn tokens
	/// @param amount The amount of tokens to burn
	function burn(address account, uint256 amount) external;
}
