// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;
import { StakingWallet } from "../StakingWallet.sol";
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
	function doStake(uint256 tokenId) external {
		stakingWallet.stake(tokenId);
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
