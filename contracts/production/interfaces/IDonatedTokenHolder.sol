// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Donated ERC-20 Token Holder.
/// @author The Cosmic Signature Development Team.
/// @notice A contract implementing this interface acts as an account holding all ERC-20 token balances
/// donated during a particular bidding round.
/// @dev `PrizesWallet` is a wrong contract to hold danated tokens, because marginal cases would be possible
/// allowing main prize winners of different bidding rounds to steal parts of each other's donated tokens.
/// Other similar issues could be possible as well.
interface IDonatedTokenHolder {
	/// @notice
	/// [Comment-202507146]
	/// Authorizes the `DonatedTokenHolder` contract deployer to spend the `DonatedTokenHolder` contract's
	/// token balance held in the `tokenAddress_` contract.
	/// @param tokenAddress_ Comment-202502248 applies.
	/// [/Comment-202507146]
	/// Only the contract deployer is permitted to call this method.
	/// @dev This method must be `_onlyDeployer` because otherwise a hacker would be able to call it
	/// for an arbitrary ERC-20 token contract and then transfer a token amount to us, all without placing a bid.
	/// Although after, or even before donating by placing a bid, the donor or any hackers can still make a few more transfers to us
	/// without placing bids, which is not too bad.
	function authorizeDeployerAsMyTokenSpender(IERC20 tokenAddress_) external;
}
