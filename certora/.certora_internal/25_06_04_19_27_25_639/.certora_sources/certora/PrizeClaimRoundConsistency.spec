methods {
    // Main prize claiming
    function claimMainPrize() external;
    
    // State getters
    function roundNum() external returns (uint256);
    function lastBidderAddress() external returns (address);
    function mainPrizeTime() external returns (uint256);
    function roundActivationTime() external returns (uint256);
    function timeoutDurationToClaimMainPrize() external returns (uint256);
    
    // Prize amounts
    function getMainEthPrizeAmount() external returns (uint256);
}

/**
 * Rule: New round starts in clean state after claim.
 * After a successful claim, the new round should have no last bidder,
 * no bids, and reset timing parameters.
 */
rule newRoundStartsClean {
    env e;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // The caller is the last bidder
    require e.msg.sender == lastBidder;
    
    // Get timing values
    uint256 prizeTime = mainPrizeTime(e);
    uint256 activationTime = roundActivationTime(e);
    
    // Ensure we can claim (after mainPrizeTime)
    require activationTime > 0;
    require prizeTime > activationTime;
    require e.block.timestamp >= prizeTime;
    require e.block.timestamp < 2^40;
    
    // Track initial round
    uint256 roundBefore = roundNum(e);
    
    // Claim the prize
    claimMainPrize(e);
    
    // Check new round state
    uint256 roundAfter = roundNum(e);
    address newLastBidder = lastBidderAddress(e);
    uint256 newActivationTime = roundActivationTime(e);
    
    assert roundAfter == roundBefore + 1,
           "Round should increment by 1";
           
    assert newLastBidder == 0,
           "New round should have no last bidder";
           
    assert newActivationTime >= prizeTime,
           "New round activation time should be at or after previous prize time";
}

/**
 * Rule: Round transition is monotonic.
 * Round numbers should only increase, never decrease or stay the same
 * after a successful claim.
 */
rule roundTransitionMonotonic {
    env e1;
    env e2;
    
    // Get initial round
    uint256 round1 = roundNum(e1);
    require round1 > 0;
    require round1 < 2^32;
    
    // Ensure there has been at least one bid
    address lastBidder1 = lastBidderAddress(e1);
    require lastBidder1 != 0;
    
    // First caller is the last bidder
    require e1.msg.sender == lastBidder1;
    
    // Get timing values
    uint256 prizeTime1 = mainPrizeTime(e1);
    uint256 activationTime1 = roundActivationTime(e1);
    
    // Ensure we can claim (after mainPrizeTime)
    require activationTime1 > 0;
    require prizeTime1 > activationTime1;
    require e1.block.timestamp >= prizeTime1;
    require e1.block.timestamp < 2^40;
    
    // First claim
    claimMainPrize(e1);
    
    // Get new round
    uint256 round2 = roundNum(e1);
    
    // Ensure e2 happens after e1
    require e2.block.timestamp >= e1.block.timestamp;
    require e2.block.timestamp < 2^40;
    
    // Check round after some time
    uint256 roundLater = roundNum(e2);
    
    assert round2 == round1 + 1,
           "Round should increment by exactly 1 after claim";
           
    assert roundLater >= round2,
           "Round number should never decrease";
} 