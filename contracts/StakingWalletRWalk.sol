// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicGameConstants } from "./Constants.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { CosmicGameErrors } from "./Errors.sol";

contract StakingWalletRWalk is Ownable {
	struct StakeAction {
		uint256 tokenId;
		address owner;
		uint256 stakeTime;
		uint256 unstakeTime;
		mapping(uint256 => bool) depositClaimed;
	}

	struct ETHDeposit {
		uint256 depositTime;
		uint256 depositAmount;
		uint256 numStaked;
	}

	mapping(uint256 => StakeAction) public stakeActions;
	uint256 public numStakeActions;
	mapping(uint256 => bool) public usedTokens; // tokens can be staked only once, and then they become 'used'

	// Variables to manage uniquneness of tokens and pick random winner
	uint256[] public stakedTokens;
	mapping(uint256 => uint256) public tokenIndices; // tokenId -> tokenIndex
	mapping(uint256 => int256) public lastActionIds; // tokenId -> actionId

	mapping(uint256 => ETHDeposit) public ETHDeposits;
	uint256 public numETHDeposits;

	uint256 public numStakedNFTs;

	RandomWalkNFT public randomWalk;
	CosmicGame public game;

	event StakeActionEvent(
		uint256 indexed actionId,
		uint256 indexed tokenId,
		uint256 totalNFTs,
		address indexed staker
	);
	event UnstakeActionEvent(
		uint256 indexed actionId,
		uint256 indexed tokenId,
		uint256 totalNFTs,
		address indexed staker
	);

	constructor(RandomWalkNFT rwalk_, CosmicGame game_) {
		require(
			address(rwalk_) != address(0),
			CosmicGameErrors.ZeroAddress("Zero-address was given for the RandomWalk token.")
		);
		require(address(game_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given for the game."));
		randomWalk = rwalk_;
		game = game_;
	}

	function stake(uint256 _tokenId) public {
		require(
			usedTokens[_tokenId] != true,
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

	function stakeMany(uint256[] memory ids) external {
		for (uint256 i = 0; i < ids.length; i++) {
			stake(ids[i]);
		}
	}

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
		randomWalk.transferFrom(address(this), msg.sender, stakeActions[stakeActionId].tokenId);
		stakeActions[stakeActionId].unstakeTime = block.timestamp;
		numStakedNFTs -= 1;
		emit UnstakeActionEvent(stakeActionId, tokenId, numStakedNFTs, msg.sender);
	}

	function unstakeMany(uint256[] memory ids) external {
		for (uint256 i = 0; i < ids.length; i++) {
			unstake(ids[i]);
		}
	}

	function wasTokenUsed(uint256 _tokenId) public view returns (bool) {
		return (usedTokens[_tokenId] == true);
	}

	function isTokenStaked(uint256 tokenId) public view returns (bool) {
		return tokenIndices[tokenId] != 0;
	}

	function numTokensStaked() public view returns (uint256) {
		return stakedTokens.length;
	}

	function tokenByIndex(uint256 tokenIndex) public view returns (uint256) {
		return stakedTokens[tokenIndex];
	}

	function lastActionIdByTokenId(uint256 tokenId) public view returns (int256) {
		uint256 tokenIndex = tokenIndices[tokenId];
		if (tokenIndex == 0) {
			return -2;
		}
		int256 lastActionId = lastActionIds[tokenId];
		return lastActionId; // will return -1 if token is not staked, > -1 if there is an ID
	}

	function stakerByTokenId(uint256 tokenId) public view returns (address) {
		int256 actionId;
		actionId = lastActionIdByTokenId(tokenId);
		if (actionId < 0) {
			return address(0);
		}
		address staker = stakeActions[uint256(actionId)].owner;
		return staker;
	}

	function pickRandomStaker(bytes32 entropy) public view returns (address) {
		require(stakedTokens.length > 0, CosmicGameErrors.NoTokensStaked("There are no RandomWalk tokens staked."));
		uint256 luckyTokenId = stakedTokens[uint256(entropy) % stakedTokens.length];
		int256 actionId = lastActionIds[luckyTokenId];
		return stakeActions[uint256(actionId)].owner;
	}

	function _insertToken(uint256 tokenId, uint256 actionId) internal {
		require(
			!isTokenStaked(tokenId),
			CosmicGameErrors.TokenAlreadyInserted("Token already in the list.", tokenId, actionId)
		);
		stakedTokens.push(tokenId);
		tokenIndices[tokenId] = stakedTokens.length;
		lastActionIds[tokenId] = int256(actionId);
	}

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
