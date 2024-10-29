// SPDX-License-Identifier: MIT

pragma solidity 0.8.27;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicGameStorage } from "./CosmicGameStorage.sol";
import { IETHDonations } from "./interfaces/IETHDonations.sol";
import { SystemManagement } from "./SystemManagement.sol";

abstract contract ETHDonations is ReentrancyGuardUpgradeable, CosmicGameStorage, SystemManagement, IETHDonations {
	function donate() external payable override onlyRuntime {
		// todo-1 See Comment-202409215.
		require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("Donation amount must be greater than 0."));
		emit DonationEvent(msg.sender, msg.value, roundNum);
	}

	function donateWithInfo(string calldata _data) external payable override onlyRuntime {
		// todo-1 Comment-202409215 should not apply here.
		// todo-1 But should we enforce a minimum donation?
		// todo-1 But this whole ETH donation thing is questionable. Why don't we force the user within to show a message
		// todo-1 to simply bid with a message?
		// todo-1 But currently bid with a message isn't supported, right?
		require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("Donation amount must be greater than 0."));

		uint256 donationInfoRecordIndex_ = numDonationInfoRecords;
		donationInfoRecords[donationInfoRecordIndex_] = CosmicGameConstants.DonationInfoRecord({
			donor: msg.sender,
			amount: msg.value,
			data: _data
		});
		numDonationInfoRecords = donationInfoRecordIndex_ + 1;
		emit DonationWithInfoEvent(msg.sender, msg.value, donationInfoRecordIndex_, roundNum);
	}
}
