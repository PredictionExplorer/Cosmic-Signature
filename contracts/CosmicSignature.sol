// SPDX-License-Identifier: CC0-1.0

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

pragma solidity ^0.8.18;

contract CosmicSignature is ERC721Enumerable, Ownable {

    mapping(uint256 => bytes32) public seeds;

    mapping(uint256 => string) public tokenNames;

    // Entropy
    bytes32 public entropy;

    uint256 public numTokens = 0;

    string private _baseTokenURI;

    address public biddingWarContract;

    event TokenNameEvent(uint256 tokenId, string newName);
    event MintEvent(uint256 indexed tokenId, address indexed owner, bytes32 seed);

    // IPFS link to the Python script that generates images and videos for each NFT based on seed.
    string public tokenGenerationScript = "ipfs://TBD";

    constructor(address _biddingWarContract) ERC721("CosmicSignature", "CSG") {
        entropy = keccak256(abi.encode(
            "newNFT",
            block.timestamp, blockhash(block.number)));
        biddingWarContract = _biddingWarContract;
    }

    function setBaseURI(string memory baseURI) public onlyOwner {
        _baseTokenURI = baseURI;
    }

    function setTokenName(uint256 tokenId, string memory name) public {
        require(
            _isApprovedOrOwner(_msgSender(), tokenId),
            "setTokenName caller is not owner nor approved"
        );
        require(bytes(name).length <= 32, "Token name is too long.");
        tokenNames[tokenId] = name;
        emit TokenNameEvent(tokenId, name);
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }

    function mint(address owner) public payable {
        require (_msgSender() == biddingWarContract,"only BiddingWar contract can mint");

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
