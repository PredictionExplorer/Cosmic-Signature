// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
// import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
// import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
// import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { INFTDonations } from "./interfaces/INFTDonations.sol";

abstract contract NFTDonations is ReentrancyGuardUpgradeable, CosmicSignatureGameStorage, SystemManagement, INFTDonations {
	// function donateNft(IERC721 nftAddress, uint256 nftId) external override nonReentrant onlyActive  {
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

	// /// @notice Internal function to handle NFT donations
	// /// @dev This function is called by donateNft and bidAndDonateNft
	// /// todo-1 Actually `donateNft` doesn't call it.
	// /// todo-1 Maybe eliminate this method and leave only `donateNft`.
	// /// @param _nftAddress Address of the NFT contract
	// /// @param _nftId ID of the NFT to donate
	// function _donateNft(IERC721 _nftAddress, uint256 _nftId) internal {
	// 	_nftAddress.safeTransferFrom(msg.sender, address(this), _nftId);
	// 	donatedNfts[numDonatedNfts] = CosmicGameConstants.DonatedNft({
	// 		roundNum: roundNum,
	// 		nftAddress: _nftAddress,
	// 		nftId: _nftId,
	// 		claimed: false
	// 	});
	// 	++ numDonatedNfts;
	// 	emit NftDonationEvent(msg.sender, _nftAddress, roundNum, _nftId, numDonatedNfts - 1);
	// }

	// function claimDonatedNft(uint256 index) public override /*nonReentrant*/ onlyActive {
	// 	require(index < numDonatedNfts, CosmicGameErrors.InvalidDonatedNftIndex("Invalid donated NFT index.", index));
	//
	// 	CosmicGameConstants.DonatedNft storage donatedNft = donatedNfts[index];
	// 	require(!donatedNft.claimed, CosmicGameErrors.DonatedNftAlreadyClaimed("Donated NFT already claimed.", index));
	// 	require(winners[donatedNft.roundNum] == msg.sender, CosmicGameErrors.NonExistentWinner("Only bidding round main prize winner is permitted to claim this NFT.", index));
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
