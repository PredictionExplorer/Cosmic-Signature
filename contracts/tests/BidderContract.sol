// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.26;
pragma abicoder v2;

import { CosmicGame } from "../production/CosmicGame.sol";
import { CosmicSignature } from "../production/CosmicSignature.sol";
import { CosmicToken } from "../production/CosmicToken.sol";
import { EthPrizesWallet } from "../production/EthPrizesWallet.sol";
import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract BidderContract is IERC721Receiver {
	CosmicGame public cosmicGame;
	address public creator;
	uint256 public lastTokenIdChecked = 0;
	uint256[] public myDonatedNFTs;
	uint256 public numMyDonatedNFTs;
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
	function doBidAndDonate(address nftAddress, uint256 nftId) external payable {
		IERC721(nftAddress).setApprovalForAll(address(cosmicGame), true);
		uint256 donatedTokenNum = cosmicGame.numDonatedNFTs();
		myDonatedNFTs.push(donatedTokenNum);
		numMyDonatedNFTs++;
		uint256 price = cosmicGame.getBidPrice();
		CosmicGame.BidParams memory params;
		params.message = "contract bid with donation";
		params.randomWalkNFTId = -1;
		bytes memory param_data;
		param_data = abi.encode(params);
		cosmicGame.bidAndDonateNFT{ value: price }(param_data, IERC721(nftAddress), nftId);
	}
	function doClaim() external {
		cosmicGame.claimPrize();
	}
	function withdrawEthPrize(address destination) external {
		EthPrizesWallet ethPrizesWallet_ = EthPrizesWallet(destination);
		ethPrizesWallet_.withdraw();
	}
	function withdrawAll() external {
		EthPrizesWallet ethPrizesWallet_ = cosmicGame.ethPrizesWallet();
		// Issue. `EthPrizesWallet.withdraw` won't revert on zero balance any more.
		// So it could make sense to call it without checking balance.
		uint256 bal_ = ethPrizesWallet_.getWinnerBalance(address(this));
		if (bal_ > 0) {
			ethPrizesWallet_.withdraw();
		}
		CosmicSignature nft = cosmicGame.nft();
		// todo-1 Review all calls to `call`.
		// todo-1 I didn't replace those with high level calls when it's used simply to send funds.
		// todo-1 Think if it's still possible to communicate to SMTChecker which specific contract we send funds to.
		// todo-1 Maybe in the mode in which SMTChecker is enabled make high level calls.
		// todo-1 In any case, write comments.
		(bool success, ) = creator.call{ value: address(this).balance }("");
		success = false;
		uint256 totalSupply = nft.totalSupply();
		for (uint256 i = lastTokenIdChecked; i < totalSupply; i++) {
			address tokenOwner = nft.ownerOf(i);
			if (tokenOwner == address(this)) {
				nft.safeTransferFrom(address(this), creator, i);
			}
		}
		if (totalSupply > 0) {
			lastTokenIdChecked = totalSupply - 1;
		}
		CosmicToken token = cosmicGame.token();
		uint ctokenBalance = token.balanceOf(address(this));
		if (ctokenBalance > 0) {
			token.transfer(creator, ctokenBalance);
		}
		for (uint256 i = 0; i < numMyDonatedNFTs; i++) {
			uint256 num = myDonatedNFTs[i];
			cosmicGame.claimDonatedNFT(num);
			(IERC721 tokenAddr, uint256 nftId, , ) = cosmicGame.donatedNFTs(num);

			tokenAddr.safeTransferFrom(address(this), creator, nftId);
		}
		delete myDonatedNFTs;
		numMyDonatedNFTs = 0;
	}
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
	function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
		return this.onERC721Received.selector;
	}
}
contract BidCNonRecv {
	// Bidder Contract but not ERC721 receiver
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
