using CosmicSignatureToken as cst;

methods {
    // Core functions
    function totalSupply() external returns (uint256) envfree;
    function balanceOf(address) external returns (uint256) envfree;
    function game() external returns (address) envfree;
    
    // Mint/burn operations
    function mint(address, uint256) external;
    function burn(address, uint256) external;
    
    // Transfer operations
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

/// @title Only game contract can mint tokens
rule onlyGameCanMint {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender != game();
    
    mint@withrevert(e, account, amount);
    
    assert lastReverted;
}

/// @title Only game contract can burn tokens
rule onlyGameCanBurn {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender != game();
    
    burn@withrevert(e, account, amount);
    
    assert lastReverted;
}



/// @title Minting increases balance correctly
rule mintingIncreasesBalance {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender == game();
    require amount > 0 && amount < 10^18; // Reasonable amount
    
    uint256 balanceBefore = balanceOf(account);
    require balanceBefore + amount <= max_uint256; // No overflow
    
    mint(e, account, amount);
    
    uint256 balanceAfter = balanceOf(account);
    
    assert balanceAfter == balanceBefore + amount;
}

/// @title Burning decreases balance correctly
rule burningDecreasesBalance {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender == game();
    require amount > 0;
    
    uint256 balanceBefore = balanceOf(account);
    require balanceBefore >= amount; // Sufficient balance
    
    burn(e, account, amount);
    
    uint256 balanceAfter = balanceOf(account);
    
    assert balanceAfter == balanceBefore - amount;
}

/// @title Cannot burn more than balance
rule cannotBurnMoreThanBalance {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender == game();
    
    uint256 balance = balanceOf(account);
    require amount > balance;
    
    burn@withrevert(e, account, amount);
    
    assert lastReverted;
}

/// @title Transfer preserves total token amount
rule transferPreservesTotal {
    env e;
    address to;
    uint256 amount;
    
    address from = e.msg.sender;
    require from != to; // No self-transfer
    
    uint256 fromBalanceBefore = balanceOf(from);
    uint256 toBalanceBefore = balanceOf(to);
    
    require fromBalanceBefore >= amount; // Can transfer
    require toBalanceBefore + amount <= max_uint256; // No overflow
    
    transfer(e, to, amount);
    
    uint256 fromBalanceAfter = balanceOf(from);
    uint256 toBalanceAfter = balanceOf(to);
    
    // Total preserved
    assert fromBalanceBefore + toBalanceBefore == fromBalanceAfter + toBalanceAfter;
}

/// @title Mint then burn same amount restores state
rule mintBurnSymmetry {
    env e1;
    env e2;
    address account;
    uint256 amount;
    
    require e1.msg.sender == game();
    require e2.msg.sender == game();
    require amount > 0 && amount < 10^18; // Reasonable amount
    
    uint256 initialBalance = balanceOf(account);
    uint256 initialSupply = totalSupply();
    
    // Ensure we can mint without overflow
    require initialBalance + amount <= max_uint256;
    require initialSupply + amount <= max_uint256;
    
    // Mint then burn
    mint(e1, account, amount);
    burn(e2, account, amount);
    
    uint256 finalBalance = balanceOf(account);
    uint256 finalSupply = totalSupply();
    
    assert finalBalance == initialBalance;
    assert finalSupply == initialSupply;
}

 