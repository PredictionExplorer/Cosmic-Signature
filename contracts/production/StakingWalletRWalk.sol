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

	/// @notice Represents a staking action for a token
	/// @dev Stores details about each staking event
	struct StakeAction {
		uint256 tokenId;
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
	struct ETHDeposit {
		uint256 depositTime;
		uint256 depositAmount;
		uint256 numStaked;
	}

	// #endregion
	// #region State

	/// @notice Reference to the RandomWalkNFT contract
	RandomWalkNFT public randomWalk;

	mapping(uint256 stakeActionId => StakeAction) public stakeActions;

	/// @notice The total number of stake actions
	uint256 public numStakeActions;

	/// @notice This contains IDs of NFTs that have ever been used for staking.
	/// @dev Idea. Item value should be an enum NFTStakingStatusCode: NeverStaked, Staked, Unstaked.
	mapping(uint256 tokenId => bool tokenWasUsed) public usedTokens;

	/// @notice Currently staked NFT IDs
	/// todo-0 Make sense to either convert this to `mapping` or eliminate `_numStakedNFTs`?
	/// todo-0 A `mapping` could be cheaper gas-wise.
	/// todo-0 Don't eliminate this because this is used by the logic.
	uint256[] public stakedTokens;

	/// @notice The current number of staked NFTs.
	uint256 private _numStakedNFTs;

	/// @notice Mapping of NFT ID to its index in the `stakedTokens` array
	/// The index is 1-based.
	mapping(uint256 => uint256) public tokenIndices;

	/// @notice Mapping of NFT ID to its last action ID
	mapping(uint256 => int256) public lastActionIds;

	/// todo-0 Eliminate?
	mapping(uint256 ETHDepositIndex => ETHDeposit) public ETHDeposits;

	/// @notice The total number of ETH deposits
	/// todo-0 Eliminate?
	uint256 public numETHDeposits;

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
		// #enable_asserts assert(_numStakedNFTs == 0);
		// #enable_asserts assert(numStakeActions == 0);
		// #endregion
	}

	function stake(uint256 _tokenId) public override {
		require(
			( ! usedTokens[_tokenId] ),
			CosmicGameErrors.OneTimeStaking("This NFT has already been staked. An NFT is allowed to be staked only once.", _tokenId)
		);
		usedTokens[_tokenId] = true;
		randomWalk.transferFrom(msg.sender, address(this), _tokenId);
		_insertToken(_tokenId, numStakeActions);
		stakeActions[numStakeActions].tokenId = _tokenId;
		stakeActions[numStakeActions].owner = msg.sender;
		stakeActions[numStakeActions].stakeTime = block.timestamp;
		numStakeActions += 1;
		_numStakedNFTs += 1;
		emit StakeActionEvent(numStakeActions - 1, _tokenId, _numStakedNFTs, msg.sender);

		// #region Assertions
		// #enable_asserts assert(usedTokens[_tokenId] == true);
		// #enable_asserts assert(stakeActions[numStakeActions - 1].tokenId == _tokenId);
		// #enable_asserts assert(stakeActions[numStakeActions - 1].owner == msg.sender);
		// #enable_asserts assert(stakeActions[numStakeActions - 1].stakeTime == block.timestamp);
		// #enable_asserts assert(isTokenStaked(_tokenId));
		// #enable_asserts assert(_numStakedNFTs > 0);
		// #enable_asserts assert(lastActionIdByTokenId(_tokenId) == int256(numStakeActions - 1));
		// #endregion
	}

	function stakeMany(uint256[] memory ids) external override {
		// #enable_asserts uint256 initialStakedNFTs = _numStakedNFTs;

		for (uint256 i = 0; i < ids.length; i++) {
			stake(ids[i]);
		}

		// #region Assertions
		// #enable_asserts assert(_numStakedNFTs == initialStakedNFTs + ids.length);
		// #endregion
	}

	function unstake(uint256 stakeActionId) public override {
		require(
			stakeActions[stakeActionId].unstakeTime == 0,
			CosmicGameErrors.TokenAlreadyUnstaked("Token has already been unstaked.", stakeActionId)
		);
		require(
			stakeActions[stakeActionId].owner == msg.sender,
			CosmicGameErrors.AccessError("Only the owner can unstake.", stakeActionId, msg.sender)
		);
		uint256 tokenId = stakeActions[stakeActionId].tokenId;
		_removeToken(tokenId);
		randomWalk.transferFrom(address(this), msg.sender, tokenId);
		stakeActions[stakeActionId].unstakeTime = block.timestamp;
		_numStakedNFTs -= 1;
		emit UnstakeActionEvent(stakeActionId, tokenId, _numStakedNFTs, msg.sender);

		// #region Assertions
		// #enable_asserts assert(stakeActions[stakeActionId].unstakeTime != 0);
		// #enable_asserts assert(!isTokenStaked(tokenId));
		// #enable_asserts assert(lastActionIdByTokenId(tokenId) == -2);
		// #enable_asserts assert(_numStakedNFTs < numStakeActions);
		// #enable_asserts assert(stakedTokens.length == _numStakedNFTs);
		// #endregion
	}

	function unstakeMany(uint256[] memory ids) external override {
		// #enable_asserts uint256 initialStakedNFTs = _numStakedNFTs;

		for (uint256 i = 0; i < ids.length; i++) {
			unstake(ids[i]);
		}

		// #region Assertions
		// #enable_asserts assert(_numStakedNFTs == initialStakedNFTs - ids.length);
		// #endregion
	}

	function wasTokenUsed(uint256 _tokenId) public view override returns (bool) {
		return usedTokens[_tokenId];
	}

	function isTokenStaked(uint256 tokenId) public view override returns (bool) {
		return tokenIndices[tokenId] != 0;
	}

	function numTokensStaked() public view override returns (uint256) {
		// #region Assertions
		// todo-1 Given this equality, why do we need to store `_numStakedNFTs` separately? To save gas?
		// todo-1 At least explain this in a comment near `_numStakedNFTs`.
		// todo-1 The same applies to `StakingWalletCST`.
		// #enable_asserts assert(stakedTokens.length == _numStakedNFTs);
		// #endregion

		return stakedTokens.length;
	}

	function lastActionIdByTokenId(uint256 tokenId) public view override returns (int256) {
		uint256 tokenIndex = tokenIndices[tokenId];
		if (tokenIndex == 0) {
			return -2;
		}
		return lastActionIds[tokenId];
	}

	function stakerByTokenId(uint256 tokenId) public view override returns (address) {
		int256 actionId = lastActionIdByTokenId(tokenId);
		if (actionId < 0) {
			return address(0);
		}
		return stakeActions[uint256(actionId)].owner;
	}

	function pickRandomStakerIfPossible(bytes32 entropy) public view override returns (address) {
		// require(stakedTokens.length > 0, CosmicGameErrors.NoTokensStaked("There are no RandomWalk NFTs staked."));
		if (stakedTokens.length == 0) {
			return address(0);
		}

		uint256 luckyTokenId = stakedTokens[uint256(entropy) % stakedTokens.length];
		int256 actionId = lastActionIds[luckyTokenId];
		return stakeActions[uint256(actionId)].owner;
	}

	/// @notice Inserts a token into the staked tokens list
	/// @dev Internal function to manage staked tokens
	/// @param tokenId ID of the token to insert
	/// @param actionId ID of the stake action
	function _insertToken(uint256 tokenId, uint256 actionId) internal {
		require(
			!isTokenStaked(tokenId),
			CosmicGameErrors.TokenAlreadyInserted("NFT is already in the list.", tokenId, actionId)
		);
		stakedTokens.push(tokenId);
		tokenIndices[tokenId] = stakedTokens.length;
		lastActionIds[tokenId] = int256(actionId);

		// #region Assertions
		// #enable_asserts assert(isTokenStaked(tokenId));
		// #enable_asserts assert(tokenIndices[tokenId] == stakedTokens.length);
		// #enable_asserts assert(lastActionIds[tokenId] == int256(actionId));
		// #enable_asserts assert(stakedTokens[stakedTokens.length - 1] == tokenId);
		// #endregion
	}

	/// @notice Removes a token from the staked tokens list
	/// @dev Internal function to manage staked tokens
	/// @param tokenId ID of the token to remove
	function _removeToken(uint256 tokenId) internal {
		require(isTokenStaked(tokenId), CosmicGameErrors.TokenAlreadyDeleted("NFT is not in the list.", tokenId));
		uint256 index = tokenIndices[tokenId];
		uint256 lastTokenId = stakedTokens[stakedTokens.length - 1];
		stakedTokens[index - 1] = lastTokenId;
		tokenIndices[lastTokenId] = index;
		delete tokenIndices[tokenId];
		stakedTokens.pop();
		lastActionIds[tokenId] = -1;

		// #region Assertions
		// #enable_asserts assert(!isTokenStaked(tokenId));
		// #enable_asserts assert(tokenIndices[tokenId] == 0);
		// #enable_asserts assert(lastActionIds[tokenId] == -1);
		// #endregion
	}
}
