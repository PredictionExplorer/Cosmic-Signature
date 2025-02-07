// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
// import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
// import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { INftDonations } from "./interfaces/INftDonations.sol";

abstract contract NftDonations is CosmicSignatureGameStorage, INftDonations {
	// function donateNft(IERC721 nftAddress, uint256 nftId) external override nonReentrant onlyRoundIsActive {
	// 	nftAddress.transferFrom(_msgSender(), address(this), nftId);
	// 	// todo-9 I moved `DonatedNft` to `IPrizesWallet`.
	// 	donatedNfts[numDonatedNfts] = CosmicSignatureConstants.DonatedNft({
	// 		roundNum: roundNum,
	// 		nftAddress: nftAddress,
	// 		nftId: nftId,
	// 		claimed: false
	// 	});
	// 	++ numDonatedNfts;
	// 	emit NftDonationEvent(_msgSender(), nftAddress, roundNum, nftId, numDonatedNfts - 1);
	// }

	// function _donateNft(IERC721 nftAddress_, uint256 nftId_) internal {
	// 	nftAddress_.transferFrom(_msgSender(), address(this), nftId_);
	// 	// todo-9 I moved `DonatedNft` to `IPrizesWallet`.
	// 	donatedNfts[numDonatedNfts] = CosmicSignatureConstants.DonatedNft({
	// 		roundNum: roundNum,
	// 		nftAddress: nftAddress_,
	// 		nftId: nftId_,
	// 		claimed: false
	// 	});
	// 	++ numDonatedNfts;
	// 	emit NftDonationEvent(_msgSender(), nftAddress_, roundNum, nftId_, numDonatedNfts - 1);
	// }

	// function claimDonatedNft(uint256 index) public override /*nonReentrant*/ onlyRoundIsActive {
	// 	require(index < numDonatedNfts, CosmicSignatureErrors.InvalidDonatedNftIndex("Invalid donated NFT index.", index));
	//
	// 	// todo-9 I moved `DonatedNft` to `IPrizesWallet`.
	// 	CosmicSignatureConstants.DonatedNft storage donatedNft = donatedNfts[index];
	// 	require(!donatedNft.claimed, CosmicSignatureErrors.DonatedNftAlreadyClaimed("Donated NFT already claimed.", index));
	// 	require(winners[donatedNft.roundNum] == _msgSender(), CosmicSignatureErrors.DonatedNftClaimDenied("Only the bidding round main prize winner is permitted to claim this NFT.", _msgSender(), index));
	//
	// 	donatedNft.claimed = true;
	// 	donatedNft.nftAddress.transferFrom(address(this), _msgSender(), donatedNft.nftId);
	//
	// 	emit DonatedNftClaimedEvent(donatedNft.roundNum, index, _msgSender(), address(donatedNft.nftAddress), donatedNft.nftId);
	// }

	// /// todo-9 `nonReentrant` not needed here?
	// function claimManyDonatedNfts(uint256[] calldata indices) external override nonReentrant /*onlyRoundIsActive*/ {
	// 	for ( uint256 counter_ = 0; counter_ < indices.length; ++ counter_ ) {
	// 		claimDonatedNft(indices[counter_]);
	// 	}
	// }
	
	// function getDonatedNftDetails(uint256 index) public view override returns (address, uint256, uint256, bool) {
	// 	require(index < numDonatedNfts, "Invalid donated NFT index.");
	// 	// todo-9 I moved `DonatedNft` to `IPrizesWallet`.
	// 	CosmicSignatureConstants.DonatedNft memory donatedNft = donatedNfts[index];
	// 	// todo-9 I have reordered `DonatedNft` members. So maybe reorder these too.
	// 	return (address(donatedNft.nftAddress), donatedNft.nftId, donatedNft.roundNum, donatedNft.claimed);
	// }
}
