// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureEvents } from "./libraries/CosmicSignatureEvents.sol";
import { ICharityWallet } from "./interfaces/ICharityWallet.sol";

/// @title CharityWallet
/// @author Cosmic Signature Team
/// @notice Manages ETH donations to charity from the Cosmic Signature protocol.
/// @dev This contract receives ETH donations from the Game contract and allows anyone
/// to trigger the transfer of accumulated funds to a designated charity address.
/// The owner can change the charity address. Anyone can call `send` to forward funds.
contract CharityWallet is ReentrancyGuardTransient, Ownable, ICharityWallet {
	/// @notice The current designated charity address.
	/// It can be zero.
	address public charityAddress = address(0);

	/// @notice Constructor sets the deployer as the owner.
	constructor() Ownable(_msgSender()) {
		// Doing nothing.
	}

	/// @notice Receives ETH donations.
	/// @dev Emits `DonationReceived` event.
	receive() external payable override nonReentrant {
		emit DonationReceived(_msgSender(), msg.value);
	}

	/// @inheritdoc ICharityWallet
	function setCharityAddress(address newValue_) external override onlyOwner {
		charityAddress = newValue_;
		emit CharityAddressChanged(newValue_);
	}

	/// @inheritdoc ICharityWallet
	/// @dev Sends the entire contract balance to the charity address.
	function send() external override nonReentrant /*onlyOwner*/ {
		// It's OK if this is zero.
		uint256 amount_ = address(this).balance;

		_send(amount_);
	}

	/// @inheritdoc ICharityWallet
	function send(uint256 amount_) external override nonReentrant /*onlyOwner*/ {
		_send(amount_);
	}

	function _send(uint256 amount_) private {
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
