// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IAddressValidator } from "./IAddressValidator.sol";

/// @title The official ERC-20 token for the Cosmic Signature ecosystem.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface implements the CosmicSignatureToken (CST) --
/// an ERC20 token with additional features.
/// This token includes ownership, burning, permit, and voting capabilities.
/// @dev
/// [Comment-202412033]
/// The total supply of these tokens is quite limited, and therefore it's guaranteed to remain
/// many orders of magnitude below the point of overflow.
/// todo-1 Describe in a user manual under what conditions CSTs are minted and burned.
/// todo-1 There is already a readme file describing it.
/// [/Comment-202412033]
///
/// ToDo-202412106-1 relates and/or applies.
///
/// todo-1 Do we need a method to make multiple mints and/or burns?
/// todo-1 A positive value means to mint; a negative value means to burn.
/// todo-1 I can name it `mintBurnMany`.
///
/// todo-1 Do we need a method to send the same and/or different amounts to multiple recipients?
/// todo-1 I can name it `transferMany`.
///
/// todo-1 Do we need to make this (or any other) contract upgradeable or replaceable?
///
/// todo-1 Document in a user manual that bidders don't need to approve any allowance, meaning to call `CosmicToken.approve`,
/// todo-1 to bid with CST.
/// todo-1 Will this apply to trading on our exchange as well?
interface ICosmicSignatureToken is IAddressValidator {
	/// @notice Emitted when `marketingWalletAddress` is changed.
	/// @param newValue The new value.
	event MarketingWalletAddressChanged(address newValue);

	// /// @notice Emitted when `marketingWalletBalanceAmountMaxLimit` is changed.
	// /// @param newValue The new value.
	// event MarketingWalletBalanceAmountMaxLimitChanged(uint256 newValue);

	/// @notice Only the contract owner is permitted to call this method.
	function setMarketingWalletAddress(address newValue_) external;

	// /// @notice Only the contract owner is permitted to call this method.
	// function setMarketingWalletBalanceAmountMaxLimit(uint256 newValue_) external;

	// /// @notice Only the `CosmicSignatureGame` contract is permitted to call this method.
	// function transferToMarketingWalletOrBurn(address fromAddress_, uint256 amount_) external;

	/// @notice Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @dev todo-1 Combine some of these methods so that the Game could make a single call per bid.
	function mintToMarketingWallet(uint256 amount_) external;

	/// @notice Mints new tokens and assigns them to the given account.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param account The address that will receive the newly minted token amount.
	/// @param value The amount of tokens to mint.
	function mint(address account, uint256 value) external;

	/// @notice Burns the given token amount from the given account.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param account The address from which to burn funds.
	/// @param value The token amount to burn.
	function burn(address account, uint256 value) external;
}
