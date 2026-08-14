// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

// #endregion
// #region

import { BiddingCommonV2 } from "./BiddingCommonV2.sol";
import { MainPrizeCommonV2 } from "./MainPrizeCommonV2.sol";
import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { BiddingV2Base } from "./BiddingV2Base.sol";
import { BiddingV3 } from "./BiddingV3.sol";
import { CosmicSignatureGameStorageV3 } from "./CosmicSignatureGameStorageV3.sol";

// #endregion
// #region

/// @title The V3+ Game views and bid-with-donation delegatecall module.
/// @author The Cosmic Signature Development Team.
/// @notice
/// [Comment-202608245]
/// In V3+, the Game is split into a slim UUPS implementation contract (`CosmicSignatureGameV3`) and three
/// delegatecall modules, so that each deployed contract stays far below the EIP-170 bytecode size limit,
/// while the proxy keeps exposing the exact pre-split external interface with the exact pre-split behavior.
///
/// The modules are plain (non-proxied, non-upgradeable) contracts compiled from the very same source mixins
/// the monolithic implementation used to inherit, and they inherit the very same storage chassis,
/// so the storage layout that their code sees under `delegatecall` is identical to the implementation's
/// (`test/tests-src/CosmicSignatureGameV3-ModularEquality.js` verifies that on every test run).
/// Because the chassis declares its state variables `public`, the compiler regenerates the exact
/// original state variable getters in each module for free.
///
/// [Comment-202608246]
/// Routing: the implementation contract's `fallback` forwards any selector it does not recognize,
/// with the full calldata and ETH value, via `delegatecall` to this module; this module's `fallback` similarly
/// forwards to `CosmicSignatureGameAdminModuleV3`, which forwards to `CosmicSignatureGamePrizesModuleV3`,
/// which is the end of the chain, so a selector unknown to every link reverts with empty revert data,
/// exactly like a call to an undeclared function of the monolith used to. Module addresses are constructor-set
/// immutables; there is no storage-based routing and no runtime routing registry. Replacing any module
/// means deploying new module instances plus a new implementation, followed by the usual UUPS upgrade,
/// authorized by the same `_authorizeUpgrade` as always.
/// [/Comment-202608246]
///
/// [Comment-202608247]
/// Calling a module directly, at its own address rather than through the Game proxy, is harmless:
/// the module then reads and writes its own (unused, mostly zero) storage. Its constructor
/// permanently disables initializers, so `owner()` is the zero address and every `onlyOwner` function reverts;
/// it also sets its own `roundActivationTime` to the maximum value, so every bid path reverts with
/// `RoundIsInactive`; the main prize claim reverts with `NoBidsPlacedInCurrentRound`, and the further prize logic
/// would revert calling the zero-address token/wallet contracts anyway. The only residual direct-call effect is
/// that `donateEth`/`donateEthWithInfo` (in the admin module) would accept and keep the caller's own donation,
/// which harms nobody but the caller. `test/tests-src/CosmicSignatureGameV3-ModularEquality.js` covers this.
/// [/Comment-202608247]
///
/// This module serves every state variable getter, every computed view of the bidding/statistics area,
/// and, being compiled from the whole original `BiddingV2Base`/`BiddingV3`, also the rarely used
/// bid-with-donation combinations and `halveEthDutchAuctionEndingBidPrice`.
/// The plain `bidWithEth`/`bidWithCst`/`receive` entry points also exist here, but they are unreachable
/// through the proxy, because the implementation contract dispatches those selectors itself (the hot path
/// never pays for a second `delegatecall`).
/// [/Comment-202608245]
/// @dev Comment-202608253 applies to why this contract is not OpenZeppelin-Upgrades-managed.
contract CosmicSignatureGameViewsModuleV3 is
	BiddingCommonV2,
	MainPrizeCommonV2,
	BidStatisticsV2,
	BiddingV2Base,
	BiddingV3,
	CosmicSignatureGameStorageV3 {
	// #region Data.

	/// @notice Comment-202608246 applies.
	address private immutable _NEXT_MODULE_ADDRESS;

	// #endregion
	// #region `constructor`

	/// @notice Comment-202608247 applies.
	/// @param nextModuleAddress_ The next module in the fallback forwarding chain
	/// (`CosmicSignatureGameAdminModuleV3`). Comment-202608246 applies.
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

	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) public view override (BiddingV2Base, BiddingV3) /* virtual */ returns (uint256) {
		return super.getNextEthBidPriceAdvanced(currentTimeOffset_);
	}

	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) public view override (BiddingV2Base, BiddingV3) /* virtual */ returns (uint256) {
		return super.getNextCstBidPriceAdvanced(currentTimeOffset_);
	}

	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) public view override (BiddingV2Base, BiddingV3) /* virtual */ returns (uint256) {
		return super.getBidCstRewardAmountAdvanced(currentTimeOffset_);
	}

	// #endregion
}

// #endregion
