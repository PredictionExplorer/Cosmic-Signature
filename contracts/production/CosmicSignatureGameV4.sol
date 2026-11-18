// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.38;

import { ISystemManagementV2 } from "./interfaces/ISystemManagementV2.sol";
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

import { IChaosZeroBinding, IChaosZeroMarket } from "./interfaces/IChaosZeroMarket.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";
import { IERC20, SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract CosmicSignatureGameV4 is
	CosmicSignatureGameV2Base,
	CosmicSignatureGameStorageV4Base,
	SystemManagementV3,
	BidStatisticsV3,
	BiddingV3,
	MainPrizeV4,
	CosmicSignatureGameStorageV4 {

	/// @notice The legacy no-argument upgrade initializer cannot configure the V4 contracts.
	function reinitialize() external pure override {
		revert V4InitializationRequired();
	}

	function initializeV4(ICosmicSignatureArtAuction artAuction_, IChaosZeroMarket chaosZeroMarket_) external override
		onlyOwner _onlyRoundIsInactive _onlyIfPrevVersionWasInitialized reinitializer(4) {
		address artAuctionAddress_ = address(artAuction_);
		if (
			artAuctionAddress_.code.length == 0 ||
			artAuction_.game() != address(this) ||
			address(artAuction_.nft()) != address(nft)
		) {
			revert InvalidArtAuction(artAuctionAddress_);
		}
		if (
			address(chaosZeroMarket_).code.length == 0 ||
			chaosZeroMarket_.game() != address(this) ||
			chaosZeroMarket_.cst() != address(token)
		) {
			revert InvalidChaosZeroMarket(address(chaosZeroMarket_));
		}
		IChaosZeroBinding source_ = chaosZeroMarket_.source();
		if (address(source_).code.length == 0 || source_.game() != address(this) || source_.cst() != address(token)) {
			revert InvalidChaosZeroMarket(address(chaosZeroMarket_));
		}
		artAuction = artAuction_;
		_setArtAuctionOpeningBid(0.001 ether);
		chaosZeroMarket = chaosZeroMarket_;
		emit ArtAuctionConfigured(artAuctionAddress_);
		_fundChaosZeroCycle();
	}

	function setArtAuctionOpeningBid(uint256 openingBid_) external override onlyOwner _onlyRoundIsInactive {
		_setArtAuctionOpeningBid(openingBid_);
	}

	function _setArtAuctionOpeningBid(uint256 openingBid_) private {
		if (openingBid_ == 0) revert ICosmicSignatureArtAuction.InvalidArtAuctionOpeningBid();
		artAuctionOpeningBid = openingBid_;
		emit ArtAuctionOpeningBidChanged(openingBid_);
	}

	function _checkIfPrevVersionWasInitialized() internal view override {
		if (_getInitializedVersion() != 3) {
			revert InvalidInitialization();
		}
	}

	/// @dev During V4 both the market and its historical outcome source are bound to the initialized CST.
	function setCosmicSignatureToken(ICosmicSignatureToken newValue_) public override (SystemManagementV2, ISystemManagementV2) onlyOwner _onlyRoundIsInactive {
		if (address(newValue_) != address(token)) {
			revert ChaosZeroCollateralIsFixed(address(token));
		}
		emit CosmicSignatureTokenAddressChanged(newValue_);
	}

	function _prepareNextRound() internal override {
		super._prepareNextRound();
		_fundChaosZeroCycle();
	}

	/// @dev Only initialization or an actual cycle increment reaches this function. CST transfers
	/// have no receiver callback, so market availability cannot block the game from advancing.
	function _fundChaosZeroCycle() private {
		address market_ = address(chaosZeroMarket);
		uint256 cumulativeAmount_ = _totalChaosZeroFunding[market_] + CHAOS_ZERO_CST_PER_CYCLE;
		_totalChaosZeroFunding[market_] = cumulativeAmount_;
		chaosZeroFunding[market_][roundNum] = ChaosZeroCycleFunding(CHAOS_ZERO_CST_PER_CYCLE, cumulativeAmount_);
		token.mint(address(this), CHAOS_ZERO_CST_PER_CYCLE);
		SafeERC20.safeTransfer(IERC20(address(token)), market_, CHAOS_ZERO_CST_PER_CYCLE);
		emit ChaosZeroCycleFunded(market_, roundNum, CHAOS_ZERO_CST_PER_CYCLE, cumulativeAmount_);
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
