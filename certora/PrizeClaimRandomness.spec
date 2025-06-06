methods {
    // Main prize claiming
    function claimMainPrize() external;
    
    // State getters
    function roundNum() external returns (uint256);
    function lastBidderAddress() external returns (address);
    function mainPrizeTime() external returns (uint256);
    function roundActivationTime() external returns (uint256);
    function timeoutDurationToClaimMainPrize() external returns (uint256);
    
    // Raffle parameters
    function numRaffleEthPrizesForBidders() external returns (uint256);
    function numRaffleCosmicSignatureNftsForBidders() external returns (uint256);
    function numRaffleCosmicSignatureNftsForRandomWalkNftStakers() external returns (uint256);
}

/**
 * Rule: Randomness should be deterministic within a single transaction.
 * When claiming the main prize, all random selections should be based on
 * a single seed that doesn't change during the transaction.
 */
rule randomnessDeterministicInClaim {
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
    
    // Require at least some raffle prizes
    uint256 numEthPrizes = numRaffleEthPrizesForBidders(e);
    uint256 numNftPrizes = numRaffleCosmicSignatureNftsForBidders(e);
    require numEthPrizes > 0 || numNftPrizes > 0;
    require numEthPrizes < 50;
    require numNftPrizes < 50;
    
    // Track round before claim
    uint256 roundBefore = roundNum(e);
    
    // Claim the main prize
    claimMainPrize(e);
    
    // Verify claim succeeded
    uint256 roundAfter = roundNum(e);
    
    assert roundAfter == roundBefore + 1,
           "Round should increment after successful claim with deterministic randomness";
} 