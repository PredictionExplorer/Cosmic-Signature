// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
// import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "../production/OwnableUpgradeableWithReservedStorageGaps.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IEthDonations } from "./interfaces/IEthDonations.sol";

abstract contract EthDonations is
	OwnableUpgradeableWithReservedStorageGaps,
	CosmicSignatureGameStorage,
	IEthDonations {
	function donateEth() external payable override /*onlyRoundIsActive*/ {
		emit EthDonated(roundNum, _msgSender(), msg.value);
	}

	function donateEthWithInfo(string calldata data_) external payable override /*onlyRoundIsActive*/ {
		uint256 ethDonationWithInfoRecordIndex_ = ethDonationWithInfoRecords.length;
		EthDonationWithInfoRecord storage ethDonationWithInfoRecordReference_ = ethDonationWithInfoRecords.push();
		ethDonationWithInfoRecordReference_.roundNum = roundNum;
		ethDonationWithInfoRecordReference_.donorAddress = _msgSender();
		ethDonationWithInfoRecordReference_.amount = msg.value;
		ethDonationWithInfoRecordReference_.data = data_;
		emit EthDonatedWithInfo(roundNum, _msgSender(), msg.value, ethDonationWithInfoRecordIndex_);
	}

	function numEthDonationWithInfoRecords() external view returns(uint256) {
		return ethDonationWithInfoRecords.length;
	}
}
