// SPDX-License-Identifier: CC0-1.0

import "@openzeppelin/contracts/access/Ownable.sol";

pragma solidity ^0.8.19;

contract RaffleWallet is Ownable {

    struct RaffleWinner {
        address destination;
        uint256 amount;
        bool claimed;
    }

    mapping(uint256 => RaffleWinner) public winners;
    uint256 numRounds;

    function deposit(address winner) public payable {
        require(msg.value > 0);
        winners[numRounds] = RaffleWinner({
            destination: winner,
            amount: msg.value,
            claimed: false
        });
        numRounds += 1;
    }

    function withdraw(uint256 depositId) public {
        (bool success, ) = winners[depositId].destination.call{value: winners[depositId].amount}("");
        require(success, "Transfer failed.");
    }

}
