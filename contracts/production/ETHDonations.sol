// SPDX-License-Identifier: MIT

pragma solidity 0.8.27;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IETHDonations } from "./interfaces/IETHDonations.sol";
import { SystemManagement } from "./SystemManagement.sol";

abstract contract ETHDonations is ReentrancyGuardUpgradeable, CosmicSignatureGameStorage, SystemManagement, IETHDonations {
	/// todo-1 Should we allow donations even while the system is inactive?
	/// todo-1 Rename to `donateEth`?
	function donate() external payable override onlyActive {
		// todo-1 See Comment-202409215.
		require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("Donation amount must be greater than 0."));
		emit DonationEvent(msg.sender, msg.value, roundNum);
	}

	/// todo-1 Should we allow donations even while the system is inactive?
	/// todo-1 Rename to `donateEthWithInfo`?
	function donateWithInfo(string calldata _data) external payable override onlyActive {
		// todo-1 Unlike in `donate`, Comment-202409215 should not apply here.
		// todo-1 But should we enforce a minimum donation?
		// todo-1 But this whole ETH donation thing is questionable. Why don't we force the user willing to show a message
		// todo-1 to simply bid with a message?
		// todo-1 Or is this feature meant to be for Taras to jump-start the game? Then why not just make the 1st bid?
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
