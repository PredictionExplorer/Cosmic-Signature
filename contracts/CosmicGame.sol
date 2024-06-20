// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicGameConstants } from "./Constants.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { RaffleWallet } from "./RaffleWallet.sol";
import { StakingWalletCST } from "./StakingWalletCST.sol";
import { StakingWalletRWalk } from "./StakingWalletRWalk.sol";
import { MarketingWallet } from "./MarketingWallet.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { BusinessLogic } from "./BusinessLogic.sol";

contract CosmicGame is Ownable, IERC721Receiver {
	CosmicGameConstants.BidType public lastBidType;
	mapping(uint256 => bool) public usedRandomWalkNFTs;
	RandomWalkNFT public randomWalk;
	// we need to set the bidPrice to anything higher than 0 because the
	// contract would break if it's zero and someone bids before a donation is made
	uint256 public bidPrice = 10 ** 15;
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
	uint256 public CSTAuctionLength = CosmicGameConstants.DEFAULT_AUCTION_LENGTH;
	uint256 public RoundStartCSTAuctionLength = CosmicGameConstants.DEFAULT_AUCTION_LENGTH;
	// how much the deadline is pushed after every bid
	uint256 public nanoSecondsExtra = 3600 * 10 ** 9;
	// how much is the secondsExtra increased by after every bid (You can think of it as the second derivative)
	// 1.0001
	uint256 public timeIncrease = 1000100;

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

	// 10% of the prize pool goes to the charity
	uint256 public charityPercentage = 10;

	uint256 public rafflePercentage = 5;

	uint256 public stakingPercentage = 10;

	uint256 public numRaffleETHWinnersBidding = 3;
	uint256 public numRaffleNFTWinnersBidding = 5;
	uint256 public numRaffleNFTWinnersStakingCST = 2;
	uint256 public numRaffleNFTWinnersStakingRWalk = 2;

	mapping(uint256 => address) public winners;

	// Entropy for the raffle.
	bytes32 public raffleEntropy;

	RaffleWallet public raffleWallet;

	StakingWalletRWalk public stakingWalletRWalk;
	StakingWalletCST public stakingWalletCST;

	mapping(uint256 => CosmicGameConstants.DonatedNFT) public donatedNFTs;
	uint256 public numDonatedNFTs;

	CosmicSignature public nft;
	BusinessLogic public bLogic;
	uint256 public systemMode = CosmicGameConstants.MODE_MAINTENANCE;
	mapping(uint256 => uint256) public extraStorage; // additional storage shared between BusinessLogic and CosmicGame, for possible future extension of bidding functionality

	event PrizeClaimEvent(uint256 indexed prizeNum, address indexed destination, uint256 amount);
	// randomWalkNFTId is int256 (not uint256) because we use -1 to indicate that a Random Walk NFT was not used in this bid
	event BidEvent(
		address indexed lastBidder,
		uint256 indexed round,
		int256 bidPrice,
		int256 randomWalkNFTId,
		int256 numCSTTokens,
		uint256 prizeTime,
		string message
	);
	event DonationEvent(address indexed donor, uint256 amount);
	event NFTDonationEvent(
		address indexed donor,
		IERC721 indexed nftAddress,
		uint256 indexed round,
		uint256 tokenId,
		uint256 index
	);
	event RaffleETHWinnerEvent(address indexed winner, uint256 indexed round, uint256 winnerIndex);
	event RaffleNFTWinnerEvent(
		address indexed winner,
		uint256 indexed round,
		uint256 indexed tokenId,
		uint256 winnerIndex,
		bool isStaker,
		bool isRWalk
	);
	event DonatedNFTClaimedEvent(
		uint256 indexed round,
		uint256 index,
		address winner,
		address nftAddressdonatedNFTs,
		uint256 tokenId
	);

	/// Admin events
	event CharityPercentageChanged(uint256 newCharityPercentage);
	event PrizePercentageChanged(uint256 newPrizePercentage);
	event RafflePercentageChanged(uint256 newRafflePercentage);
	event StakingPercentageChanged(uint256 newStakingPercentage);
	event NumRaffleETHWinnersBiddingChanged(uint256 newNumRaffleETHWinnersBidding);
	event NumRaffleNFTWinnersBiddingChanged(uint256 newNumRaffleNFTWinnersBidding);
	event NumRaffleNFTWinnersStakingCSTChanged(uint256 newNumRaffleNFTWinnersStakingCST);
	event NumRaffleNFTWinnersStakingRWalkChanged(uint256 newNumRaffleNFTWinnersStakingRWalk);
	event CharityAddressChanged(address newCharity);
	event RandomWalkAddressChanged(address newRandomWalk);
	event RaffleWalletAddressChanged(address newRaffleWallet);
	event StakingWalletCSTAddressChanged(address newStakingWalletCST);
	event StakingWalletRWalkAddressChanged(address newStakingWalletRWalk);
	event MarketingWalletAddressChanged(address newMarketingWallet);
	event CosmicTokenAddressChanged(address newCosmicToken);
	event CosmicSignatureAddressChanged(address newCosmicSignature);
	event BusinessLogicAddressChanged(address newContractAddress);
	event TimeIncreaseChanged(uint256 newTimeIncrease);
	event TimeoutClaimPrizeChanged(uint256 newTimeout);
	event PriceIncreaseChanged(uint256 newPriceIncrease);
	event NanoSecondsExtraChanged(uint256 newNanoSecondsExtra);
	event InitialSecondsUntilPrizeChanged(uint256 newInitialSecondsUntilPrize);
	event InitialBidAmountFractionChanged(uint256 newInitialBidAmountFraction);
	event ActivationTimeChanged(uint256 newActivationTime);
	event ETHToCSTBidRatioChanged(uint newETHToCSTBidRatio);
	event RoundStartCSTAuctionLengthChanged(uint256 newAuctionLength);
	event SystemModeChanged(uint256 newSystemMode);

	constructor() {
		raffleEntropy = keccak256(abi.encode("Cosmic Signature 2023", block.timestamp, blockhash(block.number - 1)));
		charity = _msgSender();
	}

	receive() external payable {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BusinessLogic.receiveEther.selector));
		if (!success) {
			assembly {
				let ptr := mload(0x40)
				let size := returndatasize()
				returndatacopy(ptr, 0, size)
				revert(ptr, size)
			}
		}
	}

	// Bidding

	function bidAndDonateNFT(bytes calldata _param_data, IERC721 nftAddress, uint256 tokenId) external payable {
		(bool success, ) = address(bLogic).delegatecall(
			abi.encodeWithSelector(BusinessLogic.bidAndDonateNFT.selector, _param_data, nftAddress, tokenId)
		);
		if (!success) {
			assembly {
				let ptr := mload(0x40)
				let size := returndatasize()
				returndatacopy(ptr, 0, size)
				revert(ptr, size)
			}
		}
	}

	function bid(bytes calldata _data) public payable {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BusinessLogic.bid.selector, _data));
		if (!success) {
			assembly {
				let ptr := mload(0x40)
				let size := returndatasize()
				returndatacopy(ptr, 0, size)
				revert(ptr, size)
			}
		}
	}
	function bidWithCST(string memory message) external {
		(bool success, ) = address(bLogic).delegatecall(
			abi.encodeWithSelector(BusinessLogic.bidWithCST.selector, message)
		);
		if (!success) {
			assembly {
				let ptr := mload(0x40)
				let size := returndatasize()
				returndatacopy(ptr, 0, size)
				revert(ptr, size)
			}
		}
	}
	function auctionDuration() external returns (bytes memory) {
		(bool success, bytes memory output) = address(bLogic).delegatecall(
			abi.encodeWithSelector(BusinessLogic.auctionDuration.selector)
		);
		require(success, "Call to business logic failed.");
		return output;
	}
	// We are doing a dutch auction that lasts 24 hours.
	function currentCSTPrice() external returns (bytes memory) {
		(bool success, bytes memory price) = address(bLogic).delegatecall(
			abi.encodeWithSelector(BusinessLogic.currentCSTPrice.selector)
		);
		require(success, "Call to business logic failed.");
		return price;
	}

	function claimPrize() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BusinessLogic.claimPrize.selector));
		if (!success) {
			assembly {
				let ptr := mload(0x40)
				let size := returndatasize()
				returndatacopy(ptr, 0, size)
				revert(ptr, size)
			}
		}
	}

	// Donate some ETH to the game.
	function donate() external payable {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BusinessLogic.donate.selector));
		if (!success) {
			assembly {
				let ptr := mload(0x40)
				let size := returndatasize()
				returndatacopy(ptr, 0, size)
				revert(ptr, size)
			}
		}
	}

	// Use this function to read/write state variables in BusinessLogic contract
	function proxyCall(bytes4 _sig, bytes calldata _encoded_params) external returns (bytes memory) {
		require(systemMode < CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_RUNTIME);
		(bool success, bytes memory retval) = address(bLogic).delegatecall(
			abi.encodeWithSelector(_sig, _encoded_params)
		);
		if (!success) {
			assembly {
				let ptr := mload(0x40)
				let size := returndatasize()
				returndatacopy(ptr, 0, size)
				revert(ptr, size)
			}
		}
		return retval;
	}

	function claimDonatedNFT(uint256 num) public {
		(bool success, ) = address(bLogic).delegatecall(
			abi.encodeWithSelector(BusinessLogic.claimDonatedNFT.selector, num)
		);
		if (!success) {
			assembly {
				let ptr := mload(0x40)
				let size := returndatasize()
				returndatacopy(ptr, 0, size)
				revert(ptr, size)
			}
		}
	}
	function claimManyDonatedNFTs(uint256[] memory tokens) external {
		(bool success, ) = address(bLogic).delegatecall(
			abi.encodeWithSelector(BusinessLogic.claimManyDonatedNFTs.selector, tokens)
		);
		if (!success) {
			assembly {
				let ptr := mload(0x40)
				let size := returndatasize()
				returndatacopy(ptr, 0, size)
				revert(ptr, size)
			}
		}
	}
	// Set different parameters (only owner is allowed). A few weeks after the project launches the owner will be set to address 0 forever. //

	function setCharity(address addr) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		require(addr != address(0), "Zero-address was given.");
		charity = addr;
		emit CharityAddressChanged(charity);
	}

	function setRandomWalk(address addr) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		require(addr != address(0), "Zero-address was given.");
		randomWalk = RandomWalkNFT(addr);
		emit RandomWalkAddressChanged(addr);
	}

	function setRaffleWallet(address addr) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		require(addr != address(0), "Zero-address was given.");
		raffleWallet = RaffleWallet(addr);
		emit RaffleWalletAddressChanged(addr);
	}

	function setStakingWalletCST(address addr) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		require(addr != address(0), "Zero-address was given.");
		stakingWalletCST = StakingWalletCST(addr);
		emit StakingWalletCSTAddressChanged(addr);
	}

	function setStakingWalletRWalk(address addr) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		require(addr != address(0), "Zero-address was given.");
		stakingWalletRWalk = StakingWalletRWalk(addr);
		emit StakingWalletRWalkAddressChanged(addr);
	}

	function setMarketingWallet(address addr) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		require(addr != address(0), "Zero-address was given.");
		marketingWallet = MarketingWallet(addr);
		emit MarketingWalletAddressChanged(addr);
	}

	function setNumRaffleETHWinnersBidding(uint256 newNumRaffleETHWinnersBidding) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		numRaffleETHWinnersBidding = newNumRaffleETHWinnersBidding;
		emit NumRaffleETHWinnersBiddingChanged(numRaffleETHWinnersBidding);
	}

	function setNumRaffleNFTWinnersBidding(uint256 newNumRaffleNFTWinnersBidding) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		numRaffleNFTWinnersBidding = newNumRaffleNFTWinnersBidding;
		emit NumRaffleNFTWinnersBiddingChanged(numRaffleNFTWinnersBidding);
	}

	function setNumRaffleNFTWinnersStakingCST(uint256 newNumRaffleNFTWinnersStakingCST) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		numRaffleNFTWinnersStakingCST = newNumRaffleNFTWinnersStakingCST;
		emit NumRaffleNFTWinnersStakingCSTChanged(numRaffleNFTWinnersStakingCST);
	}

	function setNumRaffleNFTWinnersStakingRWalk(uint256 newNumRaffleNFTWinnersStakingRWalk) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		numRaffleNFTWinnersStakingRWalk = newNumRaffleNFTWinnersStakingRWalk;
		emit NumRaffleNFTWinnersStakingRWalkChanged(numRaffleNFTWinnersStakingRWalk);
	}

	function setPrizePercentage(uint256 newPrizePercentage) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		prizePercentage = newPrizePercentage;
		require(
			prizePercentage + charityPercentage + rafflePercentage + stakingPercentage < 100,
			"Percentage value overflow, must be lower than 100."
		);
		emit PrizePercentageChanged(prizePercentage);
	}

	function setCharityPercentage(uint256 newCharityPercentage) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		charityPercentage = newCharityPercentage;
		require(
			prizePercentage + charityPercentage + rafflePercentage + stakingPercentage < 100,
			"Percentage value overflow, must be lower than 100."
		);
		emit CharityPercentageChanged(charityPercentage);
	}

	function setRafflePercentage(uint256 newRafflePercentage) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		rafflePercentage = newRafflePercentage;
		require(
			prizePercentage + charityPercentage + rafflePercentage + stakingPercentage < 100,
			"Percentage value overflow, must be lower than 100."
		);
		emit RafflePercentageChanged(rafflePercentage);
	}

	function setStakingPercentage(uint256 newStakingPercentage) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		stakingPercentage = newStakingPercentage;
		require(
			prizePercentage + charityPercentage + rafflePercentage + stakingPercentage < 100,
			"Percentage value overflow, must be lower than 100."
		);
		emit StakingPercentageChanged(stakingPercentage);
	}

	function setTokenContract(address addr) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		require(addr != address(0), "Zero-address was given.");
		token = CosmicToken(addr);
		emit CosmicTokenAddressChanged(addr);
	}

	function setNftContract(address addr) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		require(addr != address(0), "Zero-address was given.");
		nft = CosmicSignature(addr);
		emit CosmicSignatureAddressChanged(addr);
	}

	function setBusinessLogicContract(address addr) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		require(addr != address(0), "Zero-address was given.");
		bLogic = BusinessLogic(addr);
		emit BusinessLogicAddressChanged(addr);
	}

	function setTimeIncrease(uint256 newTimeIncrease) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		timeIncrease = newTimeIncrease;
		emit TimeIncreaseChanged(timeIncrease);
	}

	function setTimeoutClaimPrize(uint256 newTimeout) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		timeoutClaimPrize = newTimeout;
		emit TimeoutClaimPrizeChanged(timeoutClaimPrize);
	}

	function setPriceIncrease(uint256 newPriceIncrease) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		priceIncrease = newPriceIncrease;
		emit PriceIncreaseChanged(priceIncrease);
	}

	function setNanoSecondsExtra(uint256 newNanoSecondsExtra) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		nanoSecondsExtra = newNanoSecondsExtra;
		emit NanoSecondsExtraChanged(nanoSecondsExtra);
	}

	function setInitialSecondsUntilPrize(uint256 newInitialSecondsUntilPrize) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		initialSecondsUntilPrize = newInitialSecondsUntilPrize;
		emit InitialSecondsUntilPrizeChanged(initialSecondsUntilPrize);
	}

	function updateInitialBidAmountFraction(uint256 newInitialBidAmountFraction) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		initialBidAmountFraction = newInitialBidAmountFraction;
		emit InitialBidAmountFractionChanged(initialBidAmountFraction);
	}

	function setActivationTime(uint256 newActivationTime) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		activationTime = newActivationTime;
		lastCSTBidTime = activationTime;
		emit ActivationTimeChanged(activationTime);
	}

	function setETHToCSTBidRatio(uint256 newETHToCSTBidRatio) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		ETHToCSTBidRatio = newETHToCSTBidRatio;
		emit ETHToCSTBidRatioChanged(ETHToCSTBidRatio);
	}

	function setRoundStartCSTAuctionLength(uint256 newAuctionLength) external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		RoundStartCSTAuctionLength = newAuctionLength;
		emit RoundStartCSTAuctionLengthChanged(newAuctionLength);
	}

	function prepareMaintenance() external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_RUNTIME, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		systemMode = CosmicGameConstants.MODE_PREPARE_MAINTENANCE;
		emit SystemModeChanged(systemMode);
	}

	function setRuntimeMode() external onlyOwner {
		require(systemMode == CosmicGameConstants.MODE_MAINTENANCE, CosmicGameConstants.ERR_STR_MODE_MAINTENANCE);
		systemMode = CosmicGameConstants.MODE_RUNTIME;
		emit SystemModeChanged(systemMode);
	}

	// Make it possible for the contract to receive NFTs by implementing the IERC721Receiver interface
	function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
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
		return (address(this).balance * prizePercentage) / 100;
	}

	function charityAmount() public view returns (uint256) {
		return (address(this).balance * charityPercentage) / 100;
	}

	function raffleAmount() public view returns (uint256) {
		return (address(this).balance * rafflePercentage) / 100;
	}

	function stakingAmount() public view returns (uint256) {
		return (address(this).balance * stakingPercentage) / 100;
	}

	// Internal functions

	function _max(uint256 a, uint256 b) internal pure returns (uint256) {
		return a >= b ? a : b;
	}
}
