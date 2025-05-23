// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureEvents } from "./libraries/CosmicSignatureEvents.sol";
import { ICharityWallet } from "./interfaces/ICharityWallet.sol";

contract CharityWallet is Ownable, ICharityWallet {
	/// @notice The current designated charity address.
	/// It can be zero.
	address public charityAddress = address(0);

	constructor() Ownable(_msgSender()) {
		// Doing nothing.
	}

	receive() external payable override {
		emit DonationReceived(_msgSender(), msg.value);
	}

	function setCharityAddress(address newValue_) external override onlyOwner {
		charityAddress = newValue_;
		emit CharityAddressChanged(newValue_);
	}

	function send() external override /*onlyOwner*/ {
		// It's OK if this is zero.
		uint256 amount_ = address(this).balance;

		send(amount_);
	}

	function send(uint256 amount_) public override /*onlyOwner*/ {
		address charityAddressCopy_ = charityAddress;
		require(charityAddressCopy_ != address(0), CosmicSignatureErrors.ZeroAddress("Charity address not set."));
		// emit DonationSent(charityAddressCopy_, amount_);
		emit CosmicSignatureEvents.FundsTransferredToCharity(charityAddressCopy_, amount_);

		// Comment-202502043 applies.
		(bool isSuccess_, ) = charityAddressCopy_.call{value: amount_}("");

		if ( ! isSuccess_ ) {
			revert CosmicSignatureErrors.FundTransferFailed("ETH transfer to charity failed.", charityAddressCopy_, amount_);
		}
	}
}
