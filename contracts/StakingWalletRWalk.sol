// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicGameConstants } from "./Constants.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { CosmicGameErrors } from "./Errors.sol";

/// @title StakingWalletRWalk - Staking contract for RandomWalk NFTs
/// @author Cosmic Game Development Team
/// @notice This contract allows users to stake their RandomWalk NFTs
/// @dev Implements staking, unstaking, and random staker selection for RandomWalk NFTs
contract StakingWalletRWalk is Ownable {
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

	/// @notice Emitted when a token is staked
	/// @param actionId The ID of the stake action
	/// @param tokenId The ID of the staked token
	/// @param totalNFTs Total number of staked NFTs after this action
	/// @param staker Address of the staker
	event StakeActionEvent(
		uint256 indexed actionId,
		uint256 indexed tokenId,
		uint256 totalNFTs,
		address indexed staker
	);

	/// @notice Emitted when a token is unstaked
	/// @param actionId The ID of the unstake action
	/// @param tokenId The ID of the unstaked token
	/// @param totalNFTs Total number of staked NFTs after this action
	/// @param staker Address of the staker
	event UnstakeActionEvent(
		uint256 indexed actionId,
		uint256 indexed tokenId,
		uint256 totalNFTs,
		address indexed staker
	);

	/// @notice Initializes the StakingWalletRWalk contract
	/// @param rwalk_ Address of the RandomWalkNFT contract
	/// @param game_ Address of the CosmicGame contract
	constructor(RandomWalkNFT rwalk_, CosmicGame game_) {
		require(
			address(rwalk_) != address(0),
			CosmicGameErrors.ZeroAddress("Zero-address was given for the RandomWalk token.")
		);
		require(address(game_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for the game."));
		randomWalk = rwalk_;
		game = game_;
	}

	/// @notice Stakes a single RandomWalk NFT
	/// @param _tokenId ID of the token to stake
	function stake(uint256 _tokenId) public {
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
	}

	/// @notice Stakes multiple RandomWalk NFTs
	/// @param ids Array of token IDs to stake
	function stakeMany(uint256[] memory ids) external {
		for (uint256 i = 0; i < ids.length; i++) {
			stake(ids[i]);
		}
	}

	/// @notice Unstakes a single RandomWalk NFT
	/// @param stakeActionId ID of the stake action to unstake
	function unstake(uint256 stakeActionId) public {
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
	}

	/// @notice Unstakes multiple RandomWalk NFTs
	/// @param ids Array of stake action IDs to unstake
	function unstakeMany(uint256[] memory ids) external {
		for (uint256 i = 0; i < ids.length; i++) {
			unstake(ids[i]);
		}
	}

	/// @notice Checks if a token has been used for staking
	/// @param _tokenId ID of the token to check
	/// @return True if the token has been used, false otherwise
	function wasTokenUsed(uint256 _tokenId) public view returns (bool) {
		return usedTokens[_tokenId];
	}

	/// @notice Checks if a token is currently staked
	/// @param tokenId ID of the token to check
	/// @return True if the token is staked, false otherwise
	function isTokenStaked(uint256 tokenId) public view returns (bool) {
		return tokenIndices[tokenId] != 0;
	}

	/// @notice Returns the number of currently staked tokens
	/// @return Number of staked tokens
	function numTokensStaked() public view returns (uint256) {
		return stakedTokens.length;
	}

	/// @notice Gets the last action ID for a given token
	/// @param tokenId ID of the token to check
	/// @return Last action ID for the token, -2 if never staked, -1 if unstaked
	function lastActionIdByTokenId(uint256 tokenId) public view returns (int256) {
		uint256 tokenIndex = tokenIndices[tokenId];
		if (tokenIndex == 0) {
			return -2;
		}
		return lastActionIds[tokenId];
	}

	/// @notice Gets the staker's address for a given token
	/// @param tokenId ID of the token to check
	/// @return Address of the staker, address(0) if not staked
	function stakerByTokenId(uint256 tokenId) public view returns (address) {
		int256 actionId = lastActionIdByTokenId(tokenId);
		if (actionId < 0) {
			return address(0);
		}
		return stakeActions[uint256(actionId)].owner;
	}

	/// @notice Picks a random staker based on the provided entropy
	/// @param entropy Random bytes used to select a staker
	/// @return Address of the randomly selected staker
	function pickRandomStaker(bytes32 entropy) public view returns (address) {
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
	}
}
