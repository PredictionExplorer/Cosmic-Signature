// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { ICharityWallet } from "./interfaces/ICharityWallet.sol";

contract CharityWallet is Ownable, ICharityWallet {
	address public override charityAddress;

	// [ToDo-202408114-1]
	// `Ownable` `constructor` and `__Ownable_init` now require a nonzero `initialOwner`.
	// I have provided a simple one, but this implementation is to be revisited everywhere this ToDo is referenced.
	// [/ToDo-202408114-1]
	constructor() Ownable(msg.sender) {
	}

	receive() external payable override {
		emit DonationReceivedEvent(_msgSender(), msg.value);
	}

	function setCharity(address newCharityAddress) external override onlyOwner {
		// todo-0 Here and in a few other places, SolHint generates this warning:
		// todo-0 warning  GC: Use Custom Errors instead of require statements  gas-custom-errors
		require(newCharityAddress != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		charityAddress = newCharityAddress;
		emit CharityUpdatedEvent(charityAddress);
	}

	function send() external override {
		require(charityAddress != address(0), CosmicGameErrors.ZeroAddress("Charity address not set."));
		uint256 amount = address(this).balance;
		require(amount > 0, CosmicGameErrors.ZeroBalance("No funds to send."));

		(bool success, ) = charityAddress.call{ value: amount }("");
		require(success, CosmicGameErrors.FundTransferFailed("Transfer failed.", amount, charityAddress));
		emit DonationSentEvent(charityAddress, amount);
	}
}
