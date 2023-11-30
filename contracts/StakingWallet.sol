// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicSignature } from "./CosmicSignature.sol";

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

    CosmicSignature public nft;
    CosmicGame public game;

	event StakeActionEvent(uint256 indexed actionId, uint256 indexed tokenId,uint256 totalNFTs,uint256 unstakeTime,address staker);
	event UnstakeActionEvent(uint256 indexed actionId ,uint256 indexed tokenId,uint256 totalNFTs,address staker);
	event ClaimRewardEvent(uint256 indexed actionId,uint256 indexed depositId,uint256 reward, address staker);
	event EthDepositEvent(uint256 indexed depositTime,uint256 depositNum, uint256 numStakedNFTs,uint256 amount,uint256 modulo); 
	event CharityUpdatedEvent(address indexed newCharityAddress);
    constructor(CosmicSignature nft_, CosmicGame game_, address charity_) {
        nft = nft_;
        game = game_;
        charity = charity_;
    }

    function deposit(uint256 timestamp) external payable {
        require(msg.sender == address(game), "Only the CosmicGame contract can deposit.");
        if (numStakedNFTs == 0) {
            // Forward the money to the charity
            (bool success, ) = charity.call{value: msg.value}("");
            require(success, "Transfer to charity contract failed.");
			return;
        }
        ETHDeposits[numETHDeposits].depositTime = timestamp;
        ETHDeposits[numETHDeposits].depositAmount = msg.value;
		ETHDeposits[numETHDeposits].numStaked = numStakedNFTs;
        numETHDeposits += 1;
        // TODO: This is the amount that would be frozen forever. Verify that this is true.
        modulo += msg.value % numStakedNFTs;
		emit EthDepositEvent(timestamp,numETHDeposits-1,numStakedNFTs,msg.value,modulo);
    }

    function stake(uint256 _tokenId) external {
        nft.transferFrom(msg.sender, address(this), _tokenId);
        stakedNFTs[numStakeActions].tokenId = _tokenId;
        stakedNFTs[numStakeActions].owner = msg.sender;
        stakedNFTs[numStakeActions].stakeTime = block.timestamp;
        uint256 fractionStaked = (1e6 * numStakedNFTs) / nft.totalSupply();
        uint256 extraTime = fractionStaked * fractionStaked / 1500 + 2600000;
        stakedNFTs[numStakeActions].unstakeEligibleTime = block.timestamp + extraTime;
        numStakeActions += 1;
        numStakedNFTs += 1;
		emit StakeActionEvent(numStakeActions-1,_tokenId,numStakedNFTs,stakedNFTs[numStakeActions].unstakeEligibleTime,msg.sender);
    }

    function unstake(uint256 stakeActionId) external {
        require (stakedNFTs[stakeActionId].unstakeTime == 0, "Token has already been unstaked");
        require (stakedNFTs[stakeActionId].owner == msg.sender, "Only the owner can unstake");
        require (stakedNFTs[stakeActionId].unstakeEligibleTime < block.timestamp, "Not allowed to unstake yet");
        nft.transferFrom(address(this), msg.sender, stakedNFTs[numStakeActions].tokenId);
        stakedNFTs[stakeActionId].unstakeTime = block.timestamp;
        numStakedNFTs -= 1;
		emit UnstakeActionEvent(stakeActionId,stakedNFTs[stakeActionId].tokenId,numStakedNFTs,msg.sender);
    }

    function claimReward(uint256 stakeActionId, uint256 ETHDepositId) external {
        require (stakedNFTs[stakeActionId].unstakeTime > 0, "Token has not been unstaked");
        require (!stakedNFTs[stakeActionId].depositClaimed[ETHDepositId], "Token has not been unstaked");
        require (stakedNFTs[stakeActionId].owner == msg.sender, "Only the owner can claim reward");
        // We are checking less than here, but there is a potential issue that the deposit and stake happen at the exact same time
        // Need to think about this some more.
        require (stakedNFTs[stakeActionId].stakeTime < ETHDeposits[ETHDepositId].depositTime, "You were not staked yet.");
        require (stakedNFTs[stakeActionId].unstakeTime > ETHDeposits[ETHDepositId].depositTime, "You were already unstaked.");
        stakedNFTs[stakeActionId].depositClaimed[ETHDepositId] = true;
        uint256 amount = ETHDeposits[ETHDepositId].depositAmount / ETHDeposits[ETHDepositId].numStaked;
        (bool success, ) = stakedNFTs[stakeActionId].owner.call{value: amount}("");
        require(success, "Reward transfer failed.");
		emit ClaimRewardEvent(stakeActionId,ETHDepositId,amount,msg.sender);
    }
	function setCharity(address newCharityAddress) external onlyOwner {
        require(newCharityAddress != address(0), "Zero-address was given.");
        charity = newCharityAddress;
        emit CharityUpdatedEvent(charity);
    }

}
