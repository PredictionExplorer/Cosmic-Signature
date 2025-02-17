// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { INftDonations } from "./interfaces/INftDonations.sol";

abstract contract NftDonations is CosmicSignatureGameStorage, INftDonations {
}
