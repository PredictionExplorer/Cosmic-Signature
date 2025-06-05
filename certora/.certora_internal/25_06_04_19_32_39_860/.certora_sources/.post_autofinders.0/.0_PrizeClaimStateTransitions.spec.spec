methods {
    // Main prize claiming
    function claimMainPrize() external;
    
    // State getters
    function roundNum() external returns (uint256);
    function lastBidderAddress() external returns (address);
    function mainPrizeTime() external returns (uint256);
    function roundActivationTime() external returns (uint256);
    function timeoutDurationToClaimMainPrize() external returns (uint256);
    
    // Prizes wallet and amounts
    function prizesWallet() external returns (address);
    function getMainEthPrizeAmount() external returns (uint256);
}

/**
 * Rule: Round number increments after successful claim.
 * When the main prize is claimed successfully, the round number should increase by exactly 1.
 */
rule roundIncrementsByOne {
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
    
    // Add reasonable bounds
    require e.block.timestamp < 2^40;
    require prizeTime < 2^40;
    
    // Get round number before claim
    uint256 roundBefore = roundNum(e);
    require roundBefore > 0;
    require roundBefore < 2^32;  // Reasonable bound
    
    // Claim the main prize
    claimMainPrize(e);
    
    // Check round number after claim
    uint256 roundAfter = roundNum(e);
    
    // Round should increment by exactly 1
    assert roundAfter == roundBefore + 1,
           "Round number should increment by exactly 1 after successful claim";
}

/**
 * Rule: Last bidder address is cleared after claim.
 * After claiming the main prize, the last bidder address should be reset to zero
 * for the new round.
 */
rule lastBidderAddressClearedAfterClaim {
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
    
    // Add reasonable bounds
    require e.block.timestamp < 2^40;
    require prizeTime < 2^40;
    
    // Claim the main prize
    claimMainPrize(e);
    
    // After claiming, last bidder address should be cleared (set to zero)
    address lastBidderAfter = lastBidderAddress(e);
    
    assert lastBidderAfter == 0,
           "Last bidder address should be cleared (set to zero) after claiming main prize";
} 