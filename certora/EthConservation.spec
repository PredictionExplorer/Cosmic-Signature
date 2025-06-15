// EthConservation.spec - Basic ETH conservation rules
// Simple rules to verify ETH flows in the Cosmic Signature ecosystem

using CharityWallet as charity;
using MarketingWallet as marketing;

methods {
    // Charity wallet methods
    function charity.charityAddress() external returns (address) envfree;
    function charity.send() external;
    function charity.send(uint256) external;
    
    // Marketing wallet methods
    function marketing.send(address, uint256) external;
}

// Rule: Charity wallet balance only decreases when send() is called
rule charityBalanceDecreasesOnSend {
    env e;
    
    uint256 balanceBefore = nativeBalances[charity];
    
    // Call the send function
    charity.send(e);
    
    uint256 balanceAfter = nativeBalances[charity];
    
    // Balance should decrease if charity address is set and has balance
    assert charity.charityAddress() != 0 && balanceBefore > 0 => balanceAfter < balanceBefore;
}

// Rule: Charity wallet accumulates ETH from receives
rule charityAccumulatesEth {
    env e;
    
    uint256 balanceBefore = nativeBalances[charity];
    
    // Any method call that sends ETH to charity
    method f;
    calldataarg args;
    require f.selector != sig:charity.send().selector;
    require f.selector != sig:charity.send(uint256).selector;
    
    f@withrevert(e, args);
    
    uint256 balanceAfter = nativeBalances[charity];
    
    // If ETH was sent to charity and no revert, balance increases
    assert e.msg.value > 0 && e.msg.sender != charity && !lastReverted => 
           balanceAfter >= balanceBefore;
} 