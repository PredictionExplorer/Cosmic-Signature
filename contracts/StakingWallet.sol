// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicSignature } from "./CosmicSignature.sol";

contract StakingWallet is Ownable {

    mapping(uint256 => uint256) public amountInRound;
    uint256 public previousRoundReminder = 0;

    // round -> NFT number -> paid or not
    mapping(uint256 => mapping(uint256 => bool)) public isPaid;

    mapping(uint256 => uint256) public numWinnersInRound;
    CosmicSignature public nft;
    CosmicGame public game;

    event StakingDepositEvent(uint256 indexed round, uint256 depositedAmount, uint256 prevRoundReminder, uint256 amountPerHolder);

    constructor(CosmicSignature nft_, CosmicGame game_) {
        nft = nft_;
        game = game_;
    }

    function deposit(uint256 roundNum) external payable {
        require(msg.sender == address(game), "Only the CosmicGame contract can deposit.");
		uint256 reminder = previousRoundReminder;
		uint256 totalAmount = msg.value + reminder;
        numWinnersInRound[roundNum] = nft.totalSupply();
        amountInRound[roundNum] = totalAmount/ numWinnersInRound[roundNum];
		previousRoundReminder = totalAmount % numWinnersInRound[roundNum];
        emit StakingDepositEvent(roundNum, msg.value, reminder, amountInRound[roundNum]);
    }

    function withdraw(uint256 roundNum, uint256 tokenId) external {
        // Check if the NFT number is eligible
        require(tokenId < numWinnersInRound[roundNum]);
        require(!isPaid[roundNum][tokenId]);
        isPaid[roundNum][tokenId] = true;
        (bool success, ) = nft.ownerOf(tokenId).call{value: amountInRound[roundNum]}("");
        require(success, "Withdrawal failed.");
    }
}
