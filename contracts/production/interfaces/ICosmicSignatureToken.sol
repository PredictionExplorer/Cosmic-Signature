// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IAddressValidator } from "./IAddressValidator.sol";

/// @title The official ERC-20 token for the Cosmic Signature ecosystem.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface implements the CosmicSignatureToken (CST),
/// an ERC20 token with additional features.
/// This token includes burning, ownership, permit, and voting capabilities.
/// todo-1 No burning any more? Edit the above coment.
/// @dev
/// [Comment-202412033]
/// The total supply of these tokens is quite limited, and therefore it's guaranteed to remain
/// many orders of magnitude below the point of overflow.
/// todo-1 Describe in a user manual under what conditions CSTs are minted and burned.
/// [/Comment-202412033]
/// ToDo-202412106-1 relates and/or applies.
///
/// todo-1 Do we need a method to send the same and/or different amounts to multiple recipients?
///
/// todo-1 Document in a user manual that bidders don't need to approve any allowance, meaning to call `CosmicToken.approve`,
/// todo-1 to bid with CST.
/// todo-1 Will this apply to trading on our exchange as well?
///
/// todo-1 Do we need to make this (or any other) contract upgradeable or replaceable?
interface ICosmicSignatureToken is IAddressValidator {
	/// @notice Emitted when `marketingWalletAddress` is changed.
	/// @param newValue The new value.
	event MarketingWalletAddressChanged(address newValue);

	/// @notice Emitted when `marketingWalletBalanceAmountMaxLimit` is changed.
	/// @param newValue The new value.
	event MarketingWalletBalanceAmountMaxLimitChanged(uint256 newValue);

	/// @notice Only the contract owner is permitted to call this method.
	function setMarketingWalletAddress(address newValue_) external;

	/// @notice Only the contract owner is permitted to call this method.
	function setMarketingWalletBalanceAmountMaxLimit(uint256 newValue_) external;

	/// @notice Only the `CosmicSignatureGame` contract is permitted to call this method.
	function transferToMarketingWalletOrBurn(address fromAddress_, uint256 amount_) external;

	/// @notice Mints new tokens and assigns them to the specified address.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param account The address that will receive the newly minted token amount.
	/// @param value The amount of tokens to mint.
	function mint(address account, uint256 value) external;

	// /// @notice Burns the given amount of tokens from the given account.
	// /// Only the `CosmicSignatureGame` contract is permitted to call this method.
	// /// @dev This method overrides the burn function from `ERC20Burnable` to allow burning from any account.
	// /// todo-1 No, it doesn't actually override an inhereted function besides the one declared here.
	// /// todo-1 "Any account" appears to be a bad idea. So I added the `onlyGame` modifier.
	// /// @param account The address from which to burn the token amount.
	// /// @param value The amount of tokens to burn.
	// function burn(address account, uint256 value) external;
}
