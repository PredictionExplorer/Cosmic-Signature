// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicSignatureHelpers } from "../production/libraries/CosmicSignatureHelpers.sol";
import { IPrizesWallet, PrizesWallet } from "../production/PrizesWallet.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

abstract contract MaliciousActorBase {
	PrizesWallet public immutable prizesWallet;
	CosmicSignatureGame public immutable game;
	uint256 public modeCode = 0;
	uint256 public transient reentryDepth;

	constructor(PrizesWallet prizesWallet_, CosmicSignatureGame game_) {
		prizesWallet = prizesWallet_;
		game = game_;
	}

	receive() external payable {
		_reenterIfNeeded();
	}

	function setModeCode(uint256 newValue_) external {
		modeCode = newValue_;
	}

	function _reenterIfNeeded() internal {
		if (reentryDepth <= 0) {
			++ reentryDepth;

			// [Comment-202507062]
			// Similar magic numbers exist in multiple places.
			// [/Comment-202507062]
			if (modeCode == 1) {
				game.donateEth{value: 1 wei}();
			} else if (modeCode == 2) {
				game.donateEthWithInfo{value: 1 wei}("Reentry");
			} else if (modeCode == 3) {
				CosmicSignatureHelpers.transferEthTo(payable(address(game)), 0.01 ether);
			} else if (modeCode == 4) {
				game.bidWithEthAndDonateToken{value: 0.01 ether}(-1, "", IERC20(address(this)), 1);
			} else if (modeCode == 5) {
				game.bidWithEthAndDonateNft{value: 0.01 ether}(-1, "", IERC721(address(this)), 0);
			} else if (modeCode == 6) {
				game.bidWithEth{value: 0.01 ether}(-1, "");
			} else if (modeCode == 7) {
				game.bidWithCstAndDonateToken(10000 ether, "", IERC20(address(this)), 1);
			} else if (modeCode == 8) {
				game.bidWithCstAndDonateNft(10000 ether, "", IERC721(address(this)), 0);
			} else if (modeCode == 9) {
				game.bidWithCst(10000 ether, "");
			} else if (modeCode == 10) {
				game.claimMainPrize();
			} else if (modeCode == 101) {
				IPrizesWallet.EthDeposit[] memory ethDeposits_;
				prizesWallet.registerRoundEndAndDepositEthMany{value: 0 wei}(0, address(this), ethDeposits_);
			} else if (modeCode == 102) {
				prizesWallet.registerRoundEnd(0, address(this));
			} else if (modeCode == 103) {
				IPrizesWallet.DonatedTokenToClaim[] memory donatedTokensToClaim_;
				uint256[] memory donatedNftIndexes_;
				prizesWallet.withdrawEverything(false, donatedTokensToClaim_, donatedNftIndexes_);
			} else if (modeCode == 104) {
				prizesWallet.depositEth{value: 1 wei}(0, address(this));
			} else if (modeCode == 105) {
				prizesWallet.withdrawEth();
			} else if (modeCode == 106) {
				prizesWallet.withdrawEth(address(this));
			} else if (modeCode == 107) {
				prizesWallet.donateToken(0, address(this), IERC20(address(this)), 1);
			} else if (modeCode == 108) {
				prizesWallet.claimDonatedToken(0, IERC20(address(this)), 1);
			} else if (modeCode == 109) {
				IPrizesWallet.DonatedTokenToClaim[] memory donatedTokensToClaim_;
				prizesWallet.claimManyDonatedTokens(donatedTokensToClaim_);
			} else if (modeCode == 110) {
				prizesWallet.donateNft(0, address(this), IERC721(address(this)), 0);
			} else if (modeCode == 111) {
				prizesWallet.claimDonatedNft(0);
			} else if (modeCode == 112) {
				uint256[] memory donatedNftIndexes_;
				prizesWallet.claimManyDonatedNfts(donatedNftIndexes_);
			}

			-- reentryDepth;
		}
	}
}
