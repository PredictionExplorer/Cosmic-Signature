// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { IStakingWalletRWalk } from "./interfaces/IStakingWalletRWalk.sol";

/// todo-0 I have refactored `StakingWalletCST` and its interface. Do the same here.
/// todo-0 Nick is saying that both wallets should, ideally, reuse the functionality.
/// todo-0 Keep in mind that some functionality cannot be eliminated here.
contract StakingWalletRWalk is Ownable, IStakingWalletRWalk {
	// #region Data Types

	/// @notice Represents a stake action for a token
	/// @dev Stores details about each staking event
	struct _StakeAction {
		uint256 nftId;
		address owner;
		// todo-0 Eliminate?
		uint256 stakeTime;
		// todo-0 Eliminate?
		uint256 unstakeTime;
		// todo-0 Eliminate?
		mapping(uint256 => bool) depositClaimed;
	}

	/// @notice Represents an ETH deposit for reward distribution
	/// @dev Stores details about each ETH deposit event
	/// todo-0 Eliminate?
	struct _EthDeposit {
		uint256 depositTime;
		uint256 depositAmount;
		uint256 numStaked;
	}

	// #endregion
	// #region State

	/// @notice Reference to the RandomWalkNFT contract
	RandomWalkNFT public randomWalk;

	mapping(uint256 stakeActionId => _StakeAction) public stakeActions;

	/// @notice The total number of stake actions
	uint256 public numStakeActions;

	/// @notice This contains IDs of NFTs that have ever been used for staking.
	/// @dev Idea. Item value should be an enum NFTStakingStatusCode: NeverStaked, Staked, Unstaked.
	mapping(uint256 nftId => bool nftWasUsed) private _usedNfts;

	/// @notice Currently staked NFT IDs
	/// todo-0 Make sense to either convert this to `mapping` or eliminate `_numStakedNfts`?
	/// todo-0 A `mapping` could be cheaper gas-wise.
	/// todo-0 Don't eliminate this because this is used by the logic.
	uint256[] public stakedTokens;

	/// @notice The current number of staked NFTs.
	uint256 private _numStakedNfts;

	/// @notice Mapping of NFT ID to its index in the `stakedTokens` array
	/// The index is 1-based.
	mapping(uint256 => uint256) public tokenIndices;

	/// @notice Mapping of NFT ID to its last action ID
	mapping(uint256 => int256) public lastActionIds;

	/// todo-0 Eliminate?
	mapping(uint256 ethDepositIndex => _EthDeposit) public ethDeposits;

	/// @notice The total number of ETH deposits
	/// todo-0 Eliminate?
	uint256 public numEthDeposits;

	// #endregion

	/// @notice Initializes the StakingWalletRWalk contract
	/// @param rwalk_ Address of the RandomWalkNFT contract
	/// @dev Sets up the initial state of the contract
	constructor(RandomWalkNFT rwalk_) Ownable(msg.sender) {
		require(
			address(rwalk_) != address(0),
			CosmicGameErrors.ZeroAddress("Zero-address was given for the RandomWalk token.")
		);
		randomWalk = rwalk_;

		// #region Assertions
		// #enable_asserts assert(address(randomWalk) == address(rwalk_));
		// #enable_asserts assert(_numStakedNfts == 0);
		// #enable_asserts assert(numStakeActions == 0);
		// #endregion
	}

	function stake(uint256 nftId_) public override {
		require(
			( ! _usedNfts[nftId_] ),
			CosmicGameErrors.NftOneTimeStaking("This NFT has already been staked. An NFT is allowed to be staked only once.", nftId_)
		);
		_usedNfts[nftId_] = true;
		randomWalk.transferFrom(msg.sender, address(this), nftId_);
		_insertToken(nftId_, numStakeActions);
		stakeActions[numStakeActions].nftId = nftId_;
		stakeActions[numStakeActions].owner = msg.sender;
		stakeActions[numStakeActions].stakeTime = block.timestamp;
		numStakeActions += 1;
		_numStakedNfts += 1;
		emit StakeActionOccurred(numStakeActions - 1, nftId_, _numStakedNfts, msg.sender);

		// #region Assertions
		// #enable_asserts assert(wasNftUsed(nftId_));
		// #enable_asserts assert(stakeActions[numStakeActions - 1].nftId == nftId_);
		// #enable_asserts assert(stakeActions[numStakeActions - 1].owner == msg.sender);
		// #enable_asserts assert(stakeActions[numStakeActions - 1].stakeTime == block.timestamp);
		// #enable_asserts assert(isTokenStaked(nftId_));
		// #enable_asserts assert(_numStakedNfts > 0);
		// #enable_asserts assert(lastActionIdByTokenId(nftId_) == int256(numStakeActions - 1));
		// #endregion
	}

	function stakeMany(uint256[] memory ids) external override {
		// #enable_asserts uint256 initialStakedNFTs = _numStakedNfts;

		for (uint256 i = 0; i < ids.length; i++) {
			stake(ids[i]);
		}

		// #region Assertions
		// #enable_asserts assert(_numStakedNfts == initialStakedNFTs + ids.length);
		// #endregion
	}

	function unstake(uint256 stakeActionId) public override {
		require(
			stakeActions[stakeActionId].unstakeTime == 0,
			// todo-0 Comment-202410182 applies or at least relates?
			CosmicGameErrors.NftAlreadyUnstaked("NFT has already been unstaked.", stakeActionId)
		);
		require(
			stakeActions[stakeActionId].owner == msg.sender,
			CosmicGameErrors.NftStakeActionAccessDenied("Only NFT owner is permitted to unstake it.", stakeActionId, msg.sender)
		);
		uint256 nftId = stakeActions[stakeActionId].nftId;
		_removeToken(nftId);
		randomWalk.transferFrom(address(this), msg.sender, nftId);
		stakeActions[stakeActionId].unstakeTime = block.timestamp;
		_numStakedNfts -= 1;
		emit UnstakeActionOccurred(stakeActionId, nftId, _numStakedNfts, msg.sender);

		// #region Assertions
		// #enable_asserts assert(stakeActions[stakeActionId].unstakeTime != 0);
		// #enable_asserts assert(!isTokenStaked(nftId));
		// #enable_asserts assert(lastActionIdByTokenId(nftId) == -2);
		// #enable_asserts assert(_numStakedNfts < numStakeActions);
		// #enable_asserts assert(stakedTokens.length == _numStakedNfts);
		// #endregion
	}

	function unstakeMany(uint256[] memory ids) external override {
		// #enable_asserts uint256 initialStakedNFTs = _numStakedNfts;

		for (uint256 i = 0; i < ids.length; i++) {
			unstake(ids[i]);
		}

		// #region Assertions
		// #enable_asserts assert(_numStakedNfts == initialStakedNFTs - ids.length);
		// #endregion
	}

	function wasNftUsed(uint256 nftId_) public view override returns (bool) {
		return _usedNfts[nftId_];
	}

	function isTokenStaked(uint256 nftId) public view override returns (bool) {
		return tokenIndices[nftId] != 0;
	}

	function numNftsStaked() public view override returns (uint256) {
		// #region Assertions
		// todo-1 Given this equality, why do we need to store `_numStakedNfts` separately? To save gas?
		// todo-1 At least explain this in a comment near `_numStakedNfts`.
		// #enable_asserts assert(stakedTokens.length == _numStakedNfts);
		// #endregion

		return stakedTokens.length;
	}

	function lastActionIdByTokenId(uint256 nftId) public view override returns (int256) {
		uint256 tokenIndex = tokenIndices[nftId];
		if (tokenIndex == 0) {
			return -2;
		}
		return lastActionIds[nftId];
	}

	function stakerByTokenId(uint256 nftId) public view override returns (address) {
		int256 stakeActionId = lastActionIdByTokenId(nftId);
		if (stakeActionId < 0) {
			return address(0);
		}
		return stakeActions[uint256(stakeActionId)].owner;
	}

	function pickRandomStakerIfPossible(bytes32 entropy) public view override returns (address) {
		// require(stakedTokens.length > 0, CosmicGameErrors.NoNftsStaked("There are no RandomWalk NFTs staked."));
		if (stakedTokens.length == 0) {
			return address(0);
		}

		uint256 luckyTokenId = stakedTokens[uint256(entropy) % stakedTokens.length];
		int256 stakeActionId = lastActionIds[luckyTokenId];
		return stakeActions[uint256(stakeActionId)].owner;
	}

	/// @notice Inserts a token into the staked tokens list
	/// @dev Internal function to manage staked tokens
	/// @param nftId ID of the token to insert
	/// @param stakeActionId ID of the stake action
	function _insertToken(uint256 nftId, uint256 stakeActionId) internal {
		require(
			!isTokenStaked(nftId),
			CosmicGameErrors.TokenAlreadyInserted("NFT is already in the list.", nftId, stakeActionId)
		);
		stakedTokens.push(nftId);
		tokenIndices[nftId] = stakedTokens.length;
		lastActionIds[nftId] = int256(stakeActionId);

		// #region Assertions
		// #enable_asserts assert(isTokenStaked(nftId));
		// #enable_asserts assert(tokenIndices[nftId] == stakedTokens.length);
		// #enable_asserts assert(lastActionIds[nftId] == int256(stakeActionId));
		// #enable_asserts assert(stakedTokens[stakedTokens.length - 1] == nftId);
		// #endregion
	}

	/// @notice Removes a token from the staked tokens list
	/// @dev Internal function to manage staked tokens
	/// @param nftId ID of the token to remove
	function _removeToken(uint256 nftId) internal {
		require(isTokenStaked(nftId), CosmicGameErrors.TokenAlreadyDeleted("NFT is not in the list.", nftId));
		uint256 index = tokenIndices[nftId];
		uint256 lastTokenId = stakedTokens[stakedTokens.length - 1];
		stakedTokens[index - 1] = lastTokenId;
		tokenIndices[lastTokenId] = index;
		delete tokenIndices[nftId];
		stakedTokens.pop();
		lastActionIds[nftId] = -1;

		// #region Assertions
		// #enable_asserts assert(!isTokenStaked(nftId));
		// #enable_asserts assert(tokenIndices[nftId] == 0);
		// #enable_asserts assert(lastActionIds[nftId] == -1);
		// #endregion
	}
}
