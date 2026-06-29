// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { CosmicSignatureGameStorageV2Base } from "./CosmicSignatureGameStorageV2Base.sol";

// #endregion
// #region

abstract contract CosmicSignatureGameStorageV3Base is CosmicSignatureGameStorageV2Base {
	// #region Bidding V3

	// todo-0 Any new variables?

	// #endregion
	// #region Main Prize V3

	/// @notice The number of Cosmic Signature NFTs to be minted to the main prize beneficiary.
	/// Comment-202411064 applies.
	/// todo-0 When using this and maybe some other new variables, assert that it's positive.
	/// todo-ai-0 Test different random values, like 1 through 5.
	uint256 public mainPrizeNumCosmicSignatureNfts;

	// todo-0 Any new variables?

	// #endregion
}

// #endregion
