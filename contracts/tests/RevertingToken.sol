// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { PrizesWallet } from "../production/PrizesWallet.sol";

/// @notice A deliberately incomplete token used to test failed ERC-20/ERC-721 donation transfers.
/// Its shared `transferFrom` selector can behave as either token standard, like `MaliciousToken`.
// Revert strings are intentional here: the tests verify that third-party revert data propagates.
// The ERC-20 and ERC-721 interfaces cannot both be inherited because their shared
// `transferFrom(address,address,uint256)` selector has incompatible return declarations.
// solhint-disable comprehensive-interface, gas-custom-errors
contract RevertingToken {
	PrizesWallet public immutable prizesWallet;

	/// @notice
	/// 1 = reject every `transferFrom`;
	/// 2 = reject only transfers out of `prizesWallet`, so donation succeeds but claiming fails;
	/// any other value = allow transfers.
	uint256 public modeCode = 0;

	mapping(uint256 nftId => address ownerAddress) public ownerOf;

	constructor(PrizesWallet prizesWallet_) {
		prizesWallet = prizesWallet_;
	}

	function setModeCode(uint256 newValue_) external {
		modeCode = newValue_;
	}

	function mintNft(address ownerAddress_, uint256 nftId_) external {
		ownerOf[nftId_] = ownerAddress_;
	}

	function transfer(address toAddress_, uint256 value_) external {
		transferFrom(msg.sender, toAddress_, value_);
	}

	function approve(address /* spender_ */, uint256 /* value_ */) external pure {
		// Doing nothing. This test token does not implement allowances.
		return;
	}

	// ERC-20 compatibility. SafeERC20 accepts a transfer method that returns no data.
	function balanceOf(address /* account_ */) external pure returns (uint256) {
		return 0;
	}

	// Shared by the ERC-20 and ERC-721 test paths.
	function transferFrom(address fromAddress_, address toAddress_, uint256 valueOrNftId_) public {
		uint256 modeCode_ = modeCode;
		if (modeCode_ == 1) {
			revert ("RevertingToken rejects transferFrom.");
		}
		if (modeCode_ == 2 && fromAddress_ == address(prizesWallet)) {
			revert ("RevertingToken rejects claim transfer.");
		}

		address ownerAddress_ = ownerOf[valueOrNftId_];
		if (ownerAddress_ != address(0)) {
			require(ownerAddress_ == fromAddress_, "RevertingToken: wrong NFT owner.");
			ownerOf[valueOrNftId_] = toAddress_;
		}
	}
}
// solhint-enable comprehensive-interface, gas-custom-errors
