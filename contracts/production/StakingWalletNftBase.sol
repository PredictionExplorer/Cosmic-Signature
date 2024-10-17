// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

// #endregion
// #region

import { IStakingWalletNftBase } from "./interfaces/IStakingWalletNftBase.sol";

// #endregion
// #region

abstract contract StakingWalletNftBase is IStakingWalletNftBase {
	// #region State

	/// @notice The current staked NFT count.
	/// @dev In `StakingWalletCosmicSignatureNft`, this is the number of `stakeActions` items containing a zero `maxUnpaidEthDepositIndex`.
   /// In `StakingWalletRandomWalkNft`, this is the total number of `stakeActions` and `stakeActionIds` items.
	/// [Comment-202410274]
	/// It could make sense to declare this `public`, but this is `internal` because there is an accessor function for this.
	/// [/Comment-202410274]
	uint256 internal _numStakedNfts;

	/// @notice This contains IDs of NFTs that have ever been used for staking.
	/// @dev Idea. Item value should be an enum NftStakingStatusCode: NeverStaked, Staked, Unstaked.
	/// Comment-202410274 applies.
	mapping(uint256 nftId => bool nftWasUsed) internal _usedNfts;

	/// @notice This is used to generate monotonic unique IDs.
	uint256 internal _actionCounter;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @dev
	/// Observable universe entities accessed here:
	///    `_numStakedNfts`. `assert` only.
	///    `_actionCounter`. `assert` only.
	constructor() {
		// #enable_asserts assert(_numStakedNfts == 0);
		// #enable_asserts assert(_actionCounter == 0);
	}

	// #endregion
	// #region `stake`

	/// @dev Comment-202411023 relates and/or applies.
	function stake(uint256 nftId_) public override virtual;

	// #endregion
	// #region `stakeMany`

	/// @dev
	/// Observable universe entities accessed here:
	///    `_numStakedNfts`. `assert` only.
	///    `stake`.
	function stakeMany(uint256[] calldata nftIds_) external override {
		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		for ( uint256 nftIdIndex_ = 0; nftIdIndex_ < nftIds_.length; ++ nftIdIndex_ ) {
			stake(nftIds_[nftIdIndex_]);
		}

		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ + nftIds_.length);
	}

	// #endregion
	// #region `numStakedNfts`

	/// @dev
	/// Observable universe entities accessed here:
	///    `_numStakedNfts`.
	function numStakedNfts() external view override returns (uint256) {
		return _numStakedNfts;
	}

	// #endregion
	// #region `wasNftUsed`

	/// @dev
	/// Observable universe entities accessed here:
	///    `_usedNfts`.
	function wasNftUsed(uint256 nftId_) external view override returns (bool) {
		return _usedNfts[nftId_];
	}

	// #endregion
}

// #endregion
