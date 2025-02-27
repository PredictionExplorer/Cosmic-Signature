// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

import { AddressValidator } from "./AddressValidator.sol";
import { IStakingWalletNftBase } from "./interfaces/IStakingWalletNftBase.sol";

// #endregion
// #region

abstract contract StakingWalletNftBase is AddressValidator, IStakingWalletNftBase {
	// #region State

	/// @notice The current staked NFT count.
	/// @dev
	/// [Comment-202502266]
	/// In `StakingWalletRandomWalkNft`, this is the number of `stakeActions` items,
	/// which matches the number of `stakeActionIds` items.
	/// [/Comment-202502266]
	/// [Comment-202502268]
	/// In `StakingWalletCosmicSignatureNft`, this is the number of `stakeActions` items
	/// containing a zero `maxUnpaidEthDepositIndex`.
	/// [/Comment-202502268]
	uint256 public numStakedNfts = 0;

	/// @notice If an item of this array at a particular index is a nonzero it means
	/// a RandomWalk or CosmicSignature NFT with that ID has already been used for staking.
	/// It doesn't specify whether the given NFT is still staked or has already been unstaked.
	/// @dev Idea. Item value should be an enum NftStakingStatusCode: NeverStaked, Staked, Unstaked.
	/// It should, ideally, be 256 bits long.
	/// But currently we don't need to know that.
	uint256[1 << 64] public usedNfts;

	/// @notice This is used to generate monotonic unique IDs.
	/// @dev Issue. Yuriy would prefer to declare this variable `internal` (and name it `_...`),
	/// but Nick is saying that he needs it to monitor contract activities.
	/// But the suitability of this variable for any purpose other than what the @notice says is purely accidential.
	/// Any refactoring can easily break things.
	/// todo-1 ??? Talk to Nick again.
	uint256 public actionCounter = 0;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @dev
	/// Observable universe entities accessed here:
	///    `numStakedNfts`.
	///    `actionCounter`.
	constructor() {
		// #enable_asserts assert(numStakedNfts == 0);
		// #enable_asserts assert(actionCounter == 0);
	}

	// #endregion
	// #region `stake`

	/// @dev Comment-202411023 relates and/or applies.
	function stake(uint256 nftId_) public override virtual;

	// #endregion
	// #region `stakeMany`

	/// @dev
	/// Observable universe entities accessed here:
	///    `numStakedNfts`.
	///    `stake`.
	function stakeMany(uint256[] calldata nftIds_) external override {
		// #enable_asserts uint256 initialNumStakedNfts_ = numStakedNfts;

		// [Comment-202502265]
		// Issue. It could be more efficient to iterate this loop in the reverse.
		// But let's leave it alone.
		// [/Comment-202502265]
		for ( uint256 nftIdIndex_ = 0; nftIdIndex_ < nftIds_.length; ++ nftIdIndex_ ) {

			stake(nftIds_[nftIdIndex_]);
		}

		// #enable_asserts assert(numStakedNfts == initialNumStakedNfts_ + nftIds_.length);
	}

	// #endregion
}

// #endregion
