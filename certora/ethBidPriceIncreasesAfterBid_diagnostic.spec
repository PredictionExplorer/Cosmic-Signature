// Diagnostic specification for ethBidPriceIncreasesAfterBid rule

methods {
    function bidWithEth(int256 randomWalkNftId, string message) external;
    function getNextEthBidPrice(int256 currentTimeOffset_) external returns (uint256) envfree;
    function lastBidderAddress() external returns (address) envfree;
    function ethBidPriceIncreaseDivisor() external returns (uint256) envfree;
}

// Test 1: Check if we can have a non-zero lastBidderAddress
rule canHaveLastBidder {
    address lastBidder = lastBidderAddress();
    
    // Just check if it's possible to have a non-zero last bidder
    satisfy lastBidder != 0;
}

// Test 2: Check if ethBidPriceIncreaseDivisor can be in valid range
rule canHaveValidDivisor {
    uint256 divisor = ethBidPriceIncreaseDivisor();
    
    // Check if divisor can be in the range we expect
    satisfy divisor > 0 && divisor < 10000;
}

// Test 3: Check if we can get a reasonable ETH bid price when there's a bidder
rule canGetReasonablePrice {
    require lastBidderAddress() != 0;
    uint256 price = getNextEthBidPrice(0);
    
    // Check if price can be in reasonable range when there's already a bidder
    satisfy price > 0 && price < 100000000000000000000;
}

// Test 4: Check if bid can succeed with all preconditions
rule canBidSucceed {
    env e;
    
    require lastBidderAddress() != 0;
    uint256 priceBefore = getNextEthBidPrice(0);
    require priceBefore > 0 && priceBefore < 100000000000000000000;
    require ethBidPriceIncreaseDivisor() > 0;
    require ethBidPriceIncreaseDivisor() < 10000;
    require e.msg.value >= priceBefore;
    
    bidWithEth@withrevert(e, -1, "eth bid");
    
    // Check if it's possible for the bid to succeed
    satisfy !lastReverted;
}

// Test 5: Simplified version without the lastBidderAddress requirement
rule ethBidPriceIncreasesSimplified {
    env e;
    
    // Don't require a previous bidder - allow first bid scenario
    // require lastBidderAddress() != 0;  // REMOVED
    
    uint256 priceBefore = getNextEthBidPrice(0);
    require priceBefore > 0 && priceBefore < 100000000000000000000;
    
    require ethBidPriceIncreaseDivisor() > 0;
    require ethBidPriceIncreaseDivisor() < 10000;
    
    require e.msg.value >= priceBefore;
    
    bidWithEth@withrevert(e, -1, "eth bid");
    bool bidSucceeded = !lastReverted;
    
    if (bidSucceeded) {
        uint256 priceAfter = getNextEthBidPrice(0);
        
        assert priceAfter > priceBefore,
               "ETH bid price should increase after a successful bid";
        
        mathint expectedPrice = priceBefore + priceBefore / ethBidPriceIncreaseDivisor() + 1;
        assert priceAfter == expectedPrice,
               "ETH bid price increase should follow the correct formula";
    } else {
        // If bid failed, we still need to end with assert/satisfy
        assert true, "Bid can fail under certain conditions";
    }
}

// Test 6: Check what happens when round is just starting
rule ethBidPriceFirstBidScenario {
    env e;
    
    // Explicitly test first bid scenario
    require lastBidderAddress() == 0;  // No previous bidder
    
    uint256 priceBefore = getNextEthBidPrice(0);
    require priceBefore > 0 && priceBefore < 100000000000000000000;
    
    require ethBidPriceIncreaseDivisor() > 0;
    require ethBidPriceIncreaseDivisor() < 10000;
    
    require e.msg.value >= priceBefore;
    
    bidWithEth@withrevert(e, -1, "eth bid");
    bool bidSucceeded = !lastReverted;
    
    if (bidSucceeded) {
        uint256 priceAfter = getNextEthBidPrice(0);
        
        assert priceAfter > priceBefore,
               "ETH bid price should increase after first successful bid";
    } else {
        // If bid failed, we still need to end with assert/satisfy
        assert true, "First bid can fail under certain conditions";
    }
} 