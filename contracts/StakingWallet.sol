// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { CosmicGameConstants } from "./Constants.sol";

contract StakingWallet is Ownable {
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
	address[] public uniqueStakers; 
	mapping(address => uint256) stakerIndices;
	mapping(address => uint256) tokenCountPerStaker;

	mapping(uint256 => ETHDeposit) public ETHDeposits;
	uint256 public numETHDeposits;

	uint256 public numStakedNFTs;

	address public charity;
	// TODO: figure out the invariant that is always true that includes the modulo.
	//       It would be useful for testing.
	uint256 public modulo;
	uint256 public minStakePeriod = CosmicGameConstants.DEFAULT_MIN_STAKE_PERIOD;

	CosmicSignature public nft;
	CosmicGame public game;

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

	function deposit(uint256 timestamp) external payable {
		require(msg.sender == address(game), "Only the CosmicGame contract can deposit.");
		if (numStakedNFTs == 0) {
			// Forward the money to the charity. This execution path will happen at least once because
			//	at round=0 nobody has CS tokens and therefore nobody can't stake, while there will be a
			//	deposit at claimPrize()
			(bool success, ) = charity.call{ value: msg.value }("");
			require(success, "Transfer to charity contract failed.");
			emit CharityDepositEvent(msg.value,charity);
			return;
		}
		ETHDeposits[numETHDeposits].depositTime = timestamp;
		ETHDeposits[numETHDeposits].depositAmount = msg.value;
		ETHDeposits[numETHDeposits].numStaked = numStakedNFTs;
		numETHDeposits += 1;
		// TODO: This is the amount that would be frozen forever. Verify that this is true.
		modulo += msg.value % numStakedNFTs;
		emit EthDepositEvent(timestamp, numETHDeposits - 1, numStakedNFTs, msg.value, modulo);
	}

	function stake(uint256 _tokenId) public {

		uint256 numToks = tokenCountPerStaker[msg.sender];
		numToks += 1;
		tokenCountPerStaker[msg.sender] = numToks;
		if (!isStaker(msg.sender)) {
			_insertStaker(msg.sender);
		}
		nft.transferFrom(msg.sender, address(this), _tokenId);
		stakeActions[numStakeActions].tokenId = _tokenId;
		stakeActions[numStakeActions].owner = msg.sender;
		stakeActions[numStakeActions].stakeTime = block.timestamp;
		stakeActions[numStakeActions].unstakeEligibleTime = block.timestamp + minStakePeriod;
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
		require(stakeActions[stakeActionId].unstakeTime == 0, "Token has already been unstaked");
		require(stakeActions[stakeActionId].owner == msg.sender, "Only the owner can unstake");
		require(stakeActions[stakeActionId].unstakeEligibleTime < block.timestamp, "Not allowed to unstake yet");
		nft.transferFrom(address(this), msg.sender, stakeActions[stakeActionId].tokenId);
		stakeActions[stakeActionId].unstakeTime = block.timestamp;
		numStakedNFTs -= 1;
		uint256 numToks = tokenCountPerStaker[msg.sender];
		require((numToks - 1)<numToks,"Overflow in subtraction operation");
		numToks -= 1;
		tokenCountPerStaker[msg.sender] = numToks;
		if (numToks == 0 ) {
			_removeStaker(msg.sender);
			delete tokenCountPerStaker[msg.sender];
		}
		emit UnstakeActionEvent(stakeActionId, stakeActions[stakeActionId].tokenId, numStakedNFTs, msg.sender);
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
		// We are checking less than here, but there is a potential issue that the deposit and stake happen at the exact same time
		// Need to think about this some more.
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

	function setMinStakePeriod(uint256 newStakePeriod) external onlyOwner {
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

	function isStaker(address staker) public view returns (bool) {
		return stakerIndices[staker] != 0;
	}

	function numStakers() public view returns (uint256) {
		return uniqueStakers.length;
	}

	function stakerByIndex(uint256 index) public view returns (address) {
		require(index<uniqueStakers.length,"stakerByIndex(): index overflow");
		return uniqueStakers[index];
	}

	function numTokensByStaker(address staker) public view returns (uint256) {
		return tokenCountPerStaker[staker];
	}

	function _insertStaker(address staker) internal {
		require (!isStaker(staker),"Staker already in the list");
		if (stakerIndices[staker] == 0) {
			uniqueStakers.push(staker);
			stakerIndices[staker] = uniqueStakers.length;
		}
	}

	function _removeStaker(address staker) internal {
		require (isStaker(staker),"Staker is not in the list");
		uint256 index = stakerIndices[staker];
		address lastStaker = uniqueStakers[uniqueStakers.length - 1];
		uniqueStakers[index - 1] = lastStaker; // dev note: our indices do not start from 0
		stakerIndices[lastStaker] = index;
		delete stakerIndices[staker];
		uniqueStakers.pop();
	}
}
