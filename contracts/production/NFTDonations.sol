// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./CosmicGameStorage.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";

abstract contract NFTDonations is ReentrancyGuardUpgradeable,CosmicGameStorage {
	/// @notice Emitted when an NFT is donated
	/// @param donor The address of the donor
	/// @param nftAddress The address of the NFT contract
	/// @param round The current round number
	/// @param tokenId The ID of the donated NFT
	/// @param index The index of the donated NFT in the storage array
	event NFTDonationEvent(
		address indexed donor,
		IERC721 indexed nftAddress,
		uint256 indexed round,
		uint256 tokenId,
		uint256 index
	);
	/// @notice Emitted when a donated NFT is claimed
	/// @param round The round number
	/// @param index The index of the donated NFT
	/// @param winner The address of the winner claiming the NFT
	/// @param nftAddressdonatedNFTs The address of the NFT contract
	/// @param tokenId The ID of the claimed NFT
	event DonatedNFTClaimedEvent(
		uint256 indexed round,
		uint256 index,
		address winner,
		address nftAddressdonatedNFTs,
		uint256 tokenId
	);
	/// @notice Donate an NFT to the current round
	/// @dev This function allows users to donate NFTs that can be claimed by the round winner
	/// @param nftAddress The address of the NFT contract
	/// @param tokenId The ID of the NFT being donated
	function donateNFT(IERC721 nftAddress, uint256 tokenId) external nonReentrant {
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

	/// @notice Claim a donated NFT
	/// @dev Only the winner of the round can claim the NFT within a certain timeframe
	/// todo-1 This was `external`, but that didn't compile, so I made it `public`. To be revisited.
	/// @param index The index of the donated NFT in the storage array
	function claimDonatedNFT(uint256 index) public nonReentrant {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
		require(index < numDonatedNFTs, "Invalid donated NFT index");

		CosmicGameConstants.DonatedNFT storage nft = donatedNFTs[index];
		require(!nft.claimed, "NFT already claimed");
		require(winners[nft.round] == msg.sender, "Only the round winner can claim this NFT");

		nft.claimed = true;
		nft.nftAddress.safeTransferFrom(address(this), msg.sender, nft.tokenId);

		emit DonatedNFTClaimedEvent(nft.round, index, msg.sender, address(nft.nftAddress), nft.tokenId);
	}
	/// @notice Claim multiple donated NFTs in a single transaction
	/// @dev This function allows claiming multiple NFTs at once to save gas
	/// @param indices An array of indices of the donated NFTs to claim
	function claimManyDonatedNFTs(uint256[] calldata indices) external nonReentrant {
		for (uint256 i = 0; i < indices.length; i++) {
			claimDonatedNFT(indices[i]);
		}
	}
	/// @notice Get the details of a donated NFT
	/// @param index The index of the donated NFT
	/// @return A tuple containing the NFT address, token ID, round number, and claimed status
	function getDonatedNFTDetails(uint256 index) public view returns (address, uint256, uint256, bool) {
		require(index < numDonatedNFTs, "Invalid donated NFT index");
		CosmicGameConstants.DonatedNFT memory nft = donatedNFTs[index];
		return (address(nft.nftAddress), nft.tokenId, nft.round, nft.claimed);
	}
}
