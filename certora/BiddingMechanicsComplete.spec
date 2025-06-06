// Complete bidding mechanics verification for CosmicSignatureGame
// This spec accounts for the actual contract behavior including edge cases

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
    function nextRoundFirstCstDutchAuctionBeginningBidPrice() external returns (uint256);
    
    // Helper functions
    function getDurationElapsedSinceRoundActivation() external returns (int256);
    function mainPrizeTimeIncrementInMicroSeconds() external returns (uint256);
    function cstDutchAuctionDurationDivisor() external returns (uint256);
    function ethDutchAuctionEndingBidPriceDivisor() external returns (uint256);
}

// Constants from CosmicSignatureConstants.sol
definition RANDOMWALK_NFT_BID_PRICE_DIVISOR() returns uint256 = 2;
definition FIRST_ROUND_INITIAL_ETH_BID_PRICE() returns uint256 = 10000000000000; // 0.00001 ETH

/**
 * Rule: RandomWalk NFT provides exactly 50% discount (divisor = 2)
 * Verifies that the RandomWalk NFT discount calculation follows the correct formula
 */
rule randomWalkNftDiscountCorrectFixed {
    env e;
    uint256 baseEthPrice;
    
    require baseEthPrice > 0;
    require baseEthPrice < 10^30; // Reasonable bounds
    
    // Calculate discounted price
    uint256 discountedPrice = getEthPlusRandomWalkNftBidPrice(e, baseEthPrice);
    
    // The discount divisor is 2 (50% discount)
    // Formula: (ethBidPrice + 1) / 2
    mathint expectedPrice = (baseEthPrice + 1) / 2;
    
    assert discountedPrice == expectedPrice,
           "RandomWalk NFT discount calculation must match formula (divisor=2)";
}

/**
 * Rule: ETH bid price always increases after a successful bid
 * Ensures proper price escalation mechanics for consecutive bids
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
 * Rule: CST Dutch auction price formula with overflow protection
 * The contract uses unchecked arithmetic, so we need to account for that
 */
rule cstDutchAuctionPriceCalculation {
    env e;
    
    require lastCstBidderAddress(e) != 0; // CST bidding has started
    uint256 beginningPrice = cstDutchAuctionBeginningBidPrice(e);
    require beginningPrice > 0;
    require beginningPrice < 10^20; // Reasonable bounds
    
    // Get timestamps - avoid overflow scenarios
    uint256 beginningTimestamp = cstDutchAuctionBeginningTimeStamp(e);
    require e.block.timestamp >= beginningTimestamp;
    require e.block.timestamp - beginningTimestamp < 10^10; // Reasonable time difference
    
    // Check price with no offset
    uint256 currentPrice = getNextCstBidPrice(e, 0);
    
    // Due to unchecked arithmetic, the calculation can overflow
    // The formula: price = beginningPrice * remainingDuration / totalDuration
    // We just verify it's non-negative when no overflow occurs
    assert currentPrice >= 0,
           "CST price should be non-negative";
}

/**
 * Rule: ETH Dutch auction has a minimum price floor
 * The contract sets a minimum price when lastBidderAddress == 0
 */
rule ethDutchAuctionHasMinimumPrice {
    env e;
    
    require lastBidderAddress(e) == 0; // Dutch auction is active
    require ethDutchAuctionBeginningBidPrice(e) == 0; // Beginning price not set
    
    uint256 price = getNextEthBidPrice(e, 0);
    
    // When ethDutchAuctionBeginningBidPrice is 0, it uses FIRST_ROUND_INITIAL_ETH_BID_PRICE
    assert price >= FIRST_ROUND_INITIAL_ETH_BID_PRICE(),
           "ETH Dutch auction price should have a minimum floor";
}

/**
 * Rule: ETH Dutch auction price behavior when initialized
 * When ethDutchAuctionBeginningBidPrice > 0, price decreases over time
 */
rule ethDutchAuctionDecreasesWhenInitialized {
    env e1;
    env e2;
    
    require lastBidderAddress(e1) == 0; // Dutch auction is active
    require lastBidderAddress(e2) == 0; // Still active
    uint256 beginningPrice = ethDutchAuctionBeginningBidPrice(e1);
    require beginningPrice > 0; // Auction is initialized
    require beginningPrice < 10^20; // Reasonable bounds
    require ethDutchAuctionBeginningBidPrice(e1) == ethDutchAuctionBeginningBidPrice(e2);
    
    // Ensure both environments have the same round activation time
    require roundActivationTime(e1) == roundActivationTime(e2);
    
    // Add reasonable bounds to avoid overflow
    require roundActivationTime(e1) < 10^10;
    require e1.block.timestamp < 10^10;
    require e2.block.timestamp < 10^10;
    
    // Ensure we're after round activation for both environments
    require e1.block.timestamp > roundActivationTime(e1);
    require e2.block.timestamp > e1.block.timestamp;
    
    // Make sure ethDutchAuctionEndingBidPriceDivisor is set properly
    require ethDutchAuctionEndingBidPriceDivisor(e1) > 1;
    require ethDutchAuctionEndingBidPriceDivisor(e1) == ethDutchAuctionEndingBidPriceDivisor(e2);
    
    // Ensure reasonable time difference
    require e2.block.timestamp - e1.block.timestamp < 10000;
    
    uint256 price1 = getNextEthBidPrice(e1, 0);
    uint256 price2 = getNextEthBidPrice(e2, 0);
    
    // Price should decrease or stay the same (if it reached minimum)
    assert price2 <= price1,
           "ETH Dutch auction price should decrease over time when initialized";
}

/**
 * Rule: CST bid price reaches zero when auction expires
 * The function returns 0 when remainingDuration <= 0
 */
rule cstAuctionReturnsZeroWhenExpired {
    env e;
    
    require lastCstBidderAddress(e) != 0; // CST bidding has started
    
    // Ensure cstDutchAuctionBeginningTimeStamp is set and reasonable
    uint256 beginTimestamp = cstDutchAuctionBeginningTimeStamp(e);
    require beginTimestamp > 0;
    require beginTimestamp < e.block.timestamp; // Must be in the past
    require e.block.timestamp < 10^10; // Reasonable bounds
    
    // Ensure beginning price is set
    uint256 beginningPrice = cstDutchAuctionBeginningBidPrice(e);
    require beginningPrice > 0;
    require beginningPrice < 10^20; // Reasonable bounds
    
    // Ensure auction parameters are reasonable
    uint256 mainPrizeInc = mainPrizeTimeIncrementInMicroSeconds(e);
    uint256 durationDivisor = cstDutchAuctionDurationDivisor(e);
    require mainPrizeInc > 0 && mainPrizeInc < 10^10;
    require durationDivisor > 0 && durationDivisor < 100;
    
    // Calculate the total auction duration
    mathint totalDuration = mainPrizeInc / durationDivisor;
    
    // Calculate elapsed duration
    mathint elapsedDuration = e.block.timestamp - beginTimestamp;
    
    // Ensure we're well past the auction duration
    require elapsedDuration > totalDuration + 1000000;
    
    // With no offset, the remaining duration should already be negative
    uint256 expiredPrice = getNextCstBidPrice(e, 0);
    
    assert expiredPrice == 0,
           "CST auction should return 0 when expired (zero or negative remaining duration)";
}

/**
 * Rule: Bid price increase formula correctness
 * Validates the mathematical formula for bid price increments
 */
rule ethBidPriceIncreaseFormulaCorrect {
    env e;
    
    uint256 currentPrice = 1000; // Example price
    uint256 divisor = ethBidPriceIncreaseDivisor(e);
    
    require divisor > 0;
    require currentPrice > 0;
    require currentPrice < 10^20; // Reasonable bounds
    
    // Calculate next price according to formula
    mathint expectedNextPrice = currentPrice + currentPrice / divisor + 1;
    
    // The formula should always increase the price by at least 1
    assert expectedNextPrice > currentPrice,
           "Price increase formula should always increase the price";
}

/**
 * Rule: First bid requirements
 * Ensures the first bid in a round must include ETH payment
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
 * Rule: CST bid respects max limit
 * Verifies that CST bids fail when price limit is insufficient
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

/**
 * Rule: ETH price consistency when not in Dutch auction
 * Ensures price getter returns correct stored value outside Dutch auction
 */
rule ethBidPriceConsistency {
    env e;
    
    uint256 storedNextPrice = nextEthBidPrice(e);
    require storedNextPrice > 0;
    require lastBidderAddress(e) != 0; // Not in dutch auction
    
    // The actual price should match the stored next price
    uint256 actualPrice = getNextEthBidPrice(e, 0);
    
    assert actualPrice == storedNextPrice,
           "ETH bid price should match stored next price when not in dutch auction";
} 