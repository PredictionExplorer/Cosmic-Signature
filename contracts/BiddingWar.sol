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

    // how much is the secondsExtra increased by after every bid
    // 1.0001
    uint256 public timeIncrease = 1000100;

    // we need to set the bidPrice to anything higher than 0 because the
    // contract would break if it's zero and someone bids before a donation is made
    uint256 public bidPrice = 10**15;

    address public lastBidder = address(0);

    // After a withdrawal, start off the clock with this much time.
    uint256 public initialSecondsUntilWithdrawal = 24 * 3600;

    // The bid size will be 1000 times smaller than the withdrawal amount initially
    uint256 public initalBidAmountFraction = 1000;

    uint256 public withdrawalFraction = 2;

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

    function bidWithRWLK(uint256 randomWalkNFTID) public {
        // if you own a RandomWalkNFT, you can bid for free 1 time.
        // Each NFT can be used only once.
        if (lastBidder == address(0)) {
            // someone just withdrew and we are starting from scratch
            withdrawalTime = block.timestamp + initialSecondsUntilWithdrawal;
        }

        require(!usedRandomWalkNFTs[randomWalkNFTID]);
        require(randomWalk.ownerOf(randomWalkNFTID) == _msgSender());

        usedRandomWalkNFTs[randomWalkNFTID] = true;

        lastBidder = _msgSender();

        // we are not going to increase the bid price
        uint256 secondsAdded = nanoSecondsExtra / 1_000_000_000;
        withdrawalTime = max(withdrawalTime, block.timestamp) + secondsAdded;
        nanoSecondsExtra = (nanoSecondsExtra * timeIncrease) / MILLION;

        uint256 minutesRemainingBefore = (withdrawalTime - block.timestamp - secondsAdded) / 60;
        uint256 reward = Math.sqrt(minutesRemainingBefore);

        // mint some tokens
        token.mint(lastBidder, reward);

        emit BidEvent(lastBidder, bidPrice, int256(randomWalkNFTID));

    }

    function bid() public payable {

        if (lastBidder == address(0)) {
            // someone just withdrew and we are starting from scratch
            withdrawalTime = block.timestamp + initialSecondsUntilWithdrawal;
        }

        uint256 newBidPrice = getBidPrice();

        require(
            msg.value >= newBidPrice,
            "The value submitted with this transaction is too low."
        );

        lastBidder = _msgSender();
        bidPrice = newBidPrice;

        // If someone bid after the deadline, make sure that 'secondsExtra' will be until the withdrawal
        uint256 secondsAdded = nanoSecondsExtra / 1_000_000_000;
        withdrawalTime = max(withdrawalTime, block.timestamp) + secondsAdded;
        nanoSecondsExtra = (nanoSecondsExtra * timeIncrease) / MILLION;

        uint256 minutesRemainingBefore = (withdrawalTime - block.timestamp - secondsAdded) / 60;
        uint256 reward = Math.sqrt(minutesRemainingBefore);

        // mint some tokens
        token.mint(lastBidder, reward);

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
        return address(this).balance / withdrawalFraction;
    }

    function withdraw() public {
        require(_msgSender() == lastBidder, "Only last bidder can withdraw.");
        require(timeUntilWithdrawal() == 0, "Not enough time has elapsed.");

        address winner = lastBidder;
        lastBidder = address(0);

        uint256 amount = withdrawalAmount();

        numWithdrawals += 1;

        (bool success, ) = winner.call{value: amount}("");
        require(success, "Transfer failed.");

        nft.mint(winner);
        
        initializeBidPrice();

        emit WithdrawalEvent(numWithdrawals - 1, winner, amount);
    }

    constructor() {}

    function setRandomWalk(address addr) public onlyOwner {
        randomWalk = RandomWalkNFT(addr);
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

    function updateWithdrawalFraction(uint256 newWithdrawalFraction) public onlyOwner {
        withdrawalFraction = newWithdrawalFraction;
    }

    function updateInitalBidAmountFraction(uint256 newInitalBidAmountFraction) public onlyOwner {
        initalBidAmountFraction = newInitalBidAmountFraction;
    }

}
