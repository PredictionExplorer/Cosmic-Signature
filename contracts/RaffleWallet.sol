// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGame } from "./CosmicGame.sol";

contract RaffleWallet is Ownable {
	CosmicGame public game;
	mapping(address => uint256) public balances;
	event RaffleDepositEvent(address indexed winner, uint256 amount);
	event RaffleWithdrawalEvent(address indexed destination, uint256 amount);

	constructor(CosmicGame game_) {
		game = game_;
	}

	function deposit(address winner) external payable {
		require(winner != address(0), "Zero-address was given.");
		require(msg.value > 0, "No ETH has been sent.");
		require(msg.sender == address(game), "Only CosmicGame is allowed to deposit.");
		balances[winner] += msg.value;
		emit RaffleDepositEvent(winner, msg.value);
	}

	function withdraw() external {
		uint256 balance = balances[msg.sender];
		require(balance > 0, "Your balance is 0.");
		balances[msg.sender] = 0;
		(bool success, ) = msg.sender.call{ value: balance }("");
		require(success, "Transfer failed.");
		emit RaffleWithdrawalEvent(msg.sender, balance);
	}
}
