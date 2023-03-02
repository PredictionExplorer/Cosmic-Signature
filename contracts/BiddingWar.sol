// SPDX-License-Identifier: CC0-1.0

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Token.sol";
import "./Orbitals.sol";
import "./RandomWalkNFT.sol";

pragma solidity ^0.8.18;

contract BiddingWar is Ownable {

    uint256 constant MILLION = 10**6;

    // how much the currentBid increases after every bid
    // we want 1%?
    uint256 public priceIncrease = 1010000; // we are going to divide this number by a million

    // how much the deadline is pushed after every bid
    uint256 public nanoSecondsExtra = 3600 * 10**9;

    // how much is the secondsExtra increased by after every bid (You can think of it as the second derivative)
    // 1.0001
    uint256 public timeIncrease = 1000100;

    // we need to set the bidPrice to anything higher than 0 because the
    // contract would break if it's zero and someone bids before a donation is made
    uint256 public bidPrice = 10**15;

    address public lastBidder = address(0);

    address public charity;

    // 10% of the prize pool goes to the charity
    uint256 public charityPercentage = 10;

    // After a withdrawal, start off the clock with this much time.
    uint256 public initialSecondsUntilWithdrawal = 24 * 3600;

    // The bid size will be 1000 times smaller than the withdrawal amount initially
    uint256 public initalBidAmountFraction = 1000;

    uint256 public withdrawalPercentage = 50;

    // when the money can be taken out
    uint256 public withdrawalTime;

    uint256 public numWithdrawals = 0;

    mapping(uint256 => bool) public usedRandomWalkNFTs;

    OrbitalToken public token;
    Orbitals public nft;
    RandomWalkNFT public randomWalk;

    event WithdrawalEvent(uint256 indexed withdrawalNum, address indexed destination, uint256 amount);
    event BidEvent(address indexed lastBidder, uint256 bidPrice, int256 randomWalkNFTID);
    event DonationEvent(address indexed donator, uint256 amount);

    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a : b;
    }

    function getBidPrice() public view returns (uint256) {
        return (bidPrice * priceIncrease) / MILLION;
    }

    function initializeBidPrice() internal {
        bidPrice = withdrawalAmount() / initalBidAmountFraction;
    }

    // send some ETH into the contract and affect nothing else.
    function donate() public payable {
        require (msg.value > 0);

        if (lastBidder == address(0)) {
            initializeBidPrice();
        }

        emit DonationEvent(_msgSender(), msg.value);
    }

    function calculateReward() public view returns (uint256) {
        uint256 minutesUntilWithdrawal = (max(withdrawalTime, block.timestamp) - block.timestamp) / 60;
        return Math.sqrt(minutesUntilWithdrawal);
    }

    function pushBackWithdrawDeadline() internal {
        uint256 secondsAdded = nanoSecondsExtra / 1_000_000_000;
        withdrawalTime = max(withdrawalTime, block.timestamp) + secondsAdded;
        nanoSecondsExtra = (nanoSecondsExtra * timeIncrease) / MILLION;
    }

    function bidWithRWLK(uint256 randomWalkNFTID) public {
        // if you own a RandomWalkNFT, you can bid for free 1 time.
        // Each NFT can be used only once.
        if (lastBidder == address(0)) {
            // someone just withdrew and we are starting from scratch
            withdrawalTime = block.timestamp + initialSecondsUntilWithdrawal;
        }

        lastBidder = _msgSender();

        require(!usedRandomWalkNFTs[randomWalkNFTID]);
        require(randomWalk.ownerOf(randomWalkNFTID) == _msgSender());
        usedRandomWalkNFTs[randomWalkNFTID] = true;

        uint256 reward = calculateReward();
        token.mint(lastBidder, reward);

        pushBackWithdrawDeadline();

        emit BidEvent(lastBidder, bidPrice, int256(randomWalkNFTID));

    }

    function bid() public payable {

        if (lastBidder == address(0)) {
            // someone just withdrew and we are starting from scratch
            withdrawalTime = block.timestamp + initialSecondsUntilWithdrawal;
        }

        lastBidder = _msgSender();

        uint256 newBidPrice = getBidPrice();

        require(
            msg.value >= newBidPrice,
            "The value submitted with this transaction is too low."
        );
        bidPrice = newBidPrice;

        uint256 reward = calculateReward();
        token.mint(lastBidder, reward);

        pushBackWithdrawDeadline();

        if (msg.value > bidPrice) {
            // Return the extra money to the bidder.
            (bool success, ) = lastBidder.call{value: msg.value - bidPrice}("");
            require(success, "Transfer failed.");
        }

        emit BidEvent(lastBidder, bidPrice, -1);
    }

    receive() external payable {
        bid();
    }

    function timeUntilWithdrawal() public view returns (uint256) {
        if (withdrawalTime < block.timestamp) return 0;
        return withdrawalTime - block.timestamp;
    }

    function withdrawalAmount() public view returns (uint256) {
        return address(this).balance * withdrawalPercentage / 100;
    }

    function charityAmount() public view returns (uint256) {
        return address(this).balance * charityPercentage / 100;
    }

    function withdraw() public {
        require(_msgSender() == lastBidder, "Only last bidder can withdraw.");
        require(timeUntilWithdrawal() == 0, "Not enough time has elapsed.");

        address winner = lastBidder;
        lastBidder = address(0);

        numWithdrawals += 1;

        nft.mint(winner);
        
        initializeBidPrice();

        uint256 withdrawalAmount_ = withdrawalAmount();
        uint256 charityAmount_ = charityAmount();

        (bool success, ) = winner.call{value: withdrawalAmount_}("");
        require(success, "Transfer failed.");

        (success, ) = charity.call{value: charityAmount_}("");
        require(success, "Transfer failed.");

        emit WithdrawalEvent(numWithdrawals - 1, winner, withdrawalAmount_);
    }

    constructor() {
        charity = _msgSender();
    }

    function setRandomWalk(address addr) public onlyOwner {
        randomWalk = RandomWalkNFT(addr);
    }

    function setCharityPercentage(uint256 newCharityPercentage) public onlyOwner {
        charityPercentage = newCharityPercentage;
    }

    function setTokenContract(address addr) public onlyOwner {
        token = OrbitalToken(addr);
    }

    function setNftContract(address addr) public onlyOwner {
        nft = Orbitals(addr);
    }

    function setTimeIncrease(uint256 newTimeIncrease) public onlyOwner {
        timeIncrease = newTimeIncrease;
    }

    function setPriceIncrease(uint256 newPriceIncrease) public onlyOwner {
        priceIncrease = newPriceIncrease;
    }

    function setNanoSecondsExtra(uint256 newNanoSecondsExtra) public onlyOwner {
        nanoSecondsExtra = newNanoSecondsExtra;
    }

    function setInitialSecondsUntilWithdrawal(uint256 newInitialSecondsUntilWithdrawal) public onlyOwner {
        initialSecondsUntilWithdrawal = newInitialSecondsUntilWithdrawal;
    }

    function updateWithdrawalPercentage(uint256 newWithdrawalPercentage) public onlyOwner {
        withdrawalPercentage = newWithdrawalPercentage;
    }

    function updateInitalBidAmountFraction(uint256 newInitalBidAmountFraction) public onlyOwner {
        initalBidAmountFraction = newInitalBidAmountFraction;
    }

}
