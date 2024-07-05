// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicGameErrors } from "./Errors.sol";

contract RaffleWallet is Ownable {
	CosmicGame public game;
	mapping(address => uint256) public balances;
	event RaffleDepositEvent(address indexed winner, uint256 amount);
	event RaffleWithdrawalEvent(address indexed destination, uint256 amount);

	constructor(CosmicGame game_) {
		require(address(game_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		game = game_;
	}

	function deposit(address winner) external payable {
		require(winner != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		require(msg.value > 0, CosmicGameErrors.NonZeroValueRequired("No ETH has been sent."));
		require(
			msg.sender == address(game),
			CosmicGameErrors.DepositFromUnauthorizedSender("Only CosmicGame is allowed to deposit.", msg.sender)
		);
		balances[winner] += msg.value;
		emit RaffleDepositEvent(winner, msg.value);
	}

	function withdraw() external {
		uint256 balance = balances[msg.sender];
		require(balance > 0, CosmicGameErrors.ZeroBalance("Your balance is 0."));
		balances[msg.sender] = 0;
		(bool success, ) = msg.sender.call{ value: balance }("");
		require(success, CosmicGameErrors.FundTransferFailed("Transfer failed.", balance, msg.sender));
		emit RaffleWithdrawalEvent(msg.sender, balance);
	}
}
