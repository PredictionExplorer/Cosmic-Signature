// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.26;

/// @title Charitable donations management
/// @author Cosmic Game Development Team
/// @notice A contract implementing this interface collects donations and periodically sends them to a designated charity
/// @dev The contract is designed to be transparent. It allows anyone to trigger a donation transfer
interface ICharityWallet {
	/// @notice Emitted after the designated charity address was updated
	/// @param newCharityAddress The new charity address
	event CharityUpdatedEvent(address indexed newCharityAddress);

	/// @notice Emitted after a donation was received
	/// @param donor Donor address
	/// @param amount The amount of ETH donated
	event DonationReceivedEvent(address indexed donor, uint256 amount);

	/// @notice Emitted after accumulated donations were sent to the charity
	/// @param charity The address of the charity receiving the donation
	/// @param amount The amount of ETH sent to the charity
	event DonationSentEvent(address indexed charity, uint256 amount);

	/// @notice Allows the contract to receive ETH donations
	/// @dev This function is called for plain ETH transfers without data
   /// todo-0 That dev comment is unnecessary. It's a well known fact.
	receive() external payable;

	/// @notice Sets or updates the address of the designated charity
	/// @dev Only the contract owner can call this function
	/// @param newCharityAddress The new charity address
	function setCharity(address newCharityAddress) external;

	/// @notice Sends all accumulated donations to the designated charity
	/// Expected to be called approximately once a month, but frequency may vary
	/// @dev This function is intentionally not restricted to onlyOwner to ensure transparency
	/// and allow regular donations. It can be called by anyone at any time.
	function send() external;

	/// @notice The address of the current designated charity
	function charityAddress() external view returns (address);
}
