// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract CosmicSignature is ERC721Enumerable, Ownable {

    mapping(uint256 => bytes32) public seeds;

    mapping(uint256 => string) public tokenNames;

    // Entropy
    bytes32 public entropy;

    uint256 public numTokens = 0;

    string private _baseTokenURI;

    address public immutable cosmicGameContract;

    // IPFS link to the script that generates images and videos for each NFT based on seed.
    string public tokenGenerationScriptURL = "ipfs://TBD";

    event TokenNameEvent(uint256 indexed tokenId, string newName);
    event MintEvent(uint256 indexed tokenId, address indexed owner, uint256 indexed roundNum, bytes32 seed);
    event TokenGenerationScriptURLEvent(string newURL);
    event BaseURIEvent(string newURI);

    constructor(address _cosmicGameContract) ERC721("CosmicSignature", "CSS") {
        require(_cosmicGameContract != address(0), "Zero-address was given.");
        entropy = keccak256(abi.encode(
            "newNFT",
            block.timestamp, blockhash(block.number)));
        cosmicGameContract = _cosmicGameContract;
    }

    function setTokenGenerationScriptURL(string memory newTokenGenerationScriptURL) external onlyOwner {
        tokenGenerationScriptURL = newTokenGenerationScriptURL;
        emit TokenGenerationScriptURLEvent(newTokenGenerationScriptURL);
    }

    function setBaseURI(string memory baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
        emit BaseURIEvent(baseURI);
    }

    function setTokenName(uint256 tokenId, string memory name) external {
        require(
            _isApprovedOrOwner(_msgSender(), tokenId),
            "setTokenName caller is not owner nor approved."
        );
        require(bytes(name).length <= 32, "Token name is too long.");
        tokenNames[tokenId] = name;
        emit TokenNameEvent(tokenId, name);
    }

    function mint(address owner, uint256 roundNum) external returns (uint256) {
        require(owner != address(0), "Zero-address was given.");
        require (_msgSender() == cosmicGameContract,"Only the CosmicGame contract can mint.");

        uint256 tokenId = numTokens;
        numTokens += 1;

        entropy = keccak256(abi.encode(
            entropy,
            block.timestamp,
            blockhash(block.number),
            tokenId,
            owner));
        seeds[tokenId] = entropy;
        _mint(owner, tokenId);

        emit MintEvent(tokenId, owner, roundNum, entropy);
        return tokenId;
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }
}
