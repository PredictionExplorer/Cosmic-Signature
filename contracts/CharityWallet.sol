// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameErrors } from "./Errors.sol";

/// @title CharityWallet - A contract for managing charitable donations
/// @author Cosmic Game Development Team
/// @notice This contract collects donations and periodically sends them to a designated charity
/// @dev This contract is designed to be transparent and allows anyone to trigger the donation transfer
contract CharityWallet is Ownable {
	/// @notice The address of the current designated charity
	address public charityAddress;

	/// @notice Emitted when a donation is received
	/// @param donor The address of the donor
	/// @param amount The amount of ETH donated
	event DonationReceivedEvent(address indexed donor, uint256 amount);

	/// @notice Emitted when accumulated donations are sent to the charity
	/// @param charity The address of the charity receiving the donation
	/// @param amount The amount of ETH sent to the charity
	event DonationSentEvent(address indexed charity, uint256 amount);

	/// @notice Emitted when the charity address is updated
	/// @param newCharityAddress The new address of the designated charity
	event CharityUpdatedEvent(address indexed newCharityAddress);

	/// @notice Allows the contract to receive ETH donations
	/// @dev This function is called for plain ETH transfers without data
	receive() external payable {
		emit DonationReceivedEvent(_msgSender(), msg.value);
	}

	/// @notice Sets or updates the address of the designated charity
	/// @dev Only the contract owner can call this function
	/// @param newCharityAddress The address of the new charity
	function setCharity(address newCharityAddress) external onlyOwner {
		require(newCharityAddress != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		charityAddress = newCharityAddress;
		emit CharityUpdatedEvent(charityAddress);
	}

	/// @notice Sends all accumulated donations to the designated charity
	/// @dev This function is intentionally not restricted to onlyOwner to ensure transparency
	///      and allow regular donations. It can be called by anyone at any time.
	/// @notice Expected to be called approximately once a month, but frequency may vary
	function send() external {
		require(charityAddress != address(0), CosmicGameErrors.ZeroAddress("Charity address not set."));
		uint256 amount = address(this).balance;
		require(amount > 0, CosmicGameErrors.ZeroBalance("No funds to send."));

		(bool success, ) = charityAddress.call{ value: amount }("");
		require(success, CosmicGameErrors.FundTransferFailed("Transfer failed.", amount, charityAddress));
		emit DonationSentEvent(charityAddress, amount);
	}
}
