// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IStakingWalletCosmicSignatureNft, StakingWalletCosmicSignatureNft } from "../production/StakingWalletCosmicSignatureNft.sol";
import { BrokenEthReceiver } from "./BrokenEthReceiver.sol";

contract BrokenStakingWalletCosmicSignatureNft is BrokenEthReceiver {
	StakingWalletCosmicSignatureNft public /*immutable*/ stakingWalletCosmicSignatureNft;

	constructor() {
		// Doing nothing.
	}

	function setStakingWalletCosmicSignatureNft(IStakingWalletCosmicSignatureNft newValue_) external {
		stakingWalletCosmicSignatureNft = StakingWalletCosmicSignatureNft(address(newValue_));
	}

	function doSetApprovalForAll(IERC721 nft_) external {
		nft_.setApprovalForAll(address(stakingWalletCosmicSignatureNft), true);
	}

	function deposit(uint256 roundNum_) external payable {
		_doDeposit(roundNum_);
	}

	function doDeposit(uint256 roundNum_) external payable {
		_doDeposit(roundNum_);
	}

	function _doDeposit(uint256 roundNum_) private {
		_checkIfEthDepositsAreAccepted();
		stakingWalletCosmicSignatureNft.deposit{value: msg.value}(roundNum_);
	}
}
