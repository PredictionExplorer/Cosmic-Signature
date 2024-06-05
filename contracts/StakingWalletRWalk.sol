// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { CosmicGameConstants } from "./Constants.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";

contract StakingWalletRWalk is Ownable {
	struct StakeAction {
		uint256 tokenId;
		address owner;
		uint256 stakeTime;
		uint256 unstakeTime;
		uint256 unstakeEligibleTime;
		mapping(uint256 => bool) depositClaimed;
	}

	struct ETHDeposit {
		uint256 depositTime;
		uint256 depositAmount;
		uint256 numStaked;
	}

	mapping(uint256 => StakeAction) public stakeActions;
	uint256 public numStakeActions;

	// Variables to manage uniquneness of tokens and pick random winner
	uint256[] public stakedTokens;
	mapping(uint256 => uint256) public tokenIndices; // tokenId -> tokenIndex
	mapping(uint256 => int256) public lastActionIds; // tokenId -> actionId

	mapping(uint256 => ETHDeposit) public ETHDeposits;
	uint256 public numETHDeposits;

	uint256 public numStakedNFTs;

	uint256 public minStakePeriod = CosmicGameConstants.DEFAULT_MIN_STAKE_PERIOD;

	RandomWalkNFT public randomWalk;

	event StakeActionEvent(
		uint256 indexed actionId,
		uint256 indexed tokenId,
		uint256 totalNFTs,
		uint256 unstakeTime,
		address indexed staker
	);
	event UnstakeActionEvent(
		uint256 indexed actionId,
		uint256 indexed tokenId,
		uint256 totalNFTs,
		address indexed staker
	);
	event MinStakePeriodChanged(uint256 newPeriod);

	constructor(RandomWalkNFT rwalk_) {
		require(address(rwalk_) != address(0), "Zero-address was given for the RandomWalk token.");
		randomWalk = rwalk_;
	}

	function stake(uint256 _tokenId) public {
		randomWalk.transferFrom(msg.sender, address(this), _tokenId);
		_insertToken(_tokenId, numStakeActions);
		stakeActions[numStakeActions].tokenId = _tokenId;
		stakeActions[numStakeActions].owner = msg.sender;
		stakeActions[numStakeActions].stakeTime = block.timestamp;
		uint256 unstakeTime = block.timestamp + minStakePeriod;
		require(unstakeTime > block.timestamp, "Unstake time should be bigger than block timestamp");
		stakeActions[numStakeActions].unstakeEligibleTime = unstakeTime;
		numStakeActions += 1;
		numStakedNFTs += 1;
		emit StakeActionEvent(
			numStakeActions - 1,
			_tokenId,
			numStakedNFTs,
			stakeActions[numStakeActions - 1].unstakeEligibleTime,
			msg.sender
		);
	}

	function stakeMany(uint256[] memory ids) external {
		for (uint256 i = 0; i < ids.length; i++) {
			stake(ids[i]);
		}
	}

	function unstake(uint256 stakeActionId) public {
		require(stakeActions[stakeActionId].unstakeTime == 0, "Token has already been unstaked.");
		require(stakeActions[stakeActionId].owner == msg.sender, "Only the owner can unstake.");
		require(stakeActions[stakeActionId].unstakeEligibleTime < block.timestamp, "Not allowed to unstake yet.");
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

	function setMinStakePeriod(uint256 newStakePeriod) external onlyOwner {
		minStakePeriod = newStakePeriod;
		emit MinStakePeriodChanged(newStakePeriod);
	}

	function isTokenStaked(uint256 tokenId) public view returns (bool) {
		return tokenIndices[tokenId] != 0;
	}

	function numTokensStaked() public view returns (uint256) {
		return stakedTokens.length;
	}

	function tokenByIndex(uint256 tokenIndex) public view returns (uint256) {
		require(tokenIndex > 0, "Zero was given, token indices start from 1");
		return tokenIndices[tokenIndex];
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
		require(stakedTokens.length > 0, "There are no RandomWalk tokens staked.");
		uint256 luckyTokenId = stakedTokens[uint256(entropy) % stakedTokens.length];
		int256 actionId = lastActionIds[luckyTokenId];
		return stakeActions[uint256(actionId)].owner;
	}

	function _insertToken(uint256 tokenId, uint256 actionId) internal {
		require(!isTokenStaked(tokenId), "Token already in the list.");
		stakedTokens.push(tokenId);
		tokenIndices[tokenId] = stakedTokens.length;
		lastActionIds[tokenId] = int256(actionId);
	}

	function _removeToken(uint256 tokenId) internal {
		require(isTokenStaked(tokenId), "Token is not in the list.");
		uint256 index = tokenIndices[tokenId];
		uint256 lastTokenId = stakedTokens[stakedTokens.length - 1];
		stakedTokens[index - 1] = lastTokenId;
		tokenIndices[lastTokenId] = index;
		delete tokenIndices[tokenId];
		stakedTokens.pop();
		lastActionIds[tokenId] = -1;
	}
}
