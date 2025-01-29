// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
// import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IEthDonations } from "./interfaces/IEthDonations.sol";

abstract contract EthDonations is CosmicSignatureGameStorage, IEthDonations {
	function donateEth() external payable override /*onlyRoundIsActive*/ {
		emit EthDonated(roundNum, msg.sender, msg.value);
	}

	function donateEthWithInfo(string calldata data_) external payable override /*onlyRoundIsActive*/ {
		uint256 ethDonationWithInfoRecordIndex_ = ethDonationWithInfoRecords.length;
		EthDonationWithInfoRecord storage ethDonationWithInfoRecordReference_ = ethDonationWithInfoRecords.push();
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
