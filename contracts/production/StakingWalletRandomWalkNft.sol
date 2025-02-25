// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// #endregion
// #region

// import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
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
		/// @notice Index of this stake action in `StakingWalletRandomWalkNft.stakeActionIds`.
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

	/// @notice Info about currently staked NFTs.
	/// This array is sparse (can contain gaps).
	/// Item index corresponds to stake action ID.
	/// @dev Comment-202410117 applies to item index.
	StakeAction[1 << 64] public stakeActions;

	/// @notice An item contains a stake action ID.
	/// This array is not sparse (contains no gaps).
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
		// #enable_asserts assert(address(randomWalkNft) == address(randomWalkNft_));
	}

	// #endregion
	// #region `stake`

	/// @dev Comment-202411023 applies.
	/// Observable universe entities accessed here:
	///    `msg.sender`.
	///    `CosmicSignatureErrors.NftHasAlreadyBeenStaked`.
	///    // `CosmicSignatureConstants.BooleanWithPadding`.
	///    `NftTypeCode`.
	///    `NftStaked`.
	///    `_numStakedNfts`.
	///    `_usedNfts`.
	///    `actionCounter`.
	///    `StakeAction`.
	///    `randomWalkNft`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	function stake(uint256 nftId_) public override (IStakingWalletNftBase, StakingWalletNftBase) {
		// #region

		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		// #endregion
		// #region

		require(
			// ( ! _usedNfts[nftId_].value ),
			_usedNfts[nftId_] == 0,
			CosmicSignatureErrors.NftHasAlreadyBeenStaked("This NFT has already been staked in the past. An NFT is allowed to be staked only once.", nftId_)
		);

		// #endregion
		// #region

		// _usedNfts[nftId_] = CosmicSignatureConstants.BooleanWithPadding(true, 0);
		_usedNfts[nftId_] = 1;
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
		emit NftStaked(newStakeActionId_, NftTypeCode.RandomWalk, nftId_, msg.sender, newNumStakedNfts_);
		randomWalkNft.transferFrom(msg.sender, address(this), nftId_);

		// #endregion
		// #region

		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ + 1);
		// // #enable_asserts assert(_usedNfts[nftId_].value);
		// #enable_asserts assert(_usedNfts[nftId_] == 1);
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
	///    `CosmicSignatureErrors.NftStakeActionInvalidId`.
	///    `CosmicSignatureErrors.NftStakeActionAccessDenied`.
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
				revert CosmicSignatureErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to unstake it.", stakeActionId_, msg.sender);
			} else {
				// Comment-202410182 applies.
				revert CosmicSignatureErrors.NftStakeActionInvalidId("Invalid NFT stake action ID.", stakeActionId_);
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
		emit NftUnstaked(stakeActionId_, stakeActionCopy_.nftId, msg.sender, newNumStakedNfts_);
		randomWalkNft.transferFrom(address(this), msg.sender, stakeActionCopy_.nftId);

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
	// #region // `pickRandomStakerAddressIfPossible`

	// /// @dev
	// /// Observable universe entities accessed here:
	// ///    `_numStakedNfts`.
	// ///    `StakeAction`.
	// ///    `stakeActions`.
	// ///    `stakeActionIds`.
	// function pickRandomStakerAddressIfPossible(uint256 randomNumber_) external view override returns (address) {
	// 	uint256 numStakedNftsCopy_ = _numStakedNfts;
	//
	// 	if (numStakedNftsCopy_ == 0) {
	// 		return address(0);
	// 	}
	//
	// 	uint256 luckyStakeActionIndex_ = randomNumber_ % numStakedNftsCopy_;
	// 	uint256 luckyStakeActionId_ = stakeActionIds[luckyStakeActionIndex_];
	// 	// #enable_asserts assert(stakeActions[luckyStakeActionId_].index == luckyStakeActionIndex_);
	// 	address luckyStakerAddress_ = stakeActions[luckyStakeActionId_].nftOwnerAddress;
	// 	// #enable_asserts assert(luckyStakerAddress_ != address(0));
	// 	return luckyStakerAddress_;
	// }

	// #endregion
	// #region `pickRandomStakerAddressesIfPossible`

	/// @dev
	/// Observable universe entities accessed here:
	///    `RandomNumberHelpers.generateRandomNumber`.
	///    `_numStakedNfts`.
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
		uint256 numStakedNftsCopy_ = _numStakedNfts;
		if (numStakedNftsCopy_ > 0) {
			luckyStakerAddresses_ = new address[](numStakerAddresses_);
			for (uint256 luckyStakerIndex_ = numStakerAddresses_; luckyStakerIndex_ > 0; ) {
				unchecked { ++ randomNumberSeed_; }
				uint256 randomNumber_ = RandomNumberHelpers.generateRandomNumber(randomNumberSeed_);
				uint256 luckyStakeActionIndex_ = randomNumber_ % numStakedNftsCopy_;
				uint256 luckyStakeActionId_ = stakeActionIds[luckyStakeActionIndex_];
				// #enable_asserts assert(stakeActions[luckyStakeActionId_].index == luckyStakeActionIndex_);
				address luckyStakerAddress_ = stakeActions[luckyStakeActionId_].nftOwnerAddress;
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
