// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
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
/// @notice
/// [Comment-202608245]
/// In V3+, the Game is split into a UUPS implementation contract (`CosmicSignatureGameV3`) and two
/// delegatecall modules, so that each deployed contract stays far below the EIP-170 bytecode size limit,
/// while the proxy keeps exposing the exact pre-split external interface with the exact pre-split behavior.
///
/// The modules are plain (non-proxied, non-upgradeable) contracts compiled from the very same source mixins
/// the monolithic implementation used to inherit, and they inherit the very same `public`-variable storage
/// chassis that the implementation inherits, so the storage layout that their code sees under `delegatecall`
/// is identical to the implementation's by construction: there is a single source of both the storage
/// declarations and every piece of logic (`test/tests-src/CosmicSignatureGameV3-ModularEquality.js`
/// verifies the layout identity on every test run).
///
/// [Comment-202608246]
/// Routing: the implementation contract's `fallback` forwards any selector it does not recognize,
/// with the full calldata and ETH value, via `delegatecall` to this module; this module's `fallback`
/// similarly forwards to `CosmicSignatureGamePrizesModuleV3`, which is the end of the chain,
/// so a selector unknown to every link reverts with empty revert data, exactly like a call
/// to an undeclared function of the monolith used to. (The implementation also forwards
/// `claimMainPrize` to the prizes module directly, in a single hop.) Module addresses are constructor-set
/// immutables; there is no storage-based routing and no runtime routing registry. Replacing any module
/// means deploying new module instances plus a new implementation, followed by the usual UUPS upgrade,
/// authorized by the same `_authorizeUpgrade` as always.
/// [/Comment-202608246]
///
/// [Comment-202608247]
/// Calling a module directly, at its own address rather than through the Game proxy, is harmless:
/// the module then reads and writes its own (unused, mostly zero) storage. Its constructor
/// permanently disables initializers, so `owner()` is the zero address and every `onlyOwner` function
/// reverts; it also sets its own `roundActivationTime` far into the future (Comment-202608281),
/// so every round-activity check reverts with `RoundIsInactive`; the main prize claim reverts with
/// `NoBidsPlacedInCurrentRound`, and the further prize logic would revert calling the zero-address
/// token/wallet contracts anyway. The only residual direct-call effect is that `donateEth`/
/// `donateEthWithInfo` (in this module) would accept and keep the caller's own donation,
/// which harms nobody but the caller. `test/tests-src/CosmicSignatureGameV3-ModularEquality.js` covers this.
/// [/Comment-202608247]
///
/// This module serves every configuration setter and the ETH donation functions.
/// The state variable getters it inherits from
/// the `public`-variable storage chassis also exist here, but they are unreachable through the proxy,
/// because the implementation contract dispatches those selectors itself.
/// [/Comment-202608245]
/// @dev Comment-202608253 applies to why this contract is not OpenZeppelin-Upgrades-managed.
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

		// [Comment-202608281]
		// A deliberately finite "effectively never" timestamp, matching
		// `CosmicSignatureConstants.INITIAL_ROUND_ACTIVATION_TIME` (the house convention),
		// rather than `type(uint256).max`. A finite value keeps every piece of arithmetic involving
		// `roundActivationTime` in a sane range on a direct call: in particular,
		// `int256(type(uint256).max)` would equal -1, which would make
		// `BiddingCommonV2.getDurationElapsedSinceRoundActivation` return a bogus positive duration.
		// Comment-202608247 applies.
		// [/Comment-202608281]
		roundActivationTime = CosmicSignatureConstants.TIMESTAMP_9000_01_01;

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
}

// #endregion
