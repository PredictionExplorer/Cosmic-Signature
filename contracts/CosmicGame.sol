// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.21;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { RaffleWallet } from "./RaffleWallet.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";

contract CosmicGame is Ownable, IERC721Receiver {

    struct DonatedNFT {
        IERC721 nftAddress;
        uint256 tokenId;
        uint256 round;
        bool claimed;
    }

    uint256 public constant MILLION = 10**6;
    uint256 public constant MAX_MESSAGE_LENGTH = 280;

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

    // Some money will go to charity
    address public charity;

    // After a prize was claimed, start off the clock with this much time.
    uint256 public initialSecondsUntilPrize = 24 * 3600;

    // The bid size will be 1000 times smaller than the prize amount initially
    uint256 public initialBidAmountFraction = 200;

    // You get 100 tokens when you bid
    uint256 public constant TOKEN_REWARD = 100 * 1e18;

    uint256 public prizePercentage = 25;

    // 10% of the prize pool goes to the charity
    uint256 public charityPercentage = 10;

    uint256 public rafflePercentage = 5;

    uint256 public numRaffleWinnersPerRound = 3;

    uint256 public numRaffleNFTWinnersPerRound = 5;

    uint256 public numHolderNFTWinnersPerRound = 2;

    // when the money can be taken out
    uint256 public prizeTime;

    uint256 public roundNum = 0;

    mapping(uint256 => bool) public usedRandomWalkNFTs;

    mapping(uint256 => address) public winners;

    uint256 public activationTime = 1682377200; // April 24 2023 19:00 New York Time

    // Entropy for the raffle.
    bytes32 public raffleEntropy;

    mapping(uint256 => address) public raffleNFTWinners;

    mapping(uint256 => address) public raffleParticipants;
    uint256 public numRaffleParticipants;
    RaffleWallet public raffleWallet;

    mapping (uint256 => DonatedNFT) public donatedNFTs;
    uint256 public numDonatedNFTs;

    CosmicToken public token;
    CosmicSignature public nft;
    RandomWalkNFT public randomWalk;

    event PrizeClaimEvent(uint256 indexed prizeNum, address indexed destination, uint256 amount);
    // randomWalkNFTId is int256 (not uint256) because we use -1 to indicate that a Random Walk NFT was not used in this bid
    event BidEvent(address indexed lastBidder, uint256 indexed round, uint256 bidPrice, int256 randomWalkNFTId, uint256 prizeTime, string message);
    event DonationEvent(address indexed donor, uint256 amount);
    event NFTDonationEvent(address indexed donor, IERC721 indexed nftAddress, uint256 indexed round, uint256 tokenId, uint256 index);
    event RaffleNFTWinnerEvent(address indexed winner, uint256 indexed round, uint256 winnerIndex);
    event RaffleNFTClaimedEvent(address indexed winner, uint256 indexed tokenId);
    event DonatedNFTClaimedEvent(uint256 indexed round,uint256 index,address winner,address nftAddressdonatedNFTs,uint256 tokenId);

	/// Admin events
	event CharityPercentageChanged(uint256 newCharityPercentage);
	event PrizePercentageChanged(uint256 newPrizePercentage);
	event RafflePercentageChanged(uint256 newRafflePercentage);
	event NumRaffleWinnersPerRoundChanged(uint256 newNumRaffleWinnersPerRound);
	event NumRaffleNFTWinnersPerRoundChanged(uint256 newNumRaffleNFTWinnersPerRound);
	event NumHolderNFTWinnersPerRoundChanged(uint256 newNumHolderNFTWinnersPerRound);
	event CharityAddressChanged(address newCharity);
	event RandomWalkAddressChanged(address newRandomWalk);
	event RaffleWalletAddressChanged(address newRaffleWallet);
	event CosmicTokenAddressChanged(address newCosmicToken);
	event CosmicSignatureAddressChanged(address newCosmicSignature);
	event TimeIncreaseChanged(uint256 newTimeIncrease);
	event PriceIncreaseChanged(uint256 newPriceIncrease);
	event NanoSecondsExtraChanged(uint256 newNanoSecondsExtra);
	event InitialSecondsUntilPrizeChanged(uint256 newInitialSecondsUntilPrize);
	event InitialBidAmountFractionChanged(uint256 newInitialBidAmountFraction);
	event ActivationTimeChanged(uint256 newActivationTime);

    constructor() {
        raffleEntropy = keccak256(abi.encode(
             "Cosmic Signature 2023",
             block.timestamp, blockhash(block.number)));
        charity = _msgSender();
    }

    receive() external payable {
        bid("");
    }

    // send some ETH into the contract and affect nothing else.
    function donate() external payable {
        require (msg.value > 0, "Donation amount must be greater than 0.");

        if (lastBidder == address(0)) {
            _initializeBidPrice();
        }

        emit DonationEvent(_msgSender(), msg.value);
    }

    function bidAndDonateNFT(string memory message, IERC721 nftAddress, uint256 tokenId) external payable {
        bid(message);
        _donateNFT(nftAddress, tokenId);
    }

    function claimDonatedNFT(uint256 num) external {
       require(num < numDonatedNFTs, "The donated NFT does not exist.");
       address winner = winners[donatedNFTs[num].round];
       require(_msgSender() == winner, "You are not the winner of the round.");
       require(!donatedNFTs[num].claimed, "The NFT has already been claimed.");
       donatedNFTs[num].claimed = true;
       donatedNFTs[num].nftAddress.safeTransferFrom(address(this), winner, donatedNFTs[num].tokenId);
       emit DonatedNFTClaimedEvent(donatedNFTs[num].round,num,winner,address(donatedNFTs[num].nftAddress),donatedNFTs[num].tokenId);
    }

    function bidWithRWLKAndDonateNFT(uint256 randomWalkNFTId, string memory message, IERC721 nftAddress, uint256 tokenId) external payable {
        bidWithRWLK(randomWalkNFTId, message);
        _donateNFT(nftAddress, tokenId);
    }

    function claimPrize() external {
        // In this function we give:
        // - 10 Cosmic NFTs:
        //     - 1 to the game winner
        //     - 5 to raffle winners
        //     - 2 to RandomWalkNFT holders
        //     - 2 to Cosmic NFT holders
        // - 55% of the ETH in the contract
        //     - 25% to the game winner
        //     - 10% to the charity
        //     - 15% to the raffle winner

        require(prizeTime <= block.timestamp, "Not enough time has elapsed.");
        require(lastBidder != address(0), "There is no last bidder.");
        if (block.timestamp - prizeTime < 3600 * 24) {
            // The winner has 24 hours to claim the prize.
            // After the 24 hours have elapsed, then *anyone* is able to claim the prize!
            // This prevents a DOS attack, where somebody keeps bidding, but never claims the prize
            // which would stop the creation of new Cosmic Signature NFTs.
            require(_msgSender() == lastBidder,
                    "Only the last bidder can claim the prize during the first 24 hours.");
        }

        lastBidder = address(0);
        address winner = _msgSender();
        winners[roundNum] = winner;

        roundNum += 1;

        // Give the NFT to the winner.
        (bool mintSuccess, ) =
            address(nft).call(abi.encodeWithSelector(CosmicSignature.mint.selector, winner));
		require(mintSuccess, "CosmicSignature mint() failed to mint NFT.");

        // Give NFTs to the NFT raffle winners.
        for (uint256 i = 0; i < numRaffleNFTWinnersPerRound; i++) {
            _updateEntropy();
            address raffleWinner_ = raffleParticipants[uint256(raffleEntropy) % numRaffleParticipants];
            (, bytes memory data) =
                address(nft).call(abi.encodeWithSelector(CosmicSignature.mint.selector, address(this)));
            uint256 tokenId = abi.decode(data, (uint256));
            raffleNFTWinners[tokenId] = raffleWinner_;
            emit RaffleNFTWinnerEvent(raffleWinner_, roundNum - 1, i);
        }

        uint256 rwalkSupply = randomWalk.totalSupply();
        uint256 cosmicSupply = nft.totalSupply();

        // Give some Cosmic NFTs to random RandomWalkNFT and Cosmic NFT holders.
        // The winnerIndex variable is just here in order to emit a correct event.
        uint256 winnerIndex = numRaffleNFTWinnersPerRound;
        for (uint256 i = 0; i < numHolderNFTWinnersPerRound; i++) {
            // Give some Cosmic NFTs to some random RandomWalkNFT holders.
            if (rwalkSupply > 0) {
                _updateEntropy();
                uint256 rwalkWinnerNFTnum = uint256(raffleEntropy) % rwalkSupply;
                address rwalkWinner = randomWalk.ownerOf(rwalkWinnerNFTnum);

                (, bytes memory data) =
                    address(nft).call(abi.encodeWithSelector(CosmicSignature.mint.selector, address(this)));
                uint256 tokenId = abi.decode(data, (uint256));
                raffleNFTWinners[tokenId] = rwalkWinner;
                emit RaffleNFTWinnerEvent(rwalkWinner, roundNum - 1, winnerIndex);
                winnerIndex += 1;
            }

            // Give some Cosmic NFTs to random Cosmic NFT holders.
            if (cosmicSupply > 0) {
                _updateEntropy();
                uint256 cosmicNFTnum = uint256(raffleEntropy) % cosmicSupply;
                address cosmicWinner = nft.ownerOf(cosmicNFTnum);
                (, bytes memory data) =
                    address(nft).call(abi.encodeWithSelector(CosmicSignature.mint.selector, address(this)));
                uint256 tokenId = abi.decode(data, (uint256));
                raffleNFTWinners[tokenId] = cosmicWinner;
                emit RaffleNFTWinnerEvent(cosmicWinner, roundNum - 1, winnerIndex);
                winnerIndex += 1;
            }
        }

        // Give ETH to the right parties in this section
        uint256 prizeAmount_ = prizeAmount();
        uint256 charityAmount_ = charityAmount();
        uint256 raffleAmount_ = raffleAmount();

        // Give ETH to the winner.
        (bool success, ) = winner.call{value: prizeAmount_}("");
        require(success, "Transfer to the winner failed.");

        // Give ETH to the charity.
        (success, ) = charity.call{value: charityAmount_}("");
        require(success, "Transfer to charity contract failed.");

        // Give ETH to the ETH raffle winners.
        for (uint256 i = 0; i < numRaffleWinnersPerRound; i++) {
            _updateEntropy();
            address raffleWinner_ = raffleParticipants[uint256(raffleEntropy) % numRaffleParticipants];
            (success, ) =
                address(raffleWallet).call{value: raffleAmount_}(abi.encodeWithSelector(RaffleWallet.deposit.selector, raffleWinner_, roundNum - 1));
            require(success, "Raffle deposit failed.");
        }
        
        // Initialize the next round
        numRaffleParticipants = 0;
        _initializeBidPrice();

        emit PrizeClaimEvent(roundNum - 1, winner, prizeAmount_);
    }

	function claimManyRaffleNFTs(uint256[] memory tokens) external {
		for (uint256 i = 0; i < tokens.length; i++) {
			claimRaffleNFT(tokens[i]);
		}
	}

    function setCharity(address addr) external onlyOwner {
        require(addr != address(0), "Zero-address was given.");
        charity = addr;
        emit CharityAddressChanged(charity);
    }

    function setRandomWalk(address addr) external onlyOwner {
        require(addr != address(0), "Zero-address was given.");
        randomWalk = RandomWalkNFT(addr);
		emit RandomWalkAddressChanged(addr);
    }

    function setRaffleWallet(address addr) external onlyOwner {
        require(addr != address(0), "Zero-address was given.");
        raffleWallet = RaffleWallet(addr);
		emit RaffleWalletAddressChanged(addr);
    }

    function setNumRaffleWinnersPerRound(uint256 newNumRaffleWinnersPerRound) external onlyOwner {
        numRaffleWinnersPerRound = newNumRaffleWinnersPerRound;
		emit NumRaffleWinnersPerRoundChanged(numRaffleWinnersPerRound);
    }

    function setNumRaffleNFTWinnersPerRound(uint256 newNumRaffleNFTWinnersPerRound) external onlyOwner {
        numRaffleNFTWinnersPerRound = newNumRaffleNFTWinnersPerRound;
		emit NumRaffleNFTWinnersPerRoundChanged(numRaffleNFTWinnersPerRound);
    }

    function setNumHolderNFTWinnersPerRound(uint256 newNumHolderNFTWinnersPerRound) external onlyOwner {
        numHolderNFTWinnersPerRound = newNumHolderNFTWinnersPerRound;
		emit NumHolderNFTWinnersPerRoundChanged(numHolderNFTWinnersPerRound);
    }

    function updatePrizePercentage(uint256 newPrizePercentage) external onlyOwner {
        prizePercentage = newPrizePercentage;
		require(prizePercentage + charityPercentage + rafflePercentage < 100, "Percentage value overflow, must be lower than 100.");
		emit PrizePercentageChanged(prizePercentage);
    }

    function setCharityPercentage(uint256 newCharityPercentage) external onlyOwner {
        charityPercentage = newCharityPercentage;
		require(prizePercentage + charityPercentage + rafflePercentage < 100, "Percentage value overflow, must be lower than 100.");
	    emit CharityPercentageChanged(charityPercentage);
    }

    function setRafflePercentage(uint256 newRafflePercentage) external onlyOwner {
        rafflePercentage = newRafflePercentage;
		require(prizePercentage + charityPercentage + rafflePercentage < 100, "Percentage value overflow, must be lower than 100.");
		emit RafflePercentageChanged(rafflePercentage);
    }

    function setTokenContract(address addr) external onlyOwner {
        require(addr != address(0), "Zero-address was given.");
        token = CosmicToken(addr);
		emit CosmicTokenAddressChanged(addr);
    }

    function setNftContract(address addr) external onlyOwner {
        require(addr != address(0), "Zero-address was given.");
        nft = CosmicSignature(addr);
		emit CosmicSignatureAddressChanged(addr);
    }

    function setTimeIncrease(uint256 newTimeIncrease) external onlyOwner {
        timeIncrease = newTimeIncrease;
		emit TimeIncreaseChanged(timeIncrease);
    }

    function setPriceIncrease(uint256 newPriceIncrease) external onlyOwner {
        priceIncrease = newPriceIncrease;
		emit PriceIncreaseChanged(priceIncrease);
    }

    function setNanoSecondsExtra(uint256 newNanoSecondsExtra) external onlyOwner {
        nanoSecondsExtra = newNanoSecondsExtra;
		emit NanoSecondsExtraChanged(nanoSecondsExtra);
    }

    function setInitialSecondsUntilPrize(uint256 newInitialSecondsUntilPrize) external onlyOwner {
        initialSecondsUntilPrize = newInitialSecondsUntilPrize;
		emit InitialSecondsUntilPrizeChanged(initialSecondsUntilPrize);
    }

    function updateInitialBidAmountFraction(uint256 newInitialBidAmountFraction) external onlyOwner {
        initialBidAmountFraction = newInitialBidAmountFraction;
		emit InitialBidAmountFractionChanged(initialBidAmountFraction);
    }

    function setActivationTime(uint256 newActivationTime) external onlyOwner {
        activationTime = newActivationTime;
		emit ActivationTimeChanged(activationTime);
    }

    function timeUntilActivation() external view returns (uint256) {
        if (activationTime < block.timestamp) return 0;
        return activationTime - block.timestamp;
    }

    function timeUntilPrize() external view returns (uint256) {
        if (prizeTime < block.timestamp) return 0;
        return prizeTime - block.timestamp;
    }

    // Make it possible for the contract to receive NFTs by implementing the IERC721Receiver interface
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns(bytes4) {
        return this.onERC721Received.selector;
    }

    function bidWithRWLK(uint256 randomWalkNFTId, string memory message) public {

        require(!usedRandomWalkNFTs[randomWalkNFTId], "This RandomWalkNFT has already been used for bidding.");
        require(randomWalk.ownerOf(randomWalkNFTId) == _msgSender(),"You must be the owner of the RandomWalkNFT.");

        usedRandomWalkNFTs[randomWalkNFTId] = true;

        _bidCommon(message);

        emit BidEvent(lastBidder, roundNum, 0, int256(randomWalkNFTId), prizeTime, message);
    }

    function claimRaffleNFT(uint256 tokenId) public {
        require (raffleNFTWinners[tokenId] == _msgSender(), "Not your NFT.");
        nft.safeTransferFrom(address(this), _msgSender(), tokenId);
        emit RaffleNFTClaimedEvent(_msgSender(), tokenId);
    }

    function bid(string memory message) public payable {

        uint256 newBidPrice = getBidPrice();

        require(
            msg.value >= newBidPrice,
            "The value submitted with this transaction is too low."
        );
        bidPrice = newBidPrice;

        _bidCommon(message);

        if (msg.value > bidPrice) {
            // Return the extra money to the bidder.
            (bool success, ) = lastBidder.call{value: msg.value - bidPrice}("");
            require(success, "Refund transfer failed.");
        }
        emit BidEvent(lastBidder, roundNum, bidPrice, -1, prizeTime, message);
    }

    function getBidPrice() public view returns (uint256) {
        return (bidPrice * priceIncrease) / MILLION;
    }

    function prizeAmount() public view returns (uint256) {
        return address(this).balance * prizePercentage / 100;
    }

    function charityAmount() public view returns (uint256) {
        return address(this).balance * charityPercentage / 100;
    }

    function raffleAmount() public view returns (uint256) {
        return address(this).balance * rafflePercentage / 100;
    }

    function _initializeBidPrice() internal {
        bidPrice = address(this).balance / initialBidAmountFraction;
    }

    function _pushBackPrizeTime() internal {
        uint256 secondsAdded = nanoSecondsExtra / 1_000_000_000;
        prizeTime = _max(prizeTime, block.timestamp) + secondsAdded;
        nanoSecondsExtra = (nanoSecondsExtra * timeIncrease) / MILLION;
    }

    function _donateNFT(IERC721 _nftAddress, uint256 _tokenId) internal {
        // If you are a creator you can donate some NFT to the winner of the
        // current round (which might get you featured on the front page of the website).
        _nftAddress.safeTransferFrom(_msgSender(), address(this), _tokenId);
        donatedNFTs[numDonatedNFTs] = DonatedNFT({
            nftAddress: _nftAddress,
            tokenId: _tokenId,
            round: roundNum,
            claimed: false
        });
        numDonatedNFTs += 1;
        emit NFTDonationEvent(_msgSender(), _nftAddress, roundNum, _tokenId, numDonatedNFTs-1);
    }

    function _bidCommon(string memory message) internal {
        require(
            block.timestamp >= activationTime,
            "Not active yet."
        );
        require(bytes(message).length <= MAX_MESSAGE_LENGTH, "Message is too long.");

        if (lastBidder == address(0)) {
            // someone just claimed a prize and we are starting from scratch
            prizeTime = block.timestamp + initialSecondsUntilPrize;
        }

        lastBidder = _msgSender();

        raffleParticipants[numRaffleParticipants] = lastBidder;
        numRaffleParticipants += 1;

        (bool mintSuccess, ) =
            address(token).call(abi.encodeWithSelector(CosmicToken.mint.selector, lastBidder,TOKEN_REWARD));
		require(mintSuccess, "CosmicToken mint() failed to mint reward tokens.");

        _pushBackPrizeTime();
    }

    function _updateEntropy() internal {
        raffleEntropy = keccak256(abi.encode(
            raffleEntropy,
            block.timestamp,
            blockhash(block.number)));
    }

    function _max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a : b;
    }
}
