// SPDX-License-Identifier: CC0-1.0

import "@openzeppelin/contracts/access/Ownable.sol";

pragma solidity ^0.8.19;

contract CharityWallet is Ownable {

    event DonationReceivedEvent(address indexed donor, uint256 amount);
    event DonationSentEvent(address indexed charity, uint256 amount);
    event CharityUpdatedEvent(address indexed newCharityAddress);

    address public charityAddress;

    receive() external payable {
        emit DonationReceivedEvent(_msgSender(), msg.value);
    }

    function setCharity(address newCharityAddress) public onlyOwner {
        charityAddress = newCharityAddress;
        emit CharityUpdatedEvent(charityAddress);
    }

    function send() public {
        uint256 amount = address(this).balance;
        (bool success, ) = charityAddress.call{value: amount}("");
        require(success, "Transfer failed.");
        emit DonationSentEvent(charityAddress, amount);
    }

}
