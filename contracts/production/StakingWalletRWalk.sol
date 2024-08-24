// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;
pragma experimental SMTChecker;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { IStakingWalletRWalk } from "./interfaces/IStakingWalletRWalk.sol";

/// @dev Implements staking, unstaking, and random staker selection for RandomWalk NFTs
contract StakingWalletRWalk is Ownable, IStakingWalletRWalk {
	// #region Data Types

	/// @notice Represents a staking action for a token
	/// @dev Stores details about each staking event
	struct StakeAction {
		uint256 tokenId;
		address owner;
		uint256 stakeTime;
		uint256 unstakeTime;
		mapping(uint256 => bool) depositClaimed;
	}

	/// @notice Represents an ETH deposit for reward distribution
	/// @dev Stores details about each ETH deposit event
	struct ETHDeposit {
		uint256 depositTime;
		uint256 depositAmount;
		uint256 numStaked;
	}

	// #endregion
	// #region State

	/// @notice Mapping of stake action ID to StakeAction
	mapping(uint256 => StakeAction) public stakeActions;
	/// @notice Total number of stake actions
	uint256 public numStakeActions;
	/// @notice Mapping to track if a token has been used for staking
	mapping(uint256 => bool) public usedTokens;

	/// @notice Array of currently staked token IDs
	uint256[] public stakedTokens;
	/// @notice Mapping of token ID to its index in stakedTokens array
	mapping(uint256 => uint256) public tokenIndices;
	/// @notice Mapping of token ID to its last action ID
	mapping(uint256 => int256) public lastActionIds;

	/// @notice Mapping of deposit ID to ETHDeposit
	mapping(uint256 => ETHDeposit) public ETHDeposits;
	/// @notice Total number of ETH deposits
	uint256 public numETHDeposits;

	/// @notice Current number of staked NFTs
	uint256 public numStakedNFTs;

	/// @notice Reference to the RandomWalkNFT contract
	RandomWalkNFT public randomWalk;
	/// @notice Reference to the CosmicGame contract
	CosmicGame public game;

	// #endregion

	/// @notice Initializes the StakingWalletRWalk contract
	/// @param rwalk_ Address of the RandomWalkNFT contract
	/// @param game_ Address of the CosmicGame contract
	/// @dev Sets up the initial state of the contract
	constructor(RandomWalkNFT rwalk_, CosmicGame game_) Ownable(msg.sender) {
		require(
			address(rwalk_) != address(0),
			CosmicGameErrors.ZeroAddress("Zero-address was given for the RandomWalk token.")
		);
		require(address(game_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for the game."));
		randomWalk = rwalk_;
		game = game_;

		// SMT Checker assertions for constructor
		assert(address(randomWalk) == address(rwalk_));
		assert(address(game) == address(game_));
		assert(numStakedNFTs == 0);
		assert(numStakeActions == 0);
	}

	function stake(uint256 _tokenId) public override {
		require(
			!usedTokens[_tokenId],
			CosmicGameErrors.OneTimeStaking("Staking/unstaking token is allowed only once", _tokenId)
		);
		usedTokens[_tokenId] = true;
		randomWalk.transferFrom(msg.sender, address(this), _tokenId);
		_insertToken(_tokenId, numStakeActions);
		stakeActions[numStakeActions].tokenId = _tokenId;
		stakeActions[numStakeActions].owner = msg.sender;
		stakeActions[numStakeActions].stakeTime = block.timestamp;
		numStakeActions += 1;
		numStakedNFTs += 1;
		emit StakeActionEvent(numStakeActions - 1, _tokenId, numStakedNFTs, msg.sender);

		// SMT Checker assertions
		assert(usedTokens[_tokenId] == true);
		assert(stakeActions[numStakeActions - 1].tokenId == _tokenId);
		assert(stakeActions[numStakeActions - 1].owner == msg.sender);
		assert(stakeActions[numStakeActions - 1].stakeTime == block.timestamp);
		assert(isTokenStaked(_tokenId));
		assert(numStakedNFTs > 0);
		assert(lastActionIdByTokenId(_tokenId) == int256(numStakeActions - 1));
	}

	function stakeMany(uint256[] memory ids) external override {
		uint256 initialStakedNFTs = numStakedNFTs;
		for (uint256 i = 0; i < ids.length; i++) {
			stake(ids[i]);
		}
		// SMT Checker assertions
		assert(numStakedNFTs == initialStakedNFTs + ids.length);
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
		numStakedNFTs -= 1;
		emit UnstakeActionEvent(stakeActionId, tokenId, numStakedNFTs, msg.sender);

		// SMT Checker assertions
		assert(stakeActions[stakeActionId].unstakeTime != 0);
		assert(!isTokenStaked(tokenId));
		assert(lastActionIdByTokenId(tokenId) == -1);
		assert(numStakedNFTs < numStakeActions);
	}

	function unstakeMany(uint256[] memory ids) external override {
		uint256 initialStakedNFTs = numStakedNFTs;
		for (uint256 i = 0; i < ids.length; i++) {
			unstake(ids[i]);
		}
		// SMT Checker assertions
		assert(numStakedNFTs == initialStakedNFTs - ids.length);
	}

	function wasTokenUsed(uint256 _tokenId) public view override returns (bool) {
		return usedTokens[_tokenId];
	}

	function isTokenStaked(uint256 tokenId) public view override returns (bool) {
		return tokenIndices[tokenId] != 0;
	}

	function numTokensStaked() public view override returns (uint256) {
		// SMT Checker assertion
		assert(stakedTokens.length == numStakedNFTs);
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

	function pickRandomStaker(bytes32 entropy) public view override returns (address) {
		require(stakedTokens.length > 0, CosmicGameErrors.NoTokensStaked("There are no RandomWalk tokens staked."));
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
			CosmicGameErrors.TokenAlreadyInserted("Token already in the list.", tokenId, actionId)
		);
		stakedTokens.push(tokenId);
		tokenIndices[tokenId] = stakedTokens.length;
		lastActionIds[tokenId] = int256(actionId);

		// SMT Checker assertions
		assert(isTokenStaked(tokenId));
		assert(tokenIndices[tokenId] == stakedTokens.length);
		assert(lastActionIds[tokenId] == int256(actionId));
		assert(stakedTokens[stakedTokens.length - 1] == tokenId);
	}

	/// @notice Removes a token from the staked tokens list
	/// @dev Internal function to manage staked tokens
	/// @param tokenId ID of the token to remove
	function _removeToken(uint256 tokenId) internal {
		require(isTokenStaked(tokenId), CosmicGameErrors.TokenAlreadyDeleted("Token is not in the list.", tokenId));
		uint256 index = tokenIndices[tokenId];
		uint256 lastTokenId = stakedTokens[stakedTokens.length - 1];
		stakedTokens[index - 1] = lastTokenId;
		tokenIndices[lastTokenId] = index;
		delete tokenIndices[tokenId];
		stakedTokens.pop();
		lastActionIds[tokenId] = -1;

		// SMT Checker assertions
		assert(!isTokenStaked(tokenId));
		assert(tokenIndices[tokenId] == 0);
		assert(lastActionIds[tokenId] == -1);
		assert(stakedTokens.length == numStakedNFTs);
	}
}
