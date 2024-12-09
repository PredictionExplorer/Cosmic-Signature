// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { ICharityWallet } from "./interfaces/ICharityWallet.sol";

contract CharityWallet is Ownable, ICharityWallet {
	/// @notice The current designated charity address.
	address public charityAddress;

	/// todo-1 Review where we use `_msgSender` and other `Context` methods.
	/// todo-1 Is it really a good idea to use them?
	constructor() Ownable(_msgSender()) {
	}

	receive() external payable override {
		emit DonationReceived(_msgSender(), msg.value);
	}

	function setCharityAddress(address newValue_) external override onlyOwner {
		// todo-1 Why not allow to set it to zero? It would give us an option to pause charity donations.
		require(newValue_ != address(0), CosmicSignatureErrors.ZeroAddress("Zero-address was given."));
		charityAddress = newValue_;
		emit CharityAddressChanged(newValue_);
	}

	function send() external override {
		require(charityAddress != address(0), CosmicSignatureErrors.ZeroAddress("Charity address not set."));
		uint256 amount_ = address(this).balance;

		// // Comment-202409215 applies.
		// require(amount_ > 0, CosmicSignatureErrors.ZeroBalance("No funds to send."));

		emit DonationSent(charityAddress, amount_);
		(bool isSuccess_, ) = charityAddress.call{ value: amount_ }("");
		require(isSuccess_, CosmicSignatureErrors.FundTransferFailed("Transfer to charity failed.", charityAddress, amount_));
	}
}
