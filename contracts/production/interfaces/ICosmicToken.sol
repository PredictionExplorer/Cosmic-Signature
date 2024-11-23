// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

/// @title The official ERC-20 token for the Cosmic Signature ecosystem.
/// @author Cosmic Signature Development Team.
/// @notice A contract implementing this interface implements the CosmicToken (CST), an ERC20 token with additional features.
/// @dev This token includes burning, ownership, permit, and voting capabilities.
/// [Comment-202412033]
/// The total supply of these tokens is quite limited, and therefore it's guaranteed to remain
/// many orders of magnitude below the point of overflow.
/// [/Comment-202412033]
interface ICosmicToken {
	/// @notice Mints new tokens and assigns them to the specified address.
	/// Only the contract owner is permitted to call this method.
	/// @param to The address that will receive the minted tokens
	/// @param value The amount of tokens to mint
	function mint(address to, uint256 value) external;

	/// @notice Burns the given amount of tokens from the given account.
	/// @dev This function overrides the burn function from ERC20Burnable to allow burning from any account
	/// todo-1 No, it doesn't actually override an inhereted function, except the one declared here.
	/// todo-1 I have also added `onlyOwner`. Is it correct? Reflect that in this comment.
	/// @param account The address from which to burn tokens
	/// @param value The amount of tokens to burn
	function burn(address account, uint256 value) external;
}
