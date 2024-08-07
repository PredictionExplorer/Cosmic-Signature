// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "./CosmicGameStorage.sol";
import "./CosmicGameConstants.sol";
import "./CosmicGameErrors.sol";

contract CosmicGameImplementation is
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    CosmicGameStorage
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint256;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __Ownable_init();

        // Initialize state variables
        roundNum = 0;
        bidPrice = CosmicGameConstants.FIRST_ROUND_BID_PRICE;
        startingBidPriceCST = 100e18;
        nanoSecondsExtra = 3600 * 10 ** 9;
        timeIncrease = 1000030;
        priceIncrease = 1010000;
        initialBidAmountFraction = 4000;
        lastBidder = address(0);
        initialSecondsUntilPrize = 24 * 3600;
        timeoutClaimPrize = 24 * 3600;
        activationTime = 1702512000; // December 13 2023 19:00 New York Time
        lastCSTBidTime = activationTime;
        CSTAuctionLength = CosmicGameConstants.DEFAULT_AUCTION_LENGTH;
        RoundStartCSTAuctionLength = CosmicGameConstants.DEFAULT_AUCTION_LENGTH;
        tokenReward = CosmicGameConstants.TOKEN_REWARD;
        erc20RewardMultiplier = CosmicGameConstants.ERC20_REWARD_MULTIPLIER;
        marketingReward = CosmicGameConstants.MARKETING_REWARD;
        maxMessageLength = CosmicGameConstants.MAX_MESSAGE_LENGTH;
        systemMode = CosmicGameConstants.MODE_MAINTENANCE;

        // Initialize percentages
        prizePercentage = 25;
        charityPercentage = 10;
        rafflePercentage = 5;
        stakingPercentage = 10;

        // Initialize raffle winners
        numRaffleETHWinnersBidding = 3;
        numRaffleNFTWinnersBidding = 5;
        numRaffleNFTWinnersStakingRWalk = 4;

        raffleEntropy = keccak256(abi.encode("Cosmic Signature 2023", block.timestamp, blockhash(block.number - 1)));
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // Implement core game logic functions here

    function bid(bytes calldata _data) external payable nonReentrant whenNotPaused {
        require(
            systemMode < CosmicGameConstants.MODE_MAINTENANCE,
            CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
        );

        BusinessLogic.BidParams memory params = abi.decode(_data, (BusinessLogic.BidParams));

        if (params.randomWalkNFTId != -1) {
            require(
                !usedRandomWalkNFTs[uint256(params.randomWalkNFTId)],
                CosmicGameErrors.UsedRandomWalkNFT(
                    "This RandomWalkNFT has already been used for bidding.",
                    uint256(params.randomWalkNFTId)
                )
            );
            require(
                IRandomWalkNFT(randomWalk).ownerOf(uint256(params.randomWalkNFTId)) == _msgSender(),
                CosmicGameErrors.IncorrectERC721TokenOwner(
                    "You must be the owner of the RandomWalkNFT.",
                    randomWalk,
                    uint256(params.randomWalkNFTId),
                    _msgSender()
                )
            );
            usedRandomWalkNFTs[uint256(params.randomWalkNFTId)] = true;
        }

        CosmicGameConstants.BidType bidType = params.randomWalkNFTId == -1
            ? CosmicGameConstants.BidType.ETH
            : CosmicGameConstants.BidType.RandomWalk;

        uint256 newBidPrice = getBidPrice();
        uint256 rwalkBidPrice = newBidPrice / 2;
        uint256 paidBidPrice;

        if (bidType == CosmicGameConstants.BidType.RandomWalk) {
            require(
                msg.value >= rwalkBidPrice,
                CosmicGameErrors.BidPrice(
                    "The value submitted for this transaction with RandomWalk is too low.",
                    rwalkBidPrice,
                    msg.value
                )
            );
            paidBidPrice = rwalkBidPrice;
        } else {
            require(
                msg.value >= newBidPrice,
                CosmicGameErrors.BidPrice(
                    "The value submitted for this transaction is too low.",
                    newBidPrice,
                    msg.value
                )
            );
            paidBidPrice = newBidPrice;
        }

        // Update Stellar Spender
        bidderInfo[roundNum][_msgSender()].totalSpent = bidderInfo[roundNum][_msgSender()].totalSpent.add(paidBidPrice);
        if (bidderInfo[roundNum][_msgSender()].totalSpent > stellarSpenderAmount) {
            stellarSpenderAmount = bidderInfo[roundNum][_msgSender()].totalSpent;
            stellarSpender = _msgSender();
        }

        bidPrice = newBidPrice;

        _bidCommon(params.message, bidType);

        if (msg.value > paidBidPrice) {
            // Return the extra money to the bidder.
            uint256 amountToSend = msg.value.sub(paidBidPrice);
            (bool success, ) = _msgSender().call{ value: amountToSend }("");
            require(success, CosmicGameErrors.FundTransferFailed("Refund transfer failed.", amountToSend, _msgSender()));
        }

        emit BidEvent(
            lastBidder,
            roundNum,
            int256(paidBidPrice),
            params.randomWalkNFTId,
            -1,
            prizeTime,
            params.message
        );
    }

    // Implement other functions (bidWithCST, claimPrize, etc.) here...

    function bidWithCST(string memory message) external nonReentrant whenNotPaused {
        require(
            systemMode < CosmicGameConstants.MODE_MAINTENANCE,
            CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
        );
        uint256 userBalance = IERC20Upgradeable(token).balanceOf(_msgSender());
        uint256 price = currentCSTPrice();
        require(
            userBalance >= price,
            CosmicGameErrors.InsufficientCSTBalance(
                "Insufficient CST token balance to make a bid with CST",
                price,
                userBalance
            )
        );
        startingBidPriceCST = Math.max(100e18, price).mul(2);
        lastCSTBidTime = block.timestamp;

        IERC20Upgradeable(token).safeTransferFrom(_msgSender(), address(this), price);

        _bidCommon(message, CosmicGameConstants.BidType.CST);
        emit BidEvent(lastBidder, roundNum, -1, -1, int256(price), prizeTime, message);
    }


    function claimPrize() external nonReentrant whenNotPaused {
        require(
            systemMode < CosmicGameConstants.MODE_MAINTENANCE,
            CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
        );
        require(
            prizeTime <= block.timestamp,
            CosmicGameErrors.EarlyClaim("Not enough time has elapsed.", prizeTime, block.timestamp)
        );
        require(lastBidder != address(0), CosmicGameErrors.NoLastBidder("There is no last bidder."));

        address winner;
        if (block.timestamp.sub(prizeTime) < timeoutClaimPrize) {
            require(
                _msgSender() == lastBidder,
                CosmicGameErrors.LastBidderOnly(
                    "Only the last bidder can claim the prize during the first 24 hours.",
                    lastBidder,
                    _msgSender(),
                    timeoutClaimPrize.sub(block.timestamp.sub(prizeTime))
                )
            );
            winner = _msgSender();
        } else {
            winner = _msgSender();
        }

        _updateEnduranceChampion();

        lastBidder = address(0);
        winners[roundNum] = winner;

        uint256 prizeAmount_ = prizeAmount();
        uint256 charityAmount_ = charityAmount();
        uint256 raffleAmount_ = raffleAmount();
        uint256 stakingAmount_ = stakingAmount();

        // Distribute prizes
        _distributePrizes(winner, prizeAmount_, charityAmount_, raffleAmount_, stakingAmount_);

        _roundEndResets();
        emit PrizeClaimEvent(roundNum, winner, prizeAmount_);
        roundNum = roundNum.add(1);
    }

    function _distributePrizes(
        address winner,
        uint256 prizeAmount_,
        uint256 charityAmount_,
        uint256 raffleAmount_,
        uint256 stakingAmount_
    ) internal {
        // Main prize
        (bool success, ) = winner.call{value: prizeAmount_}("");
        require(success, CosmicGameErrors.FundTransferFailed("Transfer to the winner failed.", prizeAmount_, winner));

        // Charity
        (success, ) = charity.call{value: charityAmount_}("");
        require(success, CosmicGameErrors.FundTransferFailed("Transfer to charity failed.", charityAmount_, charity));

        // Staking
        if (IERC721Upgradeable(nft).totalSupply() > 0) {
            (success, ) = stakingWalletCST.call{value: stakingAmount_}(
                abi.encodeWithSelector(StakingWalletCST.deposit.selector)
            );
            require(success, CosmicGameErrors.FundTransferFailed("Transfer to staking wallet failed.", stakingAmount_, stakingWalletCST));
        }

        // Raffle
        _distributeRafflePrizes(raffleAmount_);

        // Mint NFT for the winner
        IERC721Upgradeable(nft).safeMint(winner, roundNum);

        // Endurance Champion and Stellar Spender prizes
        _distributeSpecialPrizes();
    }

    function _distributeRafflePrizes(uint256 raffleAmount_) internal {
        uint256 perWinnerAmount = raffleAmount_.div(numRaffleETHWinnersBidding);
        for (uint256 i = 0; i < numRaffleETHWinnersBidding; i++) {
            _updateEntropy();
            address raffleWinner = raffleParticipants[roundNum][uint256(raffleEntropy) % numRaffleParticipants[roundNum]];
            (bool success, ) = raffleWallet.call{value: perWinnerAmount}(
                abi.encodeWithSelector(RaffleWallet.deposit.selector, raffleWinner)
            );
            require(success, CosmicGameErrors.FundTransferFailed("Transfer to raffle winner failed.", perWinnerAmount, raffleWinner));
            emit RaffleETHWinnerEvent(raffleWinner, roundNum, i, perWinnerAmount);
        }
    }

    function _distributeSpecialPrizes() internal {
        // Endurance Champion Prize
        if (enduranceChampion != address(0)) {
            uint256 tokenId = IERC721Upgradeable(nft).safeMint(enduranceChampion, roundNum);
            uint256 erc20TokenReward = erc20RewardMultiplier.mul(numRaffleParticipants[roundNum]);
            IERC20Upgradeable(token).safeTransfer(enduranceChampion, erc20TokenReward);
            emit EnduranceChampionWinnerEvent(enduranceChampion, roundNum, tokenId, erc20TokenReward, 0);
        }

        // Stellar Spender Prize
        if (stellarSpender != address(0)) {
            uint256 tokenId = IERC721Upgradeable(nft).safeMint(stellarSpender, roundNum);
            uint256 erc20TokenReward = erc20RewardMultiplier.mul(numRaffleParticipants[roundNum]);
            IERC20Upgradeable(token).safeTransfer(stellarSpender, erc20TokenReward);
            emit StellarSpenderWinnerEvent(stellarSpender, roundNum, tokenId, erc20TokenReward, stellarSpenderAmount, 1);
        }
    }

    function _roundEndResets() internal {
        lastCSTBidTime = block.timestamp;
        lastBidType = CosmicGameConstants.BidType.ETH;
        CSTAuctionLength = uint256(12).mul(nanoSecondsExtra).div(1_000_000_000);
        bidPrice = address(this).balance.div(initialBidAmountFraction);
        stellarSpender = address(0);
        stellarSpenderAmount = 0;
        enduranceChampion = address(0);
        enduranceChampionDuration = 0;

        if (systemMode == CosmicGameConstants.MODE_PREPARE_MAINTENANCE) {
            systemMode = CosmicGameConstants.MODE_MAINTENANCE;
            emit SystemModeChanged(systemMode);
        }
    }

    function _updateEntropy() internal {
        raffleEntropy = keccak256(abi.encode(raffleEntropy, block.timestamp, blockhash(block.number - 1)));
    }

    function currentCSTPrice() public view returns (uint256) {
        (uint256 secondsElapsed, uint256 duration) = auctionDuration();
        if (secondsElapsed >= duration) {
            return 0;
        }
        uint256 fraction = uint256(1e6).sub((uint256(1e6).mul(secondsElapsed)).div(duration));
        return (fraction.mul(startingBidPriceCST)).div(1e6);
    }

    function auctionDuration() public view returns (uint256, uint256) {
        uint256 secondsElapsed = block.timestamp.sub(lastCSTBidTime);
        return (secondsElapsed, CSTAuctionLength);
    }

    // Internal functions

        // Admin functions

    function setCharity(address _charity) external onlyOwner {
        require(_charity != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
        charity = _charity;
        emit CharityAddressChanged(_charity);
    }

    function setSystemMode(uint256 _systemMode) external onlyOwner {
        require(_systemMode <= CosmicGameConstants.MODE_MAINTENANCE, "Invalid system mode");
        systemMode = _systemMode;
        emit SystemModeChanged(_systemMode);
    }

    function _bidCommon(string memory message, CosmicGameConstants.BidType bidType) internal {
        require(
            block.timestamp >= activationTime,
            CosmicGameErrors.ActivationTime("Not active yet.", activationTime, block.timestamp)
        );
        require(
            bytes(message).length <= maxMessageLength,
            CosmicGameErrors.BidMessageLengthOverflow("Message is too long.", bytes(message).length)
        );

        if (lastBidder == address(0)) {
            prizeTime = block.timestamp.add(initialSecondsUntilPrize);
        }

        _updateEnduranceChampion();
        lastBidder = _msgSender();
        lastBidType = bidType;

        bidderInfo[roundNum][_msgSender()].lastBidTime = block.timestamp;

        uint256 numParticipants = numRaffleParticipants[roundNum];
        raffleParticipants[roundNum][numParticipants] = lastBidder;
        numRaffleParticipants[roundNum] = numParticipants.add(1);

        IERC20Upgradeable(token).safeTransferFrom(address(this), lastBidder, tokenReward);
        IERC20Upgradeable(token).safeTransferFrom(address(this), marketingWallet, marketingReward);

        _pushBackPrizeTime();
    }

    function _updateEnduranceChampion() internal {
        if (lastBidder == address(0)) return;

        uint256 lastBidDuration = block.timestamp.sub(bidderInfo[roundNum][lastBidder].lastBidTime);
        if (lastBidDuration > enduranceChampionDuration) {
            enduranceChampionDuration = lastBidDuration;
            enduranceChampion = lastBidder;
        }
    }

    function _pushBackPrizeTime() internal {
        uint256 secondsAdded = nanoSecondsExtra.div(1_000_000_000);
        prizeTime = Math.max(prizeTime, block.timestamp).add(secondsAdded);
        nanoSecondsExtra = nanoSecondsExtra.mul(timeIncrease).div(CosmicGameConstants.MILLION);
    }

    // Implement other internal functions...

    // View functions

    /**
     * @notice Get the current endurance champion and their duration
     * @return The address of the current endurance champion and their duration
     */
    function currentEnduranceChampion() external view returns (address, uint256) {
        if (lastBidder == address(0)) {
            return (address(0), 0);
        }

        uint256 lastBidTime = block.timestamp.sub(bidderInfo[roundNum][lastBidder].lastBidTime);
        if (lastBidTime > enduranceChampionDuration) {
            return (lastBidder, lastBidTime);
        }
        return (enduranceChampion, enduranceChampionDuration);
    }

    /**
     * @notice Get the time until the game activates
     * @return The number of seconds until activation, or 0 if already activated
     */
    function timeUntilActivation() external view returns (uint256) {
        if (activationTime < block.timestamp) return 0;
        return activationTime.sub(block.timestamp);
    }

    /**
     * @notice Get the time until the next prize can be claimed
     * @return The number of seconds until the prize can be claimed, or 0 if claimable now
     */
    function timeUntilPrize() external view returns (uint256) {
        if (prizeTime < block.timestamp) return 0;
        return prizeTime.sub(block.timestamp);
    }

    /**
     * @notice Get the current bid price
     * @return The current bid price in wei
     */
    function getBidPrice() public view returns (uint256) {
        return bidPrice.mul(priceIncrease).div(CosmicGameConstants.MILLION);
    }

    /**
     * @notice Get the current prize amount
     * @return The current prize amount in wei
     */
    function prizeAmount() public view returns (uint256) {
        return address(this).balance.mul(prizePercentage).div(100);
    }

    /**
     * @notice Get the current charity amount
     * @return The current charity amount in wei
     */
    function charityAmount() public view returns (uint256) {
        return address(this).balance.mul(charityPercentage).div(100);
    }

    /**
     * @notice Get the current raffle amount
     * @return The current raffle amount in wei
     */
    function raffleAmount() public view returns (uint256) {
        return address(this).balance.mul(rafflePercentage).div(100);
    }

    /**
     * @notice Get the current staking amount
     * @return The current staking amount in wei
     */
    function stakingAmount() public view returns (uint256) {
        return address(this).balance.mul(stakingPercentage).div(100);
    }

    /**
     * @notice Get the current CST token price for bidding
     * @return The current CST token price
     */
    function currentCSTPrice() public view returns (uint256) {
        (uint256 secondsElapsed, uint256 duration) = auctionDuration();
        if (secondsElapsed >= duration) {
            return 0;
        }
        uint256 fraction = uint256(1e6).sub((uint256(1e6).mul(secondsElapsed)).div(duration));
        return (fraction.mul(startingBidPriceCST)).div(1e6);
    }

    /**
     * @notice Get the current auction duration and elapsed time
     * @return A tuple containing the seconds elapsed and total duration of the current auction
     */
    function auctionDuration() public view returns (uint256, uint256) {
        uint256 secondsElapsed = block.timestamp.sub(lastCSTBidTime);
        return (secondsElapsed, CSTAuctionLength);
    }

    /**
     * @notice Get the total number of bids in the current round
     * @return The total number of bids in the current round
     */
    function getTotalBids() public view returns (uint256) {
        return numRaffleParticipants[roundNum];
    }

    /**
     * @notice Get the address of a bidder at a specific position in the current round
     * @param position The position of the bidder (0-indexed)
     * @return The address of the bidder at the specified position
     */
    function getBidderAtPosition(uint256 position) public view returns (address) {
        require(position < numRaffleParticipants[roundNum], "Position out of bounds");
        return raffleParticipants[roundNum][position];
    }

    /**
     * @notice Get the total amount spent by a bidder in the current round
     * @param bidder The address of the bidder
     * @return The total amount spent by the bidder in wei
     */
    function getTotalSpentByBidder(address bidder) public view returns (uint256) {
        return bidderInfo[roundNum][bidder].totalSpent;
    }

    /**
     * @notice Check if a RandomWalk NFT has been used for bidding
     * @param tokenId The ID of the RandomWalk NFT
     * @return True if the NFT has been used, false otherwise
     */
    function isRandomWalkNFTUsed(uint256 tokenId) public view returns (bool) {
        return usedRandomWalkNFTs[tokenId];
    }

    /**
     * @notice Get the current system mode
     * @return The current system mode (0: Runtime, 1: Prepare Maintenance, 2: Maintenance)
     */
    function getSystemMode() public view returns (uint256) {
        return systemMode;
    }

    /**
     * @notice Get the details of a donated NFT
     * @param index The index of the donated NFT
     * @return A tuple containing the NFT address, token ID, round number, and claimed status
     */
    function getDonatedNFTDetails(uint256 index) public view returns (address, uint256, uint256, bool) {
        require(index < numDonatedNFTs, "Invalid donated NFT index");
        CosmicGameConstants.DonatedNFT memory nft = donatedNFTs[index];
        return (address(nft.nftAddress), nft.tokenId, nft.round, nft.claimed);
    }

    /**
     * @notice Get the winner of a specific round
     * @param round The round number
     * @return The address of the winner for the specified round
     */
    function getWinnerByRound(uint256 round) public view returns (address) {
        return winners[round];
    }

    // Implement other view functions...

    // Override functions
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
