// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.28;

/// @title Charitable donations management
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface collects donations and periodically sends them to a designated charity
/// @dev As noted in Comment-202409273, this contract is designed to be transparent. It allows anyone to trigger a donation transfer.
/// todo-0 Use this and other interfaces in some places where we use respective contracts.
/// todo-0 On the other hand, SMTChecker needs to know exactly which contract we call.
/// todo-0 Besides, it needs to see a high level call.
interface ICharityWallet {
	/// @notice Emitted when `charityAddress` is changed.
	/// @param newValue The new value.
	event CharityAddressChanged(address indexed newValue);

	/// @notice Emitted after a donation was received
	/// @param donorAddress Donor address
	/// @param amount The amount of ETH donated
	/// todo-1 Rename this to `DonationReceived`.
	event DonationReceivedEvent(address indexed donorAddress, uint256 amount);

	/// @notice Emitted after accumulated donations were sent to the charity.
	/// @param charityAddress Charity address.
	/// @param amount The amount of ETH transferred to the charity.
	/// @dev
	/// [ToDo-202409212-1]
	/// Consider eliminating this and using `CosmicSignatureEvents.FundsTransferredToCharity` instead.
	/// [/ToDo-202409212-1]
	/// todo-1 Rename this to `DonationSent`.
	event DonationSentEvent(address indexed charityAddress, uint256 amount);

	/// @notice Allows the contract to receive ETH donations
	/// @dev This function is called for plain ETH transfers without data
	/// todo-1 That dev comment is unnecessary. It's a well known fact.
	receive() external payable;

	/// @notice Sets `charityAddress`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	function setCharityAddress(address newValue_) external;

	/// @notice Sends all accumulated donations to the designated charity
	/// Expected to be called approximately once a month, but frequency may vary
	/// @dev
	/// [Comment-202409273]
	/// This function is intentionally not restricted to `onlyOwner` to ensure transparency
	/// and allow regular donations. It can be called by anyone at any time.
	/// todo-1 Do we need an oveload of this accepting an amount to send?
	/// [/Comment-202409273]
	function send() external;
}
