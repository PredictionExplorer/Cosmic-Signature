// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./CosmicGameConstants.sol";

contract CosmicGameStorage is OwnableUpgradeable {
    // External contracts
    address public randomWalk;
    address public nft;
    address public token;
    address public raffleWallet;
    address public stakingWalletCST;
    address public stakingWalletRWalk;
    address public marketingWallet;
    address public charity;

    // Game state
    uint256 public roundNum;
    uint256 public bidPrice;
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

    // Percentages
    uint256 public prizePercentage;
    uint256 public charityPercentage;
    uint256 public rafflePercentage;
    uint256 public stakingPercentage;

    // Prize claim variables
    mapping(uint256 => address) public winners;
    uint256 public numRaffleETHWinnersBidding;
    uint256 public numRaffleNFTWinnersBidding;
    uint256 public numRaffleNFTWinnersStakingRWalk;
    bytes32 public raffleEntropy;
    mapping(uint256 => CosmicGameConstants.DonatedNFT) public donatedNFTs;
    uint256 public numDonatedNFTs;

    // System variables
    uint256 public donateWithInfoNumRecords;
    mapping(uint256 => CosmicGameConstants.DonationInfoRecord) public donationInfoRecords;
    uint256 public activationTime;
    uint256 public tokenReward;
    uint256 public erc20RewardMultiplier;
    uint256 public marketingReward;
    uint256 public maxMessageLength;
    uint256 public systemMode;

    // Additional storage
    mapping(uint256 => uint256) public extraStorage;

    function initialize() public initializer {
        __Ownable_init();
    }
}
