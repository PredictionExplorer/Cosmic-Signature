// SPDX-License-Identifier: CC0-1.0
pragma solidity =0.8.34;

import { RandomWalkNFT } from "../production/RandomWalkNFT.sol";
import { BiddingBase } from "../production/BiddingBase.sol";
import { BiddingBaseV2 } from "../production/BiddingBaseV2.sol";
import { BidStatisticsV2 } from "../production/BidStatisticsV2.sol";
import { BrokenEthReceiver } from "./BrokenEthReceiver.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract RandomWalkNFTForCoverage is RandomWalkNFT {
	function setSaleTimeForTesting(uint256 newValue_) external {
		saleTime = newValue_;
	}

	function setLastMintTimeForTesting(uint256 newValue_) external {
		lastMintTime = newValue_;
	}
}

contract RandomWalkNFTRevertingCaller is BrokenEthReceiver, IERC721Receiver {
	function mint(RandomWalkNFT randomWalkNft_) external payable {
		randomWalkNft_.mint{value: msg.value}();
	}

	function withdraw(RandomWalkNFT randomWalkNft_) external {
		randomWalkNft_.withdraw();
	}

	function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
		return IERC721Receiver.onERC721Received.selector;
	}
}

contract BiddingBaseForCoverage is BiddingBase {
	function setRoundActivationTimeForTesting(uint256 newValue_) external {
		roundActivationTime = newValue_;
	}

	function onlyRoundIsActiveForTesting() external view _onlyRoundIsActive returns (bool) {
		return true;
	}
}

contract BiddingBaseV2ForCoverage is BiddingBaseV2 {
	function setRoundActivationTimeForTesting(uint256 newValue_) external {
		roundActivationTime = newValue_;
	}

	function onlyRoundIsActiveForTesting() external view _onlyRoundIsActive returns (bool) {
		return true;
	}
}

contract BidStatisticsV2ForCoverage is BidStatisticsV2 {
	function setRoundNumForTesting(uint256 newValue_) external {
		roundNum = newValue_;
	}

	function setLastBidderForTesting(address bidderAddress_, uint256 lastBidTimeStamp_) external {
		lastBidderAddress = bidderAddress_;
		biddersInfo[roundNum][bidderAddress_].lastBidTimeStamp = lastBidTimeStamp_;
	}

	function setEnduranceChampionForTesting(
		address bidderAddress_,
		uint256 startTimeStamp_,
		uint256 duration_,
		uint256 prevDuration_
	) external {
		enduranceChampionAddress = bidderAddress_;
		enduranceChampionStartTimeStamp = startTimeStamp_;
		enduranceChampionDuration = duration_;
		prevEnduranceChampionDuration = prevDuration_;
	}

	function setChronoWarriorForTesting(address bidderAddress_, uint256 duration_) external {
		chronoWarriorAddress = bidderAddress_;
		chronoWarriorDuration = duration_;
	}

	function setBidderSpentAmountsForTesting(address bidderAddress_, uint256 ethAmount_, uint256 cstAmount_) external {
		BidderInfo storage bidderInfoReference_ = biddersInfo[roundNum][bidderAddress_];
		bidderInfoReference_.totalSpentEthAmount = ethAmount_;
		bidderInfoReference_.totalSpentCstAmount = cstAmount_;
	}
}
