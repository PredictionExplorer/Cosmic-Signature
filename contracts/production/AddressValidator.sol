// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.33;

import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { IAddressValidator } from "./interfaces/IAddressValidator.sol";

/// @title Address Validator.
/// @author The Cosmic Signature Development Team.
/// @notice Provides modifiers and functions to validate that addresses are non-zero.
/// @dev Used throughout the protocol to ensure contract addresses are properly set.
abstract contract AddressValidator is IAddressValidator {
	/// @notice Modifier that validates the provided address is not zero.
	/// @param value_ The address to validate.
	modifier _providedAddressIsNonZero(address value_) {
		_checkProvidedAddressIsNonZero(value_);
		_;
	}

	/// @notice Validates that the provided address is not the zero address.
	/// @param value_ The address to validate.
	/// @dev Reverts with `ZeroAddress` error if the address is zero.
	function _checkProvidedAddressIsNonZero(address value_) internal pure {
		if (value_ == address(0)) {
			revert CosmicSignatureErrors.ZeroAddress("The provided address is zero.");
		}
	}
}
