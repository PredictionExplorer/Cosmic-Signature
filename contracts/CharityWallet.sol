// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.21;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract CharityWallet is Ownable {

    address public charityAddress;

    event DonationReceivedEvent(address indexed donor, uint256 amount);
    event DonationSentEvent(address indexed charity, uint256 amount);
    event CharityUpdatedEvent(address indexed newCharityAddress);

    receive() external payable {
        emit DonationReceivedEvent(_msgSender(), msg.value);
    }

    function setCharity(address newCharityAddress) external onlyOwner {
        require(newCharityAddress != address(0), "Zero-address was given.");
        charityAddress = newCharityAddress;
        emit CharityUpdatedEvent(charityAddress);
    }

    function send() external {
        uint256 amount = address(this).balance;
        (bool success, ) = charityAddress.call{value: amount}("");
        require(success, "Transfer failed.");
        emit DonationSentEvent(charityAddress, amount);
    }

}
