// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;
pragma abicoder v2;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { PrizesWallet } from "../production/PrizesWallet.sol";
// import { CosmicSignatureToken } from "../production/CosmicSignatureToken.sol";
// import { CosmicSignatureNft } from "../production/CosmicSignatureNft.sol";
import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
import { CosmicSignatureGame } from "../production/CosmicSignatureGame.sol";

contract BidderContract is IERC721Receiver {
	CosmicSignatureGame public immutable cosmicSignatureGame;
	address public immutable creator;
	uint256 public lastTokenIdChecked = 0;
	uint256[] public myDonatedNfts;
	/// todo-1 Why do we need this? Isn't this the same as `myDonatedNfts.length`?
	uint256 public numMyDonatedNfts;
	bool blockDeposits = false;
	
	constructor(CosmicSignatureGame cosmicSignatureGame_) {
		cosmicSignatureGame = cosmicSignatureGame_;
		creator = msg.sender;
	}
	receive() external payable {
		require(!blockDeposits, "I am not accepting deposits");
	}
	function doBid() external payable {
		uint256 price = cosmicSignatureGame.getBidPrice();
		CosmicSignatureGame.BidParams memory defaultParams;
		defaultParams.message = "contract bid";
		defaultParams.randomWalkNftId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		cosmicSignatureGame.bid{ value: price }(param_data);
	}
	function doBid2() external payable {
		CosmicSignatureGame.BidParams memory defaultParams;
		defaultParams.message = "contract bid";
		defaultParams.randomWalkNftId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		cosmicSignatureGame.bid{ value: msg.value }(param_data);
	}
	function doBidRWalk(int256 nftId) external payable {
		uint256 price = cosmicSignatureGame.getBidPrice();
		CosmicSignatureGame.BidParams memory params;
		params.message = "contract bid rwalk";
		params.randomWalkNftId = nftId;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicSignatureGame.bid{ value: price }(param_data);
	}
	function doBidRWalk2(int256 nftId) external payable {
		RandomWalkNFT rwalk = cosmicSignatureGame.randomWalkNft();
		rwalk.setApprovalForAll(address(cosmicSignatureGame), true);
		rwalk.transferFrom(msg.sender, address(this), uint256(nftId));
		CosmicSignatureGame.BidParams memory params;
		params.message = "contract bid rwalk";
		params.randomWalkNftId = nftId;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicSignatureGame.bid{ value: msg.value }(param_data);
	}
	// todo-1 This function no longer compiles because I moved NFT donations to `PrizesWallet`.
	// function doBidAndDonateNft(IERC721 nftAddress_, uint256 nftId_) external payable {
	// 	nftAddress_.setApprovalForAll(address(cosmicSignatureGame), true);
	// 	uint256 donatedTokenNum = cosmicSignatureGame.numDonatedNfts();
	// 	myDonatedNfts.push(donatedTokenNum);
	// 	numMyDonatedNfts++;
	// 	uint256 price = cosmicSignatureGame.getBidPrice();
	// 	CosmicSignatureGame.BidParams memory params;
	// 	params.message = "contract bid with donation";
	// 	params.randomWalkNftId = -1;
	// 	bytes memory param_data;
	// 	param_data = abi.encode(params);
	// 	cosmicSignatureGame.bidAndDonateNft{ value: price }(param_data, nftAddress_, nftId_);
	// }
	function doClaim() external {
		cosmicSignatureGame.claimPrize();
	}
	// function withdrawEthPrize(address destination) external {
	// 	PrizesWallet prizesWallet_ = PrizesWallet(destination);
	// 	prizesWallet_.withdrawEth();
	// }
	// // todo-1 This method no longer compiles because I moved NFT donations to `PrizesWallet`.
	// // todo-1 Should this method now call `PrizesWallet.withdrawEverything`?
	// function withdrawAll() external {
	// 	PrizesWallet prizesWallet_ = cosmicSignatureGame.prizesWallet();
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
	// 	CosmicSignatureNft nft_ = cosmicSignatureGame.nft();
	// 	// todo-1 Review all calls to `call`.
	// 	// todo-1 I didn't replace those with high level calls when it's used simply to send funds.
	// 	// todo-1 Think if it's still possible to communicate to SMTChecker which specific contract we send funds to.
	// 	// todo-1 Maybe in the mode in which SMTChecker is enabled make high level calls.
	// 	// todo-1 In any case, write comments.
	// 	(bool isSuccess, ) = creator.call{ value: address(this).balance }("");
	// 	isSuccess = false;
	// 	uint256 totalSupply = nft_.totalSupply();
	// 	for (uint256 i = lastTokenIdChecked; i < totalSupply; i++) {
	// 		address tokenOwner = nft_.ownerOf(i);
	// 		if (tokenOwner == address(this)) {
	// 			nft_.safeTransferFrom(address(this), creator, i);
	// 		}
	// 	}
	// 	if (totalSupply > 0) {
	// 		lastTokenIdChecked = totalSupply - 1;
	// 	}
	// 	CosmicSignatureToken token = cosmicSignatureGame.token();
	// 	uint ctokenBalance = token.balanceOf(address(this));
	// 	if (ctokenBalance > 0) {
	// 		token.transfer(creator, ctokenBalance);
	// 	}
	// 	for (uint256 i = 0; i < numMyDonatedNfts; i++) {
	// 		uint256 num = myDonatedNfts[i];
	// 		cosmicSignatureGame.claimDonatedNft(num);
	// 		(IERC721 tokenAddr, uint256 nftId, , ) = cosmicSignatureGame.donatedNfts(num);
	//
	// 		tokenAddr.safeTransferFrom(address(this), creator, nftId);
	// 	}
	// 	delete myDonatedNfts;
	// 	delete numMyDonatedNfts;
	// }
	function doFailedBid() external payable {
		uint256 price = msg.value;
		CosmicSignatureGame.BidParams memory defaultParams;
		defaultParams.message = "contract bid";
		defaultParams.randomWalkNftId = -1;
		bytes memory param_data;
		param_data = abi.encode(defaultParams);
		blockDeposits = true;
		cosmicSignatureGame.bid{ value: price }(param_data);
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
	CosmicSignatureGame public immutable cosmicSignatureGame;
	address public immutable creator;
	
	constructor(CosmicSignatureGame cosmicSignatureGame_) {
		cosmicSignatureGame = cosmicSignatureGame_;
		creator = msg.sender;
	}
	receive() external payable {}
	function doBid() external payable {
		uint256 price = cosmicSignatureGame.getBidPrice();
		CosmicSignatureGame.BidParams memory params;
		params.message = "non-erc721 receiver bid";
		params.randomWalkNftId = -1;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicSignatureGame.bid{ value: price }(param_data);
	}
	function doClaim() external {
		cosmicSignatureGame.claimPrize();
	}
}
