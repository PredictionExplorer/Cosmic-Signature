// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { ArbSys } from "@arbitrum/nitro-contracts/src/precompiles/ArbSys.sol";
import { ArbGasInfo } from "@arbitrum/nitro-contracts/src/precompiles/ArbGasInfo.sol";
import { CosmicSignatureEvents } from "./CosmicSignatureEvents.sol";

library ArbitrumHelpers {
	ArbSys internal constant arbSys = ArbSys(address(0x64));
	ArbGasInfo internal constant arbGasInfo = ArbGasInfo(address(0x6C));

	function tryGetArbBlockNumber() internal /*view*/ returns (bool isSuccess_, uint256 arbBlockNumber_) {
		(isSuccess_, arbBlockNumber_) = _tryCallPrecompile(address(arbSys), abi.encodeWithSelector(ArbSys.arbBlockNumber.selector), "ArbSys.arbBlockNumber call failed.");
		// #enable_asserts assert(( ! isSuccess_ ) || arbBlockNumber_ > 0);
	}

	function tryGetArbBlockHash(uint256 arbBlockNumber_) internal /*view*/ returns (bool isSuccess_, bytes32 arbBlockHash_) {
		uint256 arbBlockHashAsUint256_;
		(isSuccess_, arbBlockHashAsUint256_) = _tryCallPrecompile(address(arbSys), abi.encodeWithSelector(ArbSys.arbBlockHash.selector, arbBlockNumber_), "ArbSys.arbBlockHash call failed.");
		arbBlockHash_ = bytes32(arbBlockHashAsUint256_);
		// #enable_asserts assert(( ! isSuccess_ ) || uint256(arbBlockHash_) > 0);
	}

	function tryGetGasBacklog() internal /*view*/ returns (bool isSuccess_, uint256 gasBacklog_) {
		// Comment-202506298 applies.
		(isSuccess_, gasBacklog_) = _tryCallPrecompile(address(arbGasInfo), abi.encodeWithSelector(ArbGasInfo.getGasBacklog.selector), "ArbGasInfo.getGasBacklog call failed.");
	}

	function tryGetL1PricingUnitsSinceUpdate() internal /*view*/ returns (bool isSuccess_, uint256 l1PricingUnitsSinceUpdate_) {
		// Comment-202506298 applies.
		(isSuccess_, l1PricingUnitsSinceUpdate_) = _tryCallPrecompile(address(arbGasInfo), abi.encodeWithSelector(ArbGasInfo.getL1PricingUnitsSinceUpdate.selector), "ArbGasInfo.getL1PricingUnitsSinceUpdate call failed.");
	}

	/// @notice Makes a low level call to the given precompile and treats the returned data as a single 256-bit word.
	/// If the call fails or returns data of an unexpected length, emits `CosmicSignatureEvents.ArbitrumError`
	/// with the given error description.
	/// @dev
	/// [Comment-202608125]
	/// This method acts as a shared core of the `tryGet*` methods declared above.
	/// It behaves the same way their former separate bodies did.
	/// Sharing this logic reduces contract bytecode size.
	/// Comment-202608122 relates.
	/// [/Comment-202608125]
	/// [Comment-202506298]
	/// Some of the methods being called (almost?) always return a different value for each transaction.
	/// [/Comment-202506298]
	/// [Comment-202506301]
	/// Some of the values being returned are really shorter unsigned integers,
	/// but it's probably more efficient to treat them as blockchain-native words.
	/// [/Comment-202506301]
	function _tryCallPrecompile(address precompileAddress_, bytes memory callData_, string memory errorDescription_) private returns (bool isSuccess_, uint256 result_) {
		{
			bytes memory returnData_;

			// [Comment-202506296]
			// Issue. Making a low level call.
			// I would instead prefer to make a high level call under `try`,
			// but Solidity doesn't appear to guarantee that the transaction won't be reversed after certain errors.
			// Comment-202502043 relates.
			// [/Comment-202506296]
			(isSuccess_, returnData_) = precompileAddress_.call(callData_);

			if (isSuccess_) {
				if (returnData_.length == 256 / 8) {
					result_ = abi.decode(returnData_, (uint256));
				} else {
					isSuccess_ = false;
				}
			}
		}
		if ( ! isSuccess_ ) {
			emit CosmicSignatureEvents.ArbitrumError(errorDescription_);
		}
	}
}
