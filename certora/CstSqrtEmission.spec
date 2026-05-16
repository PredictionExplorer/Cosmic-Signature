// Certora rules for the CosmicSignatureGameV2 CST sqrt emission upgrade.
// The Solidity implementation under verification is:
//   reward = floor(sqrt(3 * elapsedSeconds * 1e36))
//
// The helper itself is private in BiddingV2. These rules verify the observable
// getter and the bid-side minting envelope around that helper.

methods {
    function getBidCstRewardAmount() external returns (uint256) envfree;
    function roundNum() external returns (uint256) envfree;
    function roundActivationTime() external returns (uint256) envfree;
    function lastBidderAddress() external returns (address) envfree;
    function biddersInfo(uint256,address) external returns (uint256,uint256,uint256) envfree;
    function bidWithEth(int256,string,uint256) external payable;
    function bidWithCst(uint256,string,uint256) external;
}

ghost mathint cstRewardMintedByBid {
    init_state axiom cstRewardMintedByBid == 0;
}

hook CALL(uint g, address recipient, uint value, bytes data) uint rc {
    // The first four bytes are ICosmicSignatureToken.mint(address,uint256).
    if (data.length >= 68 && sig:data == 0x40c10f19) {
        uint256 mintedAmount = calldataarg(36);
        cstRewardMintedByBid = cstRewardMintedByBid + to_mathint(mintedAmount);
    }
}

rule firstBidRewardIsZeroAtOrBeforeRoundActivation {
    require lastBidderAddress() == 0;
    require currentContract.block.timestamp <= roundActivationTime();
    assert getBidCstRewardAmount() == 0;
}

rule rewardIsZeroWhenElapsedIsZero {
    address bidder = lastBidderAddress();
    require bidder != 0;

    uint256 rn = roundNum();
    (, , uint256 lastBidTimeStamp) = biddersInfo(rn, bidder);
    require lastBidTimeStamp == currentContract.block.timestamp;

    assert getBidCstRewardAmount() == 0;
}

rule rewardMonotonicityForObservableState {
    address bidder = lastBidderAddress();
    require bidder != 0;

    uint256 rn = roundNum();
    (, , uint256 lastBidTimeStamp) = biddersInfo(rn, bidder);
    require lastBidTimeStamp <= currentContract.block.timestamp;

    uint256 rewardNow = getBidCstRewardAmount();
    require currentContract.block.timestamp < max_uint256;
    currentContract.block.timestamp = currentContract.block.timestamp + 1;
    uint256 rewardLater = getBidCstRewardAmount();

    assert rewardLater >= rewardNow;
}

rule ethBidMintsAtMostObservableReward {
    env e;
    int256 randomWalkNftId;
    string message;

    uint256 rewardBefore = getBidCstRewardAmount();
    mathint mintedBefore = cstRewardMintedByBid;

    bidWithEth(e, randomWalkNftId, message, 0);

    assert cstRewardMintedByBid - mintedBefore <= to_mathint(rewardBefore);
}

rule cstBidMintsAtMostObservableReward {
    env e;
    uint256 priceMaxLimit;
    string message;

    uint256 rewardBefore = getBidCstRewardAmount();
    mathint mintedBefore = cstRewardMintedByBid;

    bidWithCst(e, priceMaxLimit, message, 0);

    assert cstRewardMintedByBid - mintedBefore <= to_mathint(rewardBefore);
}
