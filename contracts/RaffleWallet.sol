// SPDX-License-Identifier: CC0-1.0

import "@openzeppelin/contracts/access/Ownable.sol";

pragma solidity ^0.8.19;

contract RaffleWallet is Ownable {

    struct RaffleWinner {
        address destination;
        uint256 amount;
        uint256 deposit_id;
        uint256 round;
        bool claimed;
    }

    mapping(uint256 => RaffleWinner) public winners;
    uint256 numDeposits;

    event RaffleDepositEvent(address indexed winner, uint256 indexed round, uint256 deposit_id, uint256 amount);

    function deposit(address winner,uint256 round_num) public payable {
        require(msg.value > 0, "No ETH has been sent.");
        winners[numDeposits] = RaffleWinner({
            destination: winner,
            amount: msg.value,
            deposit_id: numDeposits,
            round: round_num,
            claimed: false
        });
        emit RaffleDepositEvent(winner, round_num, numDeposits, msg.value);
        numDeposits += 1;
    }

    function withdraw(uint256 depositId) public {
        require(!winners[depositId].claimed, "Raffle has alredy been claimed.");
        winners[depositId].claimed = true;
        (bool success, ) = winners[depositId].destination.call{value: winners[depositId].amount}("");
        require(success, "Transfer failed.");
    }

}
