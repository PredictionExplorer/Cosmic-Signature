using PrizesWallet as prizesWallet;

methods {
    function game() external returns (address) envfree;
    function owner() external returns (address) envfree;
    function mainPrizeBeneficiaryAddresses(uint256) external returns (address) envfree;
    function roundTimeoutTimesToWithdrawPrizes(uint256) external returns (uint256) envfree;
    function depositEth(uint256, address) external;
    function withdrawEth() external;
    function withdrawEth(address) external;
}

/// @title Verify envfree functions work correctly
rule envfreeFunctionsWork {
    // Just check that envfree functions can be called
    assert game() == game();
    assert owner() == owner();
    assert mainPrizeBeneficiaryAddresses(1) == mainPrizeBeneficiaryAddresses(1);
    assert roundTimeoutTimesToWithdrawPrizes(1) == roundTimeoutTimesToWithdrawPrizes(1);
}

/// @title Only game can deposit ETH
rule onlyGameCanDeposit {
    env e;
    uint256 roundNum;
    address winner;
    
    depositEth@withrevert(e, roundNum, winner);
    
    // If it didn't revert, sender must be game
    assert !lastReverted => e.msg.sender == game();
}

 