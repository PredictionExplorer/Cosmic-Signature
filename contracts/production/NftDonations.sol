// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
// import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
// import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
// import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { INftDonations } from "./interfaces/INftDonations.sol";

abstract contract NftDonations is ReentrancyGuardUpgradeable, CosmicSignatureGameStorage, SystemManagement, INftDonations {
	// function donateNft(IERC721 nftAddress, uint256 nftId) external override nonReentrant onlyActive {
	// 	nftAddress.safeTransferFrom(msg.sender, address(this), nftId);
	// 	donatedNfts[numDonatedNfts] = CosmicGameConstants.DonatedNft({
	// 		roundNum: roundNum,
	// 		nftAddress: nftAddress,
	// 		nftId: nftId,
	// 		claimed: false
	// 	});
	// 	++ numDonatedNfts;
	// 	emit NftDonationEvent(msg.sender, nftAddress, roundNum, nftId, numDonatedNfts - 1);
	// }

	// function _donateNft(IERC721 nftAddress_, uint256 nftId_) internal {
	// 	nftAddress_.safeTransferFrom(msg.sender, address(this), nftId_);
	// 	donatedNfts[numDonatedNfts] = CosmicGameConstants.DonatedNft({
	// 		roundNum: roundNum,
	// 		nftAddress: nftAddress_,
	// 		nftId: nftId_,
	// 		claimed: false
	// 	});
	// 	++ numDonatedNfts;
	// 	emit NftDonationEvent(msg.sender, nftAddress_, roundNum, nftId_, numDonatedNfts - 1);
	// }

	// function claimDonatedNft(uint256 index) public override /*nonReentrant*/ onlyActive {
	// 	require(index < numDonatedNfts, CosmicGameErrors.InvalidDonatedNftIndex("Invalid donated NFT index.", index));
	//
	// 	CosmicGameConstants.DonatedNft storage donatedNft = donatedNfts[index];
	// 	require(!donatedNft.claimed, CosmicGameErrors.DonatedNftAlreadyClaimed("Donated NFT already claimed.", index));
	// 	require(winners[donatedNft.roundNum] == msg.sender, CosmicGameErrors.DonatedNftClaimDenied("Only bidding round main prize winner is permitted to claim this NFT.", msg.sender, index));
	//
	// 	donatedNft.claimed = true;
	// 	donatedNft.nftAddress.safeTransferFrom(address(this), msg.sender, donatedNft.nftId);
	//
	// 	emit DonatedNftClaimedEvent(donatedNft.roundNum, index, msg.sender, address(donatedNft.nftAddress), donatedNft.nftId);
	// }

	// /// todo-1 `nonReentrant` not needed here?
	// function claimManyDonatedNfts(uint256[] calldata indices) external override nonReentrant /*onlyActive*/ {
	// 	for ( uint256 counter_ = 0; counter_ < indices.length; ++ counter_) {
	// 		claimDonatedNft(indices[counter_]);
	// 	}
	// }
	
	// function getDonatedNftDetails(uint256 index) public view override returns (address, uint256, uint256, bool) {
	// 	require(index < numDonatedNfts, "Invalid donated NFT index.");
	// 	CosmicGameConstants.DonatedNft memory donatedNft = donatedNfts[index];
	//		// todo-9 I have reordered `DonatedNft` members. So maybe reorder these too.
	// 	return (address(donatedNft.nftAddress), donatedNft.nftId, donatedNft.roundNum, donatedNft.claimed);
	// }
}
