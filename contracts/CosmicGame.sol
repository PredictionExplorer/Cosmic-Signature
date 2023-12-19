// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicGameConstants } from "./Constants.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { RaffleWallet } from "./RaffleWallet.sol";
import { StakingWallet } from "./StakingWallet.sol";
import { MarketingWallet } from "./MarketingWallet.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { BidBusinessLogic } from "./BidBusinessLogic.sol";

contract CosmicGame is Ownable, IERC721Receiver {

    struct DonatedNFT {
        IERC721 nftAddress;
        uint256 tokenId;
        uint256 round;
        bool claimed;
    }
	// BEGINNING OF		shared variables between business logic contracts and main contract
    BidBusinessLogic.BidType public lastBidType;
    mapping(uint256 => bool) public usedRandomWalkNFTs;
    RandomWalkNFT public randomWalk;
    // we need to set the bidPrice to anything higher than 0 because the
    // contract would break if it's zero and someone bids before a donation is made
    uint256 public bidPrice = 10**15;
    uint256 public numETHBids = 0;
    address public lastBidder = address(0);
    uint256 public roundNum = 0;
    // when the money can be taken out
    uint256 public prizeTime;
    uint256 public activationTime = 1702512000; // December 13 2023 19:00 New York Time
    // After a prize was claimed, start off the clock with this much time.
    uint256 public initialSecondsUntilPrize = 24 * 3600;
    mapping(uint256 => address) public raffleParticipants;
    uint256 public numRaffleParticipants;
    CosmicToken public token;
    MarketingWallet public marketingWallet;
    uint256 public startingBidPriceCST = 100e18;
    uint256 public lastCSTBidTime = activationTime;
    uint256 public numCSTBids = 0;
    uint256 public ETHToCSTBidRatio = 10;
    uint256 public CSTAuctionLength = 10 * 3600;
    // how much the deadline is pushed after every bid
    uint256 public nanoSecondsExtra = 3600 * 10**9;
    // how much is the secondsExtra increased by after every bid (You can think of it as the second derivative)
    // 1.0001
    uint256 public timeIncrease = 1000100;
	// END OF		shared variables between business logic contracts and main contract

    // how much the currentBid increases after every bid
    // we want 1%?
    uint256 public priceIncrease = 1010000; // we are going to divide this number by a million

	// timeout for the winner to claim prize (seconds)
	uint256 public timeoutClaimPrize = 24 * 3600;	

    // Some money will go to charity
    address public charity;

    // The bid size will be 1000 times smaller than the prize amount initially
    uint256 public initialBidAmountFraction = 200;

    uint256 public prizePercentage = 25;

    uint256 public rwalkPrizePercentage = 30;

    // 10% of the prize pool goes to the charity
    uint256 public charityPercentage = 10;

    uint256 public rafflePercentage = 5;

    uint256 public stakingPercentage = 10;

    uint256 public numRaffleWinnersPerRound = 3;

    uint256 public numRaffleNFTWinnersPerRound = 5;

    uint256 public numHolderNFTWinnersPerRound = 2;





    mapping(uint256 => address) public winners;



    // Entropy for the raffle.
    bytes32 public raffleEntropy;

    RaffleWallet public raffleWallet;

    StakingWallet public stakingWallet;

    mapping (uint256 => DonatedNFT) public donatedNFTs;
    uint256 public numDonatedNFTs;

    CosmicSignature public nft;
	BidBusinessLogic public bidLogic;

    event PrizeClaimEvent(uint256 indexed prizeNum, address indexed destination, uint256 amount);
    // randomWalkNFTId is int256 (not uint256) because we use -1 to indicate that a Random Walk NFT was not used in this bid
 //   event BidEvent(address indexed lastBidder, uint256 indexed round, int256 bidPrice, int256 randomWalkNFTId, int256 numCSTTokens, uint256 prizeTime, string message);
    event DonationEvent(address indexed donor, uint256 amount);
    event NFTDonationEvent(address indexed donor, IERC721 indexed nftAddress, uint256 indexed round, uint256 tokenId, uint256 index);
    event RaffleNFTWinnerEvent(address indexed winner, uint256 indexed round, uint256 indexed tokenId, uint256 winnerIndex);
    event DonatedNFTClaimedEvent(uint256 indexed round,uint256 index,address winner,address nftAddressdonatedNFTs,uint256 tokenId);

	/// Admin events
	event CharityPercentageChanged(uint256 newCharityPercentage);
	event PrizePercentageChanged(uint256 newPrizePercentage);
	event RwalkPrizePercentageChanged(uint256 newRwalkPrizePercentage);
	event RafflePercentageChanged(uint256 newRafflePercentage);
	event StakingPercentageChanged(uint256 newStakingPercentage);
	event NumRaffleWinnersPerRoundChanged(uint256 newNumRaffleWinnersPerRound);
	event NumRaffleNFTWinnersPerRoundChanged(uint256 newNumRaffleNFTWinnersPerRound);
	event NumHolderNFTWinnersPerRoundChanged(uint256 newNumHolderNFTWinnersPerRound);
	event CharityAddressChanged(address newCharity);
	event RandomWalkAddressChanged(address newRandomWalk);
	event RaffleWalletAddressChanged(address newRaffleWallet);
    event StakingWalletAddressChanged(address newStakingWallet);
    event MarketingWalletAddressChanged(address newMarketingWallet);
	event CosmicTokenAddressChanged(address newCosmicToken);
	event CosmicSignatureAddressChanged(address newCosmicSignature);
	event TimeIncreaseChanged(uint256 newTimeIncrease);
	event TimeoutClaimPrizeChanged(uint256 newTimeout);
	event PriceIncreaseChanged(uint256 newPriceIncrease);
	event NanoSecondsExtraChanged(uint256 newNanoSecondsExtra);
	event InitialSecondsUntilPrizeChanged(uint256 newInitialSecondsUntilPrize);
	event InitialBidAmountFractionChanged(uint256 newInitialBidAmountFraction);
	event ActivationTimeChanged(uint256 newActivationTime);
    event ETHToCSTBidRatioChanged(uint newETHToCSTBidRatio);

    constructor() {
        raffleEntropy = keccak256(abi.encode(
             "Cosmic Signature 2023",
             block.timestamp, blockhash(block.number - 1)));
        charity = _msgSender();
    }

    receive() external payable {
		BidBusinessLogic.BidParams memory defaultParams;
		defaultParams.message = "";
		defaultParams.randomWalkNFTId = -1;
        bidLogic.bid(defaultParams);
    }

    // Bidding

    function bidAndDonateNFT(BidBusinessLogic.BidParams memory params, IERC721 nftAddress, uint256 tokenId) external payable {
        (bool success, ) = address(bidLogic).delegatecall(abi.encodeWithSelector(BidBusinessLogic.bid.selector,params));
         require(success, "Call to bid logic failed.");
        _donateNFT(nftAddress, tokenId);
    }

    function bid(BidBusinessLogic.BidParams calldata _data) public payable {
        (bool success, ) = address(bidLogic).delegatecall(abi.encodeWithSelector(BidBusinessLogic.bid.selector,_data));
         require(success, "Call to bid logic failed.");
    }
    function bidWithCST(string memory message) external {
        bidLogic.bidWithCST(message);
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
        if (block.timestamp - prizeTime < timeoutClaimPrize) {
            // The winner has [timeoutClaimPrize] to claim the prize.
            // After the this interval have elapsed, then *anyone* is able to claim the prize!
            // This prevents a DOS attack, where somebody keeps bidding, but never claims the prize
            // which would stop the creation of new Cosmic Signature NFTs.
            require(_msgSender() == lastBidder,
                    "Only the last bidder can claim the prize during the first 24 hours.");
        }

        lastBidder = address(0);
        address winner = _msgSender();
        winners[roundNum] = winner;

        uint256 rwalkSupply = randomWalk.totalSupply();
        uint256 cosmicSupply = nft.totalSupply();

        uint256 prizeAmount_ = prizeAmount();
		if (lastBidType == BidBusinessLogic.BidType.RandomWalk) {
			prizeAmount_ = rwalkAmount();
		}
        uint256 charityAmount_ = charityAmount();
        uint256 raffleAmount_ = raffleAmount();
        uint256 stakingAmount_ = stakingAmount();

        bool success;
        if (cosmicSupply > 0) {
            (success, ) =
                address(stakingWallet).call{value: stakingAmount_}(abi.encodeWithSelector(StakingWallet.deposit.selector, block.timestamp));
            require(success, "Staking deposit failed.");
        }

        // Give the NFT to the winner.
        (bool mintSuccess, ) =
            address(nft).call(abi.encodeWithSelector(CosmicSignature.mint.selector, winner, roundNum));
		require(mintSuccess, "CosmicSignature mint() failed to mint NFT.");

        // Winner index is used to emit the correct event.
        uint256 winnerIndex = 0;
        // Give NFTs to the NFT raffle winners.
        for (uint256 i = 0; i < numRaffleNFTWinnersPerRound; i++) {
            _updateEntropy();
            address raffleWinner_ = raffleParticipants[uint256(raffleEntropy) % numRaffleParticipants];
            (, bytes memory data) =
                address(nft).call(abi.encodeWithSelector(CosmicSignature.mint.selector, address(raffleWinner_), roundNum));
            uint256 tokenId = abi.decode(data, (uint256));
            emit RaffleNFTWinnerEvent(raffleWinner_, roundNum, tokenId, winnerIndex);
            winnerIndex += 1;
        }

        // Give some Cosmic NFTs to random RandomWalkNFT and Cosmic NFT holders.
        // The winnerIndex variable is just here in order to emit a correct event.
        for (uint256 i = 0; i < numHolderNFTWinnersPerRound; i++) {
            // Give some Cosmic NFTs to some random RandomWalkNFT holders.
            if (rwalkSupply > 0) {
                _updateEntropy();
                uint256 rwalkWinnerNFTnum = uint256(raffleEntropy) % rwalkSupply;
                address rwalkWinner = randomWalk.ownerOf(rwalkWinnerNFTnum);
                (, bytes memory data) =
                    address(nft).call(abi.encodeWithSelector(CosmicSignature.mint.selector, rwalkWinner, roundNum));
                uint256 tokenId = abi.decode(data, (uint256));
                emit RaffleNFTWinnerEvent(rwalkWinner, roundNum, tokenId, winnerIndex);
                winnerIndex += 1;
            }

            // Give some Cosmic NFTs to random Cosmic NFT holders.
            if (cosmicSupply > 0) {
                _updateEntropy();
                uint256 cosmicNFTnum = uint256(raffleEntropy) % cosmicSupply;
                address cosmicWinner = nft.ownerOf(cosmicNFTnum);
                (, bytes memory data) =
                    address(nft).call(abi.encodeWithSelector(CosmicSignature.mint.selector, address(cosmicWinner), roundNum));
                uint256 tokenId = abi.decode(data, (uint256));
                emit RaffleNFTWinnerEvent(cosmicWinner, roundNum, tokenId, winnerIndex);
                winnerIndex += 1;
            }
        }

        // Give ETH to the winner.
        (success, ) = winner.call{value: prizeAmount_}("");
        require(success, "Transfer to the winner failed.");

        // Give ETH to the charity.
        (success, ) = charity.call{value: charityAmount_}("");
        require(success, "Transfer to charity contract failed.");

        // Give ETH to the ETH raffle winners.
        for (uint256 i = 0; i < numRaffleWinnersPerRound; i++) {
            _updateEntropy();
            address raffleWinner_ = raffleParticipants[uint256(raffleEntropy) % numRaffleParticipants];
            (success, ) =
                address(raffleWallet).call{value: raffleAmount_}(abi.encodeWithSelector(RaffleWallet.deposit.selector, raffleWinner_));
            require(success, "Raffle deposit failed.");
        }
        
        // Initialize the next round
        numRaffleParticipants = 0;
        _initializeBidPrice();

        emit PrizeClaimEvent(roundNum, winner, prizeAmount_);
        roundNum += 1;
    }

    // Donate some ETH to the game.
    function donate() external payable {
        require (msg.value > 0, "Donation amount must be greater than 0.");
        if (block.timestamp < activationTime) {
            // Set the initial bid prize only if the game has not started yet.
            _initializeBidPrice();
        }
        emit DonationEvent(_msgSender(), msg.value);
    }

    // Claiming donated NFTs

    function claimDonatedNFT(uint256 num) public {
       require(num < numDonatedNFTs, "The donated NFT does not exist.");
       address winner = winners[donatedNFTs[num].round];
       require(winner != address(0),"Non-existent winner for the round.");
       require(!donatedNFTs[num].claimed, "The NFT has already been claimed.");
       donatedNFTs[num].claimed = true;
       donatedNFTs[num].nftAddress.safeTransferFrom(address(this), winner, donatedNFTs[num].tokenId);
       emit DonatedNFTClaimedEvent(donatedNFTs[num].round, num, winner, address(donatedNFTs[num].nftAddress), donatedNFTs[num].tokenId);
    }
    
	function claimManyDonatedNFTs(uint256[] memory tokens) external {
		for (uint256 i = 0; i < tokens.length; i++) {
			claimDonatedNFT(tokens[i]);
		}
	}

    // Set different parameters (only owner is allowed). A few weeks after the project launches the owner will be set to address 0 forever. //

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

    function setStakingWallet(address addr) external onlyOwner {
        require(addr != address(0), "Zero-address was given.");
        stakingWallet = StakingWallet(addr);
		emit StakingWalletAddressChanged(addr);
    }

    function setMarketingWallet(address addr) external onlyOwner {
        require(addr != address(0), "Zero-address was given.");
        marketingWallet = MarketingWallet(addr);
		emit MarketingWalletAddressChanged(addr);
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

    function setPrizePercentage(uint256 newPrizePercentage) external onlyOwner {
        prizePercentage = newPrizePercentage;
		require(prizePercentage + charityPercentage + rafflePercentage + stakingPercentage < 100, "Percentage value overflow, must be lower than 100.");
		emit PrizePercentageChanged(prizePercentage);
    }

    function setRwalkPrizePercentage(uint256 newRwalkPrizePercentage) external onlyOwner {
        rwalkPrizePercentage = newRwalkPrizePercentage;
		require(rwalkPrizePercentage + charityPercentage + rafflePercentage + stakingPercentage < 100, "Percentage value overflow, must be lower than 100.");
		emit RwalkPrizePercentageChanged(rwalkPrizePercentage);
    }

    function setCharityPercentage(uint256 newCharityPercentage) external onlyOwner {
        charityPercentage = newCharityPercentage;
		require(prizePercentage + charityPercentage + rafflePercentage + stakingPercentage < 100, "Percentage value overflow, must be lower than 100.");
	    emit CharityPercentageChanged(charityPercentage);
    }

    function setRafflePercentage(uint256 newRafflePercentage) external onlyOwner {
        rafflePercentage = newRafflePercentage;
		require(prizePercentage + charityPercentage + rafflePercentage + stakingPercentage < 100, "Percentage value overflow, must be lower than 100.");
		emit RafflePercentageChanged(rafflePercentage);
    }

    function setStakingPercentage(uint256 newStakingPercentage) external onlyOwner {
        stakingPercentage = newStakingPercentage;
		require(prizePercentage + charityPercentage + rafflePercentage + stakingPercentage < 100, "Percentage value overflow, must be lower than 100.");
		emit StakingPercentageChanged(stakingPercentage);
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

    function setTimeoutClaimPrize(uint256 newTimeout) external onlyOwner {
        timeoutClaimPrize = newTimeout;
		emit TimeoutClaimPrizeChanged(timeoutClaimPrize);
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
        lastCSTBidTime = activationTime;		
		emit ActivationTimeChanged(activationTime);
    }

    function setETHToCSTBidRatio(uint256 newETHToCSTBidRatio) external onlyOwner {
        ETHToCSTBidRatio = newETHToCSTBidRatio;
		emit ETHToCSTBidRatioChanged(ETHToCSTBidRatio);
    }

    // Make it possible for the contract to receive NFTs by implementing the IERC721Receiver interface
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns(bytes4) {
        return this.onERC721Received.selector;
    }

    // View functions 

    function timeUntilActivation() external view returns (uint256) {
        if (activationTime < block.timestamp) return 0;
        return activationTime - block.timestamp;
    }

    function timeUntilPrize() external view returns (uint256) {
        if (prizeTime < block.timestamp) return 0;
        return prizeTime - block.timestamp;
    }

    function getBidPrice() public view returns (uint256) {
        return (bidPrice * priceIncrease) / CosmicGameConstants.MILLION;
    }

    function prizeAmount() public view returns (uint256) {
        return address(this).balance * prizePercentage / 100;
    }

    function rwalkAmount() public view returns (uint256) {
        return address(this).balance * rwalkPrizePercentage / 100;
    }

    function charityAmount() public view returns (uint256) {
        return address(this).balance * charityPercentage / 100;
    }

    function raffleAmount() public view returns (uint256) {
        return address(this).balance * rafflePercentage / 100;
    }

    function stakingAmount() public view returns (uint256) {
        return address(this).balance * stakingPercentage / 100;
    }

    // Internal functions

    function _initializeBidPrice() internal {
        bidPrice = address(this).balance / initialBidAmountFraction;
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
        emit NFTDonationEvent(_msgSender(), _nftAddress, roundNum, _tokenId, numDonatedNFTs - 1);
    }
    function _updateEntropy() internal {
        raffleEntropy = keccak256(abi.encode(
            raffleEntropy,
            block.timestamp,
            blockhash(block.number - 1)));
    }

    function _max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a : b;
    }
}
