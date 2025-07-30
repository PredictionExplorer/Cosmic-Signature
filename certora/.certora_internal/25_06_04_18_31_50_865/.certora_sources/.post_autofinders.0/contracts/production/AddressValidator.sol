// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { IAddressValidator } from "./interfaces/IAddressValidator.sol";

abstract contract AddressValidator is IAddressValidator {
	modifier _providedAddressIsNonZero(address value_) {
		_checkProvidedAddressIsNonZero(value_);
		_;
	}

	function _checkProvidedAddressIsNonZero(address value_) internal pure {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01740000, 1037618708852) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01740001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01740005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01746000, value_) }
		if (value_ == address(0)) {
			revert CosmicSignatureErrors.ZeroAddress("The provided address is zero.");
		}
	}
}
