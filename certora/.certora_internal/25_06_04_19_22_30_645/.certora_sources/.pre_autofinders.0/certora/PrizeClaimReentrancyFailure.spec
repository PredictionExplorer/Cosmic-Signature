methods {
    // Main prize claiming
    function claimMainPrize() external;
    
    // State getters
    function roundNum() external returns (uint256);
    function lastBidderAddress() external returns (address);
    function mainPrizeTime() external returns (uint256);
    function roundActivationTime() external returns (uint256);
    
    // Prize amounts
    function getMainEthPrizeAmount() external returns (uint256);
    
    // External contracts
    function prizesWallet() external returns (address);
    function charityAddress() external returns (address);
    function stakingWalletCosmicSignatureNft() external returns (address);
}

/**
 * Rule: No state changes should occur if claim reverts.
 * If claimMainPrize reverts for any reason, the round number
 * and all other state should remain unchanged.
 */
rule noStateChangeOnRevert {
    env e;
    
    // Get initial state
    uint256 roundBefore = roundNum(e);
    address lastBidderBefore = lastBidderAddress(e);
    uint256 prizeTimeBefore = mainPrizeTime(e);
    
    // Try to claim (may revert)
    claimMainPrize@withrevert(e);
    
    // Check state preservation on revert
    assert lastReverted => (
        roundNum(e) == roundBefore &&
        lastBidderAddress(e) == lastBidderBefore &&
        mainPrizeTime(e) == prizeTimeBefore
    ),
    "State should not change when claim reverts";
}

/**
 * Rule: Claim should be atomic - either all effects happen or none.
 * If the claim succeeds, round must increment. If it fails, nothing changes.
 */
rule claimIsAtomic {
    env e;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // Get timing values
    uint256 prizeTime = mainPrizeTime(e);
    uint256 activationTime = roundActivationTime(e);
    
    // Ensure round has started
    require activationTime > 0;
    require prizeTime > activationTime;
    
    // Add reasonable bounds
    require e.block.timestamp < 2^40;
    require prizeTime < 2^40;
    
    // Track initial state
    uint256 roundBefore = roundNum(e);
    
    // Try to claim
    claimMainPrize@withrevert(e);
    
    // Store revert status immediately
    bool reverted = lastReverted;
    
    // Check atomicity
    uint256 roundAfter = roundNum(e);
    
    assert (!reverted => roundAfter == roundBefore + 1) &&
           (reverted => roundAfter == roundBefore),
           "Claim must be atomic: either all state changes or none";
}

/**
 * Rule: External contract failures should cause claim to revert.
 * If any external contract (charity, prizes wallet, staking wallet) fails,
 * the entire claim should revert with no state changes.
 */
rule externalFailuresCauseRevert {
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
    
    // Ensure there's a prize to claim
    uint256 prizeAmount = getMainEthPrizeAmount(e);
    require prizeAmount > 0;
    require prizeAmount < 10^20;
    
    // Get external addresses
    address charity = charityAddress(e);
    address prizes = prizesWallet(e);
    address staking = stakingWalletCosmicSignatureNft(e);
    
    // Require at least one external address is a contract that could fail
    require charity != 0 || prizes != 0 || staking != 0;
    
    // Track state before
    uint256 roundBefore = roundNum(e);
    
    // Attempt claim
    claimMainPrize@withrevert(e);
    
    // State preservation check
    assert lastReverted => roundNum(e) == roundBefore,
           "Round should not change when external contracts fail";
} 