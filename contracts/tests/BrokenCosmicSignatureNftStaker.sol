// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { StakingWalletCosmicSignatureNft } from "../production/StakingWalletCosmicSignatureNft.sol";
import { BrokenEthReceiver } from "./BrokenEthReceiver.sol";

contract BrokenCosmicSignatureNftStaker is BrokenEthReceiver {
	StakingWalletCosmicSignatureNft public immutable stakingWalletCosmicSignatureNft;

	constructor(StakingWalletCosmicSignatureNft stakingWalletCosmicSignatureNft_) {
		stakingWalletCosmicSignatureNft = stakingWalletCosmicSignatureNft_;
	}

	function doSetApprovalForAll() external {
		stakingWalletCosmicSignatureNft.nft().setApprovalForAll(address(stakingWalletCosmicSignatureNft), true);
	}

	function doStake(uint256 nftId_) external {
		stakingWalletCosmicSignatureNft.stake(nftId_);
	}

	function doUnstake(uint256 stakeActionId_) external {
		stakingWalletCosmicSignatureNft.unstake(stakeActionId_);
	}
}
