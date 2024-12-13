// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
// import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { IEthDonations } from "./interfaces/IEthDonations.sol";

abstract contract EthDonations is
	CosmicSignatureGameStorage,
	SystemManagement,
	IEthDonations {
	function donateEth() external payable override onlyActive {
		// // Comment-202409215 applies.
		// require(msg.value > 0, CosmicSignatureErrors.NonZeroValueRequired("Donation amount must be greater than 0."));

		emit EthDonated(roundNum, msg.sender, msg.value);
	}

	function donateEthWithInfo(string calldata data_) external payable override onlyActive {
		// // Comment-202409215 applies.
		// require(msg.value > 0, CosmicSignatureErrors.NonZeroValueRequired("Donation amount must be greater than 0."));

		uint256 ethDonationWithInfoRecordIndex_ = ethDonationWithInfoRecords.length;
		CosmicSignatureConstants.DonationWithInfoRecord storage ethDonationWithInfoRecordReference_ = ethDonationWithInfoRecords.push();
		ethDonationWithInfoRecordReference_.roundNum = roundNum;
		ethDonationWithInfoRecordReference_.donorAddress = msg.sender;
		ethDonationWithInfoRecordReference_.amount = msg.value;
		ethDonationWithInfoRecordReference_.data = data_;
		emit EthDonatedWithInfo(roundNum, msg.sender, msg.value, ethDonationWithInfoRecordIndex_);
	}

	function numEthDonationWithInfoRecords() external view returns(uint256) {
		return ethDonationWithInfoRecords.length;
	}
}
