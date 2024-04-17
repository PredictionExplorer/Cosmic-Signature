// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { CosmicGameConstants } from "./Constants.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";

contract StakingWallet is Ownable {
	struct StakeAction {
		uint256 tokenId;
		address owner;
		uint32 stakeTime;
		uint32 unstakeTime;
		uint32 unstakeEligibleTime;
		bool isRandomWalk;
		mapping(uint256 => bool) depositClaimed;
	}

	struct ETHDeposit {
		uint256 depositTime;
		uint256 depositAmount;
		uint256 numStaked;
	}

	mapping(uint256 => StakeAction) public stakeActions;
	uint256 public numStakeActions;
	uint256[] public tokensStaked;
	mapping(uint256 => uint256) public tokenIndices;	// tokenId -> tokenIndex
	mapping(uint256 => int256) public lastActionIds;	// tokenId -> actionId

	mapping(uint256 => ETHDeposit) public ETHDeposits;
	uint256 public numETHDeposits;

	uint256 public numStakedNFTs;

	address public charity;
	// TODO: figure out the invariant that is always true that includes the modulo.
	//       It would be useful for testing.
	uint256 public modulo;
	uint32 public minStakePeriod = CosmicGameConstants.DEFAULT_MIN_STAKE_PERIOD;

	CosmicSignature public nft;
	RandomWalkNFT public randomWalk;
	CosmicGame public game;

	event StakeActionEvent(
		uint256 indexed actionId,
		uint256 indexed tokenId,
		uint256 totalNFTs,
		uint256 unstakeTime,
		address indexed staker,
		bool isRandomWalkToken
	);
	event UnstakeActionEvent(
		uint256 indexed actionId,
		uint256 indexed tokenId,
		uint256 totalNFTs,
		address indexed staker
	);
	event ClaimRewardEvent(uint256 indexed actionId, uint256 indexed depositId, uint256 reward, address indexed staker);
	event EthDepositEvent(
		uint256 indexed depositTime,
		uint256 depositNum,
		uint256 numStakedNFTs,
		uint256 amount,
		uint256 modulo
	);
	event CharityDepositEvent(uint256 amount,address charityAddress); // emitted when numStakedNFTs = 0
	event CharityUpdatedEvent(address indexed newCharityAddress);
	event MinStakePeriodChanged(uint256 newPeriod);
	event ModuloSentEvent(uint256 amount);

	constructor(CosmicSignature nft_, CosmicGame game_, address charity_) {
		require(address(nft_)!= address(0), "Zero-address was given for the nft.");
		require(address(game_)!= address(0), "Zero-address was given for the game.");
		require(charity_!= address(0), "Zero-address was given for charity.");
		nft = nft_;
		game = game_;
		charity = charity_;
	}

	function deposit() external payable {
		require(msg.sender == address(game), "Only the CosmicGame contract can deposit.");
		if (numStakedNFTs == 0) {
			(bool success, ) = charity.call{ value: msg.value }("");
			require(success, "Transfer to charity contract failed.");
			emit CharityDepositEvent(msg.value,charity);
			return;
		}
		ETHDeposits[numETHDeposits].depositTime = block.timestamp;
		ETHDeposits[numETHDeposits].depositAmount = msg.value;
		ETHDeposits[numETHDeposits].numStaked = numStakedNFTs;
		numETHDeposits += 1;
		modulo += msg.value % numStakedNFTs;
		emit EthDepositEvent(block.timestamp, numETHDeposits - 1, numStakedNFTs, msg.value, modulo);
	}

	function stake(uint256 _tokenId,bool isRWalk) public {

		_insertToken(_tokenId,numStakeActions);
		if (isRWalk) {
			randomWalk.transferFrom(msg.sender, address(this), _tokenId);
		} else {
			nft.transferFrom(msg.sender, address(this), _tokenId);
		}
		stakeActions[numStakeActions].isRandomWalk = isRWalk;
		stakeActions[numStakeActions].tokenId = _tokenId;
		stakeActions[numStakeActions].owner = msg.sender;
		stakeActions[numStakeActions].stakeTime = uint32(block.timestamp);
		stakeActions[numStakeActions].unstakeEligibleTime = uint32(block.timestamp) + minStakePeriod;
		numStakeActions += 1;
		numStakedNFTs += 1;
		emit StakeActionEvent(
			numStakeActions - 1,
			_tokenId,
			numStakedNFTs,
			stakeActions[numStakeActions - 1].unstakeEligibleTime,
			msg.sender,
			isRWalk
		);
	}

	function stakeMany(uint256[] memory ids,bool[] memory areRandomWalk) external {
		for (uint256 i = 0; i < ids.length; i++) {
			stake(ids[i],areRandomWalk[i]);
		}
	}

	function unstake(uint256 stakeActionId) public {
		require(stakeActions[stakeActionId].unstakeTime == 0, "Token has already been unstaked");
		require(stakeActions[stakeActionId].owner == msg.sender, "Only the owner can unstake");
		require(stakeActions[stakeActionId].unstakeEligibleTime < block.timestamp, "Not allowed to unstake yet");
		if (stakeActions[stakeActionId].isRandomWalk) {
			randomWalk.transferFrom(address(this), msg.sender, stakeActions[stakeActionId].tokenId);
		} else {
			nft.transferFrom(address(this), msg.sender, stakeActions[stakeActionId].tokenId);
		}
		stakeActions[stakeActionId].unstakeTime = uint32(block.timestamp);
		numStakedNFTs -= 1;
		uint256 tokenId = stakeActions[stakeActionId].tokenId;
		_removeToken(tokenId);
		emit UnstakeActionEvent(stakeActionId, tokenId, numStakedNFTs, msg.sender);
	}

	function unstakeMany(uint256[] memory ids) external {
		for (uint256 i = 0; i < ids.length; i++) {
			unstake(ids[i]);
		}
	}

	function claimReward(uint256 stakeActionId, uint256 ETHDepositId) public {
		require(stakeActionId<numStakeActions,"Invalid stakeActionId.");
		require(ETHDepositId<numETHDeposits,"Invalid ETHDepositId.");
		require(stakeActions[stakeActionId].unstakeTime > 0, "Token has not been unstaked");
		require(!stakeActions[stakeActionId].depositClaimed[ETHDepositId], "This deposit was claimed already");
		require(stakeActions[stakeActionId].owner == msg.sender, "Only the owner can claim reward");
		require(
			stakeActions[stakeActionId].stakeTime < ETHDeposits[ETHDepositId].depositTime,
			"You were not staked yet."
		);
		require(
			stakeActions[stakeActionId].unstakeTime > ETHDeposits[ETHDepositId].depositTime,
			"You were already unstaked."
		);
		stakeActions[stakeActionId].depositClaimed[ETHDepositId] = true;
		uint256 amount = ETHDeposits[ETHDepositId].depositAmount / ETHDeposits[ETHDepositId].numStaked;
		(bool success, ) = stakeActions[stakeActionId].owner.call{ value: amount }("");
		require(success, "Reward transfer failed.");
		emit ClaimRewardEvent(stakeActionId, ETHDepositId, amount, msg.sender);
	}

	function claimManyRewards(uint256[] memory actions, uint256[] memory deposits) external {
		require(actions.length == deposits.length, "Array arguments must be of the same length.");
		for (uint256 i = 0; i < actions.length; i++) {
			claimReward(actions[i], deposits[i]);
		}
	}

	function setCharity(address newCharityAddress) external onlyOwner {
		require(newCharityAddress != address(0), "Zero-address was given.");
		charity = newCharityAddress;
		emit CharityUpdatedEvent(charity);
	}

	function setMinStakePeriod(uint32 newStakePeriod) external onlyOwner {
		minStakePeriod = newStakePeriod;
		emit MinStakePeriodChanged(newStakePeriod);
	}

	function moduloToCharity() external onlyOwner {

		uint256 amount;
		amount = modulo;
		require(amount>0,"Modulo is zero.");
		modulo = 0;
		(bool success, ) = charity.call{ value: amount}("");
		require(success, "Transfer to charity failed.");
		emit ModuloSentEvent(amount);
	}

	function tokenStaked(uint256 tokenId) public view returns (bool) {
		return tokenIndices[tokenId] != 0;
	}

	function numTokensStaked() public view returns (uint256) {
		return tokensStaked.length;
	}

	function stakerByTokenIndex(uint256 tokenIndex) public view returns (address) {
		require(tokenIndex < tokensStaked.length,"stakerOfToken(): index overflow");
		uint256 tokenId = tokensStaked[tokenIndex];
		int256 actionId = lastActionIds[tokenId];
		if (actionId == -1) {
			return address(0);
		}
		address staker = stakeActions[uint256(actionId)].owner;
		return staker;
	}

	function _insertToken(uint256 tokenId,uint256 actionId) internal {
		require(!tokenStaked(tokenId),"Token already in the list");
		tokensStaked.push(tokenId);
		tokenIndices[tokenId] = tokensStaked.length;
		lastActionIds[tokenId] = int256(actionId);
	}

	function _removeToken(uint256 tokenId) internal {
		require(tokenStaked(tokenId),"Token is not in the list");
		uint256 index = tokenIndices[tokenId];
		uint256 lastTokenId = tokensStaked[tokensStaked.length - 1];
		tokensStaked[index -1] = lastTokenId;
		tokenIndices[lastTokenId] = index;
		delete tokenIndices[tokenId];
		tokensStaked.pop();
		lastActionIds[tokenId] = -1;
	}

	function unstakeClaimRestake(uint256 stakeActionId, bool isRWalk, uint256 ETHDepositId) public  {
		// executes 3 actions in a single pass
		//		1:		unstakes token using action [stakeActionId]
		//		2:		claims reward corresponding to the deposit [ETHDepositId]
		//		3:		stakes back the token
		unstake(stakeActionId);
		claimReward(stakeActionId,ETHDepositId);
		stake(stakeActions[stakeActionId].tokenId,isRWalk);
	}

	function unstakeClaimRestakeMany(uint256[] memory unstake_actions, uint256[] memory stake_actions,bool[] memory areRandomWalk,uint256[] memory claim_actions, uint256[] memory claim_deposits) external {
		for (uint256 i = 0; i < unstake_actions.length; i++) {
			unstake(unstake_actions[i]);
		}
		require(claim_actions.length == claim_deposits.length, "Claim array arguments must be of the same length.");
		for (uint256 i = 0; i < claim_actions.length; i++) {
				claimReward(claim_actions[i],claim_deposits[i]);
		}
		for (uint256 i = 0; i < stake_actions.length; i++) {
			stake(stakeActions[stake_actions[i]].tokenId,areRandomWalk[i]);
		}
	}
}
