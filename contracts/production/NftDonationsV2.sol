// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { CosmicSignatureGameStorageV2 } from "./CosmicSignatureGameStorageV2.sol";
import { INftDonations } from "./interfaces/INftDonations.sol";

abstract contract NftDonationsV2 is CosmicSignatureGameStorageV2, INftDonations {
   // Empty.
}
