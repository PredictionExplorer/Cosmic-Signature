using CosmicSignatureToken as cst;

methods {
    // ERC20 core functions
    function totalSupply() external returns (uint256) envfree;
    function balanceOf(address) external returns (uint256) envfree;
    function allowance(address, address) external returns (uint256) envfree;
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
    
    // CST specific functions
    function mint(address, uint256) external;
    function burn(address, uint256) external;
    function game() external returns (address) envfree;
    
    // ERC20 extensions
    function decimals() external returns (uint8) envfree;
    function name() external returns (string) envfree;
    function symbol() external returns (string) envfree;
}

/// @title Only game contract can mint
rule onlyGameCanMint {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender != game();
    
    mint@withrevert(e, account, amount);
    
    assert lastReverted;
}

/// @title Only game contract can burn
rule onlyGameCanBurn {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender != game();
    
    burn@withrevert(e, account, amount);
    
    assert lastReverted;
}

/// @title Minting increases total supply and balance
rule mintIncreasesTotalSupplyAndBalance {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender == game();
    require amount > 0 && amount < 10^60; // Reasonable bounds
    
    uint256 supplyBefore = totalSupply();
    uint256 balanceBefore = balanceOf(account);
    
    // Ensure no overflow
    require supplyBefore + amount < max_uint256;
    require balanceBefore + amount < max_uint256;
    
    mint(e, account, amount);
    
    uint256 supplyAfter = totalSupply();
    uint256 balanceAfter = balanceOf(account);
    
    assert supplyAfter == supplyBefore + amount;
    assert balanceAfter == balanceBefore + amount;
}

/// @title Burning decreases total supply and balance
rule burnDecreasesTotalSupplyAndBalance {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender == game();
    require amount > 0;
    
    uint256 supplyBefore = totalSupply();
    uint256 balanceBefore = balanceOf(account);
    
    require balanceBefore >= amount; // Ensure burn can succeed
    
    burn(e, account, amount);
    
    uint256 supplyAfter = totalSupply();
    uint256 balanceAfter = balanceOf(account);
    
    assert supplyAfter == supplyBefore - amount;
    assert balanceAfter == balanceBefore - amount;
}

/// @title Transfer preserves total supply
rule transferPreservesTotalSupply {
    env e;
    address to;
    uint256 amount;
    
    uint256 supplyBefore = totalSupply();
    
    transfer(e, to, amount);
    
    uint256 supplyAfter = totalSupply();
    
    assert supplyAfter == supplyBefore;
}

/// @title Transfer updates balances correctly
rule transferUpdatesBalances {
    env e;
    address from;
    address to;
    uint256 amount;
    
    require from != to; // Avoid self-transfer edge case
    require e.msg.sender == from; // transfer uses msg.sender
    
    uint256 fromBalanceBefore = balanceOf(from);
    uint256 toBalanceBefore = balanceOf(to);
    
    require fromBalanceBefore >= amount; // Ensure transfer can succeed
    
    bool success = transfer(e, to, amount);
    
    uint256 fromBalanceAfter = balanceOf(from);
    uint256 toBalanceAfter = balanceOf(to);
    
    assert success => fromBalanceAfter == fromBalanceBefore - amount;
    assert success => toBalanceAfter == toBalanceBefore + amount;
}

/// @title TransferFrom preserves total supply
rule transferFromPreservesTotalSupply {
    env e;
    address from;
    address to;
    uint256 amount;
    
    uint256 supplyBefore = totalSupply();
    
    transferFrom(e, from, to, amount);
    
    uint256 supplyAfter = totalSupply();
    
    assert supplyAfter == supplyBefore;
}

/// @title Approve sets allowance correctly
rule approveUpdatesAllowance {
    env e;
    address spender;
    uint256 amount;
    
    approve(e, spender, amount);
    
    uint256 allowanceAfter = allowance(e.msg.sender, spender);
    
    assert allowanceAfter == amount;
}

/// @title Mint and burn operations by game are inverse
rule mintBurnSymmetry {
    env e1;
    env e2;
    address account;
    uint256 amount;
    
    require e1.msg.sender == game();
    require e2.msg.sender == game();
    
    uint256 initialBalance = balanceOf(account);
    uint256 initialSupply = totalSupply();
    
    // Ensure we can mint
    require initialBalance + amount < max_uint256;
    require initialSupply + amount < max_uint256;
    
    // Mint then burn same amount
    mint(e1, account, amount);
    burn(e2, account, amount);
    
    uint256 finalBalance = balanceOf(account);
    uint256 finalSupply = totalSupply();
    
    assert finalBalance == initialBalance;
    assert finalSupply == initialSupply;
}

/// @title Cannot burn more than balance
rule burnRequiresSufficientBalance {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender == game();
    
    uint256 balance = balanceOf(account);
    require amount > balance;
    
    burn@withrevert(e, account, amount);
    
    assert lastReverted;
}

/// @title Transfer fails with insufficient balance
rule transferRequiresSufficientBalance {
    env e;
    address to;
    uint256 amount;
    
    uint256 balance = balanceOf(e.msg.sender);
    require amount > balance;
    
    bool success = transfer@withrevert(e, to, amount);
    
    assert lastReverted || !success;
}

 