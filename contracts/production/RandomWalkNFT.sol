// todo-1 Is license supposed to be the same in all files? Currently it's not.
// SPDX-License-Identifier: MIT

pragma solidity 0.8.26;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC721Enumerable, ERC721} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { IRandomWalkNFT } from "./interfaces/IRandomWalkNFT.sol";

/// @dev This contract has already been deployed, so it makes little sense to refactor it.
contract RandomWalkNFT is ERC721Enumerable, Ownable, IRandomWalkNFT {
	// #region State

	// todo-1 We never change this.
	// todo-1 Should this be a `constant`?
	uint256 public saleTime = 1636675200; // November 11 2021 19:00 New York Time
	// todo-1 Rewrite this as `(1 ETHER) / 1_000`?
	uint256 public price = 10 ** 15; // Price starts at .001 eth

	/// @notice How long to wait until the last minter can withdraw (30 days)
	// todo-1 Should this be in `CosmicGameConstants`?
	uint256 public constant withdrawalWaitSeconds = 60 * 60 * 24 * 30;

	// Seeds
	mapping(uint256 => bytes32) public seeds;

	mapping(uint256 => string) public tokenNames;

	uint256 public numWithdrawals = 0;
	mapping(uint256 => uint256) public withdrawalNums;
	mapping(uint256 => uint256) public withdrawalAmounts;

	// Entropy
	bytes32 public entropy;

	address public lastMinter = address(0);
	// todo-0 Slither: RandomWalkNFT.lastMintTime is set pre-construction with a non-constant function or state variable: saleTime
	uint256 public lastMintTime = saleTime;
	uint256 public nextTokenId = 0;

	string private _baseTokenURI;

	// IPFS link to the Python script that generates images and videos for each NFT based on seed.
	// todo-1 Should this be a `constant`?
	string public tokenGenerationScript = "ipfs://QmP7Z8VbQLpytzXnceeAAc4D5tX39XVzoEeUZwEK8aPk8W";

	// #endregion

	// ToDo-202408114-1 applies.
	constructor() ERC721("RandomWalkNFT", "RWLK") Ownable(msg.sender) {
		entropy = keccak256(
			abi.encode(
				"A two-dimensional random walk will return to the point where it started, but a three-dimensional one may not.",
				block.timestamp,
				blockhash(block.number)
			)
		);
	}

	function setBaseURI(string memory baseURI) public override onlyOwner {
		_baseTokenURI = baseURI;
	}

	function setTokenName(uint256 tokenId, string memory name) public override {
		require(_isAuthorized(_ownerOf(tokenId),_msgSender(), tokenId), "setTokenName caller is not owner nor approved");
		require(bytes(name).length <= 32, "Token name is too long.");
		tokenNames[tokenId] = name;
		emit TokenNameEvent(tokenId, name);
	}

	// /// @return The base URI for token metadata
	// /// @dev
	// /// [ToDo-202408241-1]
	// /// Should this be `private`?
	// /// Does this really need to be `virtual`?
	// /// Does this belong to `MyERC721Enumerable`?
	// /// But we don't even use this. So I have commented this out for now.
	// /// [/ToDo-202408241-1]
	// function _baseURI() internal view virtual override returns (string memory) {
	// 	return _baseTokenURI;
	// }

	function getMintPrice() public view override returns (uint256) {
		return (price * 10011) / 10000;
	}

	function timeUntilSale() public view override returns (uint256) {
		if (saleTime < block.timestamp) return 0;
		return saleTime - block.timestamp;
	}

	// todo-0 Slither dislikes some time comparisons.
	// todo-0 Would it make sense to subtract the times as signed `int256` in most cases?
	// todo-0 It could also make sense to do it from within an `unchecked` block.
	// todo-0 All our times are supposed to be reasonable values that are close to `block.timestamp`.
	// todo-0 `activationTime`, even though it's set externally, will also be reasonable, right?
	// todo-0 But if it's not guaranteed the contract can require that it was within 1 year around `block.timestamp`.
	function timeUntilWithdrawal() public view override returns (uint256) {
		uint256 withdrawalTime = lastMintTime + withdrawalWaitSeconds;
		if (withdrawalTime < block.timestamp) return 0;
		return withdrawalTime - block.timestamp;
	}

	function withdrawalAmount() public view override returns (uint256) {
		return address(this).balance / 2;
	}

	/**
	 * If there was no mint for withdrawalWaitSeconds, then the last minter can withdraw
	 * half of the balance in the smart contract.
	 */
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

		// todo-0 Slither dislikes it that we make external calls and then emit events.
		// todo-0 In Slither report, see: reentrancy-events
		// todo-0 Ask ChatGPT: In Solidity, is it ok to make an external call and then emit an event? Is it good practice?
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

		entropy = keccak256(abi.encode(entropy, block.timestamp, blockhash(block.number), tokenId, lastMinter));
		seeds[tokenId] = entropy;
		_safeMint(lastMinter, tokenId);

		if (msg.value > price) {
			// Return the extra money to the minter.
			(bool success, ) = lastMinter.call{ value: msg.value - price }("");
			require(success, "Transfer failed.");
		}

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
