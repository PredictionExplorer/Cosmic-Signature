using RandomWalkNFT as randomWalkNft;

methods {
    function numStakedNfts() external returns (uint256) envfree;
    function stakeActionIds(uint256) external returns (uint256) envfree;
    function pickRandomStakerAddressesIfPossible(uint256, uint256) external returns (address[]) envfree;
    // We declare stake/unstake but don't need them for these rules
    function stake(uint256) external;
    function unstake(uint256) external;
    function usedNfts(uint256) external returns (uint256) envfree;
    
    // NFT helper
    function randomWalkNft.ownerOf(uint256) external returns (address) envfree;
}

/// -----------------------------------------------------------------------------
/// Safety properties around pickRandomStakerAddressesIfPossible
/// -----------------------------------------------------------------------------

/// Rule 1: Handles zero-stake case without reverting and returns an empty array
rule randomSelectionHandlesZeroStaked {
    require numStakedNfts() == 0;
    uint256 numRequested;
    uint256 seed;
    address[] result = pickRandomStakerAddressesIfPossible(numRequested, seed);
    assert result.length == 0;
}

/// Rule 2: When NFTs are staked, the function returns exactly the requested count
rule randomSelectionReturnsRequestedCount {
    uint256 staked = numStakedNfts();
    require staked > 0 && staked < 50;          // avoid huge unrolling
    uint256 numRequested;
    require numRequested > 0 && numRequested < 10;
    uint256 seed;
    address[] result = pickRandomStakerAddressesIfPossible(numRequested, seed);
    assert result.length == numRequested;
}

/// Rule 3: Maximum seed and non-zero stake doesn't overflow / revert
rule randomSelectionOverflowSafety {
    require numStakedNfts() > 0;
    uint256 seed = max_uint256;
    uint256 numRequested = 1;
    address[] result = pickRandomStakerAddressesIfPossible(numRequested, seed);
    assert result.length == numRequested;
}

/// Rule 4: Empty request (numRequested == 0) always returns empty array (regardless of stake count)
rule emptyArrayRequest {
    uint256 numRequested = 0;
    uint256 seed;
    address[] result = pickRandomStakerAddressesIfPossible(numRequested, seed);
    assert result.length == 0;
}

/// Rule 5: No division-by-zero path when no NFTs are staked and numRequested > 0
rule noDivisionByZeroInRewards {
    env e;
    require numStakedNfts() == 0;
    uint256 numRequested = 1;
    uint256 seed = 12345;
    address[] result = pickRandomStakerAddressesIfPossible(numRequested, seed);
    assert result.length == 0;
}

/// Rule 6: Modulo logic works when exactly one NFT is staked (no vacuity)
rule randomSelectionModuloSafety {
    env e;
    uint256 nftId;

    // --- Set-up ---
    require randomWalkNft.ownerOf(nftId) == e.msg.sender; // caller owns NFT
    require usedNfts(nftId) == 0;                        // NFT not yet staked

    stake(e, nftId);                                     // now exactly one staked NFT
    require numStakedNfts() == 1;

    // --- Test action ---
    uint256 numRequested = 5; // more than the available stakers
    uint256 seed;             // unconstrained seed

    address[] result = pickRandomStakerAddressesIfPossible(numRequested, seed);

    // --- Post-conditions ---
    assert result.length == numRequested;
    // All returned addresses must be the single staker (duplicates allowed)
    assert result[0] == e.msg.sender;
    assert result[4] == e.msg.sender;
} 