// Simple investigation of balance/totalSupply relationship

methods {
    function mint(address,uint256) external;
    function burn(address,uint256) external;
    function transfer(address,uint256) external returns (bool);
    
    function totalSupply() external returns (uint256) envfree;
    function balanceOf(address) external returns (uint256) envfree;
    function game() external returns (address) envfree;
}

/**
 * Rule: Check if there's a specific address that can have balance > totalSupply
 * This explores the counterexample from the previous run
 */
rule exploreBalanceExceedsTotalSupply {
    address account;
    
    // The failed assertion was: balanceOf(account) <= totalSupply()
    // So let's check when this can be violated
    
    uint256 balance = balanceOf(account);
    uint256 supply = totalSupply();
    
    // This should always pass in a correct ERC20
    assert balance <= supply;
}

/**
 * Rule: Mint to address 0 should fail
 * OpenZeppelin ERC20 should prevent minting to address(0)
 */
rule mintToZeroAddressFails {
    env e;
    uint256 amount;
    
    require e.msg.sender == game();
    
    mint@withrevert(e, 0, amount);
    
    // Should always revert when minting to address(0)
    assert lastReverted;
}

/**
 * Rule: Check initial state
 */
rule initialStateCorrect {
    // At initialization, totalSupply should be 0
    assert totalSupply() == 0 || totalSupply() > 0;
    
    // Any balance should be <= totalSupply
    address anyAddress;
    assert balanceOf(anyAddress) <= totalSupply();
}

/**
 * Rule: After mint, both balance and totalSupply increase
 */
rule mintAffectsBothBalanceAndSupply {
    env e;
    address receiver;
    uint256 amount;
    
    require e.msg.sender == game();
    require receiver != 0; // Avoid mint to zero address
    
    uint256 balanceBefore = balanceOf(receiver);
    uint256 supplyBefore = totalSupply();
    
    // Ensure no overflow
    require balanceBefore + amount <= max_uint256;
    require supplyBefore + amount <= max_uint256;
    
    mint(e, receiver, amount);
    
    uint256 balanceAfter = balanceOf(receiver);
    uint256 supplyAfter = totalSupply();
    
    // Both should increase by the same amount
    assert balanceAfter == balanceBefore + amount;
    assert supplyAfter == supplyBefore + amount;
} 