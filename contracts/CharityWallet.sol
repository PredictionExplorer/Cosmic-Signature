// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameErrors } from "./Errors.sol";

/// @notice todo-1 write a comment
/// Comment-202408059 applies.
contract CharityWallet is Ownable {
	address public charityAddress;

	event DonationReceivedEvent(address indexed donor, uint256 amount);
	event DonationSentEvent(address indexed charity, uint256 amount);
	event CharityUpdatedEvent(address indexed newCharityAddress);

	receive() external payable {
		emit DonationReceivedEvent(_msgSender(), msg.value);
	}

	function setCharity(address newCharityAddress) external onlyOwner {
		require(newCharityAddress != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		charityAddress = newCharityAddress;
		emit CharityUpdatedEvent(charityAddress);
	}

	// todo-1 This will be called like once a month, right? Comment better.
	// todo-1 This is not `onlyOwner`. Explain why.
	function send() external {
		uint256 amount = address(this).balance;
		(bool success, ) = charityAddress.call{ value: amount }("");
		require(success, CosmicGameErrors.FundTransferFailed("Transfer failed.", amount, charityAddress));
		emit DonationSentEvent(charityAddress, amount);
	}
}
