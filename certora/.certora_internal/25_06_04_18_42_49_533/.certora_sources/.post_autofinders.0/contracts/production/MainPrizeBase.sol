// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { IMainPrizeBase } from "./interfaces/IMainPrizeBase.sol";

abstract contract MainPrizeBase is CosmicSignatureGameStorage, IMainPrizeBase {
	function getInitialDurationUntilMainPrize() public view override returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01860000, 1037618708870) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01860001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01860004, 0) }
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 initialDurationUntilMainPrize_ = mainPrizeTimeIncrementInMicroSeconds / initialDurationUntilMainPrizeDivisor;
			return initialDurationUntilMainPrize_;
		}
	}

	function getDurationUntilMainPrize() public view override returns (int256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01840000, 1037618708868) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01840001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01840004, 0) }
		// todo-1 +++ Review all `unchecked`.
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 durationUntilMainPrize_ = int256(mainPrizeTime) - int256(block.timestamp);
			return durationUntilMainPrize_;
		}
	}

	function getMainPrizeTimeIncrement() public view override returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01810000, 1037618708865) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01810001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01810004, 0) }
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 mainPrizeTimeIncrement_ = mainPrizeTimeIncrementInMicroSeconds / CosmicSignatureConstants.MICROSECONDS_PER_SECOND;
			// #enable_asserts assert(mainPrizeTimeIncrement_ > 0);
			return mainPrizeTimeIncrement_;
		}
	}

	/// @notice Extends `mainPrizeTime`.
	/// This method is called on each bid.
	function _extendMainPrizeTime() internal {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01a50000, 1037618708901) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01a50001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01a50004, 0) }
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 mainPrizeCorrectedTime_ = Math.max(mainPrizeTime, block.timestamp);
			uint256 mainPrizeTimeIncrement_ = getMainPrizeTimeIncrement();
			mainPrizeTime = mainPrizeCorrectedTime_ + mainPrizeTimeIncrement_;
		}
	}
}
