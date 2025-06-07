using CosmicSignatureGame as game;

methods {
    // Access control
    function owner() external returns (address) envfree;
    
    // State queries
    function roundNum() external returns (uint256) envfree;
    function roundActivationTime() external returns (uint256) envfree;
    
    // Configuration setters
    function setDelayDurationBeforeRoundActivation(uint256) external;
    function setRoundActivationTime(uint256) external;
    function setMainEthPrizeAmountPercentage(uint256) external;
    function setChronoWarriorEthPrizeAmountPercentage(uint256) external;
    function setRaffleTotalEthPrizeAmountForBiddersPercentage(uint256) external;
    function setCosmicSignatureNftStakingTotalEthRewardAmountPercentage(uint256) external;
    function setCharityEthDonationAmountPercentage(uint256) external;

    function setMarketingWallet(address) external;
    function setCharityAddress(address) external;
    
    // Configuration getters
    function delayDurationBeforeRoundActivation() external returns (uint256) envfree;
    function mainEthPrizeAmountPercentage() external returns (uint256) envfree;
    function chronoWarriorEthPrizeAmountPercentage() external returns (uint256) envfree;
    function raffleTotalEthPrizeAmountForBiddersPercentage() external returns (uint256) envfree;
    function cosmicSignatureNftStakingTotalEthRewardAmountPercentage() external returns (uint256) envfree;
    function charityEthDonationAmountPercentage() external returns (uint256) envfree;
}

/// @title Only owner can set delay duration
rule onlyOwnerCanSetDelayDuration {
    env e;
    uint256 newValue;
    
    require e.msg.sender != owner();
    
    setDelayDurationBeforeRoundActivation@withrevert(e, newValue);
    
    assert lastReverted;
}

/// @title Only owner can set main ETH prize percentage
rule onlyOwnerCanSetMainEthPrizePercentage {
    env e;
    uint256 newValue;
    
    require e.msg.sender != owner();
    
    setMainEthPrizeAmountPercentage@withrevert(e, newValue);
    
    assert lastReverted;
}

/// @title Only owner can set wallet addresses
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

/// @title Cannot set wallet addresses when round is active
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

/// @title Cannot set zero wallet addresses
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

/// @title Setting delay duration correctly updates storage
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

/// @title Setting percentage correctly updates storage
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

/// @title Cannot set percentages when round is active
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

 