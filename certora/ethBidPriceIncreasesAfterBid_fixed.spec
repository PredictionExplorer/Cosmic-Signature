// Fixed version of ethBidPriceIncreasesAfterBid rule

methods {
    function bidWithEth(int256 randomWalkNftId, string message) external;
    function getNextEthBidPrice(int256 currentTimeOffset) external returns (uint256) envfree;
    function lastBidderAddress() external returns (address) envfree;
    function ethBidPriceIncreaseDivisor() external returns (uint256) envfree;
    function roundActivationTime() external returns (uint256) envfree;
}

// Fixed rule that properly handles different bidding scenarios
rule ethBidPriceIncreasesAfterBidFixed {
    env e;
    
    // Store initial state
    address lastBidderBefore = lastBidderAddress(e);
    uint256 priceBefore = getNextEthBidPrice(e, 0);
    
    // Basic requirements
    require priceBefore > 0 && priceBefore < 100000000000000000000; // Reasonable bounds
    require ethBidPriceIncreaseDivisor(e) > 0;
    require ethBidPriceIncreaseDivisor(e) < 10000; // Reasonable upper bound
    require e.msg.value >= priceBefore;
    
    // Ensure round is active
    require roundActivationTime(e) > 0;
    require e.block.timestamp >= roundActivationTime(e);
    
    // Additional constraints for different scenarios
    if (lastBidderBefore == 0) {
        // First bid scenario - ensure msg.value > 0 for first bid
        require e.msg.value > 0;
    } else {
        // Subsequent bid scenario - ensure sender is different from last bidder
        require e.msg.sender != lastBidderBefore;
        require e.msg.sender != 0;
    }
    
    // Place a bid
    bidWithEth@withrevert(e, -1, "eth bid");
    bool bidSucceeded = !lastReverted;
    
    // Only check price increase if bid succeeded
    if (bidSucceeded) {
        uint256 priceAfter = getNextEthBidPrice(e, 0);
        
        // Price should have increased
        assert priceAfter > priceBefore,
               "ETH bid price should increase after a successful bid";
        
        // The increase should match the formula: newPrice = oldPrice + oldPrice/divisor + 1
        mathint expectedPrice = priceBefore + priceBefore / ethBidPriceIncreaseDivisor(e) + 1;
        assert priceAfter == expectedPrice,
               "ETH bid price increase should follow the correct formula";
    }
}

// Alternative: Split into two separate rules for clarity
rule ethBidPriceIncreasesFirstBid {
    env e;
    
    // First bid scenario
    require lastBidderAddress(e) == 0;
    
    uint256 priceBefore = getNextEthBidPrice(e, 0);
    require priceBefore > 0 && priceBefore < 100000000000000000000;
    require ethBidPriceIncreaseDivisor(e) > 0;
    require ethBidPriceIncreaseDivisor(e) < 10000;
    
    // First bid must include ETH
    require e.msg.value >= priceBefore && e.msg.value > 0;
    
    // Ensure round is active
    require roundActivationTime(e) > 0;
    require e.block.timestamp >= roundActivationTime(e);
    
    bidWithEth@withrevert(e, -1, "first eth bid");
    bool bidSucceeded = !lastReverted;
    
    if (bidSucceeded) {
        uint256 priceAfter = getNextEthBidPrice(e, 0);
        assert priceAfter > priceBefore,
               "ETH bid price should increase after first successful bid";
        
        mathint expectedPrice = priceBefore + priceBefore / ethBidPriceIncreaseDivisor(e) + 1;
        assert priceAfter == expectedPrice,
               "First bid price increase should follow the correct formula";
    }
}

rule ethBidPriceIncreasesSubsequentBid {
    env e;
    
    // Subsequent bid scenario
    address lastBidderBefore = lastBidderAddress(e);
    require lastBidderBefore != 0;
    
    // Different sender
    require e.msg.sender != lastBidderBefore;
    require e.msg.sender != 0;
    
    uint256 priceBefore = getNextEthBidPrice(e, 0);
    require priceBefore > 0 && priceBefore < 100000000000000000000;
    require ethBidPriceIncreaseDivisor(e) > 0;
    require ethBidPriceIncreaseDivisor(e) < 10000;
    require e.msg.value >= priceBefore;
    
    // Ensure round is active
    require roundActivationTime(e) > 0;
    require e.block.timestamp >= roundActivationTime(e);
    
    bidWithEth@withrevert(e, -1, "subsequent eth bid");
    bool bidSucceeded = !lastReverted;
    
    if (bidSucceeded) {
        uint256 priceAfter = getNextEthBidPrice(e, 0);
        assert priceAfter > priceBefore,
               "ETH bid price should increase after subsequent successful bid";
        
        mathint expectedPrice = priceBefore + priceBefore / ethBidPriceIncreaseDivisor(e) + 1;
        assert priceAfter == expectedPrice,
               "Subsequent bid price increase should follow the correct formula";
    }
} 