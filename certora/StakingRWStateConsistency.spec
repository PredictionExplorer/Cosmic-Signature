using RandomWalkNFT as randomWalkNft;

methods {
    // StakingWalletRandomWalkNft core methods
    function numStakedNfts() external returns (uint256) envfree;
    function actionCounter() external returns (uint256) envfree;
    function stakeActions(uint256) external returns (uint256, address, uint256) envfree;
    function stakeActionIds(uint256) external returns (uint256) envfree;
    function usedNfts(uint256) external returns (uint256) envfree;
    
    // Stake/unstake operations
    function stake(uint256) external;
    function unstake(uint256) external;
    function unstakeMany(uint256[]) external;
    function stakeMany(uint256[]) external;
    
    // RandomWalkNFT methods
    function randomWalkNft.ownerOf(uint256) external returns (address) envfree;
    function randomWalkNft.transferFrom(address, address, uint256) external;
}

// Ghost mappings to track struct members
ghost mapping(uint256 => uint256) stakeActionNftIds;
ghost mapping(uint256 => address) stakeActionOwners;
ghost mapping(uint256 => uint256) stakeActionIndexes;

// Hooks to track struct members
hook Sload uint256 nftId stakeActions[KEY uint256 actionId].(offset 0) {
    require stakeActionNftIds[actionId] == nftId;
}

hook Sstore stakeActions[KEY uint256 actionId].(offset 0) uint256 nftId {
    stakeActionNftIds[actionId] = nftId;
}

hook Sload address owner stakeActions[KEY uint256 actionId].(offset 32) {
    require stakeActionOwners[actionId] == owner;
}

hook Sstore stakeActions[KEY uint256 actionId].(offset 32) address owner {
    stakeActionOwners[actionId] = owner;
}

hook Sload uint256 index stakeActions[KEY uint256 actionId].(offset 64) {
    require stakeActionIndexes[actionId] == index;
}

hook Sstore stakeActions[KEY uint256 actionId].(offset 64) uint256 index {
    stakeActionIndexes[actionId] = index;
}

/// @title Core invariant: For all valid indices, stakeActions[stakeActionIds[i]].index == i
/// @notice This ensures the two arrays are properly synchronized
invariant arraysSynchronized(uint256 i)
    i < numStakedNfts() => 
    (
        stakeActionIds(i) != 0 &&
        stakeActionIndexes[stakeActionIds(i)] == i
    )
{
    preserved stake(uint256 nftId) with (env e) {
        // Ensure the NFT hasn't been staked before
        require usedNfts(nftId) == 0;
        // Ensure caller owns the NFT
        require randomWalkNft.ownerOf(nftId) == e.msg.sender;
    }
    
    preserved unstake(uint256 stakeActionId) with (env e) {
        // Ensure valid stake action
        require stakeActionOwners[stakeActionId] == e.msg.sender;
        require stakeActionOwners[stakeActionId] != 0;
    }
}

/// @title Verifies that staking increases numStakedNfts by exactly 1
rule stakeIncreasesCount {
    env e;
    uint256 nftId;
    
    // Pre-conditions
    require usedNfts(nftId) == 0; // NFT not previously staked
    require randomWalkNft.ownerOf(nftId) == e.msg.sender; // Caller owns NFT
    
    uint256 countBefore = numStakedNfts();
    uint256 actionCounterBefore = actionCounter();
    
    stake(e, nftId);
    
    uint256 countAfter = numStakedNfts();
    uint256 actionCounterAfter = actionCounter();
    
    // Verify count increased by 1
    assert to_mathint(countAfter) == to_mathint(countBefore) + 1;
    // Verify action counter increased
    assert to_mathint(actionCounterAfter) == to_mathint(actionCounterBefore) + 1;
    // Verify NFT marked as used
    assert usedNfts(nftId) == 1;
}

/// @title Verifies that unstaking decreases numStakedNfts by exactly 1
rule unstakeDecreasesCount {
    env e;
    uint256 stakeActionId;
    
    // Pre-conditions
    require stakeActionOwners[stakeActionId] == e.msg.sender;
    require stakeActionOwners[stakeActionId] != 0; // Valid stake action
    require numStakedNfts() > 0; // At least one NFT staked
    
    uint256 countBefore = numStakedNfts();
    uint256 actionCounterBefore = actionCounter();
    
    unstake(e, stakeActionId);
    
    uint256 countAfter = numStakedNfts();
    uint256 actionCounterAfter = actionCounter();
    
    // Verify count decreased by 1
    assert to_mathint(countAfter) == to_mathint(countBefore) - 1;
    // Verify action counter increased
    assert to_mathint(actionCounterAfter) == to_mathint(actionCounterBefore) + 1;
    // Verify stake action cleared
    assert stakeActionOwners[stakeActionId] == 0;
}

/// @title Verifies the index swapping logic during unstake
rule unstakeSwapsCorrectly {
    env e;
    uint256 stakeActionId;
    
    // Pre-conditions
    uint256 numStakedBefore = numStakedNfts();
    require numStakedBefore > 1; // Need at least 2 NFTs for meaningful swap
    require stakeActionOwners[stakeActionId] == e.msg.sender;
    require stakeActionOwners[stakeActionId] != 0;
    
    uint256 indexToRemove = stakeActionIndexes[stakeActionId];
    mathint lastIndex = to_mathint(numStakedBefore) - 1;
    require lastIndex >= 0 && lastIndex < max_uint256;
    uint256 lastStakeActionId = stakeActionIds(require_uint256(lastIndex));
    
    // Special case: not removing the last element
    require to_mathint(indexToRemove) < lastIndex;
    
    unstake(e, stakeActionId);
    
    // After unstake, the last element should have moved to the removed position
    assert stakeActionIds(indexToRemove) == lastStakeActionId;
    assert stakeActionIndexes[lastStakeActionId] == indexToRemove;
}

/// @title Verifies unstakeMany processes all stake actions
rule unstakeManyProcessesAll {
    env e;
    uint256[] stakeActionIds;
    
    // Simplified case: 2 stake actions
    require stakeActionIds.length == 2;
    require stakeActionIds[0] != stakeActionIds[1]; // Different actions
    
    // Both must be owned by caller
    require stakeActionOwners[stakeActionIds[0]] == e.msg.sender;
    require stakeActionOwners[stakeActionIds[1]] == e.msg.sender;
    require stakeActionOwners[stakeActionIds[0]] != 0;
    require stakeActionOwners[stakeActionIds[1]] != 0;
    
    uint256 countBefore = numStakedNfts();
    require countBefore >= 2;
    
    unstakeMany(e, stakeActionIds);
    
    uint256 countAfter = numStakedNfts();
    
    // Both should be unstaked
    assert to_mathint(countAfter) == to_mathint(countBefore) - 2;
    assert stakeActionOwners[stakeActionIds[0]] == 0;
    assert stakeActionOwners[stakeActionIds[1]] == 0;
}

/// @title Edge case: Unstaking when only one NFT is staked
rule unstakeLastNft {
    env e;
    uint256 stakeActionId;
    
    // Exactly one NFT staked
    require numStakedNfts() == 1;
    require stakeActionOwners[stakeActionId] == e.msg.sender;
    require stakeActionOwners[stakeActionId] != 0;
    require stakeActionIds(0) == stakeActionId;
    
    unstake(e, stakeActionId);
    
    // Should result in empty staking
    assert numStakedNfts() == 0;
    assert stakeActionOwners[stakeActionId] == 0;
}

/// @title Verifies that double-staking same NFT is prevented
rule preventDoubleStaking {
    env e;
    uint256 nftId;
    
    // NFT already staked
    require usedNfts(nftId) == 1;
    
    // Attempt to stake again should revert
    stake@withrevert(e, nftId);
    
    assert lastReverted;
} 