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
	/// [Comment-202502266]
	/// This is the number of populated `stakeActions` items.
	/// `stakeActionIds` contains the same number of populated items.
	/// [/Comment-202502266]
	uint256 public numStakedNfts = 0;

	/// @notice If an item of this array at a particular index is a nonzero it means
	/// a RandomWalk or CosmicSignature NFT with that ID has already been used for staking.
	/// It doesn't specify whether the given NFT is still staked or has already been unstaked.
	uint256[1 << 64] public usedNfts;

	/// @notice This variable is used to generate monotonic unique IDs.
	/// @dev Issue. Yuriy would prefer to declare this variable `internal` (and name it `_...`),
	/// but Nick is saying that he needs it to monitor contract activities.
	/// A problem is that the suitability of this variable for any purpose other than what the @notice says is purely accidential.
	/// Any refactoring can easily break things.
	/// todo-1 ??? Talk to Nick again.
	uint256 public actionCounter = 0;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @dev
	/// Observable universe entities accessed here:
	///    Inherited `constructor`s.
	constructor() {
	}

	// #endregion
	// #region `stake`

	function stake(uint256 nftId_) public override virtual;

	// #endregion
	// #region `stakeMany`

	/// @dev
	/// Observable universe entities accessed here:
	///    `stake`.
	function stakeMany(uint256[] calldata nftIds_) external override {
		for (uint256 nftIdIndex_ = nftIds_.length; nftIdIndex_ > 0; ) {
			-- nftIdIndex_;
			stake(nftIds_[nftIdIndex_]);
		}
	}

	// #endregion
}

// #endregion
