// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;
import { StakingWallet } from "../StakingWallet.sol";
import { RaffleWallet } from "../RaffleWallet.sol";
import { CosmicGame } from "../CosmicGame.sol";
import { CosmicSignature } from "../CosmicSignature.sol";
import { CosmicToken } from "../CosmicToken.sol";
import { CosmicGameConstants } from "../Constants.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract BrokenToken {
	// used to test revert() statements in token transfers in claimPrize() function
	uint256 counter;
    function mint(address , uint256 round) public {
		counter = round;
		require(false,"Test mint() failed");
    }
	function totalSupply() public pure returns (uint256) {
		return 1;
	}
}
contract BrokenERC20 {
	// used to test revert() statements in BusinessLogic contract
	uint256 counter;
	function mint(address, uint256) external pure {
		require(false,"Test mint() (ERC20) failed");
	}
}
contract BrokenCharity {
	// used to test revert() statements for charity deposits
	uint256 counter;
	receive() external payable {
		require(false,"Test deposit failed");
    }
}
contract BrokenStaker {
	// used to test revert() statements in StakingWallet
	bool blockDeposits = false;
	StakingWallet stakingWallet;
	constructor(StakingWallet sw_,address nft_) {
		stakingWallet = sw_;
		IERC721(nft_).setApprovalForAll(address(sw_), true);
	}
	receive() external payable {
		require(!blockDeposits,"I am not accepting deposits");
    }
	function doStake(uint256 tokenId,bool isRWalk) external {
		stakingWallet.stake(tokenId,isRWalk);
	}
	function doUnstake(uint256 actionId) external {
		stakingWallet.unstake(actionId);
	}
	function doClaimReward(uint256 stakeActionId,uint256 depositId) external {
		stakingWallet.claimReward(stakeActionId,depositId);
	}
	function startBlockingDeposits() external {
		blockDeposits = true;
    }
}
contract SelfdestructibleCosmicGame is CosmicGame {
	// This contract will return all the assets before selfdestruct transaction, 
	// required for testing on the MainNet (Arbitrum) (prior to launch)

	constructor() CosmicGame() {}

	function finalizeTesting() external onlyOwner {
		// returns all the assets to the creator of the contract and self-destroys

		// CosmicSignature tokens
		uint256 cosmicSupply = nft.totalSupply();
		for (uint256 i = 0; i < cosmicSupply ; i++) {
			address owner = nft.ownerOf(i);
			if (owner == address(this)) {
				nft.transferFrom(address(this), this.owner(), i);
			}
		}
		cosmicSupply = token.balanceOf(address(this));
		token.transfer(this.owner(),cosmicSupply);
		for (uint256 i = 0; i < numDonatedNFTs; i++) {
			CosmicGameConstants.DonatedNFT memory dnft = donatedNFTs[i];
			IERC721(dnft.nftAddress).transferFrom(address(this),this.owner(),dnft.tokenId);
        }
		selfdestruct(payable(this.owner()));
	}
}
contract SpecialCosmicGame is CosmicGame {
	// special CosmicGame contract to be used in unit tests to create special test setups

	constructor() CosmicGame() {}
	function setCharityRaw(address addr) external {
        charity = addr;
    }
	function setRaffleWalletRaw(address addr) external {
		raffleWallet = RaffleWallet(addr);
	}
	function setStakingWalletRaw(address addr) external {
		stakingWallet = StakingWallet(addr);
	}
	function setNftContractRaw(address addr) external {
		nft = CosmicSignature(addr);
	}
	function setTokenContractRaw(address addr) external {
		token = CosmicToken(addr);
	}
	function setActivationTimeRaw(uint256 newActivationTime) external {
        activationTime = newActivationTime;
        lastCSTBidTime = activationTime;
	}
}
contract TestStakingWallet is StakingWallet {

	constructor(CosmicSignature nft_, CosmicGame game_, address charity_) StakingWallet(nft_, game_, charity_) {}
	
	// note: functions must be copied from parent by hand (after every update), since parent have them as 'internal'
	function insertStaker(address staker) external {
		require (!isStaker(staker),"Staker already in the list");
		if (stakerIndices[staker] == 0) {
			uniqueStakers.push(staker);
			stakerIndices[staker] = uniqueStakers.length;
		}
	}

	function removeStaker(address staker) external {
		require (isStaker(staker),"Staker is not in the list");
		uint256 index = stakerIndices[staker];
		address lastStaker = uniqueStakers[uniqueStakers.length - 1];
		uniqueStakers[index - 1] = lastStaker; // dev note: our indices do not start from 0
		stakerIndices[lastStaker] = index;
		delete stakerIndices[staker];
		uniqueStakers.pop();
	}
}
