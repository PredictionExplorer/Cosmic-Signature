// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { ICharityWallet } from "./interfaces/ICharityWallet.sol";

contract CharityWallet is Ownable, ICharityWallet {
	/// @notice The current designated charity address.
	address public charityAddress;

	// todo-1 Review where we use `_msgSender` and other `Context` methods.
	// todo-1 Is it really a good idea to use them?
	constructor() Ownable(_msgSender()) {
	}

	receive() external payable override {
		emit DonationReceivedEvent(_msgSender(), msg.value);
	}

	function setCharityAddress(address newValue_) external override onlyOwner {
		require(newValue_ != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		charityAddress = newValue_;
		emit CharityAddressChanged(newValue_);
	}

	function send() external override {
		// todo-1 Maybe force to set a nonzero charity address during deployment and replace this validation with an assert.
		require(charityAddress != address(0), CosmicSignatureErrors.ZeroAddress("Charity address not set."));
		uint256 amount = address(this).balance;
		// todo-1 See Comment-202409215.
		require(amount > 0, CosmicSignatureErrors.ZeroBalance("No funds to send."));

		(bool isSuccess, ) = charityAddress.call{ value: amount }("");
		require(isSuccess, CosmicSignatureErrors.FundTransferFailed("Transfer to charity failed.", charityAddress, amount));
		emit DonationSentEvent(charityAddress, amount);
	}
}
