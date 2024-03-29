// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { CosmicGameConstants } from "./Constants.sol";

contract StakingWallet is Ownable {
	struct stakedNFT {
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

	mapping(uint256 => stakedNFT) public stakedNFTs;
	uint256 public numStakeActions;

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
		nft.transferFrom(msg.sender, address(this), _tokenId);
		stakedNFTs[numStakeActions].tokenId = _tokenId;
		stakedNFTs[numStakeActions].owner = msg.sender;
		stakedNFTs[numStakeActions].stakeTime = block.timestamp;
		stakedNFTs[numStakeActions].unstakeEligibleTime = block.timestamp + minStakePeriod;
		numStakeActions += 1;
		numStakedNFTs += 1;
		emit StakeActionEvent(
			numStakeActions - 1,
			_tokenId,
			numStakedNFTs,
			stakedNFTs[numStakeActions - 1].unstakeEligibleTime,
			msg.sender
		);
	}

	function stakeMany(uint256[] memory ids) external {
		for (uint256 i = 0; i < ids.length; i++) {
			stake(ids[i]);
		}
	}

	function unstake(uint256 stakeActionId) public {
		require(stakedNFTs[stakeActionId].unstakeTime == 0, "Token has already been unstaked");
		require(stakedNFTs[stakeActionId].owner == msg.sender, "Only the owner can unstake");
		require(stakedNFTs[stakeActionId].unstakeEligibleTime < block.timestamp, "Not allowed to unstake yet");
		nft.transferFrom(address(this), msg.sender, stakedNFTs[stakeActionId].tokenId);
		stakedNFTs[stakeActionId].unstakeTime = block.timestamp;
		numStakedNFTs -= 1;
		emit UnstakeActionEvent(stakeActionId, stakedNFTs[stakeActionId].tokenId, numStakedNFTs, msg.sender);
	}

	function unstakeMany(uint256[] memory ids) external {
		for (uint256 i = 0; i < ids.length; i++) {
			unstake(ids[i]);
		}
	}

	function claimReward(uint256 stakeActionId, uint256 ETHDepositId) public {
		require(stakeActionId<numStakeActions,"Invalid stakeActionId.");
		require(ETHDepositId<numETHDeposits,"Invalid ETHDepositId.");
		require(stakedNFTs[stakeActionId].unstakeTime > 0, "Token has not been unstaked");
		require(!stakedNFTs[stakeActionId].depositClaimed[ETHDepositId], "This deposit was claimed already");
		require(stakedNFTs[stakeActionId].owner == msg.sender, "Only the owner can claim reward");
		// We are checking less than here, but there is a potential issue that the deposit and stake happen at the exact same time
		// Need to think about this some more.
		require(
			stakedNFTs[stakeActionId].stakeTime < ETHDeposits[ETHDepositId].depositTime,
			"You were not staked yet."
		);
		require(
			stakedNFTs[stakeActionId].unstakeTime > ETHDeposits[ETHDepositId].depositTime,
			"You were already unstaked."
		);
		stakedNFTs[stakeActionId].depositClaimed[ETHDepositId] = true;
		uint256 amount = ETHDeposits[ETHDepositId].depositAmount / ETHDeposits[ETHDepositId].numStaked;
		(bool success, ) = stakedNFTs[stakeActionId].owner.call{ value: amount }("");
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
}
