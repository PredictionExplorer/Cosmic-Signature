using PrizesWallet as prizesWallet;

methods {
    // Access control
    function game() external returns (address) envfree;
    function owner() external returns (address) envfree;
    
    // Round tracking
    function mainPrizeBeneficiaryAddresses(uint256) external returns (address) envfree;
    function roundTimeoutTimesToWithdrawPrizes(uint256) external returns (uint256) envfree;
    function timeoutDurationToWithdrawPrizes() external returns (uint256) envfree;
    
    // Core operations
    function registerRoundEnd(uint256, address) external;
    function depositEth(uint256, address) external;
    function withdrawEth() external;
    function withdrawEth(address) external;
    function setTimeoutDurationToWithdrawPrizes(uint256) external;
}

/// @title Only game contract can deposit ETH
rule onlyGameCanDepositEth {
    env e;
    uint256 roundNum;
    address winner;
    
    address gameAddr = game();
    
    depositEth@withrevert(e, roundNum, winner);
    
    assert !lastReverted => e.msg.sender == gameAddr;
    assert e.msg.sender != gameAddr => lastReverted;
}

/// @title Only game can register round end
rule onlyGameCanRegisterRoundEnd {
    env e;
    uint256 roundNum;
    address mainPrizeBeneficiary;
    
    address gameAddr = game();
    
    registerRoundEnd@withrevert(e, roundNum, mainPrizeBeneficiary);
    
    assert !lastReverted => e.msg.sender == gameAddr;
    assert e.msg.sender != gameAddr => lastReverted;
}

/// @title ETH deposits increase contract balance
rule depositEthIncreasesBalance {
    env e;
    uint256 roundNum;
    address winner;
    
    require e.msg.sender == game();
    require winner != 0;
    require e.msg.value > 0;
    
    uint256 contractBalanceBefore = nativeBalances[prizesWallet];
    
    depositEth(e, roundNum, winner);
    
    uint256 contractBalanceAfter = nativeBalances[prizesWallet];
    
    // Contract balance should increase by exactly msg.value
    assert to_mathint(contractBalanceAfter) == to_mathint(contractBalanceBefore) + to_mathint(e.msg.value);
}

/// @title Withdrawals decrease contract balance
rule withdrawalsDecreaseBalance {
    env e;
    
    uint256 contractBalanceBefore = nativeBalances[prizesWallet];
    require contractBalanceBefore > 0;
    
    withdrawEth(e);
    
    uint256 contractBalanceAfter = nativeBalances[prizesWallet];
    assert contractBalanceAfter <= contractBalanceBefore;
}

/// @title Round registration sets correct values
rule roundRegistrationSetsValues {
    env e;
    uint256 roundNum;
    address beneficiary;
    
    require e.msg.sender == game();
    require beneficiary != 0;
    require mainPrizeBeneficiaryAddresses(roundNum) == 0;
    
    uint256 timeoutDuration = timeoutDurationToWithdrawPrizes();
    
    registerRoundEnd(e, roundNum, beneficiary);
    
    assert mainPrizeBeneficiaryAddresses(roundNum) == beneficiary;
    assert roundTimeoutTimesToWithdrawPrizes(roundNum) == require_uint256(e.block.timestamp + timeoutDuration);
}

/// @title Only owner can set timeout duration
rule onlyOwnerCanSetTimeout {
    env e;
    uint256 newValue;
    
    address ownerAddr = owner();
    
    setTimeoutDurationToWithdrawPrizes@withrevert(e, newValue);
    
    assert !lastReverted => e.msg.sender == ownerAddr;
    assert e.msg.sender != ownerAddr => lastReverted;
}

/// @title ETH cannot be created in PrizesWallet
rule noEthCreation {
    env e;
    method f;
    calldataarg args;
    
    // Only consider PrizesWallet methods
    require f.contract == prizesWallet;
    
    uint256 contractBalanceBefore = nativeBalances[prizesWallet];
    
    f(e, args);
    
    uint256 contractBalanceAfter = nativeBalances[prizesWallet];
    
    // Balance can only increase via depositEth with msg.value
    assert contractBalanceAfter > contractBalanceBefore => 
           (f.selector == sig:depositEth(uint256,address).selector && 
            to_mathint(contractBalanceAfter) == to_mathint(contractBalanceBefore) + to_mathint(e.msg.value));
}

/// @title ETH withdrawals are protected
rule withdrawalProtection {
    env e;
    address prizeWinner;
    
    require prizeWinner != e.msg.sender;
    require prizeWinner != 0;
    
    // If no timeout is set, withdrawal should fail
    uint256 timeoutTime = roundTimeoutTimesToWithdrawPrizes(0);
    require timeoutTime == 0 || e.block.timestamp < timeoutTime;
    
    withdrawEth@withrevert(e, prizeWinner);
    
    // Should revert because timeout not reached
    assert lastReverted;
} 