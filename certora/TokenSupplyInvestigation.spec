// Investigation spec for total supply consistency in CosmicSignatureToken

methods {
    function mint(address,uint256) external;
    function burn(address,uint256) external;
    function transfer(address,uint256) external returns (bool);
    function transferFrom(address,address,uint256) external returns (bool);

    function totalSupply() external returns (uint256) envfree;
    function balanceOf(address) external returns (uint256) envfree;
    function game() external returns (address) envfree;
}

// Ghost variable to track the sum of all balances
ghost mathint sumOfBalances {
    init_state axiom sumOfBalances == 0;
}

// Hook to update sum when balance changes
hook Sstore _balances[KEY address account] uint256 newBalance (uint256 oldBalance) {
    sumOfBalances = sumOfBalances - oldBalance + newBalance;
}

/**
 * Invariant: The sum of all balances equals totalSupply
 * This is the fundamental ERC20 invariant
 */
invariant totalSupplyEqualsSumOfBalances()
    to_mathint(totalSupply()) == sumOfBalances;

/**
 * Rule: Minting increases totalSupply by exact amount
 */
rule mintIncreasesTotalSupplyCorrectly {
    env e;
    address receiver;
    uint256 amount;
    
    require e.msg.sender == game();
    
    uint256 totalSupplyBefore = totalSupply();
    uint256 balanceBefore = balanceOf(receiver);
    
    mint(e, receiver, amount);
    
    uint256 totalSupplyAfter = totalSupply();
    uint256 balanceAfter = balanceOf(receiver);
    
    // Check that totalSupply increased by the minted amount
    assert totalSupplyAfter == totalSupplyBefore + amount;
    
    // Check that receiver's balance increased by the minted amount
    assert balanceAfter == balanceBefore + amount;
}

/**
 * Rule: Burning decreases totalSupply by exact amount
 */
rule burnDecreasesTotalSupplyCorrectly {
    env e;
    address target;
    uint256 amount;
    
    require e.msg.sender == game();
    require balanceOf(target) >= amount; // Ensure burn won't fail
    
    uint256 totalSupplyBefore = totalSupply();
    uint256 balanceBefore = balanceOf(target);
    
    burn(e, target, amount);
    
    uint256 totalSupplyAfter = totalSupply();
    uint256 balanceAfter = balanceOf(target);
    
    // Check that totalSupply decreased by the burned amount
    assert totalSupplyAfter == totalSupplyBefore - amount;
    
    // Check that target's balance decreased by the burned amount
    assert balanceAfter == balanceBefore - amount;
}

/**
 * Rule: Transfer preserves total supply
 */
rule transferPreservesTotalSupply {
    env e;
    address to;
    uint256 amount;
    
    uint256 totalSupplyBefore = totalSupply();
    
    transfer(e, to, amount);
    
    uint256 totalSupplyAfter = totalSupply();
    
    assert totalSupplyAfter == totalSupplyBefore;
}

/**
 * Rule: Check for overflow in mint operations
 */
rule mintDoesNotOverflow {
    env e;
    address receiver;
    uint256 amount;
    
    require e.msg.sender == game();
    
    uint256 totalSupplyBefore = totalSupply();
    uint256 balanceBefore = balanceOf(receiver);
    
    // Require that the addition won't overflow
    require totalSupplyBefore + amount <= max_uint256;
    require balanceBefore + amount <= max_uint256;
    
    mint(e, receiver, amount);
    
    uint256 totalSupplyAfter = totalSupply();
    
    // If no overflow, the invariant should hold
    assert totalSupplyAfter == totalSupplyBefore + amount;
} 