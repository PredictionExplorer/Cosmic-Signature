// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

// import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { AddressValidator } from "./AddressValidator.sol";
import { IStakingWalletNftBase } from "./interfaces/IStakingWalletNftBase.sol";

// #endregion
// #region

abstract contract StakingWalletNftBase is AddressValidator, IStakingWalletNftBase {
	// #region State

	/// @notice The current staked NFT count.
	/// @dev
	/// [Comment-202412025]
	/// In `StakingWalletCosmicSignatureNft`, this is the number of `stakeActions` items containing a zero `maxUnpaidEthDepositIndex`.
	/// In `StakingWalletRandomWalkNft`, this is the total number of `stakeActions` and `stakeActionIds` items.
	/// [/Comment-202412025]
	/// [Comment-202410274]
	/// It could make sense to declare this `public`, but this is not because there is an accessor method for this.
	/// [/Comment-202410274]
	uint256 internal _numStakedNfts;

	/// @notice If an item of this array at a particular index is a nonzero it means
	/// a CosmicSignature or RandomWalk NFT with that ID has already been used for staking.
	/// @dev Idea. Item value should be an enum NftStakingStatusCode: NeverStaked, Staked, Unstaked.
	/// But it should be 256 bits long.
	/// Comment-202410274 applies.
	// CosmicSignatureConstants.BooleanWithPadding[1 << 64] internal _usedNfts;
	uint256[1 << 64] internal _usedNfts;

	/// @notice This is used to generate monotonic unique IDs.
	/// @dev Issue. I would prefer to declare this variable `internal` (and name it `_...`),
	/// but Nick is saying that he needs it to monitor contract activities.
	/// But the suitability of this variable for any purpose other than what the @notice says is purely accidential.
	/// Any refactoring can easily break things.
	/// todo-1 Talk to Nick again.
	uint256 public actionCounter;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @dev
	/// Observable universe entities accessed here:
	///    `_numStakedNfts`.
	///    `actionCounter`.
	constructor() {
		// #enable_asserts assert(_numStakedNfts == 0);
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
	///    `_numStakedNfts`.
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
	function numStakedNfts() external view override returns(uint256) {
		return _numStakedNfts;
	}

	// #endregion
	// #region `wasNftUsed`

	/// @dev
	/// Observable universe entities accessed here:
	///    // `CosmicSignatureConstants.BooleanWithPadding`.
	///    `_usedNfts`.
	function wasNftUsed(uint256 nftId_) external view override returns(/*bool*/ uint256) {
		// return _usedNfts[nftId_].value;
		return _usedNfts[nftId_];
	}

	// #endregion
}

// #endregion
