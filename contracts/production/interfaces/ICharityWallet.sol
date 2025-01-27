// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

/// @title Charitable donations management.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface collects donations and periodically sends them to a designated charity.
/// @dev As noted in Comment-202409273, this contract is designed to be transparent. It allows anyone to trigger a donation transfer.
interface ICharityWallet {
	/// @notice Emitted when `charityAddress` is changed.
	/// @param newValue The new value.
	event CharityAddressChanged(address indexed newValue);

	/// @notice Emitted after a donation was received.
	/// @param donorAddress Donor address.
	/// @param amount The amount of ETH donated.
	event DonationReceived(address indexed donorAddress, uint256 amount);

	// /// @notice Emitted after accumulated donations were sent to the charity.
	// /// @param charityAddress Charity address.
	// /// @param amount The amount of ETH transferred to the charity.
	// /// @dev I have eliminated this and instead using `CosmicSignatureEvents.FundsTransferredToCharity`.
	// event DonationSent(address indexed charityAddress, uint256 amount);

	/// @notice Allows the contract to receive ETH donations.
	receive() external payable;

	/// @notice Sets `charityAddress`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	/// It's OK if it's zero -- to give the contract owner an option to temporarily suspend charity donations.
	function setCharityAddress(address newValue_) external;

	/// @notice Sends all accumulated donations to the designated charity.
	/// Expected to be called approximately once a month, but frequency may vary
	/// @dev
	/// [Comment-202409273]
	/// This function is intentionally not restricted to `onlyOwner` to ensure transparency
	/// and allow regular donations. It can be called by anyone at any time.
	/// [/Comment-202409273]
	/// todo-1 Do we need an oveload of this accepting an amount to send?
	function send() external;
}
