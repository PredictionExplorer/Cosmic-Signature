// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicGameErrors } from "./CosmicGameErrors.sol";

/// @title RaffleWallet - A wallet for managing raffle winnings in the Cosmic Game
/// @author Cosmic Game Development Team
/// @notice This contract handles deposits of raffle winnings and allows winners to withdraw their prizes
/// @dev Implements deposit and withdrawal mechanisms for raffle prizes
contract RaffleWallet is Ownable {
	/// @notice Reference to the CosmicGame contract.
	CosmicGame public game;

	/// @notice Mapping of user addresses to their raffle prize balances
	mapping(address => uint256) public balances;

	/// @notice Emitted when a raffle prize is deposited for a winner
	/// @param winner Address of the raffle winner
	/// @param amount Amount of ETH deposited as the prize
	event RaffleDepositEvent(address indexed winner, uint256 amount);

	/// @notice Emitted when a winner withdraws their raffle prize
	/// @param destination Address of the prize recipient
	/// @param amount Amount of ETH withdrawn
	event RaffleWithdrawalEvent(address indexed destination, uint256 amount);

	/// @notice Initializes the RaffleWallet contract
	/// @param game_ Address of the CosmicGame contract.
	/// ToDo-202408114-1 applies.
	constructor(CosmicGame game_) Ownable(msg.sender) {
		require(address(game_) != address(0), CosmicGameErrors.ZeroAddress("Zero-address was given."));
		game = game_;
	}

	/// @notice Deposits a raffle prize for a winner
	/// @dev Only callable by the CosmicGame contract.
	/// @param winner Address of the raffle winner
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

	/// @notice Allows a winner to withdraw their raffle prize
	/// @dev Transfers the entire balance of the caller to their address
	function withdraw() external {
		uint256 balance = balances[msg.sender];
		require(balance > 0, CosmicGameErrors.ZeroBalance("Your balance is 0."));
		balances[msg.sender] = 0;
		(bool success, ) = msg.sender.call{ value: balance }("");
		require(success, CosmicGameErrors.FundTransferFailed("Transfer failed.", balance, msg.sender));
		emit RaffleWithdrawalEvent(msg.sender, balance);
	}
}
