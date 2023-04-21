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

    event RaffleDeposit(address indexed winner, uint256 indexed round,uint256 deposit_id,uint256 amount);

    function deposit(address winner,uint256 round_num) public payable {
        require(msg.value > 0);
        winners[numDeposits] = RaffleWinner({
            destination: winner,
            amount: msg.value,
            deposit_id: numDeposits,
            round: round_num,
            claimed: false
        });
        numDeposits += 1;
        emit RaffleDeposit(winner,round_num,numDeposits-1,msg.value);
    }

    function withdraw(uint256 depositId) public {
        require(!winners[depositId].claimed,"Raffle claimed");
        winners[depositId].claimed = true;
        (bool success, ) = winners[depositId].destination.call{value: winners[depositId].amount}("");
        require(success, "Transfer failed.");
    }

}
