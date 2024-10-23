// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

// #endregion
// #region

// import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { IEthPrizesWallet } from "./interfaces/IEthPrizesWallet.sol";

// #endregion
// #region

contract EthPrizesWallet is /*Ownable,*/ IEthPrizesWallet {
	// #region State

	/// @notice `CosmicGame` contract address.
	address public game;

	/// @notice Maps each winner address to their balance.
	// mapping(address => uint256) public winnerBalances;
	uint256[1 << 160] private _winnerBalances;

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param game_ `CosmicGame` contract address.
	constructor(address game_) /*Ownable(msg.sender)*/ {
		require(game_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		game = game_;
	}

	// #endregion
	// #region `deposit`

	/// @dev todo-1 Add a function to receive multiple deposits in a single transaction.
	/// todo-1 Ideally, it should accept an array of structs, each being 32 bytes long.
	function deposit(address winner_) external payable override {
		require(
			msg.sender == game,
			CosmicGameErrors.DepositFromUnauthorizedSender("Only the CosmicGame contract is permitted to make a deposit.", msg.sender)
		);

		// [Comment-202411084]
		// Issue. Given that only `game` is permitted to call us, this validation can't fail, right? So I have replaced it with an `assert`.
		// [/Comment-202411084]
		// require(winner_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		// #enable_asserts assert(winner_ != address(0));

		// // Comment-202409215 applies.
		// require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("No ETH has been sent."));

		_winnerBalances[uint160(winner_)] += msg.value;
		emit PrizeReceived(winner_, msg.value);
	}

	// #endregion
	// #region `withdraw`

	function withdraw() external override {
		uint256 winnerBalance_ = _winnerBalances[uint160(msg.sender)];

		// // Comment-202409215 applies.
		// require(winnerBalance_ > 0, CosmicGameErrors.ZeroBalance("Your balance is zero."));

		_winnerBalances[uint160(msg.sender)] = 0;
		emit PrizeWithdrawn(msg.sender, winnerBalance_);
		(bool isSuccess, ) = msg.sender.call{value: winnerBalance_}("");
		require(isSuccess, CosmicGameErrors.FundTransferFailed("Prize withdrawal failed.", msg.sender, winnerBalance_));
	}

	// #endregion
	// #region `getWinnerBalance`

	function getWinnerBalance(address winner_) external view override returns(uint256) {
		return _winnerBalances[uint160(winner_)];
	}

	// #endregion
}

// #endregion
