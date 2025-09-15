// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import { IRandomWalkNFT } from "./interfaces/IRandomWalkNFT.sol";

/// @dev
/// [Comment-202409149]
/// This contract has already been deployed, so it makes little sense to refactor it.
/// But I did refactor it a little.
/// Some refactorings accommodate breaking changes in OpenZeppelin.
/// Comment-202503251 relates.
/// Comment-202502063 relates.
/// [/Comment-202409149]
///
/// Issue. There is a little vulnerability here, described in Comment-202503253.
///
/// todo-1 +++ Review again what can possibly fail here and cause a transaction reversal.
contract RandomWalkNFT is ERC721Enumerable, Ownable, IRandomWalkNFT {
	// #region State

	/// @notice November 11 2021 19:00 New York Time
	/// @dev Issue. Should this be a `constant`?
	uint256 public saleTime = 1_636_675_200;

	/// @notice Price starts at 0.001 ETH
	uint256 public price = 0.001 ether;

	/// @notice How long to wait until the last minter can withdraw
	/// @dev Issue. Should this be a `constant`?
	uint256 public withdrawalWaitSeconds = 30 days;

	/// @notice Seeds
	mapping(uint256 => bytes32) public seeds;

	mapping(uint256 => string) public tokenNames;

	uint256 public numWithdrawals = 0;
	mapping(uint256 => uint256) public withdrawalNums;
	mapping(uint256 => uint256) public withdrawalAmounts;

	/// @notice Entropy
	/// @dev Issue. Random number generation could have been implemented better here.
	/// But keep in mind that the assumption described in Comment-202503254 is not valid here.
	bytes32 public entropy;

	address public lastMinter = address(0);

	/// @dev Issue. Slither: RandomWalkNFT.lastMintTime is set pre-construction with a non-constant function or state variable: saleTime
	uint256 public lastMintTime = saleTime;

	/// @dev Issue. We don't need this variable. We can use `totalSupply` instead.
	uint256 public nextTokenId = 0;

	string private _baseTokenURI;

	/// @notice IPFS link to the Python script that generates images and videos for each NFT based on seed.
	/// @dev Issue. Should this be a `constant`?
	string public tokenGenerationScript = "ipfs://QmP7Z8VbQLpytzXnceeAAc4D5tX39XVzoEeUZwEK8aPk8W";

	// #endregion

	/// @dev
	/// [Comment-202503251]
	/// In OpenZeppelin 5+,`Ownable.constructor` requires a nonzero `initialOwner`.
	/// Comment-202409149 relates and/or applies.
	/// [/Comment-202503251]
	constructor() ERC721("RandomWalkNFT", "RWLK") Ownable(_msgSender()) {
		// Issue. It would be more efficient and not any less random to initialize this with a hardcoded number.
		entropy = keccak256(
			abi.encode(
				"A two-dimensional random walk will return to the point where it started, but a three-dimensional one may not.",
				block.timestamp,

				// Comment-202412103 applies.
				blockhash(block.number)
			)
		);
	}

	function setBaseURI(string memory baseURI) public override onlyOwner {
		_baseTokenURI = baseURI;
	}

	function setTokenName(uint256 tokenId, string memory name) public override {
		// [Comment-202502063]
		// Issue. In OpenZeppelin 5, `_isApprovedOrOwner` has been replaced with `_isAuthorized`.
		// Comment-202409149 relates and/or applies.
		// [/Comment-202502063]
		// require(_isApprovedOrOwner(_msgSender(), tokenId), "setTokenName caller is not owner nor approved");
		require(_isAuthorized(_ownerOf(tokenId), _msgSender(), tokenId), "setTokenName caller is not owner nor approved");

		require(bytes(name).length <= 32, "Token name is too long.");
		tokenNames[tokenId] = name;
		emit TokenNameEvent(tokenId, name);
	}

	/// @dev Issue. `virtual` is not needd here.
	function _baseURI() internal view virtual override returns (string memory) {
		return _baseTokenURI;
	}

	function getMintPrice() public view override returns (uint256) {
		return (price * 10011) / 10000;
	}

	function timeUntilSale() public view override returns (uint256) {
		if (saleTime < block.timestamp) return 0;
		return saleTime - block.timestamp;
	}

	function timeUntilWithdrawal() public view override returns (uint256) {
		uint256 withdrawalTime = lastMintTime + withdrawalWaitSeconds;
		if (withdrawalTime < block.timestamp) return 0;
		return withdrawalTime - block.timestamp;
	}

	function withdrawalAmount() public view override returns (uint256) {
		return address(this).balance / 2;
	}

	/// @notice If there was no mint for withdrawalWaitSeconds, then the last minter can withdraw
	/// half of the balance in the smart contract.
	function withdraw() public override {
		require(_msgSender() == lastMinter, "Only last minter can withdraw.");
		require(timeUntilWithdrawal() == 0, "Not enough time has elapsed.");

		address destination = lastMinter;
		
		// Someone will need to mint again to become the last minter.
		lastMinter = address(0);

		// Token that trigerred the withdrawal
		uint256 tokenId = nextTokenId - 1;

		uint256 amount = withdrawalAmount();

		numWithdrawals += 1;
		withdrawalNums[tokenId] = numWithdrawals;
		withdrawalAmounts[tokenId] = amount;

		// Transfer half of the balance to the last minter.
		(bool success, ) = destination.call{ value: amount }("");
		require(success, "Transfer failed.");
		
		// Issue. This is in part similar to Comment-202503253.
		emit WithdrawalEvent(tokenId, destination, amount);
	}

	function mint() public payable override {
		uint256 newPrice = getMintPrice();
		require(msg.value >= newPrice, "The value submitted with this transaction is too low.");
		require(block.timestamp >= saleTime, "The sale is not open yet.");

		lastMinter = _msgSender();
		lastMintTime = block.timestamp;

		price = newPrice;
		uint256 tokenId = nextTokenId;
		nextTokenId += 1;

		// [Comment-202412103]
		// Issue. `blockhash(block.number)` is always zero.
		// [/Comment-202412103]
		entropy = keccak256(abi.encode(entropy, block.timestamp, blockhash(block.number), tokenId, lastMinter));

		seeds[tokenId] = entropy;
		_safeMint(lastMinter, tokenId);

		if (msg.value > price) {
			// Return the extra money to the minter.
			(bool success, ) = lastMinter.call{ value: msg.value - price }("");
			require(success, "Transfer failed.");
		}

		// [Comment-202503253]
		// Issue. Reentrancy vulnerability. During the call to `lastMinter.call`, `lastMinter`, `entropy`, and `price` could have changed.
		// Also, the order of events can be messed up.
		// But given Comment-202409149, it's too late to fix this.
		// [/Comment-202503253]
		emit MintEvent(tokenId, lastMinter, entropy, price);
	}

	/// @return A list of token IDs owned by `_owner`
	function walletOfOwner(address _owner) public view override returns (uint256[] memory) {
		uint256 tokenCount = balanceOf(_owner);

		if (tokenCount == 0) {
			// Return an empty array
			return new uint256[](0);
		}

		uint256[] memory result = new uint256[](tokenCount);
		for (uint256 i; i < tokenCount; i++) {
			result[i] = tokenOfOwnerByIndex(_owner, i);
		}
		return result;
	}

	/// @return A list of seeds owned by `_owner`
	function seedsOfOwner(address _owner) public view override returns (bytes32[] memory) {
		uint256 tokenCount = balanceOf(_owner);

		if (tokenCount == 0) {
			// Return an empty array
			return new bytes32[](0);
		}

		bytes32[] memory result = new bytes32[](tokenCount);
		for (uint256 i; i < tokenCount; i++) {
			uint256 tokenId = tokenOfOwnerByIndex(_owner, i);
			result[i] = seeds[tokenId];
		}
		return result;
	}
}
