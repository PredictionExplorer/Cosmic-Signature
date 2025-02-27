// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { RandomNumberHelpers } from "./libraries/RandomNumberHelpers.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { IStakingWalletNftBase, StakingWalletNftBase } from "./StakingWalletNftBase.sol";
import { IStakingWalletRandomWalkNft } from "./interfaces/IStakingWalletRandomWalkNft.sol";

// #endregion
// #region

contract StakingWalletRandomWalkNft is StakingWalletNftBase, IStakingWalletRandomWalkNft {
	// #region Data Types

	/// @notice Stores details about an NFT stake action.
	struct StakeAction {
		/// @notice
		/// [Comment-202502271]
		/// Index of this stake action in `StakingWalletRandomWalkNft.stakeActionIds`.
		/// [/Comment-202502271]
		/// @dev It can change zero or more times during the lifetime of the `StakeAction` instance.
		uint256 index;

		uint256 nftId;
		/// todo-1 ??? Reorder this to before `nftId`.
		address nftOwnerAddress;
	}

	// #endregion
	// #region State

	/// @notice The `RandomWalkNFT` contract address.
	RandomWalkNFT public immutable randomWalkNft;

	/// @notice Details about currently staked NFTs.
	/// Item index corresponds to stake action ID.
	/// Comment-202502266 relates.
	/// Unlike `stakeActionIds`, this array is sparse (can contain gaps).
	/// `numStakedNfts` counts only populated items.
	/// @dev Comment-202410117 applies to item index.
	StakeAction[1 << 64] public stakeActions;

	/// @notice An item contains a stake action ID.
	/// Comment-202502266 relates.
	/// Comment-202502271 relates.
	/// Unlike `stakeActions`, this array is not sparse (contains no gaps).
	/// [Comment-202502261]
	/// This array can contain undeleted garbage beyond `numStakedNfts` items.
	/// [/Comment-202502261]
	uint256[1 << 64] public stakeActionIds;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param randomWalkNft_ The `RandomWalkNFT` contract address.
	/// @dev
	/// Observable universe entities accessed here:
	///    `_providedAddressIsNonZero`.
	///    `StakingWalletNftBase.constructor`.
	///    `randomWalkNft`.
	constructor(RandomWalkNFT randomWalkNft_) _providedAddressIsNonZero(address(randomWalkNft_)) {
		randomWalkNft = randomWalkNft_;
		// #enable_asserts assert(randomWalkNft == randomWalkNft_);
	}

	// #endregion
	// #region `stake`

	/// @dev Comment-202411023 applies.
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `CosmicSignatureErrors.NftHasAlreadyBeenStaked`.
	///    `NftTypeCode`.
	///    `NftStaked`.
	///    `numStakedNfts`.
	///    `usedNfts`.
	///    `actionCounter`.
	///    `StakeAction`.
	///    `randomWalkNft`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	function stake(uint256 nftId_) public override (IStakingWalletNftBase, StakingWalletNftBase) {
		// #region

		// #enable_asserts uint256 initialNumStakedNfts_ = numStakedNfts;

		// #endregion
		// #region

		require(
			usedNfts[nftId_] == 0,
			CosmicSignatureErrors.NftHasAlreadyBeenStaked("This NFT has already been staked in the past. An NFT is allowed to be staked only once.", nftId_)
		);

		// #endregion
		// #region

		usedNfts[nftId_] = 1;
		uint256 newActionCounter_ = actionCounter + 1;
		actionCounter = newActionCounter_;
		uint256 newStakeActionId_ = newActionCounter_;
		StakeAction storage newStakeActionReference_ = stakeActions[newStakeActionId_];
		newStakeActionReference_.nftId = nftId_;
		newStakeActionReference_.nftOwnerAddress = msg.sender;
		uint256 newStakeActionIndex_ = numStakedNfts;
		newStakeActionReference_.index = newStakeActionIndex_;

		// It's possible that this item is already populated because we didn't delete it near Comment-202502263.
		// We are now overwriting it.
		stakeActionIds[newStakeActionIndex_] = newStakeActionId_;

		uint256 newNumStakedNfts_ = newStakeActionIndex_ + 1;
		numStakedNfts = newNumStakedNfts_;
		emit NftStaked(newStakeActionId_, NftTypeCode.RandomWalk, nftId_, msg.sender, newNumStakedNfts_);
		randomWalkNft.transferFrom(msg.sender, address(this), nftId_);

		// #endregion
		// #region

		// #enable_asserts assert(numStakedNfts == initialNumStakedNfts_ + 1);
		// #enable_asserts assert(usedNfts[nftId_] == 1);
		// #enable_asserts assert(actionCounter > 0);
		// #enable_asserts assert(randomWalkNft.ownerOf(nftId_) == address(this));
		// #enable_asserts assert(stakeActions[newStakeActionId_].index == numStakedNfts - 1);
		// #enable_asserts assert(stakeActions[newStakeActionId_].nftId == nftId_);
		// #enable_asserts assert(stakeActions[newStakeActionId_].nftOwnerAddress == msg.sender);
		// #enable_asserts assert(stakeActionIds[numStakedNfts - 1] == newStakeActionId_);

		// #endregion
	}

	// #endregion
	// #region `unstake`

	/// @dev
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `CosmicSignatureErrors.NftStakeActionInvalidId`.
	///    `CosmicSignatureErrors.NftStakeActionAccessDenied`.
	///    `numStakedNfts`.
	///    `NftUnstaked`.
	///    `StakeAction`.
	///    `randomWalkNft`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	function unstake(uint256 stakeActionId_) public override {
		// #region

		// #enable_asserts uint256 initialNumStakedNfts_ = numStakedNfts;

		// #endregion
		// #region

		StakeAction storage stakeActionReference_ = stakeActions[stakeActionId_];
		StakeAction memory stakeActionCopy_ = stakeActionReference_;

		// #endregion
		// #region

		if (msg.sender != stakeActionCopy_.nftOwnerAddress) {
			if (stakeActionCopy_.nftOwnerAddress == address(0)) {
				// [Comment-202410182]
				// One might want to implement logic that investigates whether this stake action existed and then was deleted
				// or never existed, and then provide a more accurate error type and description.
				// But it's really either impossible or unnecessary to implement that kind of logic.
				// [/Comment-202410182]
				revert CosmicSignatureErrors.NftStakeActionInvalidId("Invalid NFT stake action ID.", stakeActionId_);
			} else {
				// #enable_asserts assert(stakeActionIds[stakeActions[stakeActionId_].index] == stakeActionId_);
				revert CosmicSignatureErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to unstake it.", stakeActionId_, msg.sender);
			}
		}

		// #enable_asserts assert(stakeActionIds[stakeActions[stakeActionId_].index] == stakeActionId_);

		// #endregion
		// #region

		uint256 newNumStakedNfts_ = numStakedNfts - 1;
		numStakedNfts = newNumStakedNfts_;

		// Nothing would be broken if this happens to be equal `stakeActionId_`,
		// meaning we are unstaking the stake action that is the last in `stakeActionIds`.
		uint256 lastStakeActionId_ = stakeActionIds[newNumStakedNfts_];

		stakeActions[lastStakeActionId_].index = stakeActionCopy_.index;
		delete stakeActionReference_.index;
		delete stakeActionReference_.nftId;
		delete stakeActionReference_.nftOwnerAddress;
		stakeActionIds[stakeActionCopy_.index] = lastStakeActionId_;

		// // [Comment-202502263]
		// // This is unnecessary. Therefore Comment-202502261.
		// // [/Comment-202502263]
		// delete stakeActionIds[newNumStakedNfts_];

		emit NftUnstaked(stakeActionId_, stakeActionCopy_.nftId, msg.sender, newNumStakedNfts_);
		randomWalkNft.transferFrom(address(this), msg.sender, stakeActionCopy_.nftId);

		// #endregion
		// #region

		// #enable_asserts assert(numStakedNfts == initialNumStakedNfts_ - 1);
		// #enable_asserts assert(randomWalkNft.ownerOf(stakeActionCopy_.nftId) == msg.sender);
		// #enable_asserts assert(stakeActions[stakeActionId_].index == 0);
		// #enable_asserts assert(stakeActions[stakeActionId_].nftId == 0);
		// #enable_asserts assert(stakeActions[stakeActionId_].nftOwnerAddress == address(0));

		// // This is no longer the case because I eliminated this item deletion near Comment-202502263.
		// // #enable_asserts assert(stakeActionIds[numStakedNfts] == 0);

		// #endregion
	}

	// #endregion
	// #region `unstakeMany`

	/// @dev
	/// Observable universe entities accessed here:
	///    `numStakedNfts`.
	///    `unstake`.
	function unstakeMany(uint256[] calldata stakeActionIds_) external override {
		// #enable_asserts uint256 initialNumStakedNfts_ = numStakedNfts;

		// Comment-202502265 applies.
		for ( uint256 stakeActionIdIndex_ = 0; stakeActionIdIndex_ < stakeActionIds_.length; ++ stakeActionIdIndex_ ) {

			unstake(stakeActionIds_[stakeActionIdIndex_]);
		}

		// #enable_asserts assert(numStakedNfts == initialNumStakedNfts_ - stakeActionIds_.length);
	}

	// #endregion
	// #region `pickRandomStakerAddressesIfPossible`

	/// @dev
	/// Observable universe entities accessed here:
	///    `RandomNumberHelpers.generateRandomNumber`.
	///    `numStakedNfts`.
	///    `StakeAction`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	///
	/// todo-1 Review all `IfPossible` and `IfNeeded` methods and maybe rename some to `try`.
	/// todo-1 function\b.+?IfPossible
	/// todo-1 function\b.+?IfNeeded
	/// todo-1 Jan 26: I am happy, but take another look.
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
