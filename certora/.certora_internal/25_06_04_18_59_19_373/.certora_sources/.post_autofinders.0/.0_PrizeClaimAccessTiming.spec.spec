methods {
    // Main prize claiming
    function claimMainPrize() external;
    
    // State getters
    function roundNum() external returns (uint256);
    function lastBidderAddress() external returns (address);
    function mainPrizeTime() external returns (uint256);
    function timeoutDurationToClaimMainPrize() external returns (uint256);
    function roundActivationTime() external returns (uint256);
    
    // Helper functions
    function getMainEthPrizeAmount() external returns (uint256);
    function getDurationUntilMainPrize() external returns (int256);
}

/**
 * Rule: Main prize can only be claimed after mainPrizeTime.
 * The last bidder must wait until mainPrizeTime before claiming.
 * If they try to claim early, the transaction should revert with MainPrizeEarlyClaim error.
 */
rule mainPrizeCanOnlyBeClaimedAfterMainPrizeTime {
    env e;
    
    // Ensure there has been at least one bid (lastBidderAddress != 0)
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // Ensure the caller is the last bidder
    require e.msg.sender == lastBidder;
    
    // Set up realistic timing constraints
    uint256 prizeTime = mainPrizeTime(e);
    uint256 activationTime = roundActivationTime(e);
    
    // Ensure round has been activated and prize time is set after activation
    require activationTime > 0;
    require prizeTime > activationTime;
    
    // Ensure we're trying to claim before mainPrizeTime
    require e.block.timestamp >= activationTime;  // Round is active
    require e.block.timestamp < prizeTime;        // But before prize time
    
    // Add reasonable bounds to avoid overflow issues
    require e.block.timestamp < 2^40;  // About 35,000 years from 1970
    require prizeTime < 2^40;
    
    // Try to claim the main prize early
    claimMainPrize@withrevert(e);
    
    // The transaction must revert because we're claiming too early
    assert lastReverted,
           "Last bidder should not be able to claim main prize before mainPrizeTime";
}

/**
 * Rule: Only the last bidder can claim the main prize before timeout.
 * Non-last-bidder tries to claim while still within the timeout period.
 * The transaction should revert with MainPrizeClaimDenied error.
 */
rule onlyLastBidderBeforeTimeout {
    env e;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // Ensure the caller is NOT the last bidder
    require e.msg.sender != lastBidder;
    require e.msg.sender != 0;  // Ensure valid address
    
    // Get timing values
    uint256 prizeTime = mainPrizeTime(e);
    uint256 timeout = timeoutDurationToClaimMainPrize(e);
    uint256 activationTime = roundActivationTime(e);
    
    // Ensure round has been activated
    require activationTime > 0;
    require prizeTime > activationTime;
    require timeout > 0;
    
    // Ensure we're after mainPrizeTime but before timeout expires
    require e.block.timestamp >= prizeTime;  // After prize time
    require e.block.timestamp < prizeTime + timeout;  // But before timeout
    
    // Add reasonable bounds to avoid overflow issues
    require e.block.timestamp < 2^40;
    require prizeTime < 2^40;
    require timeout < 365 * 24 * 60 * 60;  // Less than 1 year
    
    // Try to claim the main prize as non-last-bidder
    claimMainPrize@withrevert(e);
    
    // The transaction must revert because only last bidder can claim before timeout
    assert lastReverted,
           "Non-last-bidder should not be able to claim main prize before timeout expires";
}

/**
 * Rule: Anyone can claim the main prize after timeout expires.
 * After the timeout period, any address should be able to successfully claim the prize.
 */
rule anyoneCanClaimAfterTimeout {
    env e;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // The caller can be anyone (including non-last-bidder)
    require e.msg.sender != 0;  // Just ensure valid address
    // Specifically test with a non-last-bidder to make the test stronger
    require e.msg.sender != lastBidder;
    
    // Get timing values
    uint256 prizeTime = mainPrizeTime(e);
    uint256 timeout = timeoutDurationToClaimMainPrize(e);
    uint256 activationTime = roundActivationTime(e);
    
    // Get current round number
    uint256 currentRound = roundNum(e);
    
    // Ensure round has been activated and timing makes sense
    require activationTime > 0;
    require prizeTime > activationTime;
    require timeout > 0;
    
    // Ensure we're after the timeout period
    require e.block.timestamp >= prizeTime + timeout;
    
    // Add reasonable bounds to avoid overflow issues
    require e.block.timestamp < 2^40;
    require prizeTime < 2^40;
    require timeout < 365 * 24 * 60 * 60;  // Less than 1 year
    
    // Save the round number before claiming
    uint256 roundBefore = currentRound;
    
    // Try to claim the main prize - should succeed
    claimMainPrize(e);
    
    // Verify that the round number increased (indicating successful claim)
    uint256 roundAfter = roundNum(e);
    assert roundAfter == roundBefore + 1,
           "Round number should increase after successful claim";
}

/**
 * Rule: Cannot claim main prize when no bids have been placed.
 * If lastBidderAddress == 0, the transaction should revert with NoBidsPlacedInCurrentRound error.
 */
rule cannotClaimWhenNoBids {
    env e;
    
    // Ensure no bids have been placed (lastBidderAddress == 0)
    address lastBidder = lastBidderAddress(e);
    require lastBidder == 0;
    
    // Caller can be anyone
    require e.msg.sender != 0;  // Just ensure valid address
    
    // Get timing values for sanity checks
    uint256 activationTime = roundActivationTime(e);
    
    // Ensure round has been activated (realistic scenario)
    require activationTime > 0;
    require e.block.timestamp >= activationTime;
    
    // Add reasonable bounds
    require e.block.timestamp < 2^40;
    
    // Try to claim the main prize - should revert
    claimMainPrize@withrevert(e);
    
    // The transaction must revert because there are no bids
    assert lastReverted,
           "Should not be able to claim main prize when no bids have been placed";
}

/**
 * Rule: Cannot claim the main prize twice in the same round.
 * After a successful claim, the round number increases and lastBidderAddress resets to 0.
 * Any subsequent claim attempt should fail with NoBidsPlacedInCurrentRound.
 */
rule cannotClaimTwice {
    env e1;
    env e2;
    
    // Set up two environments with the same timestamp for the first claim
    require e1.block.timestamp == e2.block.timestamp;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e1);
    require lastBidder != 0;
    
    // First caller is the last bidder
    require e1.msg.sender == lastBidder;
    
    // Get timing values
    uint256 prizeTime = mainPrizeTime(e1);
    uint256 activationTime = roundActivationTime(e1);
    
    // Ensure we can claim (after mainPrizeTime)
    require activationTime > 0;
    require prizeTime > activationTime;
    require e1.block.timestamp >= prizeTime;
    
    // Add reasonable bounds
    require e1.block.timestamp < 2^40;
    require prizeTime < 2^40;
    
    // First claim - should succeed
    claimMainPrize(e1);
    
    // Set up second environment for the second claim attempt
    // Time may have advanced slightly
    require e2.block.timestamp >= e1.block.timestamp;
    require e2.block.timestamp < 2^40;
    
    // Second caller can be anyone
    require e2.msg.sender != 0;
    
    // Second claim attempt - should revert
    claimMainPrize@withrevert(e2);
    
    // The second claim must revert because the prize was already claimed
    assert lastReverted,
           "Should not be able to claim main prize twice in the same round";
} 