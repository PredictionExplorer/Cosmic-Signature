// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { CosmicGameConstants } from "./Constants.sol";
import { CosmicGameErrors } from "./Errors.sol";
import { CosmicToken } from "./CosmicToken.sol";
import { CosmicSignature } from "./CosmicSignature.sol";
import { RaffleWallet } from "./RaffleWallet.sol";
import { StakingWalletCST } from "./StakingWalletCST.sol";
import { StakingWalletRWalk } from "./StakingWalletRWalk.sol";
import { MarketingWallet } from "./MarketingWallet.sol";
import { RandomWalkNFT } from "./RandomWalkNFT.sol";
import { BusinessLogic } from "./BusinessLogic.sol";

contract CosmicGame is Ownable, IERC721Receiver {
	// State variables

	// External contracts
	// RandomWalk token (http://randomwalknft.com for more info)
	RandomWalkNFT public randomWalk;
	// CosmicSignature token, the ERC721 token holding all minted NFTs, minted during claimPrize()
	CosmicSignature public nft;
	// CosmicToken (ERC20) , token given as reward for every bid
	CosmicToken public token;
	// Contract holding all the business logic of the game, methods are exeucted via DELEGATECALL mechanism
	BusinessLogic public bLogic;
	// Contract holding ETH rewards for all raffle winners
	RaffleWallet public raffleWallet;
	// Contract used to execute Staking operations, receive staking deposits and distribute prize funds
	StakingWalletCST public stakingWalletCST;
	// Contract used to stake RandomWalk tokens, used to pick random winner of raffle CST tokens
	StakingWalletRWalk public stakingWalletRWalk;
	// Contract holding rewards for marketing the project in social media
	MarketingWallet public marketingWallet;
	// Account receiving all charity deposits on each prize claim
	address public charity;
	// END OF external contracts

	// Bidding and Prize stake variables
	// Holds current round number, incremented on every claimPrize()
	uint256 public roundNum = 0;
	// current bid price in ETH, incremented on every bid
	uint256 public bidPrice = CosmicGameConstants.FIRST_ROUND_BID_PRICE;
	// initial bid price for bidding with CST (in Dutch auction)
	uint256 public startingBidPriceCST = 100e18;
	// how much the deadline is pushed after every bid
	uint256 public nanoSecondsExtra = 3600 * 10 ** 9;
	// how much is the secondsExtra increased by after every bid (You can think of it as the second derivative)
	uint256 public timeIncrease = 1000030;
	// how much the bid price is increased after every bid
	uint256 public priceIncrease = 1010000; // we are going to divide this number by a million
	// The bid size will be 4000 times smaller than what the contract contains
	uint256 public initialBidAmountFraction = 4000;
	// stores the address of last bidder, used to pick the winner when bids are exhausted
	address public lastBidder = address(0);
	// keepts track of last bid type (ETH, RandomWalk or CST tokens) , updated on every bid()
	CosmicGameConstants.BidType public lastBidType;
	// stores Random Walk tokens used for bidding, enforcing unique bid per token
	mapping(uint256 => bool) public usedRandomWalkNFTs;
	// number of seconds prizeTime is moved forward at each round start
	uint256 public initialSecondsUntilPrize = 24 * 3600;
	// stores the timestamp when main prize can be claimed, incremented on every bid
	uint256 public prizeTime;
	// timeout for the winner to claim prize (seconds)
	uint256 public timeoutClaimPrize = 24 * 3600;
	// keeps the addresses of every bidder (in the map), used to pick random winner of ETH in raffles, one map per round
	mapping(uint256 => mapping(uint256 => address)) public raffleParticipants; // roundNum => (bidNumber => address)
	// stores the number of participants made a bid (same as counter for total number of bids), one value per round (in map)
	mapping(uint256 => uint256) public numRaffleParticipants; // roundNum => totalBids
	// keeps track of last bid with CST tokens, used to calculate current CST bid price
	uint256 public lastCSTBidTime = activationTime;
	// stores the duration of Dutch auction, for bidding with CST tokens
	uint256 public CSTAuctionLength = CosmicGameConstants.DEFAULT_AUCTION_LENGTH;
	// stores default auction duration, and used to reset the duration at every round start
	uint256 public RoundStartCSTAuctionLength = CosmicGameConstants.DEFAULT_AUCTION_LENGTH;
	mapping(uint256 => mapping(address => CosmicGameConstants.BidderInfo)) public bidderInfo; // roundNum => bidder => BidderInfo
	// variables used to keep track of the bidder with longest bid time (accumulated)
	address public stellarSpender;
	uint256 public stellarSpenderAmount;
	address public enduranceChampion;
	uint256 public enduranceChampionDuration;
	// END OF Bidding and prize variables

	// Percentages for fund distribution
	// Main Prize percentage, the percentage of balance of the contract given in ETH to the last person to bid
	uint256 public prizePercentage = 25;
	// percentage of funds that goes to charity
	uint256 public charityPercentage = 10;
	// percentage of funds that is distributed in ETH raffles (given only to bidders)
	uint256 public rafflePercentage = 5;
	// percentage of funds that id ditributed between stakers (CST stakers only)
	uint256 public stakingPercentage = 10;
	// END OF percentage variables

	// Variables for the process of claiming prize
	// stores the address of every winner by round
	mapping(uint256 => address) public winners; // map of: [roundNum] -> [winnerAddress]
	// how many bidders will participate in ETH raffles when someone claims prize
	uint256 public numRaffleETHWinnersBidding = 3;
	// how many bidders will earn an NFT token in raffle when someone claims prize
	uint256 public numRaffleNFTWinnersBidding = 5;
	// how many CST tokens will be minted for RandomWalk stakers when someone claims prize
	uint256 public numRaffleNFTWinnersStakingRWalk = 4;
	// entropy for the raffle
	bytes32 public raffleEntropy;
	// holds the record for every token donated to the game
	mapping(uint256 => CosmicGameConstants.DonatedNFT) public donatedNFTs;
	// stores the number of donated tokens for all the games played
	uint256 public numDonatedNFTs;
	// END OF prize claim variables

	// System variables (for managing the system)
	// counter for records with info about donations
	uint256 public donateWithInfoNumRecords = 0;
	// stores the info records about each donation (only those that want to have additional info)
	mapping(uint256 => CosmicGameConstants.DonationInfoRecord) public donationInfoRecords;
	// stores the timestamp for when project starts operating
	uint256 public activationTime = 1702512000; // December 13 2023 19:00 New York Time
	// amount of CST tokens given as reward for every bid
	uint256 public tokenReward = CosmicGameConstants.TOKEN_REWARD;
	// Coefficient that is used to increase the amount of tokens top bidders (longest bidder and most eth bidder) get
	uint256 public erc20RewardMultiplier;
	// amount of CST tokens given as reward on every bid for marketing the project
	uint256 public marketingReward = CosmicGameConstants.MARKETING_REWARD;
	// maximum length of message attached to bid() operation
	uint256 public maxMessageLength = CosmicGameConstants.MAX_MESSAGE_LENGTH;
	// stores current system mode (Runtime , PrepareMaintenance , Maintenance)
	uint256 public systemMode = CosmicGameConstants.MODE_MAINTENANCE;
	// END OF system variables

	// Variables for system expansion
	// additional storage shared between BusinessLogic and CosmicGame, for possible future extension of bidding functionality
	mapping(uint256 => uint256) public extraStorage;
	// END OF State variables

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
	event DonationEvent(address indexed donor, uint256 amount, uint256 round);
	event DonationWithInfoEvent(address indexed donor, uint256 amount, uint256 recordId, uint256 round);
	event NFTDonationEvent(
		address indexed donor,
		IERC721 indexed nftAddress,
		uint256 indexed round,
		uint256 tokenId,
		uint256 index
	);
	event RaffleETHWinnerEvent(address indexed winner, uint256 indexed round, uint256 winnerIndex, uint256 amount);
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
	// Percentage values
	event CharityPercentageChanged(uint256 newCharityPercentage);
	event PrizePercentageChanged(uint256 newPrizePercentage);
	event RafflePercentageChanged(uint256 newRafflePercentage);
	event StakingPercentageChanged(uint256 newStakingPercentage);
	// Contract address values
	event CharityAddressChanged(address newCharity);
	event RandomWalkAddressChanged(address newRandomWalk);
	event RaffleWalletAddressChanged(address newRaffleWallet);
	event StakingWalletCSTAddressChanged(address newStakingWalletCST);
	event StakingWalletRWalkAddressChanged(address newStakingWalletRWalk);
	event MarketingWalletAddressChanged(address newMarketingWallet);
	event CosmicTokenAddressChanged(address newCosmicToken);
	event CosmicSignatureAddressChanged(address newCosmicSignature);
	event BusinessLogicAddressChanged(address newContractAddress);
	// Raffles
	event NumRaffleETHWinnersBiddingChanged(uint256 newNumRaffleETHWinnersBidding);
	event NumRaffleNFTWinnersBiddingChanged(uint256 newNumRaffleNFTWinnersBidding);
	event NumRaffleNFTWinnersStakingRWalkChanged(uint256 newNumRaffleNFTWinnersStakingRWalk);
	// Bidding
	event InitialSecondsUntilPrizeChanged(uint256 newInitialSecondsUntilPrize);
	event InitialBidAmountFractionChanged(uint256 newInitialBidAmountFraction);
	event TimeIncreaseChanged(uint256 newTimeIncrease);
	event PriceIncreaseChanged(uint256 newPriceIncrease);
	event NanoSecondsExtraChanged(uint256 newNanoSecondsExtra);
	event MaxMessageLengthChanged(uint256 newMessageLength);
	// Prize claim
	event TimeoutClaimPrizeChanged(uint256 newTimeout);
	// Dutch auction (CST)
	event RoundStartCSTAuctionLengthChanged(uint256 newAuctionLength);
	// Token rewards
	event TokenRewardChanged(uint256 newReward);
	event Erc20RewardMultiplierChanged(uint256 newMultiplier);
	event MarketingRewardChanged(uint256 newReward);
	// System
	event ActivationTimeChanged(uint256 newActivationTime);
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

	function bidderAddress(uint256 _round, uint256 _positionFromEnd) external returns (address) {
		(bool success, bytes memory encodedAddr) = address(bLogic).delegatecall(
			abi.encodeWithSelector(BusinessLogic.bidderAddress.selector, _round, _positionFromEnd)
		);
		if (!success) {
			assembly {
				let ptr := mload(0x40)
				let size := returndatasize()
				returndatacopy(ptr, 0, size)
				revert(ptr, size)
			}
		} else {
			address addr = abi.decode(encodedAddr, (address));
			return addr;
		}
	}

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
		require(
			success,
			CosmicGameErrors.CallToBusinessLogicFailed(
				"Call to business logic failed.",
				address(bLogic),
				BusinessLogic.auctionDuration.selector
			)
		);
		return output;
	}
	// We are doing a dutch auction that lasts 24 hours.
	function currentCSTPrice() external returns (bytes memory) {
		(bool success, bytes memory price) = address(bLogic).delegatecall(
			abi.encodeWithSelector(BusinessLogic.currentCSTPrice.selector)
		);
		require(
			success,
			CosmicGameErrors.CallToBusinessLogicFailed(
				"Call to business logic failed.",
				address(bLogic),
				BusinessLogic.currentCSTPrice.selector
			)
		);
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

	function donateWithInfo(string calldata _data) external payable {
		(bool success, ) = address(bLogic).delegatecall(
			abi.encodeWithSelector(BusinessLogic.donateWithInfo.selector, _data)
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

	function getDonationInfoRecord(
		uint256 recordId
	) public view returns (CosmicGameConstants.DonationInfoRecord memory) {
		return donationInfoRecords[recordId];
	}

	// Use this function to read/write state variables in BusinessLogic contract
	function proxyCall(bytes4 _sig, bytes calldata _encoded_params) external returns (bytes memory) {
		require(
			systemMode < CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
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

	// Use this function to read/write state variables in BusinessLogic contract in systemMode = MODE_MAINTENANCE only
	// Useful to change those state variables that were created after CosmicGame.sol was deployed and has no knowledge about them\
	// Also suitable to call any method in BusinessLogic.sol contract during maintenance window
	function maintenanceProxyCall(bytes4 _sig, bytes calldata _encoded_params) external returns (bytes memory) {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_RUNTIME, systemMode)
		);
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
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		require(addr != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		charity = addr;
		emit CharityAddressChanged(charity);
	}

	function setRandomWalk(address addr) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		require(addr != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		randomWalk = RandomWalkNFT(addr);
		emit RandomWalkAddressChanged(addr);
	}

	function setRaffleWallet(address addr) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		require(addr != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		raffleWallet = RaffleWallet(addr);
		emit RaffleWalletAddressChanged(addr);
	}

	function setStakingWalletCST(address addr) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		require(addr != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		stakingWalletCST = StakingWalletCST(addr);
		emit StakingWalletCSTAddressChanged(addr);
	}

	function setStakingWalletRWalk(address addr) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		require(addr != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		stakingWalletRWalk = StakingWalletRWalk(addr);
		emit StakingWalletRWalkAddressChanged(addr);
	}

	function setMarketingWallet(address addr) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		require(addr != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		marketingWallet = MarketingWallet(addr);
		emit MarketingWalletAddressChanged(addr);
	}

	function setNumRaffleETHWinnersBidding(uint256 newNumRaffleETHWinnersBidding) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		numRaffleETHWinnersBidding = newNumRaffleETHWinnersBidding;
		emit NumRaffleETHWinnersBiddingChanged(numRaffleETHWinnersBidding);
	}

	function setNumRaffleNFTWinnersBidding(uint256 newNumRaffleNFTWinnersBidding) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		numRaffleNFTWinnersBidding = newNumRaffleNFTWinnersBidding;
		emit NumRaffleNFTWinnersBiddingChanged(numRaffleNFTWinnersBidding);
	}

	function setNumRaffleNFTWinnersStakingRWalk(uint256 newNumRaffleNFTWinnersStakingRWalk) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		numRaffleNFTWinnersStakingRWalk = newNumRaffleNFTWinnersStakingRWalk;
		emit NumRaffleNFTWinnersStakingRWalkChanged(numRaffleNFTWinnersStakingRWalk);
	}

	function setPrizePercentage(uint256 newPrizePercentage) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		prizePercentage = newPrizePercentage;
		uint256 percentageSum = prizePercentage + charityPercentage + rafflePercentage + stakingPercentage;
		require(
			percentageSum < 100,
			CosmicGameErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum)
		);
		emit PrizePercentageChanged(prizePercentage);
	}

	function setCharityPercentage(uint256 newCharityPercentage) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		charityPercentage = newCharityPercentage;
		uint256 percentageSum = prizePercentage + charityPercentage + rafflePercentage + stakingPercentage;
		require(
			percentageSum < 100,
			CosmicGameErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum)
		);
		emit CharityPercentageChanged(charityPercentage);
	}

	function setRafflePercentage(uint256 newRafflePercentage) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		rafflePercentage = newRafflePercentage;
		uint256 percentageSum = prizePercentage + charityPercentage + rafflePercentage + stakingPercentage;
		require(
			percentageSum < 100,
			CosmicGameErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum)
		);
		emit RafflePercentageChanged(rafflePercentage);
	}

	function setStakingPercentage(uint256 newStakingPercentage) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		stakingPercentage = newStakingPercentage;
		uint256 percentageSum = prizePercentage + charityPercentage + rafflePercentage + stakingPercentage;
		require(
			percentageSum < 100,
			CosmicGameErrors.PercentageValidation("Percentage value overflow, must be lower than 100.", percentageSum)
		);
		emit StakingPercentageChanged(stakingPercentage);
	}

	function setTokenContract(address addr) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		require(addr != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		token = CosmicToken(addr);
		emit CosmicTokenAddressChanged(addr);
	}

	function setNftContract(address addr) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		require(addr != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		nft = CosmicSignature(addr);
		emit CosmicSignatureAddressChanged(addr);
	}

	function setBusinessLogicContract(address addr) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		require(addr != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		bLogic = BusinessLogic(addr);
		emit BusinessLogicAddressChanged(addr);
	}

	function setTimeIncrease(uint256 newTimeIncrease) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		timeIncrease = newTimeIncrease;
		emit TimeIncreaseChanged(timeIncrease);
	}

	function setTimeoutClaimPrize(uint256 newTimeout) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		timeoutClaimPrize = newTimeout;
		emit TimeoutClaimPrizeChanged(timeoutClaimPrize);
	}

	function setPriceIncrease(uint256 newPriceIncrease) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		priceIncrease = newPriceIncrease;
		emit PriceIncreaseChanged(priceIncrease);
	}

	function setNanoSecondsExtra(uint256 newNanoSecondsExtra) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		nanoSecondsExtra = newNanoSecondsExtra;
		emit NanoSecondsExtraChanged(nanoSecondsExtra);
	}

	function setInitialSecondsUntilPrize(uint256 newInitialSecondsUntilPrize) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		initialSecondsUntilPrize = newInitialSecondsUntilPrize;
		emit InitialSecondsUntilPrizeChanged(initialSecondsUntilPrize);
	}

	function updateInitialBidAmountFraction(uint256 newInitialBidAmountFraction) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		initialBidAmountFraction = newInitialBidAmountFraction;
		emit InitialBidAmountFractionChanged(initialBidAmountFraction);
	}

	function setActivationTime(uint256 newActivationTime) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		activationTime = newActivationTime;
		lastCSTBidTime = activationTime;
		emit ActivationTimeChanged(activationTime);
	}

	function setRoundStartCSTAuctionLength(uint256 newAuctionLength) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		RoundStartCSTAuctionLength = newAuctionLength;
		emit RoundStartCSTAuctionLengthChanged(newAuctionLength);
	}

	function setTokenReward(uint256 newTokenReward) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		tokenReward = newTokenReward;
		emit TokenRewardChanged(tokenReward);
	}

	function setErc20RewardMultiplier(uint256 newMultiplier) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		erc20RewardMultiplier = newMultiplier;
		emit Erc20RewardMultiplierChanged(erc20RewardMultiplier);
	}

	function setMarketingReward(uint256 newMarketingReward) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		marketingReward = newMarketingReward;
		emit MarketingRewardChanged(marketingReward);
	}

	function setMaxMessageLength(uint256 newMaxMessageLength) external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		maxMessageLength = newMaxMessageLength;
		emit MaxMessageLengthChanged(maxMessageLength);
	}

	function prepareMaintenance() external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_RUNTIME,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		systemMode = CosmicGameConstants.MODE_PREPARE_MAINTENANCE;
		emit SystemModeChanged(systemMode);
	}

	function setRuntimeMode() external onlyOwner {
		require(
			systemMode == CosmicGameConstants.MODE_MAINTENANCE,
			CosmicGameErrors.SystemMode(CosmicGameConstants.ERR_STR_MODE_MAINTENANCE, systemMode)
		);
		systemMode = CosmicGameConstants.MODE_RUNTIME;
		emit SystemModeChanged(systemMode);
	}

	// Make it possible for the contract to receive NFTs by implementing the IERC721Receiver interface
	function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
		return this.onERC721Received.selector;
	}

	// View functions

	function currentEnduranceChampion() external view returns (address, uint256) {
		if (lastBidder == address(0)) {
			return (address(0), 0);
		}

		uint256 lastBidTime = block.timestamp - bidderInfo[roundNum][msg.sender].lastBidTime;
		if (lastBidTime > enduranceChampionDuration) {
			return (lastBidder, lastBidTime);
		}
		return (lastBidder, enduranceChampionDuration);
	}

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
