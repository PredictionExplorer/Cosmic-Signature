// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { StakingWalletCosmicSignatureNft } from "../production/StakingWalletCosmicSignatureNft.sol";

contract MaliciousCosmicSignatureNftStaker {
	StakingWalletCosmicSignatureNft public immutable stakingWalletCosmicSignatureNft;
	uint256 public modeCode = 0;
	uint256 public transient reentryDepth;

	constructor(StakingWalletCosmicSignatureNft stakingWalletCosmicSignatureNft_) {
		stakingWalletCosmicSignatureNft = stakingWalletCosmicSignatureNft_;
	}

	receive() external payable {
		_reenterIfNeeded();
	}

	function setModeCode(uint256 newValue_) external {
		modeCode = newValue_;
	}

	function doSetApprovalForAll() external {
		stakingWalletCosmicSignatureNft.nft().setApprovalForAll(address(stakingWalletCosmicSignatureNft), true);
	}

	function doStake(uint256 nftId_) public {
		stakingWalletCosmicSignatureNft.stake(nftId_);
	}

	function doStakeMany(uint256[] memory nftIds_) public {
		stakingWalletCosmicSignatureNft.stakeMany(nftIds_);
	}

	function doUnstake(uint256 stakeActionId_) public {
		stakingWalletCosmicSignatureNft.unstake(stakeActionId_);
	}

	function doUnstakeMany(uint256[] memory stakeActionIds_) public {
		stakingWalletCosmicSignatureNft.unstakeMany(stakeActionIds_);
	}

	function doDeposit(uint256 roundNum_) external payable {
		_doDeposit(roundNum_);
	}

	function _doDeposit(uint256 roundNum_) private {
		stakingWalletCosmicSignatureNft.deposit{value: msg.value}(roundNum_);
	}

	function _doTryPerformMaintenance(address charityAddress_) private returns (bool) {
		return stakingWalletCosmicSignatureNft.tryPerformMaintenance(charityAddress_);
	}

	function _reenterIfNeeded() internal {
		if (reentryDepth <= 0) {
			++ reentryDepth;
			if (modeCode == 1) {
				doStake(0);
			} else if (modeCode == 2) {
				uint256[] memory nftIds_;
				doStakeMany(nftIds_);
			} else if (modeCode == 3) {
				doUnstake(1);
			} else if (modeCode == 4) {
				uint256[] memory stakeActionIds_;
				doUnstakeMany(stakeActionIds_);
			} else if (modeCode == 5) {
				_doDeposit(0);
			} else if (modeCode == 6) {
				_doTryPerformMaintenance(address(0));
			}
			-- reentryDepth;
		}
	}
}
