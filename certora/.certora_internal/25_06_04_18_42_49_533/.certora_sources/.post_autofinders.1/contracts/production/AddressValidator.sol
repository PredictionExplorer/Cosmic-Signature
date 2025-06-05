// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { IAddressValidator } from "./interfaces/IAddressValidator.sol";

abstract contract AddressValidator is IAddressValidator {
	modifier _providedAddressIsNonZero(address value_) {
		_checkProvidedAddressIsNonZero(value_);
		_;
	}

	function _checkProvidedAddressIsNonZero(address value_) internal pure {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff02b80000, 1037618709176) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff02b80001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff02b80005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff02b86000, value_) }
		if (value_ == address(0)) {
			revert CosmicSignatureErrors.ZeroAddress("The provided address is zero.");
		}
	}
}
