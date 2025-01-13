// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { IAddressValidator } from "./IAddressValidator.sol";

/// @title The official ERC-20 token for the Cosmic Signature ecosystem.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface implements the CosmicSignatureToken (CST) --
/// an ERC20 token with additional features.
/// This token includes ownership, burning, permit, and voting capabilities.
/// todo-1 No ownership any more.
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
/// todo-1 Do we need a method to send the same and/or different amounts to multiple recipients?
/// todo-1 It can be used by `MarketingWallet`.
/// todo-1 I can name it `transferMany`.
///
/// todo-1 Do we need to make this or any other contract upgradeable or replaceable?
///
/// todo-1 Document in a user manual that bidders don't need to approve any allowance, meaning to call `CosmicToken.approve`,
/// todo-1 to bid with CST.
/// todo-1 Will this apply to trading on our exchange as well?
///
/// todo-1 Make sure this contract is Uniswap and other similar exchanges compliant.
/// todo-1 Maybe research a bit what other cutting edge projects are doing and do the same.
interface ICosmicSignatureToken is IAddressValidator {
	struct MintSpec {
		address account;
		uint256 value;
	}

	struct MintOrBurnSpec {
		address account;

		/// @notice A positive value is to mint; a negative value is to burn.
		int256 value;
	}

	// /// @notice Emitted when `marketingWalletAddress` is changed.
	// /// @param newValue The new value.
	// event MarketingWalletAddressChanged(address newValue);

	// /// @notice Emitted when `marketingWalletBalanceAmountMaxLimit` is changed.
	// /// @param newValue The new value.
	// event MarketingWalletBalanceAmountMaxLimitChanged(uint256 newValue);

	// /// @notice Only the contract owner is permitted to call this method.
	// function setMarketingWalletAddress(address newValue_) external;

	// /// @notice Only the contract owner is permitted to call this method.
	// function setMarketingWalletBalanceAmountMaxLimit(uint256 newValue_) external;

	// /// @notice Only the `CosmicSignatureGame` contract is permitted to call this method.
	// function transferToMarketingWalletOrBurn(address fromAddress_, uint256 amount_) external;

	// /// @notice Only the `CosmicSignatureGame` contract is permitted to call this method.
	// function mintToMarketingWallet(uint256 amount_) external;

	/// @notice Mints a new token amount and assigns it to the given account.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param account_ The address that will receive the newly minted token amount.
	/// @param value_ The token amount to mint.
	function mint(address account_, uint256 value_) external;

	/// @notice Burns the given token amount from the given account.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param account_ The address from which to burn funds.
	/// @param value_ The token amount to burn.
	/// @dev Comment-202409177 relates.
	function burn(address account_, uint256 value_) external;

	function mintMany(MintSpec[] calldata specs_) external;

	function burnMany(MintSpec[] calldata specs_) external;

	function mintAndBurnMany(MintOrBurnSpec[] calldata specs_) external;
}
