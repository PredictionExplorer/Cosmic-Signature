// SPDX-License-Identifier: CC0-1.0

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

pragma solidity 0.8.19;

contract CosmicSignature is ERC721Enumerable, Ownable {

    mapping(uint256 => bytes32) public seeds;

    mapping(uint256 => string) public tokenNames;

    // The owner can control how the NFT is displayed by changing these settings.
    // This integer is a bunch of boolean flags. It might also contain the number of steps in the simulation.
    mapping(uint256 => uint256) public tokenSettings;

    // Entropy
    bytes32 public entropy;

    uint256 public numTokens = 0;

    string private _baseTokenURI;

    address public cosmicGameContract;

    event TokenNameEvent(uint256 tokenId, string newName);
    event MintEvent(uint256 indexed tokenId, address indexed owner, bytes32 seed);

    // IPFS link to the Python script that generates images and videos for each NFT based on seed.
    string public tokenGenerationScript = "ipfs://TBD";

    constructor(address _cosmicGameContract) ERC721("CosmicSignature", "CSS") {
        entropy = keccak256(abi.encode(
            "newNFT",
            block.timestamp, blockhash(block.number)));
        cosmicGameContract = _cosmicGameContract;
    }

    function setBaseURI(string memory baseURI) public onlyOwner {
        _baseTokenURI = baseURI;
    }

    function setTokenName(uint256 tokenId, string memory name) public {
        require(
            _isApprovedOrOwner(_msgSender(), tokenId),
            "setTokenName caller is not owner nor approved."
        );
        require(bytes(name).length <= 32, "Token name is too long.");
        tokenNames[tokenId] = name;
        emit TokenNameEvent(tokenId, name);
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }

    function mint(address owner) public {
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
        _safeMint(owner, tokenId);

        emit MintEvent(tokenId, owner, entropy);
    }
}
