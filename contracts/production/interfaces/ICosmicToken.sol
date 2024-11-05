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
	/// @param value The amount of tokens to mint
	function mint(address to, uint256 value) external;

	/// @notice Burns a specific amount of tokens from a given account
	/// @dev This function overrides the burn function from ERC20Burnable to allow burning from any account
	/// todo-1 No, it doesn't override an inhereted function, except the one declared here, right?
	/// @param account The address from which to burn tokens
	/// @param value The amount of tokens to burn
	function burn(address account, uint256 value) external;
}
