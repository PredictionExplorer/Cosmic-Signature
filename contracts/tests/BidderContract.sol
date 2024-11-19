// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.27;
pragma abicoder v2;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { PrizesWallet } from "../production/PrizesWallet.sol";
// import { CosmicToken } from "../production/CosmicToken.sol";
// import { CosmicSignature } from "../production/CosmicSignature.sol";
import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
import { CosmicGame } from "../production/CosmicGame.sol";

contract BidderContract is IERC721Receiver {
	CosmicGame public cosmicGame;
	address public creator;
	uint256 public lastTokenIdChecked = 0;
	uint256[] public myDonatedNfts;
	/// todo-1 Why do we need this? Isn't this the same as `myDonatedNfts.length`?
	uint256 public numMyDonatedNfts;
	bool blockDeposits = false;
	constructor(address payable _cosmicGame) {
		cosmicGame = CosmicGame(_cosmicGame);
		creator = msg.sender;
	}
	receive() external payable {
		require(!blockDeposits, "I am not accepting deposits");
	}
	function doBid() external payable {
		uint256 price = cosmicGame.getBidPrice();
		CosmicGame.BidParams memory defaultParams;
		defaultParams.message = "contract bid";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		cosmicGame.bid{ value: price }(param_data);
	}
	function doBid2() external payable {
		CosmicGame.BidParams memory defaultParams;
		defaultParams.message = "contract bid";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		cosmicGame.bid{ value: msg.value }(param_data);
	}
	function doBidRWalk(int256 nftId) external payable {
		uint256 price = cosmicGame.getBidPrice();
		CosmicGame.BidParams memory params;
		params.message = "contract bid rwalk";
		params.randomWalkNFTId = nftId;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicGame.bid{ value: price }(param_data);
	}
	function doBidRWalk2(int256 nftId) external payable {
		RandomWalkNFT rwalk = cosmicGame.randomWalkNft();
		rwalk.setApprovalForAll(address(cosmicGame), true);
		rwalk.transferFrom(msg.sender, address(this), uint256(nftId));
		CosmicGame.BidParams memory params;
		params.message = "contract bid rwalk";
		params.randomWalkNFTId = nftId;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicGame.bid{ value: msg.value }(param_data);
	}
	// todo-1 This function no longer compiles because I moved NFT donations to `PrizesWallet`.
	// function doBidAndDonateNft(IERC721 nftAddress_, uint256 nftId_) external payable {
	// 	nftAddress_.setApprovalForAll(address(cosmicGame), true);
	// 	uint256 donatedTokenNum = cosmicGame.numDonatedNfts();
	// 	myDonatedNfts.push(donatedTokenNum);
	// 	numMyDonatedNfts++;
	// 	uint256 price = cosmicGame.getBidPrice();
	// 	CosmicGame.BidParams memory params;
	// 	params.message = "contract bid with donation";
	// 	params.randomWalkNFTId = -1;
	// 	bytes memory param_data;
	// 	param_data = abi.encode(params);
	// 	cosmicGame.bidAndDonateNft{ value: price }(param_data, nftAddress_, nftId_);
	// }
	function doClaim() external {
		cosmicGame.claimPrize();
	}
	// function withdrawEthPrize(address destination) external {
	// 	PrizesWallet prizesWallet_ = PrizesWallet(destination);
	// 	prizesWallet_.withdrawEth();
	// }
	// // todo-1 This method no longer compiles because I moved NFT donations to `PrizesWallet`.
	// // todo-1 Should this method now call `PrizesWallet.withdrawEverything`?
	// function withdrawAll() external {
	// 	PrizesWallet prizesWallet_ = cosmicGame.prizesWallet();
	//
	// 	// Issue. `PrizesWallet.withdrawEth` won't revert on zero balance any more.
	// 	// So it could make sense to call it without checking balance.
	// 	// But it would cost more gas if the balance is zero.
	// 	// Comment-202409215 relates.
	// 	uint256 bal_ = prizesWallet_.getEthBalanceInfo().amount;
	// 	if (bal_ > 0) {
	// 		prizesWallet_.withdrawEth();
	// 	}
	//
	// 	CosmicSignature nft = cosmicGame.nft();
	// 	// todo-1 Review all calls to `call`.
	// 	// todo-1 I didn't replace those with high level calls when it's used simply to send funds.
	// 	// todo-1 Think if it's still possible to communicate to SMTChecker which specific contract we send funds to.
	// 	// todo-1 Maybe in the mode in which SMTChecker is enabled make high level calls.
	// 	// todo-1 In any case, write comments.
	// 	(bool success, ) = creator.call{ value: address(this).balance }("");
	// 	success = false;
	// 	uint256 totalSupply = nft.totalSupply();
	// 	for (uint256 i = lastTokenIdChecked; i < totalSupply; i++) {
	// 		address tokenOwner = nft.ownerOf(i);
	// 		if (tokenOwner == address(this)) {
	// 			nft.safeTransferFrom(address(this), creator, i);
	// 		}
	// 	}
	// 	if (totalSupply > 0) {
	// 		lastTokenIdChecked = totalSupply - 1;
	// 	}
	// 	CosmicToken token = cosmicGame.token();
	// 	uint ctokenBalance = token.balanceOf(address(this));
	// 	if (ctokenBalance > 0) {
	// 		token.transfer(creator, ctokenBalance);
	// 	}
	// 	for (uint256 i = 0; i < numMyDonatedNfts; i++) {
	// 		uint256 num = myDonatedNfts[i];
	// 		cosmicGame.claimDonatedNft(num);
	// 		(IERC721 tokenAddr, uint256 nftId, , ) = cosmicGame.donatedNfts(num);
	//
	// 		tokenAddr.safeTransferFrom(address(this), creator, nftId);
	// 	}
	// 	delete myDonatedNfts;
	// 	delete numMyDonatedNfts;
	// }
	function doFailedBid() external payable {
		uint256 price = msg.value;
		CosmicGame.BidParams memory defaultParams;
		defaultParams.message = "contract bid";
		defaultParams.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		blockDeposits = true;
		cosmicGame.bid{ value: price }(param_data);
		blockDeposits = false;
	}
	function startBlockingDeposits() external {
		blockDeposits = true;
	}
	function stopBlockingDeposits() external {
		blockDeposits = false;
	}
	function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
		// todo-1 This should return `IERC721Receiver.onERC721Received.selector` instead.
		return this.onERC721Received.selector;
	}
}

/// @notice Bidder Contract but not ERC721 receiver.
/// ToDo-202411268-1 relates and/or applies.
contract BidCNonRecv {
	CosmicGame public cosmicGame;
	address public creator;
	constructor(address payable _cosmicGame) {
		cosmicGame= CosmicGame(_cosmicGame);
		creator = msg.sender;
	}
	receive() external payable {}
	function doBid() external payable {
		uint256 price = cosmicGame.getBidPrice();
		CosmicGame.BidParams memory params;
		params.message = "non-erc721 receiver bid";
		params.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicGame.bid{ value: price }(param_data);
	}
	function doClaim() external {
		cosmicGame.claimPrize();
	}
}
