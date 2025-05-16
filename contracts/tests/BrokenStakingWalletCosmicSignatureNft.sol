// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IStakingWalletCosmicSignatureNft, StakingWalletCosmicSignatureNft } from "../production/StakingWalletCosmicSignatureNft.sol";
import { BrokenEthReceiver } from "./BrokenEthReceiver.sol";

contract BrokenStakingWalletCosmicSignatureNft is BrokenEthReceiver {
	StakingWalletCosmicSignatureNft private /*immutable*/ _stakingWalletCosmicSignatureNft;

	constructor() {
		// Doing nothing.
	}

	function setStakingWalletCosmicSignatureNft(IStakingWalletCosmicSignatureNft newValue_) external {
		_stakingWalletCosmicSignatureNft = StakingWalletCosmicSignatureNft(address(newValue_));
	}

	function doSetApprovalForAll(IERC721 nft_) external {
		nft_.setApprovalForAll(address(_stakingWalletCosmicSignatureNft), true);
	}

	function doStake(uint256 nftId) external {
		_stakingWalletCosmicSignatureNft.stake(nftId);
	}

	function doUnstake(uint256 stakeActionId_) external {
		_stakingWalletCosmicSignatureNft.unstake(stakeActionId_);
	}

	function deposit(uint256 roundNum_) external payable {
		doDeposit(roundNum_);
	}

	function doDeposit(uint256 roundNum_) public payable {
		_checkIfEthDepositsAreAccepted();
		_stakingWalletCosmicSignatureNft.deposit(roundNum_);
	}
}
