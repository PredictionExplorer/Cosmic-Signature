// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGameErrors } from "./libraries/CosmicGameErrors.sol";
import { IRaffleWallet } from "./interfaces/IRaffleWallet.sol";

contract RaffleWallet is Ownable, IRaffleWallet {
	/// @notice Reference to the CosmicGame contract.
	address public game;

	/// @notice Mapping of user addresses to their raffle prize balances
	mapping(address => uint256) public balances;

	/// @notice Initializes the RaffleWallet contract
	/// @param game_ Address of the CosmicGame contract.
	/// ToDo-202408114-1 applies.
	constructor(address game_) Ownable(msg.sender) {
		require(game_ != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		game = game_;
	}

	function deposit(address winner) external payable override {
		// todo-1 Given that only `game` may call us, can this validation fail? But maybe we should make it anyway?
		require(winner != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		// todo-1 Given that only `game` may call us, can this validation fail? But maybe we should make it anyway?
		require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("No ETH has been sent."));
		// todo-1 Make this validatiopn first?
		require(
			msg.sender == game,
			CosmicGameErrors.DepositFromUnauthorizedSender("Only CosmicGame is permitted to deposit.", msg.sender)
		);
		// todo-1 Can this really overflow?
		balances[winner] += msg.value;
		emit RaffleDepositEvent(winner, msg.value);
	}

	function withdraw() external override {
		uint256 balance = balances[msg.sender];
		// todo-1 See Comment-202409215.
		require(balance > 0, CosmicGameErrors.ZeroBalance("Your balance is 0."));
		balances[msg.sender] = 0;
		(bool success, ) = msg.sender.call{ value: balance }("");
		require(success, CosmicGameErrors.FundTransferFailed("Transfer failed.", balance, msg.sender));
		emit RaffleWithdrawalEvent(msg.sender, balance);
	}
}
