// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { ISpecialPrizes } from "./interfaces/ISpecialPrizes.sol";

abstract contract SpecialPrizes is CosmicSignatureGameStorage, ISpecialPrizes {
	// Empty.
}
