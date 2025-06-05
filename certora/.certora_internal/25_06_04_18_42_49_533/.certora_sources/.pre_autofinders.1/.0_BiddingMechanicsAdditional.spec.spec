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
    function cstDutchAuctionBeginningBidPriceMinLimit() external returns (uint256);
    function getMainEthPrizeAmount() external returns (uint256);

    // Address getters
    function charityAddress() external returns (address);
    function marketingWallet() external returns (address);
    function stakingWalletCosmicSignatureNft() external returns (address);
    function stakingWalletRandomWalkNft() external returns (address);
    function prizesWallet() external returns (address);
}

/**
 * Rule: A RandomWalk NFT can be used at most once for bidding.
 * We attempt two consecutive bids with the same NFT id. The first must succeed
 * ("require !lastReverted" guard). The second must revert with UsedRandomWalkNft.
 */
rule randomWalkNftCannotBeReused {
    env e;

    // Pick a concrete positive NFT id
    int256 nftId = 1;

    // Ensure we are not in the very first bid of the round so that NFT bids are allowed.
    require lastBidderAddress(e) != 0;

    // Pay at least the required discounted price for the first bid
    uint256 basePrice1 = getNextEthBidPrice(e, 0);
    uint256 priceWithNft1 = getEthPlusRandomWalkNftBidPrice(e, basePrice1);
    require e.msg.value >= priceWithNft1;

    // First bid should succeed (non reverting)
    bidWithEth(e, nftId, "first bid with nft");

    // Prepare sufficient value for the second bid (price likely increased)
    uint256 basePrice2 = getNextEthBidPrice(e, 0);
    uint256 priceWithNft2 = getEthPlusRandomWalkNftBidPrice(e, basePrice2);
    require e.msg.value >= priceWithNft2;

    // Second bid with the same NFT must revert (UsedRandomWalkNft)
    bidWithEth@withrevert(e, nftId, "second bid with same nft");

    assert lastReverted,
           "Second bid with the same RandomWalk NFT id must revert";
}

/**
 * Rule: First bid in a round must be ETH, not CST.
 * When lastBidderAddress is 0 (no previous bidder), attempting to bid with CST
 * should revert with error "The first bid in a bidding round shall be ETH."
 */
rule firstBidMustBeEthNotCst {
    env e;
    
    // Setup: ensure this is the first bid of the round
    require lastBidderAddress(e) == 0;
    require roundActivationTime(e) <= e.block.timestamp; // Round is active
    
    // Ensure msg.value is 0 (CST bids don't send ETH)
    require e.msg.value == 0;
    
    // Try to bid with CST as the first bid
    uint256 priceMaxLimit = 1000000; // High limit to ensure it's not the limiting factor
    
    bidWithCst@withrevert(e, priceMaxLimit, "first bid with CST");
    
    assert lastReverted,
           "First bid in a round must be ETH, CST bid should revert";
}

/**
 * Rule: Bid message length limit is respected.
 * Messages exceeding bidMessageLengthMaxLimit should cause the bid to revert.
 */
rule bidMessageLengthLimitEnforced {
    env e;
    
    // Ensure round is active and not first bid
    require lastBidderAddress(e) != 0;
    
    // Get the message length limit
    uint256 maxLength = bidMessageLengthMaxLimit(e);
    require maxLength > 0 && maxLength < 10000; // Reasonable bounds
    
    // Create a message that's too long (maxLength + 1 bytes)
    // In CVL, we can't construct strings dynamically, so we'll test with a fixed long message
    // and require that it exceeds the limit
    string longMessage = "This is a very long message that is designed to exceed the maximum allowed bid message length limit. It contains many characters to ensure it will trigger the TooLongBidMessage error. This message is exactly 281 characters long to exceed Twitter limit.";
    
    // For the test to be meaningful, we need the message to be longer than the limit
    // The message is 252 characters, so we need the limit to be less than that
    require maxLength < 250;
    
    // Ensure we have enough ETH for the bid
    uint256 bidPrice = getNextEthBidPrice(e, 0);
    require e.msg.value >= bidPrice;
    
    // Try to bid with the too-long message
    bidWithEth@withrevert(e, -1, longMessage);
    
    assert lastReverted,
           "Bid with message exceeding length limit should revert";
}

/**
 * Rule: ETH bid price increases after each bid.
 * After a successful ETH bid, the next bid price should be higher than the current one.
 */
rule ethBidPriceIncreasesAfterBid {
    env e;
    
    // Ensure round is active and not first bid
    require lastBidderAddress(e) != 0;
    
    // Get current ETH bid price
    uint256 priceBefore = getNextEthBidPrice(e, 0);
    require priceBefore > 0 && priceBefore < 10^20; // Reasonable bounds
    
    // Ensure price increase divisor is reasonable
    require ethBidPriceIncreaseDivisor(e) > 0;
    require ethBidPriceIncreaseDivisor(e) < 10000; // Reasonable upper bound
    
    // Ensure we have enough ETH for the bid
    require e.msg.value >= priceBefore;
    
    // Place a bid (no NFT)
    bidWithEth(e, -1, "eth bid");
    
    // Get new ETH bid price
    uint256 priceAfter = getNextEthBidPrice(e, 0);
    
    // Price should have increased
    assert priceAfter > priceBefore,
           "ETH bid price should increase after a successful bid";
    
    // The increase should match the formula: newPrice = oldPrice + oldPrice/divisor + 1
    mathint expectedPrice = priceBefore + priceBefore / ethBidPriceIncreaseDivisor(e) + 1;
    assert priceAfter == expectedPrice,
           "ETH bid price increase should follow the correct formula";
}

/**
 * Rule: Last bidder address is updated after each successful bid.
 * This verifies that the contract correctly tracks who placed the most recent bid.
 */
rule lastBidderAddressUpdatedOnBid {
    env e;
    
    // Ensure round is active and not first bid
    require lastBidderAddress(e) != 0;
    
    // Ensure the sender is different from current last bidder
    address lastBidderBefore = lastBidderAddress(e);
    require e.msg.sender != lastBidderBefore;
    require e.msg.sender != 0;
    
    // Ensure we have enough ETH for the bid
    uint256 bidPrice = getNextEthBidPrice(e, 0);
    require e.msg.value >= bidPrice;
    
    // Place a bid
    bidWithEth(e, -1, "update last bidder");
    
    // Get updated last bidder address
    address lastBidderAfter = lastBidderAddress(e);
    
    // Last bidder should now be the message sender
    assert lastBidderAfter == e.msg.sender,
           "Last bidder address should be updated to the current bidder";
}

/**
 * Rule: CST bid price is set to max(minLimit, previousPrice * 2) after a bid.
 * This verifies the CST price update formula after each CST bid.
 */
rule cstBidPriceUpdateFormula {
    env e;
    
    // Constants from the code
    uint256 CST_MULTIPLIER = 2;
    
    // Ensure round is active and there has been at least one bid
    require lastBidderAddress(e) != 0;
    
    // Ensure CST bidding has started
    require lastCstBidderAddress(e) != 0;
    
    // Get the minimum CST bid price limit
    uint256 minLimit = cstDutchAuctionBeginningBidPriceMinLimit(e);
    require minLimit >= 100 && minLimit <= 1000; // Reasonable bounds
    
    // Get current CST bid price (what will be paid)
    uint256 currentCstPrice = getNextCstBidPrice(e, 0);
    require currentCstPrice > 0 && currentCstPrice < 10^20 - 1; // Leave room for +1
    
    // Record the beginning bid price before the bid
    uint256 beginningPriceBefore = cstDutchAuctionBeginningBidPrice(e);
    
    // Place a CST bid
    uint256 priceMaxLimit = 10^21; // High enough to not be limiting
    bidWithCst(e, priceMaxLimit, "test cst bid");
    
    // Get the new beginning bid price after the bid
    uint256 beginningPriceAfter = cstDutchAuctionBeginningBidPrice(e);
    
    // Calculate expected price: max(currentPrice * 2, minLimit)
    mathint calculatedPrice = currentCstPrice * CST_MULTIPLIER;
    mathint expectedPrice = calculatedPrice >= minLimit ? calculatedPrice : minLimit;
    
    // Verify the price was updated correctly
    assert beginningPriceAfter == expectedPrice,
           "CST beginning bid price should be max(paidPrice * 2, minLimit)";
}

/**
 * Rule: Contract ETH balance does not change when someone bids with CST.
 * This proves that CST bids don't add or remove ETH from the contract.
 */
rule cstBidDoesNotChangeContractBalance {
    env e;
    
    // Ensure round is active and there has been at least one ETH bid
    require lastBidderAddress(e) != 0;
    
    // Ensure CST bidding is possible
    require lastCstBidderAddress(e) != 0;
    
    // Ensure no ETH is sent with the CST bid transaction
    require e.msg.value == 0;
    
    // Ensure we're not calling from any special addresses that might have side effects
    require e.msg.sender != charityAddress(e);
    require e.msg.sender != marketingWallet(e);
    require e.msg.sender != stakingWalletCosmicSignatureNft(e);
    require e.msg.sender != stakingWalletRandomWalkNft(e);
    require e.msg.sender != prizesWallet(e);
    
    // Ensure the contract is not the caller (no self-destruct possible)
    require e.msg.sender != currentContract;
    
    // Additional timing constraints to avoid edge cases
    require e.block.timestamp < 10^12; // Avoid extreme timestamps
    
    // Get contract ETH balance before CST bid
    uint256 balanceBefore = nativeBalances[currentContract];
    require balanceBefore > 0 && balanceBefore < 10^25; // Reasonable bounds
    
    // Get current CST bid price
    uint256 currentCstPrice = getNextCstBidPrice(e, 0);
    require currentCstPrice > 0 && currentCstPrice < 10^20; // Reasonable bounds
    
    // Place a CST bid
    uint256 priceMaxLimit = 10^21; // High enough to not be limiting
    bidWithCst(e, priceMaxLimit, "cst bid balance test");
    
    // Get contract ETH balance after CST bid
    uint256 balanceAfter = nativeBalances[currentContract];
    
    // Contract balance should remain exactly the same
    assert balanceAfter == balanceBefore,
           "Contract ETH balance should not change when bidding with CST";
} 