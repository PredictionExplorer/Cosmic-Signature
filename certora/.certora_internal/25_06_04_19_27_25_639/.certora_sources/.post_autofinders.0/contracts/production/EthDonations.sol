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
		uint256 newEthDonationWithInfoRecordIndex_ = ethDonationWithInfoRecords.length;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000f1,newEthDonationWithInfoRecordIndex_)}
		EthDonationWithInfoRecord storage newEthDonationWithInfoRecordReference_ = ethDonationWithInfoRecords.push();assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000100f2,0)}
		newEthDonationWithInfoRecordReference_.roundNum = roundNum;uint256 certora_local243 = newEthDonationWithInfoRecordReference_.roundNum;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000f3,certora_local243)}
		newEthDonationWithInfoRecordReference_.donorAddress = _msgSender();address certora_local244 = newEthDonationWithInfoRecordReference_.donorAddress;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000f4,certora_local244)}
		newEthDonationWithInfoRecordReference_.amount = msg.value;uint256 certora_local245 = newEthDonationWithInfoRecordReference_.amount;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000f5,certora_local245)}
		newEthDonationWithInfoRecordReference_.data = data_;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000200f6,0)}
		emit EthDonatedWithInfo(roundNum, _msgSender(), msg.value, newEthDonationWithInfoRecordIndex_);
	}

	function numEthDonationWithInfoRecords() external view override returns (uint256) {
		return ethDonationWithInfoRecords.length;
	}
}
