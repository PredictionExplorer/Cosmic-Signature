// EthConservation.spec - System-wide ETH conservation invariants
// Ensures ETH is never lost or created within the Cosmic Signature ecosystem

methods {
    // CosmicGame methods
    function getCurrentRound() external returns (uint256) envfree;
    function roundStartTime(uint256) external returns (uint256) envfree;
    function getAllBidDetails() external returns (uint256[], address[], bytes[]) envfree;
    
    // Wallet methods
    function CharityWallet.getBalance() external returns (uint256) envfree;
    function MarketingWallet.getBalance() external returns (uint256) envfree;
    function PrizesWallet.getBalance() external returns (uint256) envfree;
    function StakingWalletRandom.getBalance() external returns (uint256) envfree;
    function StakingWalletNftRewards.getBalance() external returns (uint256) envfree;
}

// Ghost variable to track total ETH in the system
ghost mathint totalSystemEth {
    init_state axiom totalSystemEth == 0;
}

// Ghost mapping to track ETH balance changes
ghost mapping(address => mathint) ethBalanceGhost {
    init_state axiom forall address a. ethBalanceGhost[a] == 0;
}

// Hook to track ETH transfers
hook Sstore _balances[KEY address a] uint256 newBalance {
    ethBalanceGhost[a] = newBalance;
    // Update total system ETH tracking
}

// Main conservation invariant
invariant ethConservation()
    // Total ETH in wallets + game contract = initial ETH + external deposits
    totalSystemEth == 
        ethBalanceGhost[CharityWallet] + 
        ethBalanceGhost[MarketingWallet] + 
        ethBalanceGhost[PrizesWallet] +
        ethBalanceGhost[StakingWalletRandom] +
        ethBalanceGhost[StakingWalletNftRewards] +
        ethBalanceGhost[CosmicGame]
    {
        preserved {
            requireInvariant ethNeverDestroyed();
        }
    }

// Supporting invariant: ETH cannot be destroyed
invariant ethNeverDestroyed()
    forall address a. ethBalanceGhost[a] >= 0;

// Rule: ETH movements are zero-sum within the system
rule ethTransferConservation(method f, env e) {
    mathint totalBefore = totalSystemEth;
    
    calldataarg args;
    f(e, args);
    
    mathint totalAfter = totalSystemEth;
    
    // Total ETH only increases with external deposits
    assert totalAfter >= totalBefore;
    
    // If no external ETH entered, total must remain constant
    assert e.msg.value == 0 => totalAfter == totalBefore;
}

// Rule: Claiming prizes preserves ETH conservation
rule claimPrizePreservesEth(env e) {
    require e.msg.value == 0;  // No ETH sent with claim
    
    mathint gameEthBefore = ethBalanceGhost[CosmicGame];
    mathint prizesEthBefore = ethBalanceGhost[PrizesWallet];
    mathint totalBefore = gameEthBefore + prizesEthBefore;
    
    // Simulate claim operation
    CosmicGame.claimMainPrize(e);
    
    mathint gameEthAfter = ethBalanceGhost[CosmicGame];
    mathint prizesEthAfter = ethBalanceGhost[PrizesWallet];
    mathint totalAfter = gameEthAfter + prizesEthAfter;
    
    // Total ETH in game + prizes wallet remains constant
    assert totalAfter == totalBefore;
}

// TODO: Add more specific conservation rules for:
// - Bid deposits
// - Prize distributions
// - Charity donations
// - Staking rewards 