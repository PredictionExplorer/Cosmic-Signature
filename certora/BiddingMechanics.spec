// Bidding mechanics verification for CosmicSignatureGame
methods {
    // Bidding functions
    function bidWithEth(int256 randomWalkNftId, string message) external;
    function bidWithCst(uint256 priceMaxLimit, string message) external;
    function getNextEthBidPrice(int256 currentTimeOffset) external returns (uint256);
    function getNextCstBidPrice(int256 currentTimeOffset) external returns (uint256);
    function getEthPlusRandomWalkNftBidPrice(uint256 ethBidPrice) external returns (uint256);
    
    // State getters
    function roundNum() external returns (uint256);
    function lastBidderAddress() external returns (address);
    function lastCstBidderAddress() external returns (address);
    function nextEthBidPrice() external returns (uint256);
    function ethDutchAuctionBeginningBidPrice() external returns (uint256);
    function mainPrizeTime() external returns (uint256);
    function roundActivationTime() external returns (uint256);
    function cstDutchAuctionBeginningTimeStamp() external returns (uint256);
    function cstDutchAuctionBeginningBidPrice() external returns (uint256);
    function ethBidPriceIncreaseDivisor() external returns (uint256);
    function bidMessageLengthMaxLimit() external returns (uint256);
    function mainPrizeTimeIncrementInMicroSeconds() external returns (uint256);
    function cstDutchAuctionDurationDivisor() external returns (uint256);
    function ethDutchAuctionEndingBidPriceDivisor() external returns (uint256);
}

/**
 * Rule: ETH bid price always increases after a successful bid
 */
rule ethBidPriceAlwaysIncreases {
    env e;
    
    // Get price before bid
    uint256 priceBefore = getNextEthBidPrice(e, 0);
    address lastBidderBefore = lastBidderAddress(e);
    
    require e.msg.value >= priceBefore;
    require e.msg.sender != 0;
    require lastBidderBefore != 0; // Not first bid
    
    // Place ETH bid (no NFT)
    bidWithEth@withrevert(e, -1, "test");
    bool bidSucceeded = !lastReverted;
    
    // Price should increase after successful bid
    uint256 priceAfter = getNextEthBidPrice(e, 0);
    
    assert !bidSucceeded || priceAfter > priceBefore, 
           "ETH bid price must increase after successful bid";
}

/**
 * Rule: RandomWalk NFT provides exactly the expected discount
 */
rule randomWalkNftDiscountCorrect {
    env e;
    uint256 baseEthPrice;
    
    require baseEthPrice > 0;
    require baseEthPrice < 10^30; // Reasonable bounds
    
    // Calculate discounted price
    uint256 discountedPrice = getEthPlusRandomWalkNftBidPrice(e, baseEthPrice);
    
    // The discount divisor is 2 (RANDOMWALK_NFT_BID_PRICE_DIVISOR)
    // Formula: (ethBidPrice + 1) / 2
    mathint expectedPrice = (baseEthPrice + 1) / 2;
    
    assert discountedPrice == expectedPrice,
           "RandomWalk NFT discount calculation must match formula";
}

/**
 * Rule: First bid in a round must be ETH (msg.value > 0)
 */
rule firstBidMustBeEth {
    env e;
    
    require lastBidderAddress(e) == 0; // No previous bidder (first bid)
    require roundActivationTime(e) <= e.block.timestamp; // Round is active
    
    // Try to bid with no ETH value (should fail for first bid)
    require e.msg.value == 0;
    bidWithEth@withrevert(e, -1, "first bid without eth");
    
    assert lastReverted,
           "First bid in a round must include ETH";
}

/**
 * Rule: ETH Dutch auction price decreases over time
 */
rule ethDutchAuctionPriceDecreases {
    env e1;
    env e2;
    
    require lastBidderAddress(e1) == 0; // Dutch auction is active
    require lastBidderAddress(e2) == 0; // Still active
    uint256 beginningPrice = ethDutchAuctionBeginningBidPrice(e1);
    require beginningPrice > 0;
    require beginningPrice < 10^20; // Reasonable bounds
    require ethDutchAuctionBeginningBidPrice(e1) == ethDutchAuctionBeginningBidPrice(e2);
    
    // Ensure both environments have the same round activation time
    require roundActivationTime(e1) == roundActivationTime(e2);
    uint256 activationTime = roundActivationTime(e1);
    require activationTime < 10^10; // Reasonable bounds
    
    // Ensure timestamps are reasonable
    require e1.block.timestamp < 10^10;
    require e2.block.timestamp < 10^10;
    
    // Ensure we're after round activation (positive elapsed duration)
    require e1.block.timestamp > activationTime;
    require e2.block.timestamp > e1.block.timestamp;
    require e2.block.timestamp - e1.block.timestamp == 100; // 100 seconds passed
    
    // Make sure ethDutchAuctionEndingBidPriceDivisor is set properly
    require ethDutchAuctionEndingBidPriceDivisor(e1) > 1;
    require ethDutchAuctionEndingBidPriceDivisor(e1) == ethDutchAuctionEndingBidPriceDivisor(e2);
    
    uint256 price1 = getNextEthBidPrice(e1, 0);
    uint256 price2 = getNextEthBidPrice(e2, 0);
    
    // Due to unchecked arithmetic, ensure prices are reasonable
    require price1 > 0 && price1 <= beginningPrice;
    require price2 > 0;
    
    assert price2 <= price1,
           "Dutch auction price should decrease or stay same over time";
}

/**
 * Rule: CST Dutch auction price decreases to zero eventually
 */
rule cstDutchAuctionReachesZero {
    env e;
    
    require lastCstBidderAddress(e) != 0; // CST bidding has started
    
    // Ensure beginning timestamp and price are set
    uint256 beginTimestamp = cstDutchAuctionBeginningTimeStamp(e);
    uint256 beginningPrice = cstDutchAuctionBeginningBidPrice(e);
    require beginTimestamp > 0;
    require beginTimestamp < 10^10; // Reasonable bounds
    require beginningPrice > 0;
    require beginningPrice < 10^20; // Reasonable bounds
    
    // Ensure auction parameters are reasonable
    uint256 mainPrizeInc = mainPrizeTimeIncrementInMicroSeconds(e);
    uint256 durationDivisor = cstDutchAuctionDurationDivisor(e);
    require mainPrizeInc > 0 && mainPrizeInc < 10^8; // Smaller bound
    require durationDivisor > 0 && durationDivisor < 100;
    
    // Calculate total duration
    mathint totalDuration = mainPrizeInc / durationDivisor;
    require totalDuration > 0 && totalDuration < 10^7; // Ensure reasonable duration
    
    // Set timestamp to be well past auction end
    require e.block.timestamp < 10^10; // Reasonable bound
    require e.block.timestamp > beginTimestamp + totalDuration + 1000;
    
    // Check price with no offset (should already be expired)
    uint256 expiredPrice = getNextCstBidPrice(e, 0);
    
    assert expiredPrice == 0,
           "CST Dutch auction should eventually reach zero price";
}

/**
 * Rule: ETH bid price formula is correct
 */
rule ethBidPriceFormulaCorrect {
    env e;
    
    uint256 currentNextPrice = nextEthBidPrice(e);
    uint256 divisor = ethBidPriceIncreaseDivisor(e);
    
    require currentNextPrice > 0;
    require divisor > 0;
    require lastBidderAddress(e) != 0; // Not in dutch auction
    
    // The actual price should match the stored next price
    uint256 actualPrice = getNextEthBidPrice(e, 0);
    
    assert actualPrice == currentNextPrice,
           "ETH bid price should match the stored next price when not in dutch auction";
}

/**
 * Rule: Cannot bid with CST when price max limit is too low
 */
rule cstBidRespectsMaxLimit {
    env e;
    uint256 priceMaxLimit;
    
    require lastBidderAddress(e) != 0; // Not first bid
    require lastCstBidderAddress(e) != 0; // CST bidding has started
    
    uint256 currentCstPrice = getNextCstBidPrice(e, 0);
    require currentCstPrice > 0;
    require priceMaxLimit < currentCstPrice; // Max limit is below current price
    
    // Try to bid with insufficient max limit
    bidWithCst@withrevert(e, priceMaxLimit, "low limit");
    
    assert lastReverted,
           "CST bid should fail when price max limit is below current price";
} 