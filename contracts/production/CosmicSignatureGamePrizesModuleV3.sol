// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { BiddingCommonV2 } from "./BiddingCommonV2.sol";
import { MainPrizeCommonV2 } from "./MainPrizeCommonV2.sol";
import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { BidStatisticsV3 } from "./BidStatisticsV3.sol";
import { SecondaryPrizesV2 } from "./SecondaryPrizesV2.sol";
import { MainPrizeV2Base } from "./MainPrizeV2Base.sol";
import { MainPrizeV3 } from "./MainPrizeV3.sol";
import { CosmicSignatureGameStorageV3 } from "./CosmicSignatureGameStorageV3.sol";

// #endregion
// #region

/// @title The V3+ Game main prize delegatecall module.
/// @author The Cosmic Signature Development Team.
/// @notice Comment-202608245 applies: this module serves `claimMainPrize` (with the whole V3 prize
/// distribution) and the prize amount views. It is the end of the fallback forwarding chain
/// described in Comment-202608246, so it deliberately declares no forwarding `fallback`:
/// a selector unknown to the whole chain reverts here with empty revert data,
/// exactly like the monolith used to revert on an undeclared function.
/// @dev Comment-202608247 applies.
/// The `nonReentrant` guard of `claimMainPrize` lives here, on the function that does the work;
/// the implementation contract does not wrap the forwarding in another guard, so the guard engages
/// exactly once per call, in the proxy's (transient) storage context, shared with the bid entry points.
/// Comment-202608253 applies to why this contract is not OpenZeppelin-Upgrades-managed.
contract CosmicSignatureGamePrizesModuleV3 is
	BiddingCommonV2,
	MainPrizeCommonV2,
	BidStatisticsV2,
	SecondaryPrizesV2,
	MainPrizeV2Base,
	BidStatisticsV3,
	MainPrizeV3,
	CosmicSignatureGameStorageV3 {
	// #region `constructor`

	/// @notice Comment-202608247 applies.
	constructor() {
		_disableInitializers();

		// Comment-202608281 applies.
		roundActivationTime = CosmicSignatureConstants.TIMESTAMP_9000_01_01;
	}

	// #endregion
	// #region Overrides Required By Solidity

	function _saveChampionDurations() internal override (BidStatisticsV2, BidStatisticsV3, MainPrizeV3) /* virtual */ {
		super._saveChampionDurations();
	}

	// #endregion
}

// #endregion
