// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { ArbSys } from "@arbitrum/nitro-contracts/src/precompiles/ArbSys.sol";
import { ArbGasInfo } from "@arbitrum/nitro-contracts/src/precompiles/ArbGasInfo.sol";
import { CosmicSignatureEvents } from "./CosmicSignatureEvents.sol";

/// @title Arbitrum Precompile Helpers.
/// @author The Cosmic Signature Development Team.
/// @notice Provides safe wrappers for Arbitrum precompile calls used for entropy generation.
/// @dev All functions use low-level calls to gracefully handle precompile failures,
/// which can occur when running on non-Arbitrum networks (e.g., Hardhat for testing).
/// On failure, functions emit an event and return `isSuccess_ = false` rather than reverting.
library ArbitrumHelpers {
	/// @notice The ArbSys precompile address (0x64).
	ArbSys internal constant arbSys = ArbSys(address(0x64));

	/// @notice The ArbGasInfo precompile address (0x6C).
	ArbGasInfo internal constant arbGasInfo = ArbGasInfo(address(0x6C));

	/// @notice Attempts to get the current Arbitrum L2 block number.
	/// @return isSuccess_ True if the call succeeded.
	/// @return arbBlockNumber_ The current Arbitrum block number, or 0 on failure.
	/// @dev Uses low-level call to avoid reverting on non-Arbitrum networks.
	function tryGetArbBlockNumber() internal /*view*/ returns (bool isSuccess_, uint256 arbBlockNumber_) {
		{
			bytes memory returnData_;

			// [Comment-202506296]
			// Making a low level call.
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

	/// @notice Attempts to get the block hash for a given Arbitrum L2 block number.
	/// @param arbBlockNumber_ The Arbitrum block number to get the hash for.
	/// @return isSuccess_ True if the call succeeded.
	/// @return arbBlockHash_ The block hash, or bytes32(0) on failure.
	/// @dev Uses low-level call to avoid reverting on non-Arbitrum networks.
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

	/// @notice Attempts to get the current gas backlog.
	/// @return isSuccess_ True if the call succeeded.
	/// @return gasBacklog_ The current gas backlog, or 0 on failure.
	/// @dev
	/// [Comment-202506298]
	/// This method (almost?) always returns a different value for each transaction,
	/// making it useful as an entropy source.
	/// [/Comment-202506298]
	/// Uses low-level call to avoid reverting on non-Arbitrum networks.
	function tryGetGasBacklog() internal /*view*/ returns (bool isSuccess_, uint256 gasBacklog_) {
		{
			bytes memory returnData_;

			// Comment-202506296 applies.
			(isSuccess_, returnData_) = address(arbGasInfo).call(abi.encodeWithSelector(ArbGasInfo.getGasBacklog.selector));

			if (isSuccess_) {
				if (returnData_.length == 256 / 8) {
					// [Comment-202506301]
					// This is really a shorter unsigned integer, but it's probably more efficient to treat this as a blockchain-native word.
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

	/// @notice Attempts to get the L1 pricing units since the last update.
	/// @return isSuccess_ True if the call succeeded.
	/// @return l1PricingUnitsSinceUpdate_ The L1 pricing units since update, or 0 on failure.
	/// @dev Uses low-level call to avoid reverting on non-Arbitrum networks.
	/// Comment-202506298 applies (this value tends to change per transaction).
	function tryGetL1PricingUnitsSinceUpdate() internal /*view*/ returns (bool isSuccess_, uint256 l1PricingUnitsSinceUpdate_) {
		{
			bytes memory returnData_;

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
