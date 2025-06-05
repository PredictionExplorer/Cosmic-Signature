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
    function getCharityEthDonationAmount() external returns (uint256);
    
    // System addresses
    function charityAddress() external returns (address);
    function prizesWallet() external returns (address);
}

/**
 * Rule: Can claim exactly at mainPrizeTime.
 * The last bidder should be able to claim exactly when block.timestamp == mainPrizeTime.
 */
rule canClaimExactlyAtMainPrizeTime {
    env e;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // The caller is the last bidder
    require e.msg.sender == lastBidder;
    
    // Get timing values
    uint256 prizeTime = mainPrizeTime(e);
    uint256 activationTime = roundActivationTime(e);
    
    // Ensure valid round state
    require activationTime > 0;
    require prizeTime > activationTime;
    
    // Set timestamp to exactly mainPrizeTime
    require e.block.timestamp == prizeTime;
    
    // Track round before
    uint256 roundBefore = roundNum(e);
    
    // Should be able to claim
    claimMainPrize(e);
    
    // Verify claim succeeded
    uint256 roundAfter = roundNum(e);
    
    assert roundAfter == roundBefore + 1,
           "Should be able to claim exactly at mainPrizeTime";
}

/**
 * Rule: Cannot claim one second before mainPrizeTime.
 * Claims should fail if attempted even one second early.
 */
rule cannotClaimOneSecondEarly {
    env e;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // The caller is the last bidder
    require e.msg.sender == lastBidder;
    
    // Get timing values
    uint256 prizeTime = mainPrizeTime(e);
    uint256 activationTime = roundActivationTime(e);
    
    // Ensure valid round state
    require activationTime > 0;
    require prizeTime > activationTime;
    require prizeTime > 0; // Prevent underflow
    
    // Set timestamp to one second before mainPrizeTime
    require e.block.timestamp == prizeTime - 1;
    
    // Try to claim (should revert)
    claimMainPrize@withrevert(e);
    
    assert lastReverted,
           "Claim should fail one second before mainPrizeTime";
}

/**
 * Rule: Anyone can claim exactly at timeout expiration.
 * Non-last-bidders should be able to claim exactly when timeout expires.
 */
rule anyoneCanClaimExactlyAtTimeout {
    env e;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // The caller is NOT the last bidder
    require e.msg.sender != lastBidder;
    require e.msg.sender != 0;
    
    // Get timing values
    uint256 prizeTime = mainPrizeTime(e);
    uint256 activationTime = roundActivationTime(e);
    uint256 timeout = timeoutDurationToClaimMainPrize(e);
    
    // Ensure valid round state
    require activationTime > 0;
    require prizeTime > activationTime;
    require timeout > 0;
    require timeout < 2^40; // Reasonable bound
    
    // Set timestamp to exactly at timeout expiration
    require e.block.timestamp == prizeTime + timeout;
    
    // Track round before
    uint256 roundBefore = roundNum(e);
    
    // Should be able to claim
    claimMainPrize(e);
    
    // Verify claim succeeded
    uint256 roundAfter = roundNum(e);
    
    assert roundAfter == roundBefore + 1,
           "Anyone should be able to claim exactly at timeout expiration";
}

/**
 * Rule: Prize claim works with zero charity donation.
 * The claim should still succeed even if charity donation amount is zero.
 */
rule claimSucceedsWithZeroCharityDonation {
    env e;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // The caller is the last bidder
    require e.msg.sender == lastBidder;
    
    // Get timing values
    uint256 prizeTime = mainPrizeTime(e);
    uint256 activationTime = roundActivationTime(e);
    
    // Ensure we can claim
    require activationTime > 0;
    require prizeTime > activationTime;
    require e.block.timestamp >= prizeTime;
    require e.block.timestamp < 2^40;
    
    // Require zero charity donation
    uint256 charityAmount = getCharityEthDonationAmount(e);
    require charityAmount == 0;
    
    // But main prize should be non-zero
    uint256 mainPrize = getMainEthPrizeAmount(e);
    require mainPrize > 0;
    require mainPrize < 10^20;
    
    // Track round before
    uint256 roundBefore = roundNum(e);
    
    // Claim should still succeed
    claimMainPrize(e);
    
    // Verify claim succeeded
    uint256 roundAfter = roundNum(e);
    
    assert roundAfter == roundBefore + 1,
           "Claim should succeed even with zero charity donation";
}

/**
 * Rule: Cannot claim with round number at maximum.
 * Ensures the system handles round number boundaries correctly.
 */
rule cannotClaimAtMaxRoundNumber {
    env e;
    
    // Set round number to maximum uint256
    uint256 currentRound = roundNum(e);
    require currentRound == max_uint256;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // The caller is the last bidder
    require e.msg.sender == lastBidder;
    
    // Get timing values
    uint256 prizeTime = mainPrizeTime(e);
    uint256 activationTime = roundActivationTime(e);
    
    // Ensure we can claim
    require activationTime > 0;
    require prizeTime > activationTime;
    require e.block.timestamp >= prizeTime;
    
    // Try to claim (should revert due to round overflow)
    claimMainPrize@withrevert(e);
    
    assert lastReverted,
           "Claim should fail when round number is at maximum";
} 