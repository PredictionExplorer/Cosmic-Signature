// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IStakingWalletCosmicSignatureNft, StakingWalletCosmicSignatureNft } from "../production/StakingWalletCosmicSignatureNft.sol";

contract BrokenStakingWalletCosmicSignatureNft {
	StakingWalletCosmicSignatureNft private /*immutable*/ _stakingWalletCosmicSignatureNft;

	/// @notice 0, 1, 2.
	uint256 private _depositBlockingModeCode = 0;

	constructor() {
		// Doing nothing.
	}

	receive() external payable {
		_checkIfDepositsAreBlocked();
	}

	function setStakingWalletCosmicSignatureNft(IStakingWalletCosmicSignatureNft newValue_) external {
		_stakingWalletCosmicSignatureNft = StakingWalletCosmicSignatureNft(address(newValue_));
	}

	function setDepositBlockingModeCode(uint256 newValue_) external {
		_depositBlockingModeCode = newValue_;
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
		_checkIfDepositsAreBlocked();
		_stakingWalletCosmicSignatureNft.deposit(roundNum_);
	}

	function _checkIfDepositsAreBlocked() private view {
		if (_depositBlockingModeCode == 1) {
			revert("I am not accepting deposits.");
		} else {
			assert(_depositBlockingModeCode == 0);
		}
	}
}
