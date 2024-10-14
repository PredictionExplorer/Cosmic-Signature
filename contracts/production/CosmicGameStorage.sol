// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { CosmicGameConstants } from "./libraries/CosmicGameConstants.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { StakingWalletCosmicSignatureNft } from "./StakingWalletCosmicSignatureNft.sol";
import { ICosmicGameStorage } from "./interfaces/ICosmicGameStorage.sol";

abstract contract CosmicGameStorage is ICosmicGameStorage {
	// #region External Contracts

	// todo-1 Why not name this `randomWalkNFT`?
	address public randomWalk;

	/// @notice Reference to the CosmicSignature NFT contract
	CosmicSignature public nft;
	
	CosmicToken public token;
	address public raffleWallet;
	StakingWalletCosmicSignatureNft public stakingWalletCosmicSignatureNft;
	// todo-0 Make this strongly typed.
	address public stakingWalletRWalk;
	address public marketingWallet;
	address public charity;

	// #endregion
	// #region Game State

	uint256 public roundNum;
	uint256 public bidPrice;
	uint256 public startingBidPriceCSTMinLimit;
	uint256 public startingBidPriceCST;
	uint256 public nanoSecondsExtra;
	uint256 public timeIncrease;
	uint256 public priceIncrease;
	uint256 public initialBidAmountFraction;
	address public lastBidder;
	CosmicGameConstants.BidType public lastBidType;
	mapping(uint256 => bool) public usedRandomWalkNFTs;
	uint256 public initialSecondsUntilPrize;
	uint256 public prizeTime;
	uint256 public timeoutClaimPrize;
	mapping(uint256 => mapping(uint256 => address)) public raffleParticipants;
	mapping(uint256 => uint256) public numRaffleParticipants;
	uint256 public lastCSTBidTime;
	uint256 public CSTAuctionLength;
	uint256 public RoundStartCSTAuctionLength;
	mapping(uint256 => mapping(address => CosmicGameConstants.BidderInfo)) public bidderInfo;
	address public stellarSpender;
	uint256 public stellarSpenderAmount;
	address public enduranceChampion;
	uint256 public enduranceChampionDuration;

	// #endregion
	// #region Percentages

	uint256 public prizePercentage;
	uint256 public charityPercentage;
	uint256 public rafflePercentage;
	uint256 public stakingPercentage;

	// #endregion
	// #region Prize Claim Variables

	mapping(uint256 => address) public winners;
	uint256 public numRaffleETHWinnersBidding;
	uint256 public numRaffleNFTWinnersBidding;
	uint256 public numRaffleNFTWinnersStakingRWalk;
	bytes32 public raffleEntropy;
	mapping(uint256 => CosmicGameConstants.DonatedNFT) public donatedNFTs;
	uint256 public numDonatedNFTs;

	// #endregion
	// #region System Variables

	uint256 public donateWithInfoNumRecords;
	mapping(uint256 => CosmicGameConstants.DonationInfoRecord) public donationInfoRecords;
	uint256 public activationTime;
	uint256 public tokenReward;
	uint256 public erc20RewardMultiplier;
	uint256 public marketingReward;

	/// @notice
	/// [Comment-202409143]
	/// This limits the number of bytes, which can be fewer UTF-8 characters.
	/// [/Comment-202409143]
	uint256 public maxMessageLength;

	uint256 public systemMode;

	// #endregion
}
