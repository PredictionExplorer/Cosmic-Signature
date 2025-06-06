// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicSignatureErrors } from "../production/libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureToken } from "../production/CosmicSignatureToken.sol";
import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
import { CosmicSignatureNft } from "../production/CosmicSignatureNft.sol";
import { PrizesWallet } from "../production/PrizesWallet.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";
import { BrokenEthReceiver } from "./BrokenEthReceiver.sol";

/// @dev Issue. A real production contract like this should be written better. It must be `Ownable`.
/// Issue. This contract does not support ERC-20 token donations.
contract BidderContract is BrokenEthReceiver {
	CosmicSignatureGame public immutable cosmicSignatureGame;
	uint256[] public donatedNftIndexes;
	
	constructor(CosmicSignatureGame cosmicSignatureGame_) {
		cosmicSignatureGame = cosmicSignatureGame_;
	}

	function doSetApprovalForAll(IERC721 nft_, address operator_) external {
		nft_.setApprovalForAll(operator_, true);
	}

	function doBidWithEth() external payable {
		// // #enable_asserts // #disable_smtchecker uint256 gasUsed_  = gasleft();
		cosmicSignatureGame.bidWithEth{value: msg.value}((-1), "contract ETH bid");
		// // #enable_asserts // #disable_smtchecker gasUsed_  -= gasleft();
		// // #enable_asserts // #disable_smtchecker console.log("BidderContract.doBidWithEth; CosmicSignatureGame.bidWithEth gas used =", gasUsed_);
	}

	function doBidWithEthPlusRandomWalkNft(uint256 nftId_) external payable {
		RandomWalkNFT randomWalkNft_ = cosmicSignatureGame.randomWalkNft();
		randomWalkNft_.transferFrom(msg.sender, address(this), nftId_);
		// // #enable_asserts // #disable_smtchecker uint256 gasUsed_  = gasleft();
		cosmicSignatureGame.bidWithEth{value: msg.value}(int256(nftId_), "contract ETH bid with Random Walk NFT");
		// // #enable_asserts // #disable_smtchecker gasUsed_  -= gasleft();
		// // #enable_asserts // #disable_smtchecker console.log("BidderContract.doBidWithEthPlusRandomWalkNft; CosmicSignatureGame.bidWithEth gas used =", gasUsed_);
		randomWalkNft_.transferFrom(address(this), msg.sender, nftId_);
	}

	function doBidWithEthAndDonateNft(IERC721 nftAddress_, uint256 nftId_) external payable {
		RandomWalkNFT randomWalkNft_ = cosmicSignatureGame.randomWalkNft();
		randomWalkNft_.transferFrom(msg.sender, address(this), nftId_);
		PrizesWallet prizesWallet_ = cosmicSignatureGame.prizesWallet();
		// nftAddress_.setApprovalForAll(address(prizesWallet_), true);
		uint256 nextDonatedNftIndex_ = prizesWallet_.nextDonatedNftIndex();
		donatedNftIndexes.push(nextDonatedNftIndex_);
		// // #enable_asserts // #disable_smtchecker uint256 gasUsed_  = gasleft();
		cosmicSignatureGame.bidWithEthAndDonateNft{value: msg.value}((-1), "contract ETH bid with NFT donation", nftAddress_, nftId_);
		// // #enable_asserts // #disable_smtchecker gasUsed_  -= gasleft();
		// // #enable_asserts // #disable_smtchecker console.log("BidderContract.doBidWithEthAndDonateNft; CosmicSignatureGame.bidWithEthAndDonateNft gas used =", gasUsed_);
	}

	function doClaimMainPrize() external {
		// // #enable_asserts // #disable_smtchecker uint256 gasUsed_  = gasleft();
		cosmicSignatureGame.claimMainPrize();
		// // #enable_asserts // #disable_smtchecker gasUsed_  -= gasleft();
		// // #enable_asserts // #disable_smtchecker console.log("BidderContract.doClaimMainPrize; CosmicSignatureGame.claimMainPrize gas used =", gasUsed_);
	}

	function doWithdrawEth() external {
		PrizesWallet prizesWallet_ = cosmicSignatureGame.prizesWallet();
		prizesWallet_.withdrawEth();
	}

	function doWithdrawEth(address prizeWinnerAddress_) external {
		PrizesWallet prizesWallet_ = cosmicSignatureGame.prizesWallet();
		prizesWallet_.withdrawEth(prizeWinnerAddress_);
	}

	/// @dev Issue. There are `PrizesWallet` and/or other contract methods that do multiple things in a single transaction.
	/// This method should, ideally, call those.
	function withdrawEverything() external {
		{
			CosmicSignatureToken token_ = cosmicSignatureGame.token();
			uint256 ourCosmicSignatureTokenBalance_ = token_.balanceOf(address(this));
			token_.transfer(msg.sender, ourCosmicSignatureTokenBalance_);
		}

		{
			CosmicSignatureNft nft_ = cosmicSignatureGame.nft();
			uint256 numNftsWeOwn_ = nft_.balanceOf(address(this));
			for (uint256 nftIndex_ = numNftsWeOwn_; nftIndex_ > 0; ) {
				-- nftIndex_;
				uint256 nftId_ = nft_.tokenOfOwnerByIndex(address(this), nftIndex_);
				
				// Comment-202501145 applies.
				nft_.transferFrom(address(this), msg.sender, nftId_);
			}
		}

		// Issue. Would it make sense to call `PrizesWallet.withdrawEverything`?
		{
			PrizesWallet prizesWallet_ = cosmicSignatureGame.prizesWallet();
			prizesWallet_.withdrawEth();

			{
				// Comment-202502043 applies.
				(bool isSuccess_, ) = msg.sender.call{value: address(this).balance}("");

				if ( ! isSuccess_ ) {
					revert CosmicSignatureErrors.FundTransferFailed("ETH transfer to msg.sender failed.", msg.sender, address(this).balance);
				}
			}

			for (uint256 donatedNftIndexIndex_ = donatedNftIndexes.length; donatedNftIndexIndex_ > 0; ) {
				-- donatedNftIndexIndex_;
				uint256 donatedNftIndex_ = donatedNftIndexes[donatedNftIndexIndex_];
				( , IERC721 nftAddress_, uint256 nftId_) = prizesWallet_.donatedNfts(donatedNftIndex_);
				prizesWallet_.claimDonatedNft(donatedNftIndex_);

				// Issue. If this fails for a single NFT the whole transaction would fail.
				// So a malicious NFT contrct can break this logic.
				nftAddress_.transferFrom(address(this), msg.sender, nftId_);
			}
			delete donatedNftIndexes;
		}
	}
}
