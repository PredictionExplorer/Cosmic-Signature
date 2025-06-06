using RandomWalkNFT as randomWalkNft;

methods {
    // Core state getters
    function numStakedNfts() external returns (uint256) envfree;
    function actionCounter() external returns (uint256) envfree;
    function stakeActions(uint256) external returns (uint256, address, uint256) envfree;
    function stakeActionIds(uint256) external returns (uint256) envfree;
    function usedNfts(uint256) external returns (uint256) envfree;
    
    // Operations
    function stake(uint256) external;
    function unstake(uint256) external;
    
    // NFT operations
    function randomWalkNft.ownerOf(uint256) external returns (address) envfree;
    function randomWalkNft.transferFrom(address, address, uint256) external returns (bool);
}

// Ghost state to track stake action fields
ghost mapping(uint256 => uint256) ghostNftIds;
ghost mapping(uint256 => address) ghostOwners;
ghost mapping(uint256 => uint256) ghostIndexes;

// Hooks to synchronize ghost state with actual storage
hook Sload uint256 nftId stakeActions[KEY uint256 id].(offset 0) {
    require ghostNftIds[id] == nftId;
}

hook Sstore stakeActions[KEY uint256 id].(offset 0) uint256 nftId {
    ghostNftIds[id] = nftId;
}

hook Sload address owner stakeActions[KEY uint256 id].(offset 32) {
    require ghostOwners[id] == owner;
}

hook Sstore stakeActions[KEY uint256 id].(offset 32) address owner {
    ghostOwners[id] = owner;
}

hook Sload uint256 index stakeActions[KEY uint256 id].(offset 64) {
    require ghostIndexes[id] == index;
}

hook Sstore stakeActions[KEY uint256 id].(offset 64) uint256 index {
    ghostIndexes[id] = index;
}

/// @title Verifies that numStakedNfts accurately reflects the number of active stakes
rule numStakedNftsAccuracy {
    env e;
    uint256 nftId;
    
    // Setup: NFT not previously used and owned by caller
    require usedNfts(nftId) == 0;
    require randomWalkNft.ownerOf(nftId) == e.msg.sender;
    
    uint256 countBefore = numStakedNfts();
    
    stake(e, nftId);
    
    uint256 countAfter = numStakedNfts();
    
    // Must increase by exactly 1
    assert countAfter == require_uint256(countBefore + 1);
}

/// @title Verifies actionCounter monotonically increases
rule actionCounterMonotonic {
    env e;
    uint256 nftId;
    
    require usedNfts(nftId) == 0;
    require randomWalkNft.ownerOf(nftId) == e.msg.sender;
    
    uint256 counterBefore = actionCounter();
    
    stake(e, nftId);
    
    uint256 counterAfter = actionCounter();
    
    // Counter must increase
    assert counterAfter > counterBefore;
}

/// @title Verifies that staking creates valid stake action
rule stakeCreatesValidAction {
    env e;
    uint256 nftId;
    
    require usedNfts(nftId) == 0;
    require randomWalkNft.ownerOf(nftId) == e.msg.sender;
    require actionCounter() < max_uint256;
    
    stake(e, nftId);
    
    uint256 newActionId = actionCounter();
    
    // Verify the stake action was created correctly
    assert ghostNftIds[newActionId] == nftId;
    assert ghostOwners[newActionId] == e.msg.sender;
    assert ghostIndexes[newActionId] == numStakedNfts() - 1;
}

/// @title Verifies unstaking clears stake action data
rule unstakeClearsData {
    env e;
    uint256 stakeActionId;
    
    // Preconditions: valid stake action owned by caller
    require ghostOwners[stakeActionId] == e.msg.sender;
    require ghostOwners[stakeActionId] != 0;
    
    unstake(e, stakeActionId);
    
    // After unstaking, owner and nftId should be cleared
    assert ghostOwners[stakeActionId] == 0;
    assert ghostNftIds[stakeActionId] == 0;
}

/// @title Edge case: Cannot unstake non-existent stake action
rule cannotUnstakeInvalid {
    env e;
    uint256 stakeActionId;
    
    // Invalid stake action (no owner)
    require ghostOwners[stakeActionId] == 0;
    
    unstake@withrevert(e, stakeActionId);
    
    assert lastReverted;
}

/// @title Edge case: Cannot unstake someone else's stake
rule cannotUnstakeOthers {
    env e;
    uint256 stakeActionId;
    address otherOwner;
    
    // Stake action owned by someone else
    require ghostOwners[stakeActionId] == otherOwner;
    require otherOwner != 0;
    require otherOwner != e.msg.sender;
    
    unstake@withrevert(e, stakeActionId);
    
    assert lastReverted;
}

/// @title Verifies array compaction works correctly
rule arrayCompactionCorrect {
    env e;
    uint256 stakeActionId;
    
    uint256 numBefore = numStakedNfts();
    require numBefore >= 2; // Need at least 2 for meaningful test
    
    // Get the stake action to remove
    require ghostOwners[stakeActionId] == e.msg.sender;
    uint256 indexToRemove = ghostIndexes[stakeActionId];
    require indexToRemove < numBefore; // Valid index
    
    // Get the last stake action
    mathint lastIndex = numBefore - 1;
    require lastIndex >= 0;
    uint256 lastActionId = stakeActionIds(require_uint256(lastIndex));
    
    // Case: we're not removing the last element
    require indexToRemove < lastIndex;
    
    unstake(e, stakeActionId);
    
    // The last element should now be at the removed index
    assert stakeActionIds(indexToRemove) == lastActionId;
    assert ghostIndexes[lastActionId] == indexToRemove;
}

/// @title Critical invariant: No duplicate NFTs can be staked
rule noDuplicateStakes {
    env e;
    uint256 nftId;
    
    // NFT already marked as used
    require usedNfts(nftId) == 1;
    
    stake@withrevert(e, nftId);
    
    assert lastReverted;
} 