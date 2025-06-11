// Diagnostic specification for ethBidPriceIncreasesAfterBid rule

methods {
    function bidWithEth(int256 randomWalkNftId, string message) external;
    function getNextEthBidPrice(int256 currentTimeOffset) external returns (uint256) envfree;
    function lastBidderAddress() external returns (address) envfree;
    function ethBidPriceIncreaseDivisor() external returns (uint256) envfree;
}

// Test 1: Check if we can have a non-zero lastBidderAddress
rule canHaveLastBidder {
    env e;
    address lastBidder = lastBidderAddress(e);
    
    // Just check if it's possible to have a non-zero last bidder
    satisfy lastBidder != 0;
}

// Test 2: Check if ethBidPriceIncreaseDivisor can be in valid range
rule canHaveValidDivisor {
    env e;
    uint256 divisor = ethBidPriceIncreaseDivisor(e);
    
    // Check if divisor can be in the range we expect
    satisfy divisor > 0 && divisor < 10000;
}

// Test 3: Check if we can get a reasonable ETH bid price when there's a bidder
rule canGetReasonablePrice {
    env e;
    
    require lastBidderAddress(e) != 0;
    uint256 price = getNextEthBidPrice(e, 0);
    
    // Check if price can be in reasonable range when there's already a bidder
    satisfy price > 0 && price < 100000000000000000000;
}

// Test 4: Check if bid can succeed with all preconditions
rule canBidSucceed {
    env e;
    
    require lastBidderAddress(e) != 0;
    uint256 priceBefore = getNextEthBidPrice(e, 0);
    require priceBefore > 0 && priceBefore < 100000000000000000000;
    require ethBidPriceIncreaseDivisor(e) > 0;
    require ethBidPriceIncreaseDivisor(e) < 10000;
    require e.msg.value >= priceBefore;
    
    bidWithEth@withrevert(e, -1, "eth bid");
    
    // Check if it's possible for the bid to succeed
    satisfy !lastReverted;
}

// Test 5: Simplified version without the lastBidderAddress requirement
rule ethBidPriceIncreasesSimplified {
    env e;
    
    // Don't require a previous bidder - allow first bid scenario
    // require lastBidderAddress(e) != 0;  // REMOVED
    
    uint256 priceBefore = getNextEthBidPrice(e, 0);
    require priceBefore > 0 && priceBefore < 100000000000000000000;
    
    require ethBidPriceIncreaseDivisor(e) > 0;
    require ethBidPriceIncreaseDivisor(e) < 10000;
    
    require e.msg.value >= priceBefore;
    
    bidWithEth@withrevert(e, -1, "eth bid");
    bool bidSucceeded = !lastReverted;
    
    if (bidSucceeded) {
        uint256 priceAfter = getNextEthBidPrice(e, 0);
        
        assert priceAfter > priceBefore,
               "ETH bid price should increase after a successful bid";
        
        mathint expectedPrice = priceBefore + priceBefore / ethBidPriceIncreaseDivisor(e) + 1;
        assert priceAfter == expectedPrice,
               "ETH bid price increase should follow the correct formula";
    }
}

// Test 6: Check what happens when round is just starting
rule ethBidPriceFirstBidScenario {
    env e;
    
    // Explicitly test first bid scenario
    require lastBidderAddress(e) == 0;  // No previous bidder
    
    uint256 priceBefore = getNextEthBidPrice(e, 0);
    require priceBefore > 0 && priceBefore < 100000000000000000000;
    
    require ethBidPriceIncreaseDivisor(e) > 0;
    require ethBidPriceIncreaseDivisor(e) < 10000;
    
    require e.msg.value >= priceBefore;
    
    bidWithEth@withrevert(e, -1, "eth bid");
    bool bidSucceeded = !lastReverted;
    
    if (bidSucceeded) {
        uint256 priceAfter = getNextEthBidPrice(e, 0);
        
        assert priceAfter > priceBefore,
               "ETH bid price should increase after first successful bid";
    }
} 