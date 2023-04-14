import "./BidW.sol";
import "./CosmicSignatureToken.sol";
import "./CosmicSignatureNFT.sol";
import "./CosmicSignatureDAO.sol";
import "./CharityWallet.sol";
import "./RandomWalkNFT.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";
pragma solidity ^0.8.19;

contract BWTest is BidW  {
	address payable bw_addr = payable(0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48);
	uint256 prev_prizeTime = 0;
	uint256 rw_token_id = 0;
	constructor() payable {

	}
	function echidna_balance_bw_gt_zero() public returns (bool) {
	  return bw_addr.balance>0;
	}
	function echidna_balance_bw_gt_one() public returns (bool) {
	  return bw_addr.balance>1;
	}
	function echidna_balance_bw_gt_ten() public returns (bool) {
	  return bw_addr.balance>10;
	}
	function echidna_bid() public returns (bool) {
		uint256 bid_price;
		bid_price=BidW(bw_addr).getBidPrice();
		if (address(this).balance > bid_price) {
			BidW(bw_addr).bid{value:bid_price}("");
			return true;
		} else {
			return true;
		}
	}
	function echidna_claim_prize() public returns (bool) {
		address lb = BidW(bw_addr).lastBidder();
		if (lb == address(this)) {
			BidW(bw_addr).claimPrize();
		}
		return true;
	}
	function echidna_prize_time_always_greater() public returns (bool) {
		if (prev_prizeTime > 0) {
			if (prev_prizeTime < BidW(bw_addr).prizeTime()) {
				return false;
			}
		}
		prev_prizeTime = BidW(bw_addr).prizeTime();
		return true;
	}
	function echidna_bid_price_never_zero() public returns (bool) {
		return BidW(bw_addr).getBidPrice() > 0;
	}
	function echidna_bid_price_never_one() public returns (bool) {
		return BidW(bw_addr).getBidPrice() > 1;
	}
	function echidna_bid_price_never_ten() public returns (bool) {
		return BidW(bw_addr).getBidPrice() > 10;
	}
	function echidna_bid_and_donate() public returns (bool) {
		RandomWalkNFT rw = BidW(bw_addr).randomWalk();
		uint256 price = (rw).getMintPrice();
		if (address(this).balance > price) {
			rw.mint{value:price}();
		} else {
			return true;
		}
		rw.setApprovalForAll(bw_addr,true);
		uint256 bid_price;
		bid_price=BidW(bw_addr).getBidPrice();
		if (address(this).balance > bid_price) {
			BidW(bw_addr).bidAndDonateNFT{value:bid_price}("",rw,rw_token_id);
		}
		rw_token_id++;
		return true;
	}
	function echidna_bidWithRWLK() public returns (bool) {
		RandomWalkNFT rw = BidW(bw_addr).randomWalk();
		uint256 price = (rw).getMintPrice();
		if (address(this).balance > price) {
			rw.mint{value:price}();
		} else {
			return true;
		}
		BidW(bw_addr).bidWithRWLK(rw_token_id,"");
		rw_token_id++;
		return true;
	}
}
