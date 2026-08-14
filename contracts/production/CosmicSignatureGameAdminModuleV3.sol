// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { BiddingCommonV2 } from "./BiddingCommonV2.sol";
import { MainPrizeCommonV2 } from "./MainPrizeCommonV2.sol";
import { SystemManagementV2 } from "./SystemManagementV2.sol";
import { SystemManagementV3 } from "./SystemManagementV3.sol";
import { EthDonationsV2 } from "./EthDonationsV2.sol";
import { CosmicSignatureGameStorageV3 } from "./CosmicSignatureGameStorageV3.sol";

// #endregion
// #region

/// @title The V3+ Game configuration and ETH donations delegatecall module.
/// @author The Cosmic Signature Development Team.
/// @notice Comment-202608245 applies: this module serves every configuration setter
/// (including the two retired V2 setters that revert with `NotImplemented`)
/// and the ETH donation functions. It is reached through the fallback forwarding chain
/// described in Comment-202608246.
/// @dev Comment-202608247 applies.
/// Comment-202608253 applies to why this contract is not OpenZeppelin-Upgrades-managed.
contract CosmicSignatureGameAdminModuleV3 is
	BiddingCommonV2,
	MainPrizeCommonV2,
	SystemManagementV2,
	EthDonationsV2,
	SystemManagementV3,
	CosmicSignatureGameStorageV3 {
	// #region Data.

	/// @notice Comment-202608246 applies.
	address private immutable _NEXT_MODULE_ADDRESS;

	// #endregion
	// #region `constructor`

	/// @notice Comment-202608247 applies.
	/// @param nextModuleAddress_ The next module in the fallback forwarding chain
	/// (`CosmicSignatureGamePrizesModuleV3`). Comment-202608246 applies.
	constructor(address nextModuleAddress_) {
		_disableInitializers();
		roundActivationTime = type(uint256).max;
		_NEXT_MODULE_ADDRESS = nextModuleAddress_;
	}

	// #endregion
	// #region `fallback`

	/// @notice Comment-202608246 applies.
	fallback() external payable {
		address nextModuleAddress_ = _NEXT_MODULE_ADDRESS;
		assembly {
			calldatacopy(0, 0, calldatasize())
			let isSuccess_ := delegatecall(gas(), nextModuleAddress_, 0, calldatasize(), 0, 0)
			returndatacopy(0, 0, returndatasize())
			switch isSuccess_
			case 0 {
				revert(0, returndatasize())
			}
			default {
				return(0, returndatasize())
			}
		}
	}

	// #endregion
	// #region Overrides Required By Solidity

	function setCstDutchAuctionDuration(uint256 newValue_) /* external */ public override (SystemManagementV2, SystemManagementV3) /* virtual */ {
		super.setCstDutchAuctionDuration(newValue_);
	}

	function setCstDutchAuctionDurationChangeDivisor(uint256 newValue_) /* external */ public override (SystemManagementV2, SystemManagementV3) /* virtual */ {
		super.setCstDutchAuctionDurationChangeDivisor(newValue_);
	}

	// #endregion
}

// #endregion
