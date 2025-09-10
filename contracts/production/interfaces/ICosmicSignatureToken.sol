// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { IAddressValidator } from "./IAddressValidator.sol";

/// @title The Official ERC-20 Token for the Cosmic Signature Ecosystem.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface implements the CosmicSignatureToken (CST) --
/// an ERC20 token with additional features.
/// This contract includes minting, burning, permit, and voting capabilities.
/// @dev
/// [Comment-202412033]
/// The total supply of this token is quite limited, and therefore it's guaranteed to remain
/// many orders of magnitude below the point of overflow.
/// Comment-202507302 relates.
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
///
/// todo-1 Review again what can possibly fail here and cause a transaction reversal.
/// todo-1 Assuming it's OK, but there is a lot of code there that is hard to comprehend.
/// todo-1 Let's see what SMTChecker says.
/// todo-1 To the auditor: We assume that OpenZeppelin's ERC20 nd ERC721 implementations
/// todo-1 aren't supposed to revert under surprising circumstances.
/// todo-1 They will revert only in expected and well understood cases, such as total supply overflow
/// todo-1 or burning a bigger amount than the given account holds.
/// todo-1 It's difficult for us to confirm the above assumption by reviewing all code in complex contracts, such as ERC20Votes,
/// todo-1 but you probably already know.
/// todo-1 Note that we are aware that ERC20Votes allows fewer than 256 bits to hold token amounts, which is not a problem,
/// todo-1 given Comment-202412033.
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

	/// @notice Mints a token amount and assigns it to the given account.
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
