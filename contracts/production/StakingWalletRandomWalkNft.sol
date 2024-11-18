// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

// #endregion
// #region

import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { IStakingWalletNftBase } from "./interfaces/IStakingWalletNftBase.sol";
import { StakingWalletNftBase } from "./StakingWalletNftBase.sol";
import { IStakingWalletRandomWalkNft } from "./interfaces/IStakingWalletRandomWalkNft.sol";

// #endregion
// #region

contract StakingWalletRandomWalkNft is StakingWalletNftBase, IStakingWalletRandomWalkNft {
	// #region Data Types

	/// @notice Stores details about an NFT stake action.
	struct StakeAction {
		/// @notice Index of this stake action in `StakingWalletRandomWalkNft.stakeActionIds`.
		/// @dev It can change zero or more times during the lifetime of the `StakeAction` instance.
		uint256 index;

		uint256 nftId;
		address nftOwnerAddress;
	}

	// #endregion
	// #region State

	/// @notice The `RandomWalkNFT` contract address.
	RandomWalkNFT public randomWalkNft;

	/// @notice Info about currently staked NFTs.
	/// @dev Comment-202410117 applies to `stakeActionId`.
	// mapping(uint256 stakeActionId => StakeAction) public stakeActions;
	StakeAction[1 << 64] public stakeActions;

	/// @notice This maps `StakeAction.index` to `stakeActions` item key.
	// mapping(uint256 stakeActionIndex => uint256 stakeActionId) public stakeActionIds;
	uint256[1 << 64] public stakeActionIds;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param randomWalkNft_ The `RandomWalkNFT` contract address.
	/// @dev
	/// Observable universe entities accessed here:
	///    `CosmicGameErrors.ZeroAddress`.
	///    `StakingWalletNftBase.constructor`.
	///    `randomWalkNft`.
	constructor(RandomWalkNFT randomWalkNft_) {
		require(address(randomWalkNft_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for the randomWalkNft_."));
		randomWalkNft = randomWalkNft_;
		// #enable_asserts assert(address(randomWalkNft) == address(randomWalkNft_));
	}

	// #endregion
	// #region `stake`

	/// @dev Comment-202411023 applies.
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `CosmicGameErrors.NftOneTimeStaking`.
	///    `CosmicGameConstants.BooleanWithPadding`.
	///    `CosmicGameConstants.NftTypeCode`.
	///    `NftStaked`.
	///    `_numStakedNfts`.
	///    `_usedNfts`.
	///    `actionCounter`.
	///    `StakeAction`.
	///    `randomWalkNft`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	function stake(uint256 nftId_) public override(IStakingWalletNftBase, StakingWalletNftBase) {
		// #region

		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		// #endregion
		// #region

		require(
			( ! _usedNfts[nftId_].value ),
			CosmicGameErrors.NftOneTimeStaking("This NFT has already been staked. An NFT is allowed to be staked only once.", nftId_)
		);

		// #endregion
		// #region

		uint256 newActionCounter_ = actionCounter + 1;
		actionCounter = newActionCounter_;
		uint256 newStakeActionId_ = newActionCounter_;
		StakeAction storage newStakeActionReference_ = stakeActions[newStakeActionId_];
		newStakeActionReference_.nftId = nftId_;
		newStakeActionReference_.nftOwnerAddress = msg.sender;
		uint256 newStakeActionIndex_ = _numStakedNfts;
		newStakeActionReference_.index = newStakeActionIndex_;
		stakeActionIds[newStakeActionIndex_] = newStakeActionId_;
		uint256 newNumStakedNfts_ = newStakeActionIndex_ + 1;
		_numStakedNfts = newNumStakedNfts_;
		_usedNfts[nftId_] = CosmicGameConstants.BooleanWithPadding(true, 0);
		randomWalkNft.transferFrom(msg.sender, address(this), nftId_);
		emit NftStaked(newStakeActionId_, CosmicGameConstants.NftTypeCode.RandomWalk, nftId_, msg.sender, newNumStakedNfts_);

		// #endregion
		// #region

		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ + 1);
		// #enable_asserts assert(_usedNfts[nftId_].value);
		// #enable_asserts assert(actionCounter > 0);
		// #enable_asserts assert(randomWalkNft.ownerOf(nftId_) == address(this));
		// #enable_asserts assert(stakeActions[newStakeActionId_].index == _numStakedNfts - 1);
		// #enable_asserts assert(stakeActions[newStakeActionId_].nftId == nftId_);
		// #enable_asserts assert(stakeActions[newStakeActionId_].nftOwnerAddress == msg.sender);
		// #enable_asserts assert(stakeActionIds[_numStakedNfts - 1] == newStakeActionId_);

		// #endregion
	}

	// #endregion
	// #region `unstake`

	/// @dev
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `CosmicGameErrors.NftStakeActionInvalidId`.
	///    `CosmicGameErrors.NftStakeActionAccessDenied`.
	///    `_numStakedNfts`.
	///    `NftUnstaked`.
	///    `StakeAction`.
	///    `randomWalkNft`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	function unstake(uint256 stakeActionId_) public override {
		// #region

		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		// #endregion
		// #region

		StakeAction storage stakeActionReference_ = stakeActions[stakeActionId_];
		StakeAction memory stakeActionCopy_ = stakeActionReference_;

		// #endregion
		// #region

		if (msg.sender != stakeActionCopy_.nftOwnerAddress) {
			if (stakeActionCopy_.nftOwnerAddress != address(0)) {
				// #enable_asserts assert(stakeActionIds[stakeActions[stakeActionId_].index] == stakeActionId_);
				revert CosmicGameErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to unstake it.", stakeActionId_, msg.sender);
			} else {
				// Comment-202410182 applies.
				revert CosmicGameErrors.NftStakeActionInvalidId("Invalid NFT stake action ID.", stakeActionId_);
			}
		}

		// #endregion
		// #region

		// #enable_asserts assert(stakeActionIds[stakeActions[stakeActionId_].index] == stakeActionId_);

		// #endregion
		// #region

		uint256 newNumStakedNfts_ = _numStakedNfts - 1;
		_numStakedNfts = newNumStakedNfts_;
		uint256 lastStakeActionId = stakeActionIds[newNumStakedNfts_];
		stakeActions[lastStakeActionId].index = stakeActionCopy_.index;
		delete stakeActionReference_.index;
		delete stakeActionReference_.nftId;
		delete stakeActionReference_.nftOwnerAddress;
		stakeActionIds[stakeActionCopy_.index] = lastStakeActionId;
		delete stakeActionIds[newNumStakedNfts_];
		randomWalkNft.transferFrom(address(this), msg.sender, stakeActionCopy_.nftId);
		emit NftUnstaked(stakeActionId_, stakeActionCopy_.nftId, msg.sender, newNumStakedNfts_);

		// #endregion
		// #region

		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ - 1);
		// #enable_asserts assert(randomWalkNft.ownerOf(stakeActionCopy_.nftId) == msg.sender);
		// #enable_asserts assert(stakeActions[stakeActionId_].index == 0);
		// #enable_asserts assert(stakeActions[stakeActionId_].nftId == 0);
		// #enable_asserts assert(stakeActions[stakeActionId_].nftOwnerAddress == address(0));
		// #enable_asserts assert(stakeActionIds[_numStakedNfts] == 0);

		// #endregion
	}

	// #endregion
	// #region `unstakeMany`

	/// @dev
	/// Observable universe entities accessed here:
	///    `_numStakedNfts`.
	///    `unstake`.
	function unstakeMany(uint256[] calldata stakeActionIds_) external override {
		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		for ( uint256 stakeActionIdIndex_ = 0; stakeActionIdIndex_ < stakeActionIds_.length; ++ stakeActionIdIndex_ ) {
			unstake(stakeActionIds_[stakeActionIdIndex_]);
		}

		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ - stakeActionIds_.length);
	}

	// #endregion
	// #region `pickRandomStakerAddressIfPossible`

	/// @dev
	/// Observable universe entities accessed here:
	///    // `CosmicGameErrors.NoStakedNfts`.
	///    `_numStakedNfts`.
	///    `StakeAction`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	/// todo-1 Why is entropy `bytes32`? Can I make it `uint256`? The caller should cast it to `uint256`.
	function pickRandomStakerAddressIfPossible(bytes32 entropy_) external view override returns(address) {
		uint256 numStakedNftsCopy_ = _numStakedNfts;

		// require(numStakedNftsCopy_ > 0, CosmicGameErrors.NoStakedNfts("There are no staked NFTs."));
		if (numStakedNftsCopy_ == 0) {
			return address(0);
		}

		uint256 luckyStakeActionIndex_ = uint256(entropy_) % numStakedNftsCopy_;
		uint256 luckyStakeActionId_ = stakeActionIds[luckyStakeActionIndex_];
		// #enable_asserts assert(stakeActions[luckyStakeActionId_].index == luckyStakeActionIndex_);
		address luckyStakerAddress_ = stakeActions[luckyStakeActionId_].nftOwnerAddress;
		// #enable_asserts assert(luckyStakerAddress_ != address(0));
		return luckyStakerAddress_;
	}

	// #endregion
}

// #endregion
