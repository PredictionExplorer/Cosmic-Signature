// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IEthDonations } from "./interfaces/IEthDonations.sol";

abstract contract EthDonations is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	CosmicSignatureGameStorage,
	IEthDonations {
	function donateEth() external payable override nonReentrant /*_onlyRoundIsActive*/ {
		// #enable_asserts assert(msg.value > 0 || msg.value == 0);
		emit EthDonated(roundNum, _msgSender(), msg.value);
	}

	function donateEthWithInfo(string calldata data_) external payable override nonReentrant /*_onlyRoundIsActive*/ {
		// #enable_asserts uint256 oldLength_ = ethDonationWithInfoRecords.length;
		uint256 newEthDonationWithInfoRecordIndex_ = ethDonationWithInfoRecords.length;
		EthDonationWithInfoRecord storage newEthDonationWithInfoRecordReference_ = ethDonationWithInfoRecords.push();
		// #enable_asserts assert(ethDonationWithInfoRecords.length == oldLength_ + 1);
		newEthDonationWithInfoRecordReference_.roundNum = roundNum;
		newEthDonationWithInfoRecordReference_.donorAddress = _msgSender();
		newEthDonationWithInfoRecordReference_.amount = msg.value;
		newEthDonationWithInfoRecordReference_.data = data_;
		// #enable_asserts assert(newEthDonationWithInfoRecordReference_.donorAddress == _msgSender());
		// #enable_asserts assert(newEthDonationWithInfoRecordReference_.amount == msg.value);
		emit EthDonatedWithInfo(roundNum, _msgSender(), msg.value, newEthDonationWithInfoRecordIndex_);
	}

	function numEthDonationWithInfoRecords() external view override returns (uint256) {
		return ethDonationWithInfoRecords.length;
	}
}
