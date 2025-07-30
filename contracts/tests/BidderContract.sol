// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicSignatureHelpers } from "../production/libraries/CosmicSignatureHelpers.sol";
import { CosmicSignatureErrors } from "../production/libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureToken } from "../production/CosmicSignatureToken.sol";
import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
import { CosmicSignatureNft } from "../production/CosmicSignatureNft.sol";
import { PrizesWallet } from "../production/PrizesWallet.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";
import { BrokenEthReceiver } from "./BrokenEthReceiver.sol";

/// @title A Testing Contract That Plays The Game.
/// @notice A real production contract like this should be written better. It probably must be `Ownable`.
/// @dev
/// [Comment-202508069]
/// Issue. This contract does not support ERC-20 token donations.
/// [/Comment-202508069]
contract BidderContract is BrokenEthReceiver {
	CosmicSignatureGame public immutable cosmicSignatureGame;

	/// @notice Info about NFTs to claim.
	/// @dev Issue. It's questionable that we store these here.
	/// It would instead be better to simply claim all NFTs donated during bidding rounds that we won.
	/// We can get all that info from `PrizesWallet`.
	/// Although logic like that could require more gas.
	uint256[] public donatedNftIndexes;

	constructor(CosmicSignatureGame cosmicSignatureGame_) {
		cosmicSignatureGame = cosmicSignatureGame_;
	}

	function doSetApprovalForAll(IERC721 nft_, address operator_, bool approved_) external {
		nft_.setApprovalForAll(operator_, approved_);
	}

	function doBidWithEth() external payable {
		// // #enable_asserts // #disable_smtchecker uint256 gasUsed_  = gasleft();
		cosmicSignatureGame.bidWithEth{value: msg.value}(-1, "BidderContract ETH bid");
		// // #enable_asserts // #disable_smtchecker gasUsed_  -= gasleft();
		// // #enable_asserts // #disable_smtchecker console.log("BidderContract.doBidWithEth; CosmicSignatureGame.bidWithEth gas used =", gasUsed_);
	}

	function doBidWithEthPlusRandomWalkNft(uint256 nftId_) external payable {
		RandomWalkNFT randomWalkNft_ = cosmicSignatureGame.randomWalkNft();
		randomWalkNft_.transferFrom(msg.sender, address(this), nftId_);
		// // #enable_asserts // #disable_smtchecker uint256 gasUsed_  = gasleft();
		cosmicSignatureGame.bidWithEth{value: msg.value}(int256(nftId_), "BidderContract ETH bid with a Random Walk NFT");
		// // #enable_asserts // #disable_smtchecker gasUsed_  -= gasleft();
		// // #enable_asserts // #disable_smtchecker console.log("BidderContract.doBidWithEthPlusRandomWalkNft; CosmicSignatureGame.bidWithEth gas used =", gasUsed_);
		randomWalkNft_.transferFrom(address(this), msg.sender, nftId_);
	}

	function doBidWithEthAndDonateNft(IERC721 nftAddress_, uint256 nftId_) external payable {
		nftAddress_.transferFrom(msg.sender, address(this), nftId_);
		PrizesWallet prizesWallet_ = cosmicSignatureGame.prizesWallet();
		uint256 nextDonatedNftIndex_ = prizesWallet_.nextDonatedNftIndex();
		donatedNftIndexes.push(nextDonatedNftIndex_);
		// // #enable_asserts // #disable_smtchecker uint256 gasUsed_  = gasleft();
		cosmicSignatureGame.bidWithEthAndDonateNft{value: msg.value}(-1, "BidderContract ETH bid with an NFT donation", nftAddress_, nftId_);
		// // #enable_asserts // #disable_smtchecker gasUsed_  -= gasleft();
		// // #enable_asserts // #disable_smtchecker console.log("BidderContract.doBidWithEthAndDonateNft; CosmicSignatureGame.bidWithEthAndDonateNft gas used =", gasUsed_);
	}

	function doClaimMainPrize() external {
		// // #enable_asserts // #disable_smtchecker uint256 gasUsed_  = gasleft();
		cosmicSignatureGame.claimMainPrize();
		// // #enable_asserts // #disable_smtchecker gasUsed_  -= gasleft();
		// // #enable_asserts // #disable_smtchecker console.log("BidderContract.doClaimMainPrize; CosmicSignatureGame.claimMainPrize gas used =", gasUsed_);

		// [Comment-202508067]
		// Not transferring the received ETH to the caller. Is it OK?
		// Maybe it's OK, given that `withdrawEverything` will do it.
		// [/Comment-202508067]
	}

	function doWithdrawEth() external {
		PrizesWallet prizesWallet_ = cosmicSignatureGame.prizesWallet();
		prizesWallet_.withdrawEth();

		// Comment-202508067 applies.
	}

	function doWithdrawEth(address prizeWinnerAddress_) external {
		PrizesWallet prizesWallet_ = cosmicSignatureGame.prizesWallet();
		prizesWallet_.withdrawEth(prizeWinnerAddress_);

		// Comment-202508067 applies.
	}

	/// @dev Comment-202508069 applies.
	/// Issue. There are `PrizesWallet` and/or other contract methods that do multiple things in a single transaction.
	/// This method should, ideally, call those.
	function withdrawEverything() external {
		{
			CosmicSignatureToken token_ = cosmicSignatureGame.token();
			uint256 myCosmicSignatureTokenBalance_ = token_.balanceOf(address(this));
			token_.transfer(msg.sender, myCosmicSignatureTokenBalance_);
		}

		{
			CosmicSignatureNft nft_ = cosmicSignatureGame.nft();
			uint256 numNftsIOwn_ = nft_.balanceOf(address(this));
			for (uint256 nftIndex_ = numNftsIOwn_; nftIndex_ > 0; ) {
				-- nftIndex_;
				uint256 nftId_ = nft_.tokenOfOwnerByIndex(address(this), nftIndex_);

				// Comment-202501145 applies.
				nft_.transferFrom(address(this), msg.sender, nftId_);
			}
			// #enable_asserts assert(nft_.balanceOf(address(this)) == 0);
		}

		// Issue. Would it make sense to call `PrizesWallet.withdrawEverything`?
		{
			PrizesWallet prizesWallet_ = cosmicSignatureGame.prizesWallet();
			prizesWallet_.withdrawEth();

			// Comment-202508067 relates.
			surrenderMyEth();

			for (uint256 donatedNftIndexIndex_ = donatedNftIndexes.length; donatedNftIndexIndex_ > 0; ) {
				-- donatedNftIndexIndex_;
				uint256 donatedNftIndex_ = donatedNftIndexes[donatedNftIndexIndex_];
				( , IERC721 nftAddress_, uint256 nftId_) = prizesWallet_.donatedNfts(donatedNftIndex_);
				prizesWallet_.claimDonatedNft(donatedNftIndex_);

				// Issue. If this reverts for a single NFT, the whole transaction would revert.
				// So a malicious NFT contrct can break our logic.
				nftAddress_.transferFrom(address(this), msg.sender, nftId_);
			}
			delete donatedNftIndexes;
		}
	}
}
