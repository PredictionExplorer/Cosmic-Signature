// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { IAddressValidator } from "./interfaces/IAddressValidator.sol";

abstract contract AddressValidator is IAddressValidator {
	modifier _providedAddressIsNonZero(address value_) {
		if (value_ == address(0)) {
			revert CosmicSignatureErrors.ZeroAddress("The provided address is zero.");
		}
		_;
	}
}
