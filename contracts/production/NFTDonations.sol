// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicGameStorage } from "./CosmicGameStorage.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { INFTDonations } from "./interfaces/INFTDonations.sol";

abstract contract NFTDonations is ReentrancyGuardUpgradeable, CosmicGameStorage, SystemManagement, INFTDonations {
	// todo-0 Didn't we discuss that an NFT donation without placing a bid could result in spamming?
	function donateNFT(IERC721 nftAddress, uint256 nftId) external override nonReentrant onlyRuntime  {
		nftAddress.safeTransferFrom(msg.sender, address(this), nftId);
		donatedNFTs[numDonatedNFTs] = CosmicGameConstants.DonatedNFT({
			nftAddress: nftAddress,
			nftId: nftId,
			round: roundNum,
			claimed: false
		});
		++ numDonatedNFTs;
		emit NFTDonationEvent(msg.sender, nftAddress, roundNum, nftId, numDonatedNFTs - 1);
	}

	/// @notice Internal function to handle NFT donations
	/// @dev This function is called by donateNFT and bidAndDonateNFT
	/// @param _nftAddress Address of the NFT contract
	/// @param _nftId ID of the NFT to donate
	function _donateNFT(IERC721 _nftAddress, uint256 _nftId) internal {
		_nftAddress.safeTransferFrom(msg.sender, address(this), _nftId);
		donatedNFTs[numDonatedNFTs] = CosmicGameConstants.DonatedNFT({
			nftAddress: _nftAddress,
			nftId: _nftId,
			round: roundNum,
			claimed: false
		});
		++ numDonatedNFTs;
		emit NFTDonationEvent(msg.sender, _nftAddress, roundNum, _nftId, numDonatedNFTs - 1);
	}

	function claimDonatedNFT(uint256 index) public override onlyRuntime {
		require(index < numDonatedNFTs, CosmicGameErrors.InvalidDonatedNFTIndex("Invalid donated NFT index",index));

		CosmicGameConstants.DonatedNFT storage donatedNFT = donatedNFTs[index];
		require(!donatedNFT.claimed, CosmicGameErrors.NFTAlreadyClaimed("NFT already claimed",index));
		require(winners[donatedNFT.round] == msg.sender, CosmicGameErrors.NonExistentWinner("Only the round winner can claim this NFT",index));

		donatedNFT.claimed = true;
		// todo-1 Sometimes we use "safe" function and sometimes we don't. Review all NFT calls.
		donatedNFT.nftAddress.safeTransferFrom(address(this), msg.sender, donatedNFT.nftId);

		emit DonatedNFTClaimedEvent(donatedNFT.round, index, msg.sender, address(donatedNFT.nftAddress), donatedNFT.nftId);
	}

	function claimManyDonatedNFTs(uint256[] calldata indices) external override nonReentrant onlyRuntime {
		for (uint256 i = 0; i < indices.length; i++) {
			claimDonatedNFT(indices[i]);
		}
	}
	
	function getDonatedNFTDetails(uint256 index) public view override returns (address, uint256, uint256, bool) {
		require(index < numDonatedNFTs, "Invalid donated NFT index");
		CosmicGameConstants.DonatedNFT memory donatedNFT = donatedNFTs[index];
		return (address(donatedNFT.nftAddress), donatedNFT.nftId, donatedNFT.round, donatedNFT.claimed);
	}
}
