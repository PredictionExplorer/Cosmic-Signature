// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import "./CosmicGameStorage.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { CosmicGameErrors } from "./CosmicGameErrors.sol";

contract ETHDonations is ReentrancyGuardUpgradeable,CosmicGameStorage {

	/// @notice Emitted when a donation is made
	/// @param donor The address of the donor
	/// @param amount The amount donated
	/// @param round The current round number
	event DonationEvent(address indexed donor, uint256 amount, uint256 round);

	/// @notice Emitted when a donation with additional info is made
	/// @param donor The address of the donor
	/// @param amount The amount donated
	/// @param recordId The ID of the donation record
	/// @param round The current round number
	event DonationWithInfoEvent(address indexed donor, uint256 amount, uint256 recordId, uint256 round);

	/// @notice Donate ETH to the game
	/// @dev This function allows users to donate ETH without placing a bid
	function donate() external payable nonReentrant {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("Donation amount must be greater than 0."));
		emit DonationEvent(_msgSender(), msg.value, roundNum);
	}

	/// @notice Donate ETH with additional information
	/// @dev This function allows users to donate ETH and attach a message or data
	/// @param _data Additional information about the donation
	function donateWithInfo(string calldata _data) external payable nonReentrant {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("Donation amount must be greater than 0."));
		uint256 recordId = donateWithInfoNumRecords;
		// ToDo-202408116-0 applies.
		donateWithInfoNumRecords = donateWithInfoNumRecords/*.add*/ + (1);
		donationInfoRecords[recordId] = CosmicGameConstants.DonationInfoRecord({
			donor: _msgSender(),
			amount: msg.value,
			data: _data
		});
		emit DonationWithInfoEvent(_msgSender(), msg.value, recordId, roundNum);
	}
}
