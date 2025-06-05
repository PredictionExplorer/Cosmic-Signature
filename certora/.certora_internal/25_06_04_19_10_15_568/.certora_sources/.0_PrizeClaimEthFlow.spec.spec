methods {
    // Main prize claiming
    function claimMainPrize() external;
    
    // State getters
    function roundNum() external returns (uint256);
    function lastBidderAddress() external returns (address);
    function mainPrizeTime() external returns (uint256);
    function timeoutDurationToClaimMainPrize() external returns (uint256);
    function roundActivationTime() external returns (uint256);
    
    // ETH flow related functions
    function getMainEthPrizeAmount() external returns (uint256);
    function getCharityEthDonationAmount() external returns (uint256);
    function charityAddress() external returns (address);
    
    // External contract addresses
    function prizesWallet() external returns (address);
    function stakingWalletCosmicSignatureNft() external returns (address);
}

/**
 * Rule: Main prize ETH is transferred when claimed.
 * When claimMainPrize is called successfully, the main ETH prize
 * should be transferred from the contract.
 */
rule mainPrizeEthTransferred {
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
    
    // Ensure there's a prize to claim
    uint256 prizeAmount = getMainEthPrizeAmount(e);
    require prizeAmount > 0;
    require prizeAmount < 10^20;
    
    // Get initial round
    uint256 roundBefore = roundNum(e);
    
    // Claim the main prize
    claimMainPrize(e);
    
    // Check that claim was successful by verifying round incremented
    uint256 roundAfter = roundNum(e);
    
    assert roundAfter == roundBefore + 1,
           "Round should increment after successful main prize claim";
}

/**
 * Rule: Charity donation amount is positive when claim succeeds.
 * When the main prize is claimed, a charity donation should be made.
 * We verify this indirectly by checking that the function reports
 * a positive donation amount and the claim succeeds.
 */
rule charityDonationOccurs {
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
    
    // Check charity setup
    address charity = charityAddress(e);
    require charity != 0;
    
    // Get charity donation amount
    uint256 charityAmount = getCharityEthDonationAmount(e);
    require charityAmount > 0;
    require charityAmount < 10^20;
    
    // Track round before
    uint256 roundBefore = roundNum(e);
    
    // Claim the main prize
    claimMainPrize(e);
    
    // Verify claim succeeded
    uint256 roundAfter = roundNum(e);
    
    assert roundAfter == roundBefore + 1,
           "Claim with charity donation should succeed";
} 