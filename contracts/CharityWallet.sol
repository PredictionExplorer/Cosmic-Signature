// SPDX-License-Identifier: CC0-1.0

import "@openzeppelin/contracts/access/Ownable.sol";

pragma solidity ^0.8.18;

contract CharityWallet is Ownable {

    event CharityDonationEvent(address indexed donor, uint256 amount);

    receive() external payable {
        emit CharityDonationEvent(_msgSender(), msg.value);
    }

    function send(address destination, uint256 amount) public onlyOwner {
        (bool success, ) = destination.call{value: amount}("");
        require(success, "Transfer failed.");
    }

}
