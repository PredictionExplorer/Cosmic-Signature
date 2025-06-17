// Pragmatic token verification focusing on property preservation
// Accepts that Certora explores unreachable initial states

methods {
    function mint(address,uint256) external;
    function burn(address,uint256) external;
    function transfer(address,uint256) external returns (bool);
    function transferFrom(address,address,uint256) external returns (bool);
    function approve(address,uint256) external returns (bool);
    
    function totalSupply() external returns (uint256) envfree;
    function balanceOf(address) external returns (uint256) envfree;
    function game() external returns (address) envfree;
}

/**
 * CORE SECURITY PROPERTIES
 * These are the properties that actually matter for security
 */

/**
 * Property 1: Only the game contract can mint tokens
 * This is critical for economic security
 */
rule onlyGameCanMint {
    env e;
    address receiver;
    uint256 amount;
    
    // If not game, must revert
    require e.msg.sender != game();
    
    mint@withrevert(e, receiver, amount);
    
    assert lastReverted, "Non-game address was able to mint!";
}

/**
 * Property 2: Only the game contract can burn tokens
 * This is critical for economic security
 */
rule onlyGameCanBurn {
    env e;
    address target;
    uint256 amount;
    
    // If not game, must revert
    require e.msg.sender != game();
    
    burn@withrevert(e, target, amount);
    
    assert lastReverted, "Non-game address was able to burn!";
}

/**
 * Property 3: Transfers cannot create or destroy tokens
 * Total supply must remain constant during transfers
 */
rule transfersPreserveTotalSupply {
    env e;
    address recipient;
    uint256 amount;
    
    uint256 supplyBefore = totalSupply();
    
    transfer@withrevert(e, recipient, amount);
    
    uint256 supplyAfter = totalSupply();
    
    assert supplyAfter == supplyBefore, "Transfer changed total supply!";
}

/**
 * Property 4: TransferFrom cannot create or destroy tokens
 */
rule transferFromPreservesTotalSupply {
    env e;
    address from;
    address to;
    uint256 amount;
    
    uint256 supplyBefore = totalSupply();
    
    transferFrom@withrevert(e, from, to, amount);
    
    uint256 supplyAfter = totalSupply();
    
    assert supplyAfter == supplyBefore, "TransferFrom changed total supply!";
}

/**
 * Property 5: Successful mint increases supply by exact amount
 * This ensures no hidden minting
 */
rule mintIncreasesSupplyCorrectly {
    env e;
    address receiver;
    uint256 amount;
    
    require e.msg.sender == game();
    require receiver != 0; // OpenZeppelin requirement
    
    uint256 supplyBefore = totalSupply();
    uint256 receiverBalanceBefore = balanceOf(receiver);
    
    // Ensure no overflow
    require supplyBefore + amount <= max_uint256;
    require receiverBalanceBefore + amount <= max_uint256;
    
    mint(e, receiver, amount);
    
    uint256 supplyAfter = totalSupply();
    uint256 receiverBalanceAfter = balanceOf(receiver);
    
    assert supplyAfter == supplyBefore + amount, "Supply didn't increase by minted amount";
    assert receiverBalanceAfter == receiverBalanceBefore + amount, "Balance didn't increase by minted amount";
}

/**
 * Property 6: Successful burn decreases supply by exact amount
 * This ensures no hidden burning
 */
rule burnDecreasesSupplyCorrectly {
    env e;
    address target;
    uint256 amount;
    
    require e.msg.sender == game();
    require balanceOf(target) >= amount; // Must have enough to burn
    
    uint256 supplyBefore = totalSupply();
    uint256 targetBalanceBefore = balanceOf(target);
    
    // CRITICAL: Ensure we start from a valid state
    // In a real deployment, individual balances never exceed total supply
    require targetBalanceBefore <= supplyBefore;
    
    // Also ensure that burning won't cause underflow
    require supplyBefore >= amount;
    
    burn(e, target, amount);
    
    uint256 supplyAfter = totalSupply();
    uint256 targetBalanceAfter = balanceOf(target);
    
    assert supplyAfter == supplyBefore - amount, "Supply didn't decrease by burned amount";
    assert targetBalanceAfter == targetBalanceBefore - amount, "Balance didn't decrease by burned amount";
}

/**
 * Property 7: Cannot mint to zero address
 * OpenZeppelin enforces this
 */
rule cannotMintToZeroAddress {
    env e;
    uint256 amount;
    
    require e.msg.sender == game();
    
    mint@withrevert(e, 0, amount);
    
    assert lastReverted, "Was able to mint to zero address!";
}

/**
 * Property 8: Cannot burn from zero address
 * OpenZeppelin enforces this
 */
rule cannotBurnFromZeroAddress {
    env e;
    uint256 amount;
    
    require e.msg.sender == game();
    
    burn@withrevert(e, 0, amount);
    
    assert lastReverted, "Was able to burn from zero address!";
}

/**
 * Property 9: Approve doesn't affect balances
 * This is important to ensure approve can't be used to manipulate balances
 */
rule approveDoesNotAffectBalances {
    env e;
    address spender;
    uint256 amount;
    
    uint256 ownerBalanceBefore = balanceOf(e.msg.sender);
    uint256 spenderBalanceBefore = balanceOf(spender);
    uint256 supplyBefore = totalSupply();
    
    approve(e, spender, amount);
    
    uint256 ownerBalanceAfter = balanceOf(e.msg.sender);
    uint256 spenderBalanceAfter = balanceOf(spender);
    uint256 supplyAfter = totalSupply();
    
    assert ownerBalanceAfter == ownerBalanceBefore, "Approve changed owner balance!";
    assert spenderBalanceAfter == spenderBalanceBefore, "Approve changed spender balance!";
    assert supplyAfter == supplyBefore, "Approve changed total supply!";
}

/**
 * Property 10: Transfer conserves tokens (from + to balances sum is preserved)
 * This is a key conservation property
 */
rule transferConservesTokens {
    env e;
    address recipient;
    uint256 amount;
    
    address sender = e.msg.sender;
    require sender != recipient; // Avoid self-transfer
    
    uint256 senderBalanceBefore = balanceOf(sender);
    uint256 recipientBalanceBefore = balanceOf(recipient);
    
    // Must have enough to transfer
    require senderBalanceBefore >= amount;
    // Prevent overflow on recipient
    require recipientBalanceBefore + amount <= max_uint256;
    
    // Calculate sum before (using mathint to avoid overflow)
    mathint sumBefore = senderBalanceBefore + recipientBalanceBefore;
    
    transfer(e, recipient, amount);
    
    uint256 senderBalanceAfter = balanceOf(sender);
    uint256 recipientBalanceAfter = balanceOf(recipient);
    mathint sumAfter = senderBalanceAfter + recipientBalanceAfter;
    
    assert sumAfter == sumBefore, "Transfer didn't conserve tokens!";
    assert senderBalanceAfter == senderBalanceBefore - amount, "Sender balance incorrect!";
    assert recipientBalanceAfter == recipientBalanceBefore + amount, "Recipient balance incorrect!";
} 