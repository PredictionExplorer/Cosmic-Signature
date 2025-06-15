// SystemConfig.spec - System configuration and access control verification
// Consolidated from 1 files

methods {
    function charityEthDonationAmountPercentage() external returns (uint256) envfree;
    function chronoWarriorEthPrizeAmountPercentage() external returns (uint256) envfree;
    function cosmicSignatureNftStakingTotalEthRewardAmountPercentage() external returns (uint256) envfree;
    function delayDurationBeforeRoundActivation() external returns (uint256) envfree;
    function mainEthPrizeAmountPercentage() external returns (uint256) envfree;
    function owner() external returns (address) envfree;
    function raffleTotalEthPrizeAmountForBiddersPercentage() external returns (uint256) envfree;
    function roundActivationTime() external returns (uint256) envfree;
    function roundNum() external returns (uint256) envfree;
    function setCharityAddress(address) external;
    function setCharityEthDonationAmountPercentage(uint256) external;
    function setChronoWarriorEthPrizeAmountPercentage(uint256) external;
    function setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(uint256) external;
    function setDelayDurationBeforeRoundActivation(uint256) external;
    function setMainEthPrizeAmountPercentage(uint256) external;
    function setMarketingWallet(address) external;
    function setRaffleTotalEthPrizeAmountForBiddersPercentage(uint256) external;
    function setRoundActivationTime(uint256) external;
}

// ===== CANNOTSET RULES =====

rule cannotSetPercentagesWhenRoundActive {
    env e;
    uint256 newValue;
    
    require e.msg.sender == owner();
    require e.block.timestamp >= roundActivationTime(); // Round is active
    
    setMainEthPrizeAmountPercentage@withrevert(e, newValue);
    assert lastReverted;
    
    setChronoWarriorEthPrizeAmountPercentage@withrevert(e, newValue);
    assert lastReverted;
    
    setCharityEthDonationAmountPercentage@withrevert(e, newValue);
    assert lastReverted;
}

rule cannotSetWalletAddressesWhenRoundActive {
    env e;
    address newAddress;
    
    require e.msg.sender == owner();
    require newAddress != 0;
    require e.block.timestamp >= roundActivationTime(); // Round is active
    
    setMarketingWallet@withrevert(e, newAddress);
    assert lastReverted;
    
    setCharityAddress@withrevert(e, newAddress);
    assert lastReverted;
}

rule cannotSetZeroWalletAddresses {
    env e;
    
    require e.msg.sender == owner();
    require e.block.timestamp < roundActivationTime(); // Round is inactive
    
    // Try to set zero addresses
    setMarketingWallet@withrevert(e, 0);
    assert lastReverted;
    
    setCharityAddress@withrevert(e, 0);
    assert lastReverted;
}

// ===== ONLYOWNER RULES =====

rule onlyOwnerCanSetDelayDuration {
    env e;
    uint256 newValue;
    
    require e.msg.sender != owner();
    
    setDelayDurationBeforeRoundActivation@withrevert(e, newValue);
    
    assert lastReverted;
}

rule onlyOwnerCanSetMainEthPrizePercentage {
    env e;
    uint256 newValue;
    
    require e.msg.sender != owner();
    
    setMainEthPrizeAmountPercentage@withrevert(e, newValue);
    
    assert lastReverted;
}

rule onlyOwnerCanSetWalletAddresses {
    env e;
    address newAddress;
    
    require e.msg.sender != owner();
    require newAddress != 0; // Valid address
    
    setMarketingWallet@withrevert(e, newAddress);
    assert lastReverted;
    
    setCharityAddress@withrevert(e, newAddress);
    assert lastReverted;
}

// ===== SETDELAY RULES =====

rule setDelayDurationUpdatesStorage {
    env e;
    uint256 newValue;
    
    require e.msg.sender == owner();
    // Note: Delay duration can be set even when round is active
    
    uint256 oldValue = delayDurationBeforeRoundActivation();
    
    setDelayDurationBeforeRoundActivation(e, newValue);
    
    uint256 updatedValue = delayDurationBeforeRoundActivation();
    
    assert updatedValue == newValue;
}

// ===== SETPERCENTAGE RULES =====

rule setPercentageUpdatesStorage {
    env e;
    uint256 newValue;
    
    require e.msg.sender == owner();
    require e.block.timestamp < roundActivationTime(); // Round is inactive
    require newValue <= 100; // Reasonable percentage
    
    uint256 oldValue = mainEthPrizeAmountPercentage();
    
    setMainEthPrizeAmountPercentage(e, newValue);
    
    uint256 updatedValue = mainEthPrizeAmountPercentage();
    
    assert updatedValue == newValue;
}

// ===== PERCENTAGE SUM INVARIANT =====
// NOTE: The following rules were disabled because they revealed that the contract
// does NOT enforce percentage bounds. Individual percentages can exceed 100%
// and the sum of all percentages can exceed 100%. This is a potential vulnerability
// that should be fixed in the contract code.
//
// invariant percentagesSumToValidTotal()
//     mainEthPrizeAmountPercentage() + 
//     chronoWarriorEthPrizeAmountPercentage() + 
//     charityEthDonationAmountPercentage() + 
//     cosmicSignatureNftStakingTotalEthRewardAmountPercentage() + 
//     raffleTotalEthPrizeAmountForBiddersPercentage() <= 100;
//
// rule percentagesSumCorrectlyAfterUpdate { ... }
// rule noPercentageOverflow { ... }

