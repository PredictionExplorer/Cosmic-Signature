// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

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

	/// @notice Represents a stake action for a token
	/// @dev Stores details about each staking event
	struct _StakeAction {
		/// @notice Index of this stake action in `StakingWalletRandomWalkNft.stakeActionIds`.
		/// @dev It can change zero or more times during the lifetime of the `_StakeAction` instance.
		uint256 index;

		uint256 nftId;
		address nftOwnerAddress;
		// // todo-0 Eliminate?
		// uint256 stakeTime;
		// // todo-0 Eliminate?
		// uint256 unstakeTime;
		// // todo-0 Eliminate?
		// mapping(uint256 => bool) depositClaimed;
	}

	// /// @notice Represents an ETH deposit for reward distribution
	// /// @dev Stores details about each ETH deposit event
	// /// todo-0 Eliminate?
	// struct _EthDeposit {
	// 	uint256 depositTime;
	// 	uint256 depositAmount;
	// 	uint256 numStaked;
	// }

	// #endregion
	// #region State

	/// @notice Reference to the RandomWalkNFT contract
	RandomWalkNFT public randomWalkNft;

	/// @notice todo-0 write comment
	mapping(uint256 stakeActionId => _StakeAction) public stakeActions;

	/// @notice This maps `_StakeAction.index` to `stakeActions` item key.
	/// @dev Issue. Ideally, item value should be a storage slot reference, like in the `unstake` function,
	/// the `stakeActionReference_` variable. It could be possible to implement that in assembly.
	mapping(uint256 stakeActionIndex => uint256 stakeActionId) public stakeActionIds;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param randomWalkNft_ Address of the RandomWalkNFT contract.
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
	///    `CosmicGameConstants.NftTypeCode`.
	///    `NftStaked`.
	///    `_numStakedNfts`.
	///    `_usedNfts`.
	///    `_actionCounter`.
	///    `_StakeAction`.
	///    `randomWalkNft`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	function stake(uint256 nftId_) public override(IStakingWalletNftBase, StakingWalletNftBase) {
		// #region

		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		// #endregion
		// #region

		require(
			( ! _usedNfts[nftId_] ),
			CosmicGameErrors.NftOneTimeStaking("This NFT has already been staked. An NFT is allowed to be staked only once.", nftId_)
		);

		// #endregion
		// #region

		uint256 newStakeActionId_ = _actionCounter + 1;
		_actionCounter = newStakeActionId_;
		_StakeAction storage newStakeActionReference_ = stakeActions[newStakeActionId_];
		newStakeActionReference_.nftId = nftId_;
		newStakeActionReference_.nftOwnerAddress = msg.sender;
		uint256 newStakeActionIndex_ = _numStakedNfts;
		newStakeActionReference_.index = newStakeActionIndex_;
		stakeActionIds[newStakeActionIndex_] = newStakeActionId_;
		uint256 newNumStakedNfts_ = newStakeActionIndex_ + 1;
		_numStakedNfts = newNumStakedNfts_;
		_usedNfts[nftId_] = true;
		randomWalkNft.transferFrom(msg.sender, address(this), nftId_);
		emit NftStaked(newStakeActionId_, CosmicGameConstants.NftTypeCode.RandomWalk, nftId_, msg.sender, newNumStakedNfts_);

		// #endregion
		// #region

		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ + 1);
		// #enable_asserts assert(_usedNfts[nftId_]);
		// #enable_asserts assert(_actionCounter > 0);
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
	///    `_StakeAction`.
	///    `randomWalkNft`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	function unstake(uint256 stakeActionId_) public override {
		// #region

		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		// #endregion
		// #region

		_StakeAction storage stakeActionReference_ = stakeActions[stakeActionId_];
		_StakeAction memory stakeActionCopy_ = stakeActionReference_;

		// #endregion
		// #region

		if (msg.sender != stakeActionCopy_.nftOwnerAddress) {
			if (stakeActionCopy_.nftOwnerAddress != address(0)) {
				// [Comment-202411024]
				// Similar logic exists in multiple places.
				// [/Comment-202411024]
				// #enable_asserts assert(stakeActionIds[stakeActions[stakeActionId_].index] == stakeActionId_);

				revert CosmicGameErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to unstake it.", stakeActionId_, msg.sender);
			} else {
				// Comment-202410182 applies.
				revert CosmicGameErrors.NftStakeActionInvalidId("Invalid NFT stake action ID.", stakeActionId_);
			}
		}

		// #endregion
		// #region

		// Comment-202411024 applies.
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
	///    `_numStakedNfts`. `assert` only.
	///    `unstake`.
	function unstakeMany(uint256[] calldata stakeActionIds_) external override {
		// #enable_asserts uint256 initialNumStakedNfts_ = _numStakedNfts;

		for ( uint256 stakeActionIdIndex_ = 0; stakeActionIdIndex_ < stakeActionIds_.length; ++ stakeActionIdIndex_ ) {
			unstake(stakeActionIds_[stakeActionIdIndex_]);
		}

		// #enable_asserts assert(_numStakedNfts == initialNumStakedNfts_ - stakeActionIds_.length);
	}

	// #endregion
	// #region //

	// function numStakedNfts() public view override returns (uint256) {
	// 	// #region Assertions
	// 	// todo-1 Given this equality, why do we need to store `_numStakedNfts` separately? To save gas?
	// 	// todo-1 At least explain this in a comment near `_numStakedNfts`.
	// 	// #enable_asserts assert(stakedTokens.length == _numStakedNfts);
	// 	// #endregion
	//
	// 	return stakedTokens.length;
	// }

	// function isTokenStaked(uint256 nftId) public view override returns (bool) {
	// 	return tokenIndices[nftId] != 0;
	// }

	// function lastActionIdByTokenId(uint256 nftId) public view override returns (int256) {
	// 	uint256 tokenIndex = tokenIndices[nftId];
	// 	if (tokenIndex == 0) {
	// 		return -2;
	// 	}
	// 	return lastActionIds[nftId];
	// }

	// function stakerByTokenId(uint256 nftId) public view override returns (address) {
	// 	int256 stakeActionId = lastActionIdByTokenId(nftId);
	// 	if (stakeActionId < 0) {
	// 		return address(0);
	// 	}
	// 	return stakeActions[uint256(stakeActionId)].owner;
	// }

	// #endregion
	// #region `pickRandomStakerIfPossible`

	/// @dev
	/// Observable universe entities accessed here:
	///    // `CosmicGameErrors.NoStakedNfts`.
	///    `_numStakedNfts`.
	///    `_StakeAction`.
	///    `stakeActions`.
	///    `stakeActionIds`.
	/// todo-1 Why is entropy `bytes32`? Can I make it `uint256`? The caller should cast it to `uint256`.
	function pickRandomStakerIfPossible(bytes32 entropy_) external view override returns (address) {
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
	// #region //

	// /// @notice Inserts a token into the staked tokens list
	// /// @dev Internal function to manage staked tokens
	// /// @param nftId ID of the token to insert
	// /// @param stakeActionId ID of the stake action
	// function _insertToken(uint256 nftId, uint256 stakeActionId) internal {
	// 	require(
	// 		!isTokenStaked(nftId),
	// 		CosmicGameErrors.TokenAlreadyInserted("NFT is already in the list.", nftId, stakeActionId)
	// 	);
	// 	stakedTokens.push(nftId);
	// 	tokenIndices[nftId] = stakedTokens.length;
	// 	lastActionIds[nftId] = int256(stakeActionId);
	//
	// 	// #region Assertions
	// 	// #enable_asserts assert(isTokenStaked(nftId));
	// 	// #enable_asserts assert(tokenIndices[nftId] == stakedTokens.length);
	// 	// #enable_asserts assert(lastActionIds[nftId] == int256(stakeActionId));
	// 	// #enable_asserts assert(stakedTokens[stakedTokens.length - 1] == nftId);
	// 	// #endregion
	// }

	// /// @notice Removes a token from the staked tokens list
	// /// @dev Internal function to manage staked tokens
	// /// @param nftId ID of the token to remove
	// function _removeToken(uint256 nftId) internal {
	// 	require(isTokenStaked(nftId), CosmicGameErrors.TokenAlreadyDeleted("NFT is not in the list.", nftId));
	// 	uint256 index = tokenIndices[nftId];
	// 	uint256 lastTokenId = stakedTokens[stakedTokens.length - 1];
	// 	stakedTokens[index - 1] = lastTokenId;
	// 	tokenIndices[lastTokenId] = index;
	// 	delete tokenIndices[nftId];
	// 	stakedTokens.pop();
	// 	lastActionIds[nftId] = -1;
	//
	// 	// #region Assertions
	// 	// #enable_asserts assert(!isTokenStaked(nftId));
	// 	// #enable_asserts assert(tokenIndices[nftId] == 0);
	// 	// #enable_asserts assert(lastActionIds[nftId] == -1);
	// 	// #endregion
	// }

	// #endregion
}

// #endregion
