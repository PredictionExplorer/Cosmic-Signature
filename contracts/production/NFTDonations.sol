// SPDX-License-Identifier: MIT

pragma solidity 0.8.27;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { SystemManagement } from "./SystemManagement.sol";
import { INFTDonations } from "./interfaces/INFTDonations.sol";

abstract contract NFTDonations is ReentrancyGuardUpgradeable, CosmicSignatureGameStorage, SystemManagement, INFTDonations {
	/// todo-1 Didn't we discuss that an NFT donation without placing a bid could result in spamming?
	/// todo-1 But Nick is saying it's OK.
	/// todo-0 Should we allow donations even while the system is inactive?
	function donateNFT(IERC721 nftAddress, uint256 nftId) external override nonReentrant onlyActive  {
		nftAddress.safeTransferFrom(msg.sender, address(this), nftId);
		donatedNFTs[numDonatedNFTs] = CosmicGameConstants.DonatedNFT({
			nftAddress: nftAddress,
			nftId: nftId,
			roundNum: roundNum,
			claimed: false
		});
		++ numDonatedNFTs;
		emit NFTDonationEvent(msg.sender, nftAddress, roundNum, nftId, numDonatedNFTs - 1);
	}

	/// @notice Internal function to handle NFT donations
	/// @dev This function is called by donateNFT and bidAndDonateNFT
	/// todo-0 todo-1 What's the difference between this and `donateNFT`? Can I eliminate one of them?
	/// @param _nftAddress Address of the NFT contract
	/// @param _nftId ID of the NFT to donate
	function _donateNFT(IERC721 _nftAddress, uint256 _nftId) internal {
		_nftAddress.safeTransferFrom(msg.sender, address(this), _nftId);
		donatedNFTs[numDonatedNFTs] = CosmicGameConstants.DonatedNFT({
			nftAddress: _nftAddress,
			nftId: _nftId,
			roundNum: roundNum,
			claimed: false
		});
		++ numDonatedNFTs;
		emit NFTDonationEvent(msg.sender, _nftAddress, roundNum, _nftId, numDonatedNFTs - 1);
	}

	/// todo-0 Allow this to execute even before activation time.
	function claimDonatedNFT(uint256 index) public override /*nonReentrant*/ onlyActive {
		require(index < numDonatedNFTs, CosmicGameErrors.InvalidDonatedNFTIndex("Invalid donated NFT index", index));

		CosmicGameConstants.DonatedNFT storage donatedNFT = donatedNFTs[index];
		require(!donatedNFT.claimed, CosmicGameErrors.NFTAlreadyClaimed("NFT already claimed", index));
		// todo-1 Should we allow anybody to claim after a timeout that starts after ciam main prize?
		require(winners[donatedNFT.roundNum] == msg.sender, CosmicGameErrors.NonExistentWinner("Only the round winner can claim this NFT", index));

		donatedNFT.claimed = true;
		// todo-1 Sometimes we use "safe" function and sometimes we don't. Review all NFT calls.
		donatedNFT.nftAddress.safeTransferFrom(address(this), msg.sender, donatedNFT.nftId);

		// todo-1 Emit this before making the exernal call?
		emit DonatedNFTClaimedEvent(donatedNFT.roundNum, index, msg.sender, address(donatedNFT.nftAddress), donatedNFT.nftId);
	}

	/// todo-1 `nonReentrant` not needed here?
	function claimManyDonatedNFTs(uint256[] calldata indices) external override nonReentrant /*onlyActive*/ {
		for (uint256 i = 0; i < indices.length; i++) {
			claimDonatedNFT(indices[i]);
		}
	}
	
	function getDonatedNFTDetails(uint256 index) public view override returns (address, uint256, uint256, bool) {
		require(index < numDonatedNFTs, "Invalid donated NFT index");
		CosmicGameConstants.DonatedNFT memory donatedNFT = donatedNFTs[index];
		return (address(donatedNFT.nftAddress), donatedNFT.nftId, donatedNFT.roundNum, donatedNFT.claimed);
	}
}
