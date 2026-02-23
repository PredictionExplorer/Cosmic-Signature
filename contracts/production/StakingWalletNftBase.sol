// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.33;

// #endregion
// #region

import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { IStakingWalletNftBase } from "./interfaces/IStakingWalletNftBase.sol";

// #endregion
// #region

/// @title NFT Staking Wallet Base Contract.
/// @author The Cosmic Signature Development Team.
/// @notice Abstract base contract providing common NFT staking functionality.
/// @dev This contract enforces the one-time staking rule for NFTs and provides base stake/unstake logic.
/// Derived contracts extend this with specific staking mechanics.
abstract contract StakingWalletNftBase is AddressValidator, IStakingWalletNftBase {
	// #region State

	/// @notice The current staked NFT count.
	/// @dev
	/// [Comment-202502266]
	/// This is the number of populated `stakeActions` items in derived contracts.
	/// In `StakingWalletRandomWalkNft`, the `stakeActionIds` array contains the same number of populated items.
	/// [/Comment-202502266]
	uint256 public numStakedNfts = 0;

	/// @notice Tracks which NFTs have been used for staking.
	/// @dev Each Random Walk or Cosmic Signature NFT is allowed to be used for staking only once.
	/// A nonzero value at a given index indicates the NFT with that ID has already been used for staking.
	/// This flag remains set even after unstaking, preventing re-staking of the same NFT.
	/// This design ensures fairness by preventing gaming of the reward distribution system.
	/// See also: `CosmicSignatureGameStorage.usedRandomWalkNfts`.
	uint256[1 << 64] public usedNfts;

	/// @notice Monotonically increasing counter used to generate unique action IDs.
	/// @dev Incremented for each stake and unstake action across the contract's lifetime.
	/// One might want to declare this variable `internal` (and name it `_...`), but Nick needs it to be `public`.
	uint256 public actionCounter = 0;

	// #endregion
	// #region `constructor`

	/// @notice Initializes the base staking wallet contract.
	/// @dev
	/// Observable universe entities accessed here:
	///    Inherited `constructor`s.
	constructor() {
		// Doing nothing.
	}

	// #endregion
	// #region `stake`

	/// @inheritdoc IStakingWalletNftBase
	/// @dev
	/// Observable universe entities accessed here:
	///    `_stake`.
	function stake(uint256 nftId_) external override virtual {
		_stake(nftId_);
	}

	// #endregion
	// #region `_stake`

	/// @notice Internal staking implementation that enforces the one-time staking rule.
	/// @param nftId_ The ID of the NFT to stake.
	/// @dev This base implementation marks the NFT as used for staking.
	/// Derived contracts must call `super._stake()` and extend with additional logic
	/// (e.g., transferring the NFT, recording stake action details).
	/// Reverts with `NftHasAlreadyBeenStaked` if the NFT was previously staked.
	/// Observable universe entities accessed here:
	///    `CosmicSignatureErrors.NftHasAlreadyBeenStaked`.
	///    `usedNfts`.
	function _stake(uint256 nftId_) internal virtual {
		require(
			usedNfts[nftId_] == 0,
			CosmicSignatureErrors.NftHasAlreadyBeenStaked("This NFT has already been staked in the past. An NFT is allowed to be staked only once.", nftId_)
		);
		usedNfts[nftId_] = 1;
	}

	// #endregion
	// #region `stakeMany`

	/// @inheritdoc IStakingWalletNftBase
	/// @dev
	/// Observable universe entities accessed here:
	///    `_stakeMany`.
	function stakeMany(uint256[] calldata nftIds_) external override virtual {
		_stakeMany(nftIds_);
	}

	// #endregion
	// #region `_stakeMany`

	/// @notice Internal implementation to stake multiple NFTs in a single transaction.
	/// @param nftIds_ Array of NFT IDs to stake.
	/// @dev Iterates in reverse order for gas optimization.
	/// Calls `_stake` for each NFT, which enforces individual staking rules.
	/// Observable universe entities accessed here:
	///    `_stake`.
	function _stakeMany(uint256[] calldata nftIds_) internal {
		for (uint256 nftIdIndex_ = nftIds_.length; nftIdIndex_ > 0; ) {
			-- nftIdIndex_;
			_stake(nftIds_[nftIdIndex_]);
		}
	}

	// #endregion
}

// #endregion
