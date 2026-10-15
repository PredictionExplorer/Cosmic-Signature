// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { IMainPrize1 } from "./IMainPrize1.sol";
import { IMainPrize2 } from "./IMainPrize2.sol";

/// @notice
/// [Comment-202607102]
/// This contract supports claiming bidding round main prize.
/// [/Comment-202607102]
interface IMainPrize is IMainPrize1, IMainPrize2 {
	// Empty.
}
