// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.19;

import { CosmicGameConstants } from "../Constants.sol";
import { CosmicGame } from "../CosmicGame.sol";
import { CosmicToken } from "../CosmicToken.sol";
import { CosmicSignature } from "../CosmicSignature.sol";
import { RaffleWallet } from "../RaffleWallet.sol";
import { StakingWallet } from "../StakingWallet.sol";
import { MarketingWallet } from "../MarketingWallet.sol";
import { RandomWalkNFT } from "../RandomWalkNFT.sol";
import { BusinessLogic } from "../BusinessLogic.sol";

contract BLTest is BusinessLogic {
	uint256 public constant DEFAULT_INDEX = 11;
	uint256 public constant DEFAULT_VALUE = 111;
	address public constant DEFAULT_ADDRESS = 0x1111111111111111111111111111111111111111;

	function f0() external {
		lastBidType = CosmicGameConstants.BidType.CST;
	}
	function f1() external {
		usedRandomWalkNFTs[DEFAULT_INDEX] = true;
	}
	function f2() external {
		randomWalk = RandomWalkNFT(DEFAULT_ADDRESS);
	}
	function f3() external {
		bidPrice = DEFAULT_VALUE;
	}
	function f4() external {
		numETHBids = DEFAULT_VALUE;
	}
	function f5() external {
		lastBidder = DEFAULT_ADDRESS;
	}
	function f6() external {
		roundNum = DEFAULT_VALUE;
	}
	function f7() external {
		prizeTime = DEFAULT_VALUE;
	}
	function f8() external {
		activationTime = DEFAULT_VALUE;
	}
	function f9() external {
		initialSecondsUntilPrize = DEFAULT_VALUE;
	}
	function f10() external {
		raffleParticipants[DEFAULT_INDEX] = DEFAULT_ADDRESS;
	}
	function f11() external {
		numRaffleParticipants = DEFAULT_VALUE;
	}
	function f12() external {
		token = CosmicToken(DEFAULT_ADDRESS);
	}
	function f13() external {
		marketingWallet = MarketingWallet(DEFAULT_ADDRESS);
	}
	function f14() external {
		startingBidPriceCST = DEFAULT_VALUE;
	}
	function f15() external {
		lastCSTBidTime = DEFAULT_VALUE;
	}
	function f16() external {
		numCSTBids = DEFAULT_VALUE;
	}
	function f17() external {
		ETHToCSTBidRatio = DEFAULT_VALUE;
	}
	function f18() external {
		CSTAuctionLength = DEFAULT_VALUE;
	}
	function f19() external {
		nanoSecondsExtra = DEFAULT_VALUE;
	}
	function f20() external {
		timeIncrease = DEFAULT_VALUE;
	}
	function f21() external {
		priceIncrease = DEFAULT_VALUE;
	}
	function f22() external {
		timeoutClaimPrize = DEFAULT_VALUE;
	}
	function f23() external {
		charity = DEFAULT_ADDRESS;
	}
	function f24() external {
		initialBidAmountFraction = DEFAULT_VALUE;
	}
	function f25() external {
		prizePercentage = DEFAULT_VALUE;
	}
	function f26() external {
		charityPercentage = DEFAULT_VALUE;
	}
	function f27() external {
		rafflePercentage = DEFAULT_VALUE;
	}
	function f28() external {
		stakingPercentage = DEFAULT_VALUE;
	}
	function f29() external {
		numRaffleWinnersPerRound = DEFAULT_VALUE;
	}
	function f30() external {
		numRaffleNFTWinnersPerRound = DEFAULT_VALUE;
	}
	function f31() external {
		numHolderNFTWinnersPerRound = DEFAULT_VALUE;
	}
	function f32() external {
		winners[DEFAULT_INDEX] = DEFAULT_ADDRESS;
	}
	function f33() external {
		raffleEntropy = bytes32(bytes20(DEFAULT_ADDRESS));
	}
	function f34() external {
		raffleWallet = RaffleWallet(DEFAULT_ADDRESS);
	}
	function f35() external {
		stakingWallet = StakingWallet(DEFAULT_ADDRESS);
	}
	function f36() external {
		donatedNFTs[DEFAULT_INDEX].round = DEFAULT_VALUE;
	}
	function f37() external {
		numDonatedNFTs = DEFAULT_VALUE;
	}
	function f38() external {
		nft = CosmicSignature(DEFAULT_ADDRESS);
	}
	function f39() external {
		bLogic = BusinessLogic(DEFAULT_ADDRESS);
	}
	function f40() external {
		extraStorage[DEFAULT_INDEX] = DEFAULT_VALUE;
	}
}

contract CGTest is CosmicGame {
	function f0() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f0.selector));
		require(success, "Delegate call execution failed.");
	}
	function f1() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f1.selector));
		require(success, "Delegate call execution failed.");
	}
	function f2() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f2.selector));
		require(success, "Delegate call execution failed.");
	}
	function f3() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f3.selector));
		require(success, "Delegate call execution failed.");
	}
	function f4() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f4.selector));
		require(success, "Delegate call execution failed.");
	}
	function f5() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f5.selector));
		require(success, "Delegate call execution failed.");
	}
	function f6() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f6.selector));
		require(success, "Delegate call execution failed.");
	}
	function f7() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f7.selector));
		require(success, "Delegate call execution failed.");
	}
	function f8() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f8.selector));
		require(success, "Delegate call execution failed.");
	}
	function f9() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f9.selector));
		require(success, "Delegate call execution failed.");
	}
	function f10() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f10.selector));
		require(success, "Delegate call execution failed.");
	}
	function f11() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f11.selector));
		require(success, "Delegate call execution failed.");
	}
	function f12() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f12.selector));
		require(success, "Delegate call execution failed.");
	}
	function f13() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f13.selector));
		require(success, "Delegate call execution failed.");
	}
	function f14() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f14.selector));
		require(success, "Delegate call execution failed.");
	}
	function f15() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f15.selector));
		require(success, "Delegate call execution failed.");
	}
	function f16() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f16.selector));
		require(success, "Delegate call execution failed.");
	}
	function f17() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f17.selector));
		require(success, "Delegate call execution failed.");
	}
	function f18() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f18.selector));
		require(success, "Delegate call execution failed.");
	}
	function f19() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f19.selector));
		require(success, "Delegate call execution failed.");
	}
	function f20() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f20.selector));
		require(success, "Delegate call execution failed.");
	}
	function f21() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f21.selector));
		require(success, "Delegate call execution failed.");
	}
	function f22() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f22.selector));
		require(success, "Delegate call execution failed.");
	}
	function f23() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f23.selector));
		require(success, "Delegate call execution failed.");
	}
	function f24() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f24.selector));
		require(success, "Delegate call execution failed.");
	}
	function f25() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f25.selector));
		require(success, "Delegate call execution failed.");
	}
	function f26() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f26.selector));
		require(success, "Delegate call execution failed.");
	}
	function f27() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f27.selector));
		require(success, "Delegate call execution failed.");
	}
	function f28() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f28.selector));
		require(success, "Delegate call execution failed.");
	}
	function f29() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f29.selector));
		require(success, "Delegate call execution failed.");
	}
	function f30() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f30.selector));
		require(success, "Delegate call execution failed.");
	}
	function f31() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f31.selector));
		require(success, "Delegate call execution failed.");
	}
	function f32() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f32.selector));
		require(success, "Delegate call execution failed.");
	}
	function f33() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f33.selector));
		require(success, "Delegate call execution failed.");
	}
	function f34() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f34.selector));
		require(success, "Delegate call execution failed.");
	}
	function f35() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f35.selector));
		require(success, "Delegate call execution failed.");
	}
	function f36() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f36.selector));
		require(success, "Delegate call execution failed.");
	}
	function f37() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f37.selector));
		require(success, "Delegate call execution failed.");
	}
	function f38() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f38.selector));
		require(success, "Delegate call execution failed.");
	}
	function f39() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f39.selector));
		require(success, "Delegate call execution failed.");
	}
	function f40() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(BLTest.f40.selector));
		require(success, "Delegate call execution failed.");
	}
}
contract LogicVers1 is BusinessLogic {
	// contract for testing upgradability of business logi
	function write() external {
		roundNum = 10001;	
		extraStorage[10001] = 10001;
	}
}
contract LogicVers2 is BusinessLogic {
	// contract for testing upgradability of business logic
	function write() external {
		roundNum = 10002;	
		extraStorage[10002] = 10002;
	}
}
contract CGVersions is CosmicGame {
	// contract for testing upgradability of business logic
	function write() external {
		(bool success, ) = address(bLogic).delegatecall(abi.encodeWithSelector(LogicVers1.write.selector));
		require(success, "Delegate call execution failed.");
	}
}
