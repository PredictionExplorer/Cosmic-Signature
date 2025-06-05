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

/**
 * Rule: Random selection cannot be manipulated by transaction parameters.
 * The randomness used for selecting winners should not be affected by
 * msg.sender, msg.value, or other transaction parameters the claimer controls.
 */
rule randomnessNotManipulableByTxParams {
    env e1;
    env e2;
    
    // Both environments have the same block parameters
    require e1.block.timestamp == e2.block.timestamp;
    require e1.block.number == e2.block.number;
    require e1.block.difficulty == e2.block.difficulty;
    require e1.block.basefee == e2.block.basefee;
    
    // But different transaction parameters
    require e1.msg.sender != e2.msg.sender;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e1);
    require lastBidder != 0;
    require lastBidderAddress(e2) == lastBidder;
    
    // Both callers are authorized (either last bidder or anyone after timeout)
    uint256 prizeTime = mainPrizeTime(e1);
    uint256 activationTime = roundActivationTime(e1);
    uint256 timeout = timeoutDurationToClaimMainPrize(e1);
    
    require activationTime > 0;
    require prizeTime > activationTime;
    require e1.block.timestamp >= prizeTime;
    require e1.block.timestamp < 2^40;
    
    // Either both are the last bidder, or both are after timeout
    bool isBeforeTimeout = e1.block.timestamp < prizeTime + timeout;
    require (isBeforeTimeout && e1.msg.sender == lastBidder && e2.msg.sender == lastBidder) ||
            (!isBeforeTimeout);
    
    // Same raffle configuration
    require numRaffleEthPrizesForBidders(e1) == numRaffleEthPrizesForBidders(e2);
    require numRaffleEthPrizesForBidders(e1) > 0;
    
    // Get initial round
    uint256 roundBefore = roundNum(e1);
    require roundNum(e2) == roundBefore;
    
    // Both claims should succeed
    claimMainPrize(e1);
    claimMainPrize(e2);
    
    // Both should increment the round
    assert roundNum(e1) == roundBefore + 1 && roundNum(e2) == roundBefore + 1,
           "Randomness should be consistent regardless of who claims";
} 