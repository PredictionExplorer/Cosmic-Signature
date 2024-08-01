// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title (globally used) Constants and Structs 
/// @notice These are default values/types you can use in your scripts when calling methods of the contracts
/// @dev For state variables the constants are used by the constructor, but usually will be updated to other values
library CosmicGameConstants {
	uint256 public constant MILLION = 10 ** 6;
	/// @notice Specifies the default value for state variable `maxMessageLength` declared in CosmicGame.sol , set in the constructor() of CosmicGame.sol
	uint256 public constant MAX_MESSAGE_LENGTH = 280;
	/// @notice Specifies the default value for state variable `bidPrice` declared in CosmicGame.sol, set in the constructor() of CosmicGame.sol
	uint256 public constant FIRST_ROUND_BID_PRICE = 1e14; // 1 / 10,000 of ETH
	/// @notice Specifies the default value for the state variable `tokenReward` in CosmicGame.sol, set in the constructor() of CosmicGame.sol
	uint256 public constant TOKEN_REWARD = 100 * 1e18;
	/// @notice Specifies the default value for the state variable `erc20RewardMultipliera in CosmicGame.sol, set in the constructor of CosmicGame.sol
	uint256 public constant ERC20_REWARD_MULTIPLIER = 10;
	/// @notice Specifies the default value for the state variable `marketingReward` in CosmicGame.sol, set in the constructor of CosmicGame.sol
	uint256 public constant MARKETING_REWARD = 15 * 1e18;
	/// @notice Specifies the default value for the state variable `CSTAuctionLength` in CosmicGame.sol, set in the constructor of CosmicGame.sol
	uint256 public constant DEFAULT_AUCTION_LENGTH = 12 * 3600;
	/// @notice Specifies one out ot three possible values that the state variable `systemMode` in CosmicGame.sol can be set to
	uint256 public constant MODE_RUNTIME = 0;
	/// @notice Specifies one out ot three possible values that the state variable `systemMode` in CosmicGame.sol can be set to
	uint256 public constant MODE_PREPARE_MAINTENANCE = 1;
	/// @notice Specifies one out ot three possible values that the state variable `systemMode` in CosmicGame.sol can be set to
	uint256 public constant MODE_MAINTENANCE = 2;

	/// @notice Specifies common error string value returned when the User tries to use the system out of Maintenance mode
	string public constant ERR_STR_MODE_MAINTENANCE = "System must be in MODE_MAINTENANCE";
	/// @notice Specifies common error string value returned when the User tries to use the system out of Runtime mode
	string public constant ERR_STR_MODE_RUNTIME = "System in maintenance mode";

	struct BidderInfo {
		uint256 totalSpent;
		uint256 lastBidTime;
	}

	struct DonatedNFT {
		IERC721 nftAddress;
		uint256 tokenId;
		uint256 round;
		bool claimed;
	}
	struct DonationInfoRecord {
		address donor;
		uint256 amount;
		string data; // JSON-formatted string with data, defined by us (offchain)
	}
	enum BidType {
		ETH,
		RandomWalk,
		CST
	}
}
