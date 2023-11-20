// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { CosmicGame } from "./CosmicGame.sol";
import { CosmicSignature } from "./CosmicSignature.sol";

contract StakingWallet is Ownable {

    mapping(uint256 => uint256) public valueInRound;
    // round -> NFT number -> paid or not
    mapping(uint256 => mapping(uint256 => bool)) public isPaid;

    mapping(uint256 => uint256) public numWinnersInRound;
    CosmicSignature public nft;
    CosmicGame public game;

    event RaffleDepositEvent(uint256 indexed round, uint256 amount);

    constructor(CosmicSignature nft_, CosmicGame game_) {
        nft = nft_;
        game = game_;
    }

    function deposit(uint256 roundNum) external payable {
        require(msg.value > 0, "No ETH has been sent.");
        require(msg.sender == address(game), "Only the CosmicGame contract can deposit.");
        numWinnersInRound[roundNum] = nft.totalSupply();
        valueInRound[roundNum] = msg.value / numWinnersInRound[roundNum];
        emit RaffleDepositEvent(roundNum, msg.value);
    }

    function withdraw(uint256 roundNum, uint256 tokenId) external {
        // Check if the NFT number is eligible
        require(tokenId < numWinnersInRound[roundNum]);
        require(!isPaid[roundNum][tokenId]);
        isPaid[roundNum][tokenId] = true;
        (bool success, ) = nft.ownerOf(tokenId).call{value: tokenId}("");
        require(success, "Withdrawal failed.");
    }
}
