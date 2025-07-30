// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

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
		uint256 nftId;

		/// @dev Comment-202504011 applies.
		address nftOwnerAddress;

		/// @notice
		/// [Comment-202502271]
		/// Index of this `StakeAction` instance in `StakingWalletRandomWalkNft.stakeActionIds`.
		/// [/Comment-202502271]
		/// @dev It can change zero or more times over the `StakeAction` instance lifetime.
		uint256 index;
	}

	// #endregion
	// #region State

	/// @notice The `RandomWalkNFT` contract address.
	RandomWalkNFT public immutable randomWalkNft;

	/// @notice Details about currently staked NFTs.
	/// Item index corresponds to stake action ID.
	/// Comment-202502266 relates.
	/// Unlike `stakeActionIds`, this array is sparse (can contain gaps).
	StakeAction[1 << 64] public stakeActions;

	/// @notice An item contains a stake action ID.
	/// Comment-202502271 relates.
	/// Comment-202502266 relates.
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
	///    Inherited `constructor`s.
	///    `_providedAddressIsNonZero`.
	///    `randomWalkNft`.
	constructor(RandomWalkNFT randomWalkNft_) _providedAddressIsNonZero(address(randomWalkNft_)) {
		randomWalkNft = randomWalkNft_;
	}

	// #endregion
	// #region `stake`

	/// @dev
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `numStakedNfts`.
	///    `actionCounter`.
	///    `super.stake`.
	///    `NftStaked`.
	///    `StakeAction`.
	///    `randomWalkNft`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	function stake(uint256 nftId_) public override (IStakingWalletNftBase, StakingWalletNftBase) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b40000, 1037618708916) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b40001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b40005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b46000, nftId_) }
		super.stake(nftId_);
		uint256 newActionCounter_ = actionCounter + 1;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000120,newActionCounter_)}
		actionCounter = newActionCounter_;
		uint256 newStakeActionId_ = newActionCounter_;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000121,newStakeActionId_)}
		StakeAction storage newStakeActionReference_ = stakeActions[newStakeActionId_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00010122,0)}
		// #enable_asserts assert(newStakeActionReference_.nftId == 0);
		newStakeActionReference_.nftId = nftId_;uint256 certora_local300 = newStakeActionReference_.nftId;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0000012c,certora_local300)}
		// #enable_asserts assert(newStakeActionReference_.nftOwnerAddress == address(0));
		newStakeActionReference_.nftOwnerAddress = msg.sender;address certora_local301 = newStakeActionReference_.nftOwnerAddress;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0000012d,certora_local301)}
		uint256 newNumStakedNfts_ = numStakedNfts;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000123,newNumStakedNfts_)}
		uint256 newStakeActionIndex_ = newNumStakedNfts_;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000124,newStakeActionIndex_)}
		// #enable_asserts assert(newStakeActionReference_.index == 0);
		newStakeActionReference_.index = newStakeActionIndex_;uint256 certora_local302 = newStakeActionReference_.index;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0000012e,certora_local302)}

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

	/// @dev
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
	function unstake(uint256 stakeActionId_) public override {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b50000, 1037618708917) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b50001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b50005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01b56000, stakeActionId_) }
		// #region

		StakeAction storage stakeActionReference_ = stakeActions[stakeActionId_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00010125,0)}
		StakeAction memory stakeActionCopy_ = stakeActionReference_;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00010126,0)}

		// #endregion
		// #region

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
		// #region

		delete stakeActionReference_.nftId;
		delete stakeActionReference_.nftOwnerAddress;
		uint256 newNumStakedNfts_ = numStakedNfts - 1;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000127,newNumStakedNfts_)}
		numStakedNfts = newNumStakedNfts_;

		// Nothing would be broken if this happens to be equal `stakeActionId_`,
		// meaning we are unstaking the stake action that is the last in `stakeActionIds`.
		uint256 lastStakeActionId_ = stakeActionIds[newNumStakedNfts_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000128,lastStakeActionId_)}

		stakeActions[lastStakeActionId_].index = stakeActionCopy_.index;
		delete stakeActionReference_.index;
		stakeActionIds[stakeActionCopy_.index] = lastStakeActionId_;

		// // [Comment-202502263]
		// // This is unnecessary. Therefore Comment-202502261.
		// // [/Comment-202502263]
		// delete stakeActionIds[newNumStakedNfts_];

		uint256 newActionCounter_ = actionCounter + 1;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000129,newActionCounter_)}
		actionCounter = newActionCounter_;
		emit NftUnstaked(newActionCounter_, stakeActionId_, stakeActionCopy_.nftId, msg.sender, newNumStakedNfts_);

		// Comment-202501145 applies.
		randomWalkNft.transferFrom(address(this), msg.sender, stakeActionCopy_.nftId);

		// #endregion
	}

	// #endregion
	// #region `unstakeMany`

	/// @dev
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

	/// @dev
	/// Observable universe entities accessed here:
	///    `RandomNumberHelpers.generateRandomNumber`.
	///    `numStakedNfts`.
	///    `StakeAction`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	///
	/// todo-1 +++ Review all `IfPossible` and `IfNeeded` methods and maybe rename some to `try`.
	/// todo-1 +++ function\b.+?IfPossible
	/// todo-1 +++ function\b.+?IfNeeded
	/// todo-1 +++ Jan 26: I am happy.
	function pickRandomStakerAddressesIfPossible(uint256 numStakerAddresses_, uint256 randomNumberSeed_) external view override returns (address[] memory) {
		address[] memory luckyStakerAddresses_;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0001012a,0)}
		uint256 numStakedNftsCopy_ = numStakedNfts;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0000012b,numStakedNftsCopy_)}
		if (numStakedNftsCopy_ > 0) {
			luckyStakerAddresses_ = new address[](numStakerAddresses_);
			for (uint256 luckyStakerIndex_ = numStakerAddresses_; luckyStakerIndex_ > 0; ) {
				unchecked { ++ randomNumberSeed_; }
				uint256 randomNumber_ = RandomNumberHelpers.generateRandomNumber(randomNumberSeed_);assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff0000012f,randomNumber_)}
				uint256 luckyStakeActionIndex_ = randomNumber_ % numStakedNftsCopy_;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000130,luckyStakeActionIndex_)}
				uint256 luckyStakeActionId_ = stakeActionIds[luckyStakeActionIndex_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000131,luckyStakeActionId_)}
				StakeAction storage luckyStakeActionReference_ = stakeActions[luckyStakeActionId_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00010132,0)}
				// #enable_asserts assert(luckyStakeActionReference_.index == luckyStakeActionIndex_);
				address luckyStakerAddress_ = luckyStakeActionReference_.nftOwnerAddress;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000133,luckyStakerAddress_)}
				// #enable_asserts assert(luckyStakerAddress_ != address(0));
				-- luckyStakerIndex_;
				luckyStakerAddresses_[luckyStakerIndex_] = luckyStakerAddress_;address certora_local308 = luckyStakerAddresses_[luckyStakerIndex_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff00000134,certora_local308)}
			}
		}
		return luckyStakerAddresses_;
	}

	// #endregion
}

// #endregion
