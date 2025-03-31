// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { IAddressValidator } from "./IAddressValidator.sol";

/// @title The official ERC-20 token for the Cosmic Signature ecosystem.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface implements the CosmicSignatureToken (CST) --
/// an ERC20 token with additional features.
/// This contract includes minting, burning, permit, and voting capabilities.
/// @dev
/// [Comment-202412033]
/// The total supply of this token is quite limited, and therefore it's guaranteed to remain
/// many orders of magnitude below the point of overflow.
/// todo-1 Describe in a user manual under what conditions CSTs are minted and burned.
/// todo-1 There is already a readme file describing it.
/// [/Comment-202412033]
///
/// todo-1 Document in a user manual that to bid with CST, bidders don't need to approve any allowance,
/// todo-1 meaning to call `CosmicSignatureToken.approve`.
/// todo-1 Will this apply to trading on our exchange as well? Maybe not because it could be a security concern.
/// todo-1 But we are not going to develop an exchange.
///
/// todo-1 +++ Research modern features that we might need to implement.
///
/// todo-1 +++ Make sure this contract is Uniswap and other similar exchanges compliant.
/// todo-1 Test manually that we can trade this on Uniswap and the others.
interface ICosmicSignatureToken is IERC20, IERC20Permit, IAddressValidator {
	/// @dev Comment-202501144 relates.
	struct MintSpec {
		address account;

		/// @notice It's OK if this is zero.
		uint256 value;
	}

	/// @dev Comment-202501144 relates.
	struct MintOrBurnSpec {
		address account;

		/// @notice A positive value is to mint; a negative value is to burn.
		/// It's OK if this is zero.
		int256 value;
	}

	// /// @notice Emitted when `marketingWalletAddress` is changed.
	// /// @param newValue The new value.
	// event MarketingWalletAddressChanged(address indexed newValue);

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
	/// It's OK if it's zero.
	function mint(address account_, uint256 value_) external;

	/// @notice Burns the given token amount from the given account.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// @param account_ The address from which to burn funds.
	/// @param value_ The token amount to burn.
	/// It's OK if it's zero.
	function burn(address account_, uint256 value_) external;

	/// @notice Calling this method is equivalent to calling `mint` zero or more times.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	function mintMany(MintSpec[] calldata specs_) external;

	/// @notice Calling this method is equivalent to calling `burn` zero or more times.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	function burnMany(MintSpec[] calldata specs_) external;

	/// @notice Calling this method is equivalent to calling `mint` and/or `burn` zero or more times.
	/// Only the `CosmicSignatureGame` contract is permitted to call this method.
	/// The order of mints and burns can make a difference between the operation succeeding or failing.
	function mintAndBurnMany(MintOrBurnSpec[] calldata specs_) external;

	/// @notice Calling this method is equivalent to calling `transfer` zero or more times.
	/// @param value_ The token amount to transfer to each recipient.
	/// It's OK if it's zero.
	function transferMany(address[] calldata tos_, uint256 value_) external;

	/// @notice Calling this method is equivalent to calling `transfer` zero or more times.
	function transferMany(MintSpec[] calldata specs_) external;
}
