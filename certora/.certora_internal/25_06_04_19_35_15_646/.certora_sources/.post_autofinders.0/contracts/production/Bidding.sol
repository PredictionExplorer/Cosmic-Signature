// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.29;

// #endregion
// #region

// // #enable_asserts // #disable_smtchecker import "hardhat/console.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuardTransientUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import { OwnableUpgradeableWithReservedStorageGaps } from "./OwnableUpgradeableWithReservedStorageGaps.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicSignatureConstants } from "./libraries/CosmicSignatureConstants.sol";
import { CosmicSignatureErrors } from "./libraries/CosmicSignatureErrors.sol";
import { ICosmicSignatureToken } from "./interfaces/ICosmicSignatureToken.sol";
import { CosmicSignatureGameStorage } from "./CosmicSignatureGameStorage.sol";
import { BiddingBase } from "./BiddingBase.sol";
import { MainPrizeBase } from "./MainPrizeBase.sol";
import { BidStatistics } from "./BidStatistics.sol";
import { IBidding } from "./interfaces/IBidding.sol";

// #endregion
// #region

abstract contract Bidding is
	ReentrancyGuardTransientUpgradeable,
	OwnableUpgradeableWithReservedStorageGaps,
	CosmicSignatureGameStorage,
	BiddingBase,
	MainPrizeBase,
	BidStatistics,
	IBidding {
	// #region `receive`

	/// @dev Comment-202502051 relates.
	/// Comment-202505201 relates.
	receive() external payable override /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		_bidWithEth((-1), "");
	}

	// #endregion
	// #region `bidWithEthAndDonateToken`

	/// @dev Comment-202502051 relates.
	/// Comment-202505201 relates.
	function bidWithEthAndDonateToken(int256 randomWalkNftId_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external payable override /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, message_);
		prizesWallet.donateToken(roundNum, _msgSender(), tokenAddress_, amount_);
	}

	// #endregion
	// #region `bidWithEthAndDonateNft`

	/// @dev Comment-202502051 relates.
	/// Comment-202505201 relates.
	function bidWithEthAndDonateNft(int256 randomWalkNftId_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external payable override /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, message_);
		prizesWallet.donateNft(roundNum, _msgSender(), nftAddress_, nftId_);
	}

	// #endregion
	// #region `bidWithEth`

	/// @dev Comment-202502051 relates.
	/// Comment-202505201 relates.
	function bidWithEth(int256 randomWalkNftId_, string memory message_) external payable override /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		_bidWithEth(randomWalkNftId_, message_);
	}

	// #endregion
	// #region `_bidWithEth`

	/// @dev
	/// [Comment-202502051]
	/// A reason for this to be `nonReentrant` is to pervent the possibility to mess up
	/// the order of bidding and token/NFT donation events.
	/// [/Comment-202502051]
	/// [Comment-202505201]
	/// A reason for this to be `nonReentrant` is because a reentry from `_distributePrizes` could result in incorrect behavior.
	/// [/Comment-202505201]
	function _bidWithEth(int256 randomWalkNftId_, string memory message_) private logInternal375(message_)nonReentrant /*_onlyRoundIsActive*/ {
		// #region

		// BidType bidType_;

		// Comment-202503162 relates and/or applies.
		uint256 ethBidPrice_ = getNextEthBidPrice(int256(0));assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000d3,ethBidPrice_)}
		uint256 paidEthPrice_ =
			(randomWalkNftId_ < int256(0)) ?
			ethBidPrice_ :
			getEthPlusRandomWalkNftBidPrice(ethBidPrice_);assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000d4,paidEthPrice_)}

		// #endregion
		// #region

		int256 overpaidEthPrice_ = int256(msg.value) - int256(paidEthPrice_);assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000d5,overpaidEthPrice_)}
		if (overpaidEthPrice_ == int256(0)) {
			// This is the most common case. Doing nothing. Not spending any gas.
		} else if(overpaidEthPrice_ > int256(0)) {
			// If the bidder sent more ETH than required, but we are not going to refund the excess,
			// treating the whole received amount as what they were supposed to send.
			// Comment-202502052 relates and/or applies.
			// Comment-202502054 relates and/or applies.
			{
				// #enable_asserts assert(block.basefee > 0);
				uint256 ethBidRefundAmountMinLimit_ = ethBidRefundAmountInGasMinLimit * block.basefee;

				// [Comment-202505296]
				// todo-1 Tell the auditor about this.
				// Issue. The Hardhat Coverage task results tell us that this condition never becomes `true`.
				// That's because `block.basefee` is zero, as explained in Comment-202505294.
				// [/Comment-202505296]
				if (uint256(overpaidEthPrice_) < ethBidRefundAmountMinLimit_) {

					overpaidEthPrice_ = int256(0);
					paidEthPrice_ = msg.value;
					// ethBidPrice_ = msg.value;
					// if (randomWalkNftId_ >= int256(0)) {
					// 	// [Comment-202505074]
					// 	// It could make sense to subtract something like `CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR - 1` from this
					// 	// to make this formula closer to the opposite of `getEthPlusRandomWalkNftBidPrice`,
					// 	// but it's unnecessary to spend gas on that.
					// 	// Comment-202503162 relates and/or applies.
					// 	// [/Comment-202505074]
					// 	ethBidPrice_ *= CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR;
					// }
				}
			}
		} else {
			// [Comment-202412045]
			// Performing this validatin sooner -- to minimize transaction fee in case the validation fails.
			// [/Comment-202412045]
			revert CosmicSignatureErrors.InsufficientReceivedBidAmount("The current ETH bid price is greater than the amount you transferred.", paidEthPrice_, msg.value);
		}

		// #endregion
		// #region

		if (randomWalkNftId_ < int256(0)) {
			// #region

			// // #enable_asserts assert(bidType_ == BidType.ETH);

			// #endregion
		} else {
			// #region

			require(
				usedRandomWalkNfts[uint256(randomWalkNftId_)] == 0,
				CosmicSignatureErrors.UsedRandomWalkNft(
					"This Random Walk NFT has already been used for bidding.",
					uint256(randomWalkNftId_)
				)
			);
			require(
				// [Comment-202502091]
				// It would probably be a bad idea to evaluate something like
				// `randomWalkNft._isAuthorized` or `randomWalkNft._isApprovedOrOwner`
				// Comment-202502063 relates.
				// [/Comment-202502091]
				_msgSender() == randomWalkNft.ownerOf(uint256(randomWalkNftId_)),

				CosmicSignatureErrors.CallerIsNotNftOwner(
					"You are not the owner of this Random Walk NFT.",
					randomWalkNft,
					uint256(randomWalkNftId_),
					_msgSender()
				)
			);
			usedRandomWalkNfts[uint256(randomWalkNftId_)] = 1;
			// bidType_ = BidType.RandomWalk;

			// #endregion
		}

		// #endregion
		// #region

		biddersInfo[roundNum][_msgSender()].totalSpentEthAmount += paidEthPrice_;
		if (lastBidderAddress == address(0)) {
			ethDutchAuctionBeginningBidPrice = ethBidPrice_ * CosmicSignatureConstants.ETH_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER;
		}

		// [Comment-202501061]
		// This formula ensures that the result increases.
		// todo-1 Everywhere we use formulas that add 1, make sure the web site uses the same formulas.
		// todo-1 For example, it offers to increase bid price by 1% or 2%.
		// [/Comment-202501061]
		nextEthBidPrice = ethBidPrice_ + ethBidPrice_ / ethBidPriceIncreaseDivisor + 1;

		// Comment-202501125 applies.
		token.mint(_msgSender(), cstRewardAmountForBidding);

		_bidCommon(/*bidType_,*/ message_);
		emit BidPlaced(
			roundNum,
			_msgSender(),
			int256(paidEthPrice_),
			-1,
			randomWalkNftId_,
			message_,
			mainPrizeTime
		);

		// #endregion
		// #region

		// [Comment-202505096]
		// Refunding excess ETH if the bidder sent significantly more than required.
		// [/Comment-202505096]
		if (overpaidEthPrice_ > int256(0)) {
			// // #enable_asserts // #disable_smtchecker uint256 gasUsed1_ = gasleft();
			// // #enable_asserts // #disable_smtchecker uint256 gasUsed2_ = gasleft();

			// Comment-202502043 applies.
			(bool isSuccess_, ) = _msgSender().call{value: uint256(overpaidEthPrice_)}("");

			// // #enable_asserts // #disable_smtchecker gasUsed2_ -= gasleft();
			// // #enable_asserts // #disable_smtchecker gasUsed1_ -= gasleft();
			// // #enable_asserts // #disable_smtchecker console.log("Gas Spent =", gasUsed1_, gasUsed2_, gasUsed2_ - (gasUsed1_ - gasUsed2_));
			if ( ! isSuccess_ ) {
				revert CosmicSignatureErrors.FundTransferFailed("ETH refund transfer failed.", _msgSender(), uint256(overpaidEthPrice_));
			}
		}

		// #endregion
	}modifier logInternal375(string memory message_) { assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01770000, 1037618708855) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01770001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01770005, 9) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01776001, message_) } _; }

	// #endregion
	// #region `getNextEthBidPrice`

	function getNextEthBidPrice(int256 currentTimeOffset_) public view override returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01820000, 1037618708866) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01820001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01820005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01826000, currentTimeOffset_) }
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 nextEthBidPrice_;
			if (lastBidderAddress == address(0)) {
				nextEthBidPrice_ = ethDutchAuctionBeginningBidPrice;
				// #enable_asserts assert((nextEthBidPrice_ == 0) == (roundNum == 0));
				if (nextEthBidPrice_ == 0) {
					nextEthBidPrice_ = CosmicSignatureConstants.FIRST_ROUND_INITIAL_ETH_BID_PRICE;
				} else {
					int256 ethDutchAuctionElapsedDuration_ = getDurationElapsedSinceRoundActivation() + currentTimeOffset_;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000dd,ethDutchAuctionElapsedDuration_)}
					if (ethDutchAuctionElapsedDuration_ <= int256(0)) {
						// Doing nothing.
					} else {
						// If this assertion fails, further assertions will not necessarily succeed and the behavior will not necessarily be correct.
						// #enable_asserts assert(ethDutchAuctionEndingBidPriceDivisor > 1);

						// [Comment-202501301]
						// Adding 1 to ensure that the result is a nonzero.
						// Comment-202503162 relates and/or applies.
						// [/Comment-202501301]
						uint256 ethDutchAuctionEndingBidPrice_ = nextEthBidPrice_ / ethDutchAuctionEndingBidPriceDivisor + 1;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000de,ethDutchAuctionEndingBidPrice_)}
						// #enable_asserts assert(ethDutchAuctionEndingBidPrice_ > 0 && ethDutchAuctionEndingBidPrice_ <= nextEthBidPrice_);

						uint256 ethDutchAuctionDuration_ = _getEthDutchAuctionDuration();assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000df,ethDutchAuctionDuration_)}
						if (uint256(ethDutchAuctionElapsedDuration_) < ethDutchAuctionDuration_) {
							uint256 ethDutchAuctionBidPriceDifference_ = nextEthBidPrice_ - ethDutchAuctionEndingBidPrice_;
							nextEthBidPrice_ -= ethDutchAuctionBidPriceDifference_ * uint256(ethDutchAuctionElapsedDuration_) / ethDutchAuctionDuration_;
						} else {
							nextEthBidPrice_ = ethDutchAuctionEndingBidPrice_;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000e0,nextEthBidPrice_)}
						}
					}
				}
			} else {
				nextEthBidPrice_ = nextEthBidPrice;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000dc,nextEthBidPrice_)}
			}
			// #enable_asserts assert(nextEthBidPrice_ > 0);
			return nextEthBidPrice_;
		}
	}

	// #endregion
	// #region `getEthPlusRandomWalkNftBidPrice`

	function getEthPlusRandomWalkNftBidPrice(uint256 ethBidPrice_) public pure override returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017f0000, 1037618708863) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017f0001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017f0005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017f6000, ethBidPrice_) }
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			// Comment-202505074 relates.
			uint256 ethPlusRandomWalkNftBidPrice_ =
				(ethBidPrice_ + (CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR - 1)) /
				CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR;

			// #enable_asserts assert(
			// #enable_asserts 	( ! ( ethBidPrice_ > 0 &&
			// #enable_asserts 	      ethBidPrice_ <= type(uint256).max - (CosmicSignatureConstants.RANDOMWALK_NFT_BID_PRICE_DIVISOR - 1)
			// #enable_asserts 	    )
			// #enable_asserts 	) ||
			// #enable_asserts 	ethPlusRandomWalkNftBidPrice_ > 0 &&
			// #enable_asserts 	ethPlusRandomWalkNftBidPrice_ <= ethBidPrice_
			// #enable_asserts );
			return ethPlusRandomWalkNftBidPrice_;
		}
	}

	// #endregion
	// #region `getEthDutchAuctionDurations`

	function getEthDutchAuctionDurations() external view override returns (uint256, int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 ethDutchAuctionDuration_ = _getEthDutchAuctionDuration();
			int256 ethDutchAuctionElapsedDuration_ = getDurationElapsedSinceRoundActivation();
			return (ethDutchAuctionDuration_, ethDutchAuctionElapsedDuration_);
		}
	}

	// #endregion
	// #region `_getEthDutchAuctionDuration`

	function _getEthDutchAuctionDuration() private view returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01780000, 1037618708856) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01780001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01780004, 0) }
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 ethDutchAuctionDuration_ = mainPrizeTimeIncrementInMicroSeconds / ethDutchAuctionDurationDivisor;
			return ethDutchAuctionDuration_;
		}
	}

	// #endregion
	// #region `bidWithCstAndDonateToken`

	/// @dev Comment-202505201 relates.
	function bidWithCstAndDonateToken(uint256 priceMaxLimit_, string memory message_, IERC20 tokenAddress_, uint256 amount_) external override /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
		prizesWallet.donateToken(roundNum, _msgSender(), tokenAddress_, amount_);
	}

	// #endregion
	// #region `bidWithCstAndDonateNft`

	/// @dev Comment-202505201 relates.
	function bidWithCstAndDonateNft(uint256 priceMaxLimit_, string memory message_, IERC721 nftAddress_, uint256 nftId_) external override /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
		prizesWallet.donateNft(roundNum, _msgSender(), nftAddress_, nftId_);
	}

	// #endregion
	// #region `bidWithCst`

	/// @dev Comment-202505201 relates.
	function bidWithCst(uint256 priceMaxLimit_, string memory message_) external override /*nonReentrant*/ /*_onlyRoundIsActive*/ {
		_bidWithCst(priceMaxLimit_, message_);
	}

	// #endregion
	// #region `_bidWithCst`

	/// @dev Comment-202505201 applies.
	function _bidWithCst(uint256 priceMaxLimit_, string memory message_) private logInternal378(message_)nonReentrant /*_onlyRoundIsActive*/ {
		// [Comment-202501045]
		// Somewhere around here, one might want to validate that the first bid in a bidding round is ETH.
		// But we are going to validate that near Comment-202501044.
		// [/Comment-202501045]

		// Comment-202503162 relates and/or applies.
		uint256 paidPrice_ = getNextCstBidPrice(int256(0));assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000d6,paidPrice_)}

		// Comment-202412045 applies.
		require(
			paidPrice_ <= priceMaxLimit_,
			CosmicSignatureErrors.InsufficientReceivedBidAmount("The current CST bid price is greater than the maximum you allowed.", paidPrice_, priceMaxLimit_)
		);

		// [Comment-202412251]
		// This is a common sense requirement.
		// The marketing wallet isn't supposed to bid with CST.
		// The behavior isn't necessarily going to be correct if this condition is not met,
		// but it appears that it's not going to be too bad,
		// so it's probably unnecessary to spend gas to `require` this.
		// That said, the marketing wallet is a contract that is not capable of bidding. So this assertion is guaranteed to succeed.
		// [/Comment-202412251]
		// #enable_asserts assert(_msgSender() != marketingWallet);

		// [Comment-202409177]
		// Burning the CST amount used for bidding.
		// Doing it before subsequent minting, which requires the bidder to have the given amount.
		// It probably makes little sense to call `ERC20Burnable.burn` or `ERC20Burnable.burnFrom` instead.
		// [/Comment-202409177]
		// [Comment-202501125]
		// Minting a CST reward to the bidder for placing this bid.
		// [/Comment-202501125]
		{
			ICosmicSignatureToken.MintOrBurnSpec[] memory mintAndBurnSpecs_ = new ICosmicSignatureToken.MintOrBurnSpec[](2);
			mintAndBurnSpecs_[0].account = _msgSender();
			mintAndBurnSpecs_[0].value = ( - int256(paidPrice_) );
			mintAndBurnSpecs_[1].account = _msgSender();
			mintAndBurnSpecs_[1].value = int256(cstRewardAmountForBidding);
			token.mintAndBurnMany(mintAndBurnSpecs_);
		}

		biddersInfo[roundNum][_msgSender()].totalSpentCstAmount += paidPrice_;
		cstDutchAuctionBeginningTimeStamp = block.timestamp;

		// [Comment-202409163]
		// Increasing the starting CST price for the next CST bid, while enforcing a minimum.
		// [/Comment-202409163]
		uint256 newCstDutchAuctionBeginningBidPrice_ =
			Math.max(paidPrice_ * CosmicSignatureConstants.CST_DUTCH_AUCTION_BEGINNING_BID_PRICE_MULTIPLIER, cstDutchAuctionBeginningBidPriceMinLimit);assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000d7,newCstDutchAuctionBeginningBidPrice_)}
		cstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;

		if (lastCstBidderAddress == address(0)) {
			// Comment-202501045 applies.

			// [Comment-202504212]
			// Issue. If the admin increases `cstDutchAuctionBeginningBidPriceMinLimit` for the next round,
			// it's possible that this value will not respect that setting.
			// [/Comment-202504212]
			nextRoundFirstCstDutchAuctionBeginningBidPrice = newCstDutchAuctionBeginningBidPrice_;
		}
		lastCstBidderAddress = _msgSender();
		_bidCommon(/*BidType.CST,*/ message_);
		emit BidPlaced(roundNum, _msgSender(), -1, int256(paidPrice_), -1, message_, mainPrizeTime);
	}modifier logInternal378(string memory message_) { assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017a0000, 1037618708858) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017a0001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017a0005, 9) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017a6001, message_) } _; }

	// #endregion
	// #region `getNextCstBidPrice`

	function getNextCstBidPrice(int256 currentTimeOffset_) public view override returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017e0000, 1037618708862) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017e0001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017e0005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017e6000, currentTimeOffset_) }
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			(uint256 cstDutchAuctionDuration_, int256 cstDutchAuctionRemainingDuration_) = _getCstDutchAuctionTotalAndRemainingDurations();
			cstDutchAuctionRemainingDuration_ -= currentTimeOffset_;
			if (cstDutchAuctionRemainingDuration_ <= int256(0)) {
				return 0;
			}

			// Comment-202501307 relates and/or applies.
			uint256 cstDutchAuctionBeginningBidPrice_ =
				(lastCstBidderAddress == address(0)) ? nextRoundFirstCstDutchAuctionBeginningBidPrice : cstDutchAuctionBeginningBidPrice;

			uint256 nextCstBidPrice_ = cstDutchAuctionBeginningBidPrice_ * uint256(cstDutchAuctionRemainingDuration_) / cstDutchAuctionDuration_;
			return nextCstBidPrice_;
		}
	}

	// #endregion
	// #region `getCstDutchAuctionDurations`

	function getCstDutchAuctionDurations() external view override returns (uint256, int256) {
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 cstDutchAuctionDuration_ = _getCstDutchAuctionDuration();
			int256 cstDutchAuctionElapsedDuration_ = _getCstDutchAuctionElapsedDuration();
			return (cstDutchAuctionDuration_, cstDutchAuctionElapsedDuration_);
		}
	}

	// #endregion
	// #region `_getCstDutchAuctionDuration`

	function _getCstDutchAuctionDuration() private view returns (uint256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017b0000, 1037618708859) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017b0001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017b0004, 0) }
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 cstDutchAuctionDuration_ = mainPrizeTimeIncrementInMicroSeconds / cstDutchAuctionDurationDivisor;
			return cstDutchAuctionDuration_;
		}
	}

	// #endregion
	// #region `_getCstDutchAuctionElapsedDuration`

	function _getCstDutchAuctionElapsedDuration() private view returns (int256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01790000, 1037618708857) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01790001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff01790004, 0) }
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			int256 cstDutchAuctionElapsedDuration_ = int256(block.timestamp) - int256(cstDutchAuctionBeginningTimeStamp);
			return cstDutchAuctionElapsedDuration_;
		}
	}

	// #endregion
	// #region `_getCstDutchAuctionTotalAndRemainingDurations`

	function _getCstDutchAuctionTotalAndRemainingDurations() private view returns (uint256, int256) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017c0000, 1037618708860) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017c0001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017c0004, 0) }
		// #enable_smtchecker /*
		unchecked
		// #enable_smtchecker */
		{
			uint256 cstDutchAuctionDuration_ = _getCstDutchAuctionDuration();
			int256 cstDutchAuctionElapsedDuration_ = _getCstDutchAuctionElapsedDuration();
			int256 cstDutchAuctionRemainingDuration_ = int256(cstDutchAuctionDuration_) - cstDutchAuctionElapsedDuration_;
			return (cstDutchAuctionDuration_, cstDutchAuctionRemainingDuration_);
		}
	}

	// #endregion
	// #region `_bidCommon`

	/// @notice Handles common bid logic.
	/// --- param bidType_ Bid type code.
	/// @param message_ Comment-202503155 applies.
	/// @dev Comment-202502051 relates.
	/// Comment-202505201 relates.
	/// Comment-202411169 relates and/or applies.
	function _bidCommon(/*BidType bidType_,*/ string memory message_) private /*nonReentrant*/ /*_onlyRoundIsActive*/ {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017d0000, 1037618708861) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017d0001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017d0005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff017d6000, message_) }
		require(
			bytes(message_).length <= bidMessageLengthMaxLimit,
			CosmicSignatureErrors.TooLongBidMessage("Message is too long.", bytes(message_).length)
		);

		// The first bid of the current bidding round?
		if (lastBidderAddress == address(0)) {

			// Comment-202411169 relates.
			_checkRoundIsActive();

			// [Comment-202501044]
			// It's probably more efficient to validate this here than to validate `lastBidderAddress` near Comment-202501045.
			// This logic assumes that ETH bid price is guaranteed to be a nonzero, as specified in Comment-202503162.
			// [/Comment-202501044]
			require(msg.value > 0, CosmicSignatureErrors.WrongBidType("The first bid in a bidding round shall be ETH."));

			cstDutchAuctionBeginningTimeStamp = block.timestamp;
			mainPrizeTime = block.timestamp + getInitialDurationUntilMainPrize();
			emit FirstBidPlacedInRound(roundNum, block.timestamp);
		} else {
			// [Comment-202411169]
			// It's unnecessary to call `_onlyRoundIsActive` or `_checkRoundIsActive`.
			// Given that `lastBidderAddress` is a nonzero, we know that the current bidding round is active.
			// [/Comment-202411169]
			// #enable_asserts assert(block.timestamp >= roundActivationTime);

			_updateChampionsIfNeeded();
			_extendMainPrizeTime();
		}
		// lastBidType = bidType_;
		lastBidderAddress = _msgSender();
		BidderAddresses storage bidderAddressesReference_ = bidderAddresses[roundNum];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000100d8,0)}
		uint256 numBids_ = bidderAddressesReference_.numItems;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000d9,numBids_)}
		bidderAddressesReference_.items[numBids_] = _msgSender();address certora_local218 = bidderAddressesReference_.items[numBids_];assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000da,certora_local218)}
		++ numBids_;
		bidderAddressesReference_.numItems = numBids_;uint256 certora_local219 = bidderAddressesReference_.numItems;assembly ("memory-safe"){mstore(0xffffff6e4604afefe123321beef1b02fffffffffffffffffffffffff000000db,certora_local219)}
		biddersInfo[roundNum][_msgSender()].lastBidTimeStamp = block.timestamp;
	}

	// #endregion
}

// #endregion
