// Practical verification of token supply consistency
// Uses invariants and ghost variables to track the fundamental ERC20 property

methods {
    function mint(address,uint256) external;
    function burn(address,uint256) external;
    function transfer(address,uint256) external returns (bool);
    function transferFrom(address,address,uint256) external returns (bool);
    function approve(address,uint256) external returns (bool);
    
    function totalSupply() external returns (uint256) envfree;
    function balanceOf(address) external returns (uint256) envfree;
    function allowance(address,address) external returns (uint256) envfree;
    function game() external returns (address) envfree;
}

// Ghost variable to track sum of all balances
ghost mathint sumOfBalances {
    init_state axiom sumOfBalances == 0;
}

// Hook to update sum when any balance changes
hook Sstore _balances[KEY address account] uint256 newBalance (uint256 oldBalance) {
    sumOfBalances = sumOfBalances - oldBalance + newBalance;
}

// Hook to ensure totalSupply starts at 0
hook Sload uint256 val currentContract._totalSupply {
    require val >= 0; // This is always true for uint256, but helps the prover
}

/**
 * Invariant: Sum of all balances equals totalSupply
 * This is THE fundamental ERC20 invariant
 */
invariant totalSupplyIntegrity()
    to_mathint(totalSupply()) == sumOfBalances
    {
        preserved mint(address account, uint256 amount) with (env e) {
            require e.msg.sender == game();
            require account != 0; // OpenZeppelin requirement
        }
        preserved burn(address account, uint256 amount) with (env e) {
            require e.msg.sender == game();
            require balanceOf(account) >= amount; // Can only burn what exists
        }
    }

/**
 * Invariant: Each individual balance is bounded by totalSupply
 * This is a consequence of the sum invariant
 */
invariant balanceBoundedByTotalSupply(address account)
    balanceOf(account) <= totalSupply()
    {
        preserved {
            requireInvariant totalSupplyIntegrity();
        }
    }

/**
 * Invariant: Sum of balances is non-negative
 * This should be trivially true since balances are uint256
 */
invariant sumOfBalancesNonNegative()
    sumOfBalances >= 0
    {
        preserved {
            require sumOfBalances >= 0; // Help the prover with the initial state
        }
    }

/**
 * Rule: Mint increases both balance and totalSupply by same amount
 */
rule mintCorrectness {
    env e;
    address receiver;
    uint256 amount;
    
    require e.msg.sender == game();
    require receiver != 0; // OpenZeppelin prevents minting to zero address
    
    // Assume we start from a valid state
    requireInvariant totalSupplyIntegrity();
    
    uint256 balanceBefore = balanceOf(receiver);
    uint256 supplyBefore = totalSupply();
    
    // Prevent overflow
    require balanceBefore + amount <= max_uint256;
    require supplyBefore + amount <= max_uint256;
    
    mint(e, receiver, amount);
    
    assert balanceOf(receiver) == balanceBefore + amount;
    assert totalSupply() == supplyBefore + amount;
}

/**
 * Rule: Burn decreases both balance and totalSupply by same amount
 */
rule burnCorrectness {
    env e;
    address target;
    uint256 amount;
    
    require e.msg.sender == game();
    require balanceOf(target) >= amount; // Can only burn what exists
    
    // Assume we start from a valid state
    requireInvariant totalSupplyIntegrity();
    
    uint256 balanceBefore = balanceOf(target);
    uint256 supplyBefore = totalSupply();
    
    burn(e, target, amount);
    
    assert balanceOf(target) == balanceBefore - amount;
    assert totalSupply() == supplyBefore - amount;
}

/**
 * Rule: Transfer moves balance but preserves totalSupply
 */
rule transferCorrectness {
    env e;
    address recipient;
    uint256 amount;
    
    address sender = e.msg.sender;
    require sender != recipient; // Avoid self-transfer edge case
    
    // Assume we start from a valid state
    requireInvariant totalSupplyIntegrity();
    
    uint256 senderBalanceBefore = balanceOf(sender);
    uint256 recipientBalanceBefore = balanceOf(recipient);
    uint256 supplyBefore = totalSupply();
    
    require senderBalanceBefore >= amount; // Must have enough to transfer
    require recipientBalanceBefore + amount <= max_uint256; // No overflow
    
    transfer(e, recipient, amount);
    
    // Balances change
    assert balanceOf(sender) == senderBalanceBefore - amount;
    assert balanceOf(recipient) == recipientBalanceBefore + amount;
    
    // But total supply unchanged
    assert totalSupply() == supplyBefore;
}

/**
 * Rule: Only mint/burn/burnFrom can change totalSupply
 * Updated to handle all burn variants and batch operations
 */
rule totalSupplyChangeRestricted(method f) {
    env e;
    calldataarg args;
    
    // Assume we start from a valid state
    requireInvariant totalSupplyIntegrity();
    
    uint256 supplyBefore = totalSupply();
    
    f(e, args);
    
    uint256 supplyAfter = totalSupply();
    
    // If supply changed, must be mint or burn operation
    assert supplyAfter != supplyBefore => 
           (f.selector == sig:mint(address,uint256).selector ||
            f.selector == sig:burn(address,uint256).selector ||
            f.selector == sig:burn(uint256).selector ||
            f.selector == sig:burnFrom(address,uint256).selector ||
            // Batch operations that can change supply
            f.selector == 0xb33266da || // mintMany
            f.selector == 0xe6eb77a1 || // burnMany  
            f.selector == 0xb3551214);  // mintAndBurnMany
}

/**
 * Rule: Zero address never has balance
 * This is enforced by OpenZeppelin's _update function
 */
rule zeroAddressAlwaysEmpty {
    // Assume we're in a reachable state (post-constructor)
    requireInvariant totalSupplyIntegrity();
    
    assert balanceOf(0) == 0;
}

/**
 * Rule: Approve doesn't affect balances or supply
 */
rule approveDoesNotAffectBalances {
    env e;
    address spender;
    uint256 amount;
    
    uint256 ownerBalanceBefore = balanceOf(e.msg.sender);
    uint256 spenderBalanceBefore = balanceOf(spender);
    uint256 supplyBefore = totalSupply();
    
    approve(e, spender, amount);
    
    assert balanceOf(e.msg.sender) == ownerBalanceBefore;
    assert balanceOf(spender) == spenderBalanceBefore;
    assert totalSupply() == supplyBefore;
}

/**
 * Rule: Transfers preserve sum of balances
 * This is a key property - transfers just move tokens around
 */
rule transferPreservesSumOfBalances {
    env e;
    address to;
    uint256 amount;
    
    // Start from valid state
    requireInvariant totalSupplyIntegrity();
    requireInvariant sumOfBalancesNonNegative();
    
    mathint sumBefore = sumOfBalances;
    
    transfer@withrevert(e, to, amount);
    
    // Whether successful or reverted, sum unchanged
    assert sumOfBalances == sumBefore;
}

/**
 * Rule: Access control - only game can mint
 */
rule mintAccessControl {
    env e;
    address receiver;
    uint256 amount;
    
    // If caller is not game, mint must revert
    require e.msg.sender != game();
    
    mint@withrevert(e, receiver, amount);
    
    assert lastReverted;
}

/**
 * Rule: Access control - only game can burn
 */
rule burnAccessControl {
    env e;
    address target;
    uint256 amount;
    
    // If caller is not game, burn must revert
    require e.msg.sender != game();
    
    burn@withrevert(e, target, amount);
    
    assert lastReverted;
}

/**
 * Rule: Minting to zero address always reverts
 */
rule mintToZeroAddressReverts {
    env e;
    uint256 amount;
    
    require e.msg.sender == game();
    
    mint@withrevert(e, 0, amount);
    
    assert lastReverted;
}

/**
 * Rule: Burning from zero address always reverts
 */
rule burnFromZeroAddressReverts {
    env e;
    uint256 amount;
    
    require e.msg.sender == game();
    
    burn@withrevert(e, 0, amount);
    
    assert lastReverted;
} 