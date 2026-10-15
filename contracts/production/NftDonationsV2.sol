// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { CosmicSignatureGameStorageV2Base } from "./CosmicSignatureGameStorageV2Base.sol";
import { INftDonations } from "./interfaces/INftDonations.sol";

abstract contract NftDonationsV2 is CosmicSignatureGameStorageV2Base, INftDonations {
   // Empty.
}
