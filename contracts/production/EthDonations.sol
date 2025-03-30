// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IEthDonations } from "./interfaces/IEthDonations.sol";

abstract contract EthDonations is
	OwnableUpgradeableWithReservedStorageGaps,
	CosmicSignatureGameStorage,
	IEthDonations {
	function donateEth() external payable override /*_onlyRoundIsActive*/ {
		emit EthDonated(roundNum, _msgSender(), msg.value);
	}

	function donateEthWithInfo(string calldata data_) external payable override /*_onlyRoundIsActive*/ {
		uint256 newEthDonationWithInfoRecordIndex_ = ethDonationWithInfoRecords.length;
		EthDonationWithInfoRecord storage newEthDonationWithInfoRecordReference_ = ethDonationWithInfoRecords.push();
		newEthDonationWithInfoRecordReference_.roundNum = roundNum;
		newEthDonationWithInfoRecordReference_.donorAddress = _msgSender();
		newEthDonationWithInfoRecordReference_.amount = msg.value;
		newEthDonationWithInfoRecordReference_.data = data_;
		emit EthDonatedWithInfo(roundNum, _msgSender(), msg.value, newEthDonationWithInfoRecordIndex_);
	}

	function numEthDonationWithInfoRecords() external view override returns (uint256) {
		return ethDonationWithInfoRecords.length;
	}
}
