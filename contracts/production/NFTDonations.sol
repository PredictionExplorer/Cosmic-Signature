// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicGameStorage } from "./CosmicGameStorage.sol";
import { INFTDonations } from "./interfaces/INFTDonations.sol";

abstract contract NFTDonations is CosmicGameStorage, INFTDonations {
	function donateNFT(IERC721 nftAddress, uint256 tokenId) external override {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);

		nftAddress.safeTransferFrom(msg.sender, address(this), tokenId);

		donatedNFTs[numDonatedNFTs] = CosmicGameConstants.DonatedNFT({
			nftAddress: nftAddress,
			tokenId: tokenId,
			round: roundNum,
			claimed: false
		});

		numDonatedNFTs += 1;
		emit NFTDonationEvent(msg.sender, nftAddress, roundNum, tokenId, numDonatedNFTs - 1);
	}

	/// @notice Internal function to handle NFT donations
	/// @dev This function is called by donateNFT and bidAndDonateNFT
	/// @param _nftAddress Address of the NFT contract
	/// @param _tokenId ID of the NFT to donate
	function _donateNFT(IERC721 _nftAddress, uint256 _tokenId) internal {
		_nftAddress.safeTransferFrom(msg.sender, address(this), _tokenId);
		donatedNFTs[numDonatedNFTs] = CosmicGameConstants.DonatedNFT({
			nftAddress: _nftAddress,
			tokenId: _tokenId,
			round: roundNum,
			claimed: false
		});
		// ToDo-202408116-0 applies.
		numDonatedNFTs = numDonatedNFTs/*.add*/ + (1);
		// ToDo-202408116-0 applies.
		emit NFTDonationEvent(msg.sender, _nftAddress, roundNum, _tokenId, numDonatedNFTs/*.sub*/ - (1));
	}

	// todo-1 This was `external`, but that didn't compile, so I made it `public`. To be revisited.
	function claimDonatedNFT(uint256 index) public override {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		require(index < numDonatedNFTs, CosmicGameErrors.InvalidDonatedNFTIndex("Invalid donated NFT index",index));

		CosmicGameConstants.DonatedNFT storage nft = donatedNFTs[index];
		require(!nft.claimed, CosmicGameErrors.NFTAlreadyClaimed("NFT already claimed",index));
		require(winners[nft.round] == msg.sender, CosmicGameErrors.NonExistentWinner("Only the round winner can claim this NFT",index));

		nft.claimed = true;
		nft.nftAddress.safeTransferFrom(address(this), msg.sender, nft.tokenId);

		emit DonatedNFTClaimedEvent(nft.round, index, msg.sender, address(nft.nftAddress), nft.tokenId);
	}

	function claimManyDonatedNFTs(uint256[] calldata indices) external override {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		for (uint256 i = 0; i < indices.length; i++) {
			claimDonatedNFT(indices[i]);
		}
	}
	
	function getDonatedNFTDetails(uint256 index) public view override returns (address, uint256, uint256, bool) {
		require(index < numDonatedNFTs, "Invalid donated NFT index");
		CosmicGameConstants.DonatedNFT memory nft = donatedNFTs[index];
		return (address(nft.nftAddress), nft.tokenId, nft.round, nft.claimed);
	}
}
