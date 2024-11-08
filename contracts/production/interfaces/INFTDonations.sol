// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.27;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ICosmicSignatureGameStorage } from "./ICosmicSignatureGameStorage.sol";
import { ISystemManagement } from "./ISystemManagement.sol";

interface INFTDonations is ICosmicSignatureGameStorage, ISystemManagement {
	/// @notice Emitted when an NFT is donated
	/// @param donor The address of the donor
	/// @param nftAddress The address of the NFT contract
	/// @param roundNum The current bidding round number.
	/// @param nftId The ID of the donated NFT
	/// @param index The index of the donated NFT in the storage array
	event NFTDonationEvent(
		address indexed donor,
		IERC721 indexed nftAddress,
		uint256 indexed roundNum,
		uint256 nftId,
		uint256 index
	);

	/// @notice Emitted when a donated NFT is claimed
	/// @param roundNum The bidding round number.
	/// @param index The index of the donated NFT
	/// @param winner The address of the winner claiming the NFT
	/// @param nftAddressdonatedNFTs The address of the NFT contract
	/// @param nftId The ID of the claimed NFT
	event DonatedNFTClaimedEvent(
		uint256 indexed roundNum,
		uint256 index,
		address winner,
		address nftAddressdonatedNFTs,
		uint256 nftId
	);

	/// @notice Donate an NFT to the current round
	/// @dev This function allows users to donate NFTs that can be claimed by the round winner
	/// @param nftAddress The address of the NFT contract
	/// @param nftId The ID of the NFT being donated
	function donateNFT(IERC721 nftAddress, uint256 nftId) external;

	/// @notice Claim a donated NFT
	/// @dev Only the winner of the round can claim the NFT within a certain timeframe
	/// @param index The index of the donated NFT in the storage array
	function claimDonatedNFT(uint256 index) external;

	/// @notice Claim multiple donated NFTs in a single transaction
	/// @dev This function allows claiming multiple NFTs at once to save gas
	/// @param indices An array of indices of the donated NFTs to claim
	function claimManyDonatedNFTs(uint256[] calldata indices) external;

	/// @notice Get the details of a donated NFT
	/// @param index The index of the donated NFT
	/// @return A tuple containing the NFT address, NFT ID, bidding round number, and claimed status.
	function getDonatedNFTDetails(uint256 index) external view returns (address, uint256, uint256, bool);
}
