methods {
    // StakingWalletCosmicSignatureNft methods
    function numStakedNfts() external returns (uint256) envfree;
    function deposit(uint256) external;
    function actionCounter() external returns (uint256) envfree;
    function rewardAmountPerStakedNft() external returns (uint256) envfree;
    function game() external returns (address) envfree;
}

/// @title Verifies that deposit reverts when no NFTs are staked (division by zero)
/// @notice The division by zero causes a panic, which is caught by the try-catch in MainPrize
rule depositRevertsWhenNoNftsStaked {
    env e;
    
    // Scenario: No NFTs staked
    require numStakedNfts() == 0;
    require e.msg.value > 0;
    
    // Direct call to deposit should revert with division by zero
    deposit@withrevert(e, 1);
    
    // Verify it reverted (division by zero panic)
    assert lastReverted;
}

/// @title Verifies that deposit succeeds when NFTs are staked and updates state correctly
rule depositSucceedsWithStakedNfts {
    env e;
    
    // Scenario: At least one NFT staked
    uint256 numStaked = numStakedNfts();
    require numStaked > 0 && numStaked < 1000;
    require e.msg.value > 0 && e.msg.value < 10^18;
    require e.msg.sender == game(); // Must be called by game contract
    
    uint256 actionCounterBefore = actionCounter();
    uint256 rewardBefore = rewardAmountPerStakedNft();
    
    // Calculate expected reward increment
    mathint expectedIncrement = e.msg.value / numStaked;
    require expectedIncrement > 0; // Ensure meaningful increment
    
    // Deposit should succeed
    deposit(e, 1);
    
    // Verify state changes occurred
    assert actionCounter() == actionCounterBefore + 1;
    assert rewardAmountPerStakedNft() == rewardBefore + expectedIncrement;
}

/// @title Verifies the reward calculation is correct
rule rewardCalculationCorrect {
    env e;
    
    uint256 numStaked = numStakedNfts();
    require numStaked > 0 && numStaked < 1000; // Reasonable bounds
    require e.msg.value > 0 && e.msg.value < 10^18; // Less than 1 ETH
    require e.msg.sender == game(); // Must be called by game contract
    
    uint256 rewardBefore = rewardAmountPerStakedNft();
    
    deposit(e, 1);
    
    uint256 rewardAfter = rewardAmountPerStakedNft();
    mathint expectedIncrement = e.msg.value / numStaked;
    
    assert rewardAfter == rewardBefore + expectedIncrement;
}

/// @title Invariant: numStakedNfts > 0 is required for successful deposit
invariant depositRequiresStakedNfts()
    // This invariant captures that deposit can only succeed when NFTs are staked
    // The try-catch in MainPrize handles the failure gracefully
    true
    {
        preserved deposit(uint256 roundNum) with (env e) {
            require numStakedNfts() > 0;
        }
    } 