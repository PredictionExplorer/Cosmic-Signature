// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

// #endregion
// #region

import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { RandomNumberHelpers } from "./libraries/RandomNumberHelpers.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { StakingWalletNftBase } from "./StakingWalletNftBase.sol";
import { IStakingWalletRandomWalkNft } from "./interfaces/IStakingWalletRandomWalkNft.sol";

// #endregion
// #region

/// @title Staking Wallet for Random Walk NFTs.
/// @author The Cosmic Signature Development Team.
/// @notice Allows users to stake Random Walk NFTs for random prize eligibility.
/// @dev Staked NFTs can be randomly selected to receive Cosmic Signature NFT prizes at the end of bidding rounds.
/// This contract maintains a compact array of stake action IDs to enable efficient random selection.
/// Each NFT can only be staked once in its lifetime to ensure fair distribution of prizes.
contract StakingWalletRandomWalkNft is StakingWalletNftBase, IStakingWalletRandomWalkNft {
	// #region Data Types

	/// @notice Stores details about an NFT stake action.
	/// @dev Used to track ownership and array position of each staked NFT.
	struct StakeAction {
		/// @notice The ID of the staked NFT.
		uint256 nftId;

		/// @notice Address of the NFT owner who staked it.
		/// @dev Comment-202504011 applies.
		address nftOwnerAddress;

		/// @notice Current index of this `StakeAction` in the `stakeActionIds` array.
		/// @dev
		/// [Comment-202502271]
		/// Index of this `StakeAction` instance in `StakingWalletRandomWalkNft.stakeActionIds`.
		/// [/Comment-202502271]
		/// This index can change during the `StakeAction` lifetime when other NFTs are unstaked
		/// and this stake action is moved to fill the gap (swap-and-pop pattern).
		uint256 index;
	}

	// #endregion
	// #region State

	/// @notice The `RandomWalkNFT` contract address.
	RandomWalkNFT public immutable randomWalkNft;

	/// @notice Maps stake action IDs to stake action details.
	/// @dev Item index corresponds to stake action ID.
	/// Comment-202502266 relates.
	/// Unlike `stakeActionIds`, this array is sparse (can contain gaps after unstaking).
	StakeAction[1 << 64] public stakeActions;

	/// @notice Compact array of stake action IDs for efficient random selection.
	/// @dev Each item contains a stake action ID.
	/// Comment-202502271 relates.
	/// Comment-202502266 relates.
	/// Unlike `stakeActions`, this array is not sparse (contains no gaps).
	/// [Comment-202502261]
	/// This array can contain undeleted garbage beyond `numStakedNfts` items.
	/// [/Comment-202502261]
	uint256[1 << 64] public stakeActionIds;

	// #endregion
	// #region `constructor`

	/// @notice Initializes the staking wallet with the Random Walk NFT contract address.
	/// @param randomWalkNft_ The `RandomWalkNFT` contract address.
	/// @dev
	/// Observable universe entities accessed here:
	///    Inherited `constructor`s.
	///    `_providedAddressIsNonZero`.
	///    `randomWalkNft`.
	constructor(RandomWalkNFT randomWalkNft_) _providedAddressIsNonZero(address(randomWalkNft_)) {
		randomWalkNft = randomWalkNft_;
	}

	// #endregion
	// #region `_stake`

	/// @notice Internal implementation to stake a Random Walk NFT.
	/// @param nftId_ The ID of the NFT to stake.
	/// @dev Creates a new stake action, records it in both data structures, and transfers the NFT.
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `numStakedNfts`.
	///    `actionCounter`.
	///    `super._stake`.
	///    `NftStaked`.
	///    `StakeAction`.
	///    `randomWalkNft`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	function _stake(uint256 nftId_) internal override {
		super._stake(nftId_);
		uint256 newActionCounter_ = actionCounter + 1;
		actionCounter = newActionCounter_;
		uint256 newStakeActionId_ = newActionCounter_;
		StakeAction storage newStakeActionReference_ = stakeActions[newStakeActionId_];
		// #enable_asserts assert(newStakeActionReference_.nftId == 0);
		newStakeActionReference_.nftId = nftId_;
		// #enable_asserts assert(newStakeActionReference_.nftOwnerAddress == address(0));
		newStakeActionReference_.nftOwnerAddress = msg.sender;
		uint256 newNumStakedNfts_ = numStakedNfts;
		uint256 newStakeActionIndex_ = newNumStakedNfts_;
		// #enable_asserts assert(newStakeActionReference_.index == 0);
		newStakeActionReference_.index = newStakeActionIndex_;

		// It's possible that this item is already populated because we didn't delete it near Comment-202502263.
		// We are now overwriting it.
		stakeActionIds[newStakeActionIndex_] = newStakeActionId_;

		++ newNumStakedNfts_;
		numStakedNfts = newNumStakedNfts_;
		emit NftStaked(newStakeActionId_, nftId_, msg.sender, newNumStakedNfts_);

		// [Comment-202501145]
		// Somewhere around here or in the caller method
		// it could make sense to use the feature Comment-202501144 is talking about.
		// [/Comment-202501145]
		randomWalkNft.transferFrom(msg.sender, address(this), nftId_);
	}

	// #endregion
	// #region `unstake`

	/// @inheritdoc IStakingWalletRandomWalkNft
	/// @dev Uses swap-and-pop pattern to maintain a compact `stakeActionIds` array without gaps.
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `CosmicSignatureErrors.NftStakeActionInvalidId`.
	///    `CosmicSignatureErrors.NftStakeActionAccessDenied`.
	///    `numStakedNfts`.
	///    `actionCounter`.
	///    `NftUnstaked`.
	///    `StakeAction`.
	///    `randomWalkNft`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	function unstake(uint256 stakeActionId_) public override {
		// #region

		StakeAction storage stakeActionReference_ = stakeActions[stakeActionId_];
		StakeAction memory stakeActionCopy_ = stakeActionReference_;

		// #endregion
		// #region Validate caller is the NFT owner

		if (msg.sender != stakeActionCopy_.nftOwnerAddress) {
			if (stakeActionCopy_.nftOwnerAddress == address(0)) {
				revert CosmicSignatureErrors.NftStakeActionInvalidId("Invalid NFT stake action ID.", stakeActionId_);
			} else {
				// #enable_asserts assert(stakeActionIds[stakeActions[stakeActionId_].index] == stakeActionId_);
				revert CosmicSignatureErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to unstake it.", stakeActionId_, msg.sender);
			}
		}
		// #enable_asserts assert(stakeActionIds[stakeActions[stakeActionId_].index] == stakeActionId_);

		// #endregion
		// #region Update state using swap-and-pop pattern

		delete stakeActionReference_.nftId;
		delete stakeActionReference_.nftOwnerAddress;
		uint256 newNumStakedNfts_ = numStakedNfts - 1;
		numStakedNfts = newNumStakedNfts_;

		// Nothing would be broken if this happens to be equal `stakeActionId_`,
		// meaning we are unstaking the stake action that is the last in `stakeActionIds`.
		uint256 lastStakeActionId_ = stakeActionIds[newNumStakedNfts_];

		stakeActions[lastStakeActionId_].index = stakeActionCopy_.index;
		delete stakeActionReference_.index;
		stakeActionIds[stakeActionCopy_.index] = lastStakeActionId_;

		// [Comment-202502263]
		// Deleting the last element is unnecessary for correctness because we track `numStakedNfts`.
		// Therefore Comment-202502261.
		// [/Comment-202502263]

		uint256 newActionCounter_ = actionCounter + 1;
		actionCounter = newActionCounter_;
		emit NftUnstaked(newActionCounter_, stakeActionId_, stakeActionCopy_.nftId, msg.sender, newNumStakedNfts_);

		// Comment-202501145 applies.
		randomWalkNft.transferFrom(address(this), msg.sender, stakeActionCopy_.nftId);

		// #endregion
	}

	// #endregion
	// #region `unstakeMany`

	/// @inheritdoc IStakingWalletRandomWalkNft
	/// @dev Iterates in reverse order for gas optimization.
	/// Observable universe entities accessed here:
	///    `unstake`.
	function unstakeMany(uint256[] calldata stakeActionIds_) external override {
		for (uint256 stakeActionIdIndex_ = stakeActionIds_.length; stakeActionIdIndex_ > 0; ) {
			-- stakeActionIdIndex_;
			unstake(stakeActionIds_[stakeActionIdIndex_]);
		}
	}

	// #endregion
	// #region `pickRandomStakerAddressesIfPossible`

	/// @inheritdoc IStakingWalletRandomWalkNft
	/// @dev Uses on-chain randomness to select stakers. The compact `stakeActionIds` array
	/// enables O(1) random access for efficient random selection.
	/// Observable universe entities accessed here:
	///    `RandomNumberHelpers.generateRandomNumber`.
	///    `numStakedNfts`.
	///    `StakeAction`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	function pickRandomStakerAddressesIfPossible(uint256 numStakerAddresses_, uint256 randomNumberSeed_) external view override returns (address[] memory) {
		address[] memory luckyStakerAddresses_;
		uint256 numStakedNftsCopy_ = numStakedNfts;
		if (numStakedNftsCopy_ > 0) {
			luckyStakerAddresses_ = new address[](numStakerAddresses_);
			for (uint256 luckyStakerIndex_ = numStakerAddresses_; luckyStakerIndex_ > 0; ) {
				unchecked { ++ randomNumberSeed_; }
				uint256 randomNumber_ = RandomNumberHelpers.generateRandomNumber(randomNumberSeed_);
				uint256 luckyStakeActionIndex_ = randomNumber_ % numStakedNftsCopy_;
				uint256 luckyStakeActionId_ = stakeActionIds[luckyStakeActionIndex_];
				StakeAction storage luckyStakeActionReference_ = stakeActions[luckyStakeActionId_];
				// #enable_asserts assert(luckyStakeActionReference_.index == luckyStakeActionIndex_);
				address luckyStakerAddress_ = luckyStakeActionReference_.nftOwnerAddress;
				// #enable_asserts assert(luckyStakerAddress_ != address(0));
				-- luckyStakerIndex_;
				luckyStakerAddresses_[luckyStakerIndex_] = luckyStakerAddress_;
			}
		}
		return luckyStakerAddresses_;
	}

	// #endregion
}

// #endregion
