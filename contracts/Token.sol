// SPDX-License-Identifier: CC0-1.0

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

pragma solidity ^0.8.18;

contract OrbitalToken is ERC20, ERC20Burnable {

    address public biddingWarContract;

    constructor(address _biddingWarContract) ERC20("Obital Token", "ORB") {
        biddingWarContract = _biddingWarContract;
    }

    function mint(address owner, uint256 amount) public {
        require (_msgSender() == biddingWarContract);
        _mint(owner, amount);
    }

}
