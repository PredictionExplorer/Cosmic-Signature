// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

/// @title The official ERC-20 token for the Cosmic Signature ecosystem.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface implements the CosmicSignatureToken (CST),
/// an ERC20 token with additional features.
/// This token includes burning, ownership, permit, and voting capabilities.
/// todo-1 But do we really need to expose burning?
/// @dev
/// [Comment-202412033]
/// The total supply of these tokens is quite limited, and therefore it's guaranteed to remain
/// many orders of magnitude below the point of overflow.
/// [/Comment-202412033]
/// ToDo-202412106-1 relates and/or applies.
///
/// todo-1 Do we need a method to send the same and/or different amounts to multiple recipients?
///
/// todo-1 I have reviewed possible extensions to inherit from. Maybe "ERC1363.sol", "draft-ERC20TemporaryApproval.sol".
/// todo-1 Ask the guys.
///
/// todo-1 Do we really need to derive from `ERC20Burnable`? Maybe to send CST to another network via a brodge.
/// todo-1 But we still don't need the `burn` function that allows `msg.sender` to burn own money.
/// todo-1 Maybe override it and make it always revert.
/// todo-1 But it's not going to work because we don't support arbitrary minting.
/// todo-1 But should we support sending tokens to another blockchain? What if we deploy the game contract on another blockchain?
/// todo-1 Ask the guys.
interface ICosmicSignatureToken {
	/// @notice Mints new tokens and assigns them to the specified address.
	/// Only the contract owner is permitted to call this method.
	/// todo-1 But we should have separate roles for the game and the owner. Only the game should be permitted to mint and burn.
	/// @param account The address that will receive the newly minted tokens.
	/// @param value The amount of tokens to mint.
	function mint(address account, uint256 value) external;

	/// @notice Burns the given amount of tokens from the given account.
	/// Only the contract owner is permitted to call this method.
	/// todo-1 But we should have separate roles for the game and the owner. Only the game should be permitted to mint and burn.
	/// @dev This method overrides the burn function from `ERC20Burnable` to allow burning from any account.
	/// todo-1 No, it doesn't actually override an inhereted function, besides the one declared here.
	/// todo-1 "Any account" appears to be a bad idea. So I added the `onlyOwner` modifier. But tell the guys.
	/// @param account The address from which to burn tokens.
	/// @param value The amount of tokens to burn.
	function burn(address account, uint256 value) external;
}
