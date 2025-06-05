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
    
    // The discount divisor is 10 (RANDOMWALK_NFT_BID_PRICE_DIVISOR)
    // Formula: (ethBidPrice + 9) / 10
    mathint expectedPrice = (baseEthPrice + 9) / 10;
    
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
    require ethDutchAuctionBeginningBidPrice(e1) > 0;
    require e2.block.timestamp > e1.block.timestamp; // Time has passed
    require e2.block.timestamp - e1.block.timestamp == 100; // 100 seconds passed
    
    uint256 price1 = getNextEthBidPrice(e1, 0);
    uint256 price2 = getNextEthBidPrice(e2, 0);
    
    assert price2 <= price1,
           "Dutch auction price should decrease or stay same over time";
}

/**
 * Rule: CST Dutch auction price decreases to zero eventually
 */
rule cstDutchAuctionReachesZero {
    env e;
    
    require lastCstBidderAddress(e) != 0; // CST bidding has started
    require cstDutchAuctionBeginningBidPrice(e) > 0;
    
    // Check price far in the future (large positive offset)
    uint256 futureCstPrice = getNextCstBidPrice(e, 1000000);
    
    assert futureCstPrice == 0,
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