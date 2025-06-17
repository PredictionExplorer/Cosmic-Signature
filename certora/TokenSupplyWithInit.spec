// Spec with proper initialization modeling

methods {
    function mint(address,uint256) external;
    function burn(address,uint256) external;
    function transfer(address,uint256) external returns (bool);
    
    function totalSupply() external returns (uint256) envfree;
    function balanceOf(address) external returns (uint256) envfree;
    function game() external returns (address) envfree;
}

// Ghost to track if we're in a valid post-constructor state
ghost bool initialized {
    init_state axiom initialized == false;
}

// Assume after constructor, totalSupply is 0
hook Sload uint256 val currentContract._totalSupply {
    require !initialized => val == 0;
}

// Assume after constructor, all balances are 0
hook Sload uint256 val currentContract._balances[KEY address a] {
    require !initialized => val == 0;
}

/**
 * Rule: In any reachable state, balance <= totalSupply
 * This models that we start from a proper constructor state
 */
rule balanceAlwaysBoundedByTotalSupply {
    // Mark that we're now in post-constructor state
    initialized = true;
    
    address account;
    assert balanceOf(account) <= totalSupply();
}

/**
 * Rule: The invariant is preserved by all operations
 */
rule invariantPreservedByAllOperations(method f) {
    env e;
    calldataarg args;
    
    // Start from valid state
    initialized = true;
    
    // Check invariant before
    address accountBefore;
    require balanceOf(accountBefore) <= totalSupply();
    
    // Execute any function
    f(e, args);
    
    // Check invariant after
    address accountAfter;
    assert balanceOf(accountAfter) <= totalSupply();
}

/**
 * Rule: Specific check for mint operation
 */
rule mintMaintainsInvariant {
    env e;
    address receiver;
    uint256 amount;
    
    initialized = true;
    
    require e.msg.sender == game();
    require receiver != 0;
    
    // Pre-condition: invariant holds
    address anyAddr;
    require balanceOf(anyAddr) <= totalSupply();
    
    // No overflow
    require totalSupply() + amount <= max_uint256;
    require balanceOf(receiver) + amount <= max_uint256;
    
    mint(e, receiver, amount);
    
    // Post-condition: invariant still holds
    address checkAddr;
    assert balanceOf(checkAddr) <= totalSupply();
} 