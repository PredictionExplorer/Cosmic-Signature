// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.21;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract RaffleWallet is Ownable {

    struct RaffleWinner {
        address destination;
        uint256 amount;
        uint256 depositId;
        uint256 round;
        bool claimed;
    }

    mapping(uint256 => RaffleWinner) public winners;
    uint256 public numDeposits;

    event RaffleDepositEvent(address indexed winner, uint256 indexed round, uint256 depositId, uint256 amount);

    function deposit(address winner,uint256 roundNum) external payable {
        require(winner != address(0), "Zero-address was given.");
        require(msg.value > 0, "No ETH has been sent.");
        winners[numDeposits] = RaffleWinner({
            destination: winner,
            amount: msg.value,
            depositId: numDeposits,
            round: roundNum,
            claimed: false
        });
        emit RaffleDepositEvent(winner, roundNum, numDeposits, msg.value);
        numDeposits += 1;
    }

    function withdraw(uint256 depositId) external {
        require(!winners[depositId].claimed, "Raffle has alredy been claimed.");
        winners[depositId].claimed = true;
        (bool success, ) = winners[depositId].destination.call{value: winners[depositId].amount}("");
        require(success, "Transfer failed.");
    }

}
