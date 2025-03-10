// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

/// @title Charitable donations management.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface collects ETH donations
/// and lets anybody to periodically transfer accumulated donations to a designated charity.
/// @dev As noted in Comment-202409273, this contract is designed to be transparent.
/// It allows anyone to trigger a donated funds transfer.
interface ICharityWallet {
	/// @notice Emitted when `charityAddress` is changed.
	/// @param newValue The new value.
	/// It can be zero.
	event CharityAddressChanged(address indexed newValue);

	/// @notice Emitted after a donation was received.
	/// @param donorAddress Donor address.
	/// @param amount The amount of ETH donated.
	/// It can be zero.
	event DonationReceived(address indexed donorAddress, uint256 amount);

	// todo-1 +++ I posted a message that I had eliminated this: https://predictionexplorer.slack.com/archives/C02EDDE5UF8/p1738629443108849
	// todo-1 +++ Leave this commented? Don't remove?
	// /// @notice Emitted after accumulated donations were transferred to the charity.
	// /// @param charityAddress Charity address.
	// /// @param amount The amount of ETH transferred to the charity.
	// /// It can be zero.
	// /// @dev I have eliminated this event and instead using `CosmicSignatureEvents.FundsTransferredToCharity`.
	// event DonationSent(address indexed charityAddress, uint256 amount);

	/// @notice Allows the contract to receive ETH donations.
	/// It's OK if `msg.value` is zero.
	receive() external payable;

	/// @notice Sets `charityAddress`.
	/// Only the contract owner is permitted to call this method.
	/// @param newValue_ The new value.
	/// It may be zero -- to give the contract owner an option to temporarily suspend charity donations.
	function setCharityAddress(address newValue_) external;

	/// @notice Sends all accumulated ETH donations to the designated charity.
	/// [Comment-202502035]
	/// Expected to be called approximately once a month, but frequency may vary.
	/// [/Comment-202502035]
	/// @dev
	/// [Comment-202409273]
	/// This method is intentionally not restricted to `onlyOwner`. Anybody is welcomed to call it at any time.
	/// This design ensures transparency and encourages regular donations.
	/// [/Comment-202409273]
	function send() external;

	/// @notice Sends the given ETH amount to the designated charity.
	/// Comment-202502035 applies.
	/// @param amount_ ETH amount to transfer to charity.
	/// It's OK if it's zero.
	/// @dev Comment-202409273 applies.
	function send(uint256 amount_) external;
}
