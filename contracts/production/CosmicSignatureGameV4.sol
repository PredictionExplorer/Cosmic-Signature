// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { SystemManagementV2 } from "./SystemManagementV2.sol";
import { BidStatisticsV2 } from "./BidStatisticsV2.sol";
import { BiddingV2Base } from "./BiddingV2Base.sol";
import { CosmicSignatureGameV2Base } from "./CosmicSignatureGameV2Base.sol";
import { CosmicSignatureGameStorageV4Base } from "./CosmicSignatureGameStorageV4Base.sol";
import { SystemManagementV3 } from "./SystemManagementV3.sol";
import { BidStatisticsV3 } from "./BidStatisticsV3.sol";
import { BiddingV3 } from "./BiddingV3.sol";
import { MainPrizeV3 } from "./MainPrizeV3.sol";
import { MainPrizeV4 } from "./MainPrizeV4.sol";
import { CosmicSignatureGameStorageV4 } from "./CosmicSignatureGameStorageV4.sol";
import { ICosmicSignatureArtAuction } from "./interfaces/ICosmicSignatureArtAuction.sol";

/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract CosmicSignatureGameV4 is
	CosmicSignatureGameV2Base,
	CosmicSignatureGameStorageV4Base,
	SystemManagementV3,
	BidStatisticsV3,
	BiddingV3,
	MainPrizeV4,
	CosmicSignatureGameStorageV4 {

	/// @notice The legacy no-argument upgrade initializer cannot configure an auction.
	function reinitialize() external pure override {
		revert V4InitializationRequired();
	}

	function initializeV4(ICosmicSignatureArtAuction artAuction_) external override
		onlyOwner _onlyRoundIsInactive _onlyIfPrevVersionWasInitialized reinitializer(4) {
		address artAuctionAddress_ = address(artAuction_);
		if (
			artAuctionAddress_.code.length == 0 ||
			artAuction_.game() != address(this) ||
			address(artAuction_.nft()) != address(nft)
		) {
			revert InvalidArtAuction(artAuctionAddress_);
		}
		artAuction = artAuction_;
		emit ArtAuctionConfigured(artAuctionAddress_);
	}

	function _checkIfPrevVersionWasInitialized() internal view override {
		if (_getInitializedVersion() != 3) {
			revert InvalidInitialization();
		}
	}

	function setCstDutchAuctionDuration(uint256 newValue_) public override (SystemManagementV2, SystemManagementV3) {
		super.setCstDutchAuctionDuration(newValue_);
	}

	function setCstDutchAuctionDurationChangeDivisor(uint256 newValue_) public override (SystemManagementV2, SystemManagementV3) {
		super.setCstDutchAuctionDurationChangeDivisor(newValue_);
	}

	function _updateRoundStatsOnMainPrizeClaim(bool isSameBid_) internal override (BidStatisticsV2, BidStatisticsV3, MainPrizeV3) {
		super._updateRoundStatsOnMainPrizeClaim(isSameBid_);
	}

	function getNextEthBidPriceAdvanced(int256 currentTimeOffset_) public view override (BiddingV2Base, BiddingV3) returns (uint256) {
		return super.getNextEthBidPriceAdvanced(currentTimeOffset_);
	}

	function getNextCstBidPriceAdvanced(int256 currentTimeOffset_) public view override (BiddingV2Base, BiddingV3) returns (uint256) {
		return super.getNextCstBidPriceAdvanced(currentTimeOffset_);
	}

	function getBidCstRewardAmountAdvanced(int256 currentTimeOffset_) public view override (BiddingV2Base, BiddingV3) returns (uint256) {
		return super.getBidCstRewardAmountAdvanced(currentTimeOffset_);
	}
}
