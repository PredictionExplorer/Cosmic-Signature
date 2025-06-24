// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPrizesWallet, PrizesWallet } from "../production/PrizesWallet.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";
import { MaliciousActorBase } from "./MaliciousActorBase.sol";

/// @dev Issue. It looks like we really need this contract only to reenter another contract on ETH receive.
/// For other operations we could use a regular signer.
contract MaliciousPrizeWinner is MaliciousActorBase {
	constructor(PrizesWallet prizesWallet_, CosmicSignatureGame game_) MaliciousActorBase(prizesWallet_, game_) {
		// Doing nothing.
	}

	function doWithdrawEverything(
		bool withdrawEth_,
		IPrizesWallet.DonatedTokenToClaim[] calldata donatedTokensToClaim_,
		uint256[] calldata donatedNftIndexes_
	) external {
		prizesWallet.withdrawEverything(withdrawEth_, donatedTokensToClaim_, donatedNftIndexes_);
	}

	function doWithdrawEth() external {
		prizesWallet.withdrawEth();
	}

	function doWithdrawEth(address prizeWinnerAddress_) external {
		prizesWallet.withdrawEth(prizeWinnerAddress_);
	}

	function doClaimDonatedToken(uint256 roundNum_, IERC20 tokenAddress_) external {
		prizesWallet.claimDonatedToken(roundNum_, tokenAddress_);
	}

	function doClaimManyDonatedTokens(IPrizesWallet.DonatedTokenToClaim[] calldata donatedTokensToClaim_) external {
		prizesWallet.claimManyDonatedTokens(donatedTokensToClaim_);
	}

	function doClaimDonatedNft(uint256 index_) external {
		prizesWallet.claimDonatedNft(index_);
	}

	function doClaimManyDonatedNfts(uint256[] calldata indexes_) external {
		prizesWallet.claimManyDonatedNfts(indexes_);
	}
}
