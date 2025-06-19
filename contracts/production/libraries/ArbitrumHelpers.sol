// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { ArbSys } from "@arbitrum/nitro-contracts/src/precompiles/ArbSys.sol";
import { ArbGasInfo } from "@arbitrum/nitro-contracts/src/precompiles/ArbGasInfo.sol";
import { CosmicSignatureEvents } from "./CosmicSignatureEvents.sol";

library ArbitrumHelpers {
	ArbSys internal constant arbSys = ArbSys(address(0x64));
	ArbGasInfo internal constant arbGasInfo = ArbGasInfo(address(0x6C));

	function tryGetArbBlockNumber() internal /*view*/ returns (bool isSuccess_, uint256 arbBlockNumber_) {
		{
			bytes memory returnData_;

			// [Comment-202506296]
			// I would instead prefer to make a high level call under `try`,
			// but Solidity doesn't appear to guarantee that the transaction won't be reversed after certain errors.
			// Comment-202502043 relates.
			// [/Comment-202506296]
			(isSuccess_, returnData_) = address(arbSys).call(abi.encodeWithSelector(ArbSys.arbBlockNumber.selector));

			if (isSuccess_) {
				if (returnData_.length == 256 / 8) {
					arbBlockNumber_ = abi.decode(returnData_, (uint256));
					// #enable_asserts assert(arbBlockNumber_ > 0);
				} else {
					isSuccess_ = false;
				}
			}		
		}
		if ( ! isSuccess_ ) {
			emit CosmicSignatureEvents.ArbitrumError("ArbSys.arbBlockNumber call failed.");
		}
	}

	function tryGetArbBlockHash(uint256 arbBlockNumber_) internal /*view*/ returns (bool isSuccess_, bytes32 arbBlockHash_) {
		{
			bytes memory returnData_;

			// Comment-202506296 applies.
			(isSuccess_, returnData_) = address(arbSys).call(abi.encodeWithSelector(ArbSys.arbBlockHash.selector, arbBlockNumber_));

			if (isSuccess_) {
				if (returnData_.length == 32) {
					arbBlockHash_ = abi.decode(returnData_, (bytes32));
					// #enable_asserts assert(uint256(arbBlockHash_) > 0);
				} else {
					isSuccess_ = false;
				}
			}		
		}
		if ( ! isSuccess_ ) {
			emit CosmicSignatureEvents.ArbitrumError("ArbSys.arbBlockHash call failed.");
		}
	}

	function tryGetGasBacklog() internal /*view*/ returns (bool isSuccess_, uint256 gasBacklog_) {
		{
			bytes memory returnData_;

			// [Comment-202506298]
			// This method (almost?) always returns a different value for each transaction.
			// [/Comment-202506298]
			// Comment-202506296 applies.
			(isSuccess_, returnData_) = address(arbGasInfo).call(abi.encodeWithSelector(ArbGasInfo.getGasBacklog.selector));

			if (isSuccess_) {
				if (returnData_.length == 256 / 8) {
					// [Comment-202506301]
					// This is really a shorter integer, but it's probably more efficient to treat this as a blockchain-native word.
					// [/Comment-202506301]
					gasBacklog_ = abi.decode(returnData_, (uint256));
				} else {
					isSuccess_ = false;
				}
			}		
		}
		if ( ! isSuccess_ ) {
			emit CosmicSignatureEvents.ArbitrumError("ArbGasInfo.getGasBacklog call failed.");
		}
	}

	function tryGetL1PricingUnitsSinceUpdate() internal /*view*/ returns (bool isSuccess_, uint256 l1PricingUnitsSinceUpdate_) {
		{
			bytes memory returnData_;

			// Comment-202506298 applies.
			// Comment-202506296 applies.
			(isSuccess_, returnData_) = address(arbGasInfo).call(abi.encodeWithSelector(ArbGasInfo.getL1PricingUnitsSinceUpdate.selector));

			if (isSuccess_) {
				if (returnData_.length == 256 / 8) {
					// Comment-202506301 applies.
					l1PricingUnitsSinceUpdate_ = abi.decode(returnData_, (uint256));
				} else {
					isSuccess_ = false;
				}
			}		
		}
		if ( ! isSuccess_ ) {
			emit CosmicSignatureEvents.ArbitrumError("ArbGasInfo.getL1PricingUnitsSinceUpdate call failed.");
		}
	}
}
