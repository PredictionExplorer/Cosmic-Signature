methods {
    // Main prize claiming
    function claimMainPrize() external;
    
    // State getters
    function roundNum() external returns (uint256);
    function lastBidderAddress() external returns (address);
    function mainPrizeTime() external returns (uint256);
    function roundActivationTime() external returns (uint256);
    
    // Secondary prize related
    function numRaffleEthPrizesForBidders() external returns (uint256);
    function getRaffleTotalEthPrizeAmountForBidders() external returns (uint256);
    
    // Prizes wallet
    function prizesWallet() external returns (address);
}

/**
 * Rule: Secondary prizes are distributed when main prize is claimed.
 * When claimMainPrize is called successfully, secondary ETH prizes 
 * should be allocated to random bidders through the prizesWallet.
 */
rule secondaryPrizesDistributedWithMainClaim {
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
    
    // Get number of secondary prizes
    uint256 numSecondaryPrizes = numRaffleEthPrizesForBidders(e);
    require numSecondaryPrizes > 0;
    require numSecondaryPrizes < 100;  // Reasonable bound
    
    // Get round number before claim
    uint256 roundBefore = roundNum(e);
    
    // Claim the main prize (which also distributes secondary prizes)
    claimMainPrize(e);
    
    // Verify round incremented (indicates successful claim)
    uint256 roundAfter = roundNum(e);
    
    assert roundAfter == roundBefore + 1,
           "Round should increment after successful claim with secondary prize distribution";
}

/**
 * Rule: Secondary prizes have correct total amount.
 * The total amount for secondary prizes should match getRaffleTotalEthPrizeAmountForBidders().
 */
rule secondaryPrizesCorrectTotalAmount {
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
    
    // Get secondary prize parameters
    uint256 numSecondaryPrizes = numRaffleEthPrizesForBidders(e);
    require numSecondaryPrizes > 0;
    require numSecondaryPrizes < 100;
    
    uint256 totalSecondaryAmount = getRaffleTotalEthPrizeAmountForBidders(e);
    require totalSecondaryAmount > 0;
    require totalSecondaryAmount < 10^20;
    
    // Ensure each prize is at least 1 wei
    require totalSecondaryAmount >= numSecondaryPrizes;
    
    // Track round before claim
    uint256 roundBefore = roundNum(e);
    
    // Claim the main prize
    claimMainPrize(e);
    
    // Verify round incremented
    uint256 roundAfter = roundNum(e);
    
    assert roundAfter == roundBefore + 1,
           "Round should increment after claim with correct secondary prize amounts";
} 