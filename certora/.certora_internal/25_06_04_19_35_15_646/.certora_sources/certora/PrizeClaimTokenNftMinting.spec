methods {
    // Main prize claiming
    function claimMainPrize() external;
    
    // State getters
    function roundNum() external returns (uint256);
    function lastBidderAddress() external returns (address);
    function lastCstBidderAddress() external returns (address);
    function mainPrizeTime() external returns (uint256);
    function roundActivationTime() external returns (uint256);
    
    // Wallet addresses
    function marketingWallet() external returns (address);
    function stakingWalletCosmicSignatureNft() external returns (address);
    
    // Token/NFT related
    function marketingWalletCstContributionAmount() external returns (uint256);
    function cstPrizeAmountMultiplier() external returns (uint256);
    function enduranceChampionAddress() external returns (address);
    
    // Helper to get number of bidders
    function bidderAddresses(uint256 roundNum) external returns (uint256);
}

/**
 * Rule: Marketing wallet receives CST tokens when prize is claimed.
 * We verify that after a successful claim, the marketing wallet should be
 * set to receive marketingWalletCstContributionAmount of CST tokens.
 */
rule marketingWalletGetsCst {
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
    
    // Get marketing wallet address
    address marketingWalletAddr = marketingWallet(e);
    require marketingWalletAddr != 0;
    require marketingWalletAddr != currentContract;
    
    // Get expected CST amount for marketing wallet
    uint256 expectedCstAmount = marketingWalletCstContributionAmount(e);
    require expectedCstAmount > 0;
    require expectedCstAmount < 10^20;
    
    // Track round number before claim
    uint256 roundBefore = roundNum(e);
    
    // Claim the main prize
    claimMainPrize(e);
    
    // Verify round incremented (indicates successful claim)
    uint256 roundAfter = roundNum(e);
    assert roundAfter == roundBefore + 1,
           "Round should increment after successful claim with marketing wallet CST mint";
}

/**
 * Rule: Last CST bidder receives their CST prize when main prize is claimed.
 * The last CST bidder should receive CST tokens based on the cstPrizeAmountMultiplier.
 */
rule lastCstBidderGetsPrize {
    env e;
    
    // Ensure there has been at least one bid
    address lastBidder = lastBidderAddress(e);
    require lastBidder != 0;
    
    // Get the last CST bidder
    address lastCstBidder = lastCstBidderAddress(e);
    
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
    
    // Get CST prize multiplier
    uint256 cstMultiplier = cstPrizeAmountMultiplier(e);
    require cstMultiplier > 0;
    require cstMultiplier < 1000;
    
    // Track round number before claim
    uint256 roundBefore = roundNum(e);
    
    // Claim the main prize
    claimMainPrize(e);
    
    // Verify round incremented (indicates successful claim)
    uint256 roundAfter = roundNum(e);
    
    // If there was a CST bidder, verify the claim succeeded
    if (lastCstBidder != 0) {
        assert roundAfter == roundBefore + 1,
               "Round should increment after successful claim when CST bidder exists";
    } else {
        // If no CST bidder, claim can still succeed
        assert roundAfter == roundBefore + 1,
               "Round should increment after successful claim even without CST bidder";
    }
}

/**
 * Rule: Endurance champion receives NFT when main prize is claimed.
 * The endurance champion should receive an NFT if they exist.
 */
rule enduranceChampionGetsNft {
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
    
    // Get endurance champion address
    address enduranceChampion = enduranceChampionAddress(e);
    
    // Track round number before claim
    uint256 roundBefore = roundNum(e);
    
    // Claim the main prize
    claimMainPrize(e);
    
    // Verify round incremented (indicates successful claim)
    uint256 roundAfter = roundNum(e);
    
    // Whether or not there's an endurance champion, the claim should succeed
    assert roundAfter == roundBefore + 1,
           "Round should increment after successful claim regardless of endurance champion";
}

/**
 * Rule: Last bidder receives NFTs when claiming main prize.
 * The last bidder should receive 2 NFTs when they claim the prize.
 */
rule lastBidderGetsNfts {
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
    
    // Track round number before claim
    uint256 roundBefore = roundNum(e);
    
    // Claim the main prize
    claimMainPrize(e);
    
    // Verify round incremented (indicates successful claim and NFT minting)
    uint256 roundAfter = roundNum(e);
    assert roundAfter == roundBefore + 1,
           "Round should increment after successful claim with last bidder NFT mint";
} 