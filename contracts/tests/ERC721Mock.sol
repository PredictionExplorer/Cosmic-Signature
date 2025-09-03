// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.30;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

contract ERC721Mock is IERC721 {
	mapping(uint256 => address) private _ownerOf;
	mapping(address => uint256) private _balanceOf;
	mapping(uint256 => address) private _tokenApprovals;
	mapping(address => mapping(address => bool)) private _operatorApprovals;

	// --- IERC165 ---
	function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
		return interfaceId == type(IERC165).interfaceId || interfaceId == type(IERC721).interfaceId;
	}

	// --- IERC721 core ---

	function balanceOf(address owner) external view override returns (uint256) {
		require(owner != address(0), "zero owner");
		return _balanceOf[owner];
	}

	function ownerOf(uint256 tokenId) public view override returns (address) {
		address o = _ownerOf[tokenId];
		require(o != address(0), "no owner");
		return o;
	}

	function approve(address to, uint256 tokenId) external override {
		address o = ownerOf(tokenId);
		require(msg.sender == o || _operatorApprovals[o][msg.sender], "not allowed");
		_tokenApprovals[tokenId] = to;
		emit Approval(o, to, tokenId);
	}

	function getApproved(uint256 tokenId) external view override returns (address) {
		require(_ownerOf[tokenId] != address(0), "nonexistent");
		return _tokenApprovals[tokenId];
	}

	function setApprovalForAll(address operator, bool approved) external override {
		_operatorApprovals[msg.sender][operator] = approved;
		emit ApprovalForAll(msg.sender, operator, approved);
	}

	function isApprovedForAll(address owner, address operator) external view override returns (bool) {
		return _operatorApprovals[owner][operator];
	}

	function transferFrom(address from, address to, uint256 tokenId) public override {
		require(to != address(0), "zero to");
		address o = ownerOf(tokenId);
		require(o == from, "not owner");
		require(
			msg.sender == o ||
			_tokenApprovals[tokenId] == msg.sender ||
			_operatorApprovals[o][msg.sender],
			"not approved"
		);

		_tokenApprovals[tokenId] = address(0);
		_ownerOf[tokenId] = to;
		_balanceOf[from] -= 1;
		_balanceOf[to] += 1;

		emit Transfer(from, to, tokenId);
	}

	function safeTransferFrom(address from, address to, uint256 tokenId) external override {
		transferFrom(from, to, tokenId);
	}

	function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external override {
		transferFrom(from, to, tokenId);
	}

	// --- helpers ---

	function mint(address to, uint256 tokenId) external {
		require(to != address(0), "zero to");
		require(_ownerOf[tokenId] == address(0), "exists");
		_ownerOf[tokenId] = to;
		_balanceOf[to] += 1;
		emit Transfer(address(0), to, tokenId);
	}

	function burn(uint256 tokenId) external {
		address o = ownerOf(tokenId);
		require(msg.sender == o || _operatorApprovals[o][msg.sender], "not allowed");
		_ownerOf[tokenId] = address(0);
		_balanceOf[o] -= 1;
		_tokenApprovals[tokenId] = address(0);
		emit Transfer(o, address(0), tokenId);
	}

	// No receive/fallback => nonpayable
}

