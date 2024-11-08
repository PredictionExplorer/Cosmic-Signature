// #region

// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;

// #endregion
// #region

// import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { IPrizesWallet } from "./interfaces/IPrizesWallet.sol";

// #endregion
// #region

contract PrizesWallet is /*Ownable,*/ IPrizesWallet {
	// #region State

	/// @notice The `CosmicGame` contract address.
	address public game;

	/// @notice Maps each winner address to their ETH balance.
	uint256[1 << 160] private _ethBalances;

	// #endregion
	// #region `onlyGame`

	modifier onlyGame() {
		require(
			msg.sender == game,
			CosmicGameErrors.CallDenied("Only the CosmicGame contract is permitted to call this method.", msg.sender)
		);
		_;
	}

	// #endregion
	// #region `constructor`

	/// @notice Constructor.
	/// @param game_ `CosmicGame` contract address.
	constructor(address game_) /*Ownable(msg.sender)*/ {
		require(game_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		game = game_;
	}

	// #endregion
	// #region `depositEth`

	function depositEth(address winner_) external payable override onlyGame {
		// [Comment-202411084]
		// Issue. Given that only `game` is permitted to call us, this validation can't fail, right? So I have replaced it with an `assert`.
		// [/Comment-202411084]
		// require(winner_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		// #enable_asserts assert(winner_ != address(0));

		// // Comment-202409215 applies.
		// require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("No ETH has been sent."));

		_ethBalances[uint160(winner_)] += msg.value;
		emit EthReceived(winner_, msg.value);
	}

	// #endregion
	// #region `withdrawEth`

	function withdrawEth() external override {
		uint256 ethBalance_ = _ethBalances[uint160(msg.sender)];

		// // Comment-202409215 applies.
		// require(ethBalance_ > 0, CosmicGameErrors.ZeroBalance("Your balance is zero."));

		_ethBalances[uint160(msg.sender)] = 0;
		emit EthWithdrawn(msg.sender, ethBalance_);
		(bool isSuccess, ) = msg.sender.call{value: ethBalance_}("");
		require(isSuccess, CosmicGameErrors.FundTransferFailed("ETH withdrawal failed.", msg.sender, ethBalance_));
	}

	// #endregion
	// #region `getEthBalance`

	function getEthBalance() external view override returns(uint256) {
		return _ethBalances[uint160(msg.sender)];
	}

	// #endregion
	// #region `getEthBalance`

	function getEthBalance(address winner_) external view override returns(uint256) {
		return _ethBalances[uint160(winner_)];
	}

	// #endregion
}

// #endregion
