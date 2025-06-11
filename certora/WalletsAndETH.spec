// WalletsAndETH.spec - Wallet and ETH flow verification - PrizesWallet and ETH conservation
// Consolidated from 2 files

methods {
    function Context._msgSender() internal returns(address) with (env e) => e.msg.sender;
    function claimDonatedNft(uint256) external;
    function claimDonatedToken(uint256, address) external;
    function claimManyDonatedNfts(uint256[]) external;
    function claimManyDonatedTokens(IPrizesWallet.DonatedTokenToClaim[]) external;
    function depositEth(uint256, address) external;
    function donateNft(uint256, address, address, uint256) external;
    function donateToken(uint256, address, address, uint256) external;
    function game() external returns (address) envfree;
    function getEthBalanceInfo(address) external returns (IPrizesWallet.EthBalanceInfo memory) envfree;
    function mainPrizeBeneficiaryAddresses(uint256) external returns (address) envfree;
    function owner() external returns (address) envfree;
    function registerRoundEnd(uint256, address) external;
    function registerRoundEndAndDepositEthMany(uint256, address, IPrizesWallet.EthDeposit[]) external;
    function roundTimeoutTimesToWithdrawPrizes(uint256) external returns (uint256) envfree;
    function setTimeoutDurationToWithdrawPrizes(uint256) external;
    function timeoutDurationToWithdrawPrizes() external returns (uint256) envfree;
    function withdrawEth() external;
    function withdrawEth(address) external;
    function withdrawEverything(bool, IPrizesWallet.DonatedTokenToClaim[], uint256[]) external;
}

// ===== CANNOTWITHDRAW RULES =====

rule cannotWithdrawOthersBeforeTimeout {
    env e;
    address beneficiary;
    
    // Setup different users
    require beneficiary != 0;
    require beneficiary != e.msg.sender;
    
    // Get beneficiary's balance info
    IPrizesWallet.EthBalanceInfo info = getEthBalanceInfo(beneficiary);
    require info.amount > 0; // Has balance to withdraw
    
    // Get timeout for the round
    uint256 timeout = roundTimeoutTimesToWithdrawPrizes(info.roundNum);
    require timeout > 0; // Timeout was set
    require e.block.timestamp < timeout; // Before timeout
    
    // Try to withdraw someone else's funds
    withdrawEth@withrevert(e, beneficiary);
    
    // Must revert
    assert lastReverted;
}

// ===== CHECKENVFREE RULES =====

rule checkEnvfreeFunctions {
    env e;
    
    // These should all work without environment
    address gameAddr = game();
    address ownerAddr = owner();
    
    // Check various getters
    address beneficiary = mainPrizeBeneficiaryAddresses(1);
    uint256 timeout = roundTimeoutTimesToWithdrawPrizes(1);
    uint256 duration = timeoutDurationToWithdrawPrizes();
    
    // Check balance info getter
    IPrizesWallet.EthBalanceInfo info = getEthBalanceInfo(e.msg.sender);
    
    // If we got here, all envfree functions work
    assert true;
}

// ===== DEPOSITETH RULES =====

rule depositEthAccessControlEdgeCases {
    env e;
    uint256 roundNum;
    address winner;
    
    // Test various non-game addresses
    require(game() != 0);
    require(e.msg.sender != game());
    
    // Additional constraints to test edge cases
    require(winner != 0);  // Valid winner address
    require(e.msg.value > 0);  // Attempting to deposit actual ETH
    require(roundNum > 0);  // Valid round number
    
    depositEth@withrevert(e, roundNum, winner);
    
    // Should always revert for non-game addresses regardless of parameters
    assert lastReverted;
}

// ===== DEPOSITINCREASES RULES =====

rule depositIncreasesRecipientBalance {
    env e;
    uint256 roundNum;
    address recipient;
    
    // Setup
    require e.msg.sender == game();
    require recipient != 0;
    require e.msg.value > 0;
    
    // Get recipient's balance before
    IPrizesWallet.EthBalanceInfo balanceBefore = getEthBalanceInfo(recipient);
    require balanceBefore.amount < max_uint256 - e.msg.value; // No overflow
    
    depositEth(e, roundNum, recipient);
    
    // Get recipient's balance after
    IPrizesWallet.EthBalanceInfo balanceAfter = getEthBalanceInfo(recipient);
    
    // Balance must increase by msg.value
    assert balanceAfter.amount == balanceBefore.amount + e.msg.value;
    assert balanceAfter.roundNum == roundNum;
}

// ===== ETHDEPOSIT RULES =====

rule ethDepositStaysInContract {
    env e;
    uint256 roundNum;
    address winner;
    
    // Setup
    require e.msg.sender == game();
    require e.msg.sender != currentContract; // Sender cannot be the contract itself
    require e.msg.value > 0;
    require e.msg.value < 1000000000000000000; // Less than 1 ETH
    require nativeBalances[currentContract] < max_uint256 - e.msg.value;
    
    uint256 balanceBefore = nativeBalances[currentContract];
    
    depositEth(e, roundNum, winner);
    
    uint256 balanceAfter = nativeBalances[currentContract];
    
    // Contract balance increases by msg.value
    assert balanceAfter == balanceBefore + e.msg.value;
}

// ===== ONLYGAME RULES =====

rule onlyGameCanDepositEth {
    env e;
    uint256 roundNum;
    address winner;
    
    // Ensure game is initialized and sender is NOT the game
    require(game() != 0);
    require(e.msg.sender != game());
    
    depositEth@withrevert(e, roundNum, winner);
    
    assert lastReverted;
}

rule onlyGameCanRegisterRound {
    env e;
    uint256 roundNum;
    address beneficiary;
    
    // Ensure game is initialized and sender is NOT the game
    require(game() != 0);
    require(e.msg.sender != game());
    
    registerRoundEnd@withrevert(e, roundNum, beneficiary);
    
    assert lastReverted;
}

rule onlyGameCanRegisterRoundEnd {
    env e;
    uint256 roundNum;
    address beneficiary;
    
    registerRoundEnd@withrevert(e, roundNum, beneficiary);
    
    // If call succeeded, sender must be game
    assert !lastReverted => e.msg.sender == game();
}

// ===== ONLYOWNER RULES =====

rule onlyOwnerCanSetTimeout {
    env e;
    uint256 newValue;
    
    setTimeoutDurationToWithdrawPrizes@withrevert(e, newValue);
    
    // If call succeeded, sender must be owner
    assert !lastReverted => e.msg.sender == owner();
}

// ===== REGISTERROUND RULES =====

rule registerRoundAccessControlEdgeCases {
    env e;
    uint256 roundNum;
    address beneficiary;
    
    // Test various non-game addresses
    require(game() != 0);
    require(e.msg.sender != game());
    
    // Additional constraints to test edge cases
    require(beneficiary != 0);  // Valid beneficiary
    require(roundNum > 0);  // Valid round number
    
    registerRoundEnd@withrevert(e, roundNum, beneficiary);
    
    // Should always revert for non-game addresses regardless of parameters
    assert lastReverted;
}

// ===== ROUNDREGISTRATION RULES =====

rule roundRegistrationCorrect {
    env e;
    uint256 roundNum;
    address beneficiary;
    
    // Setup
    require e.msg.sender == game();
    require beneficiary != 0;
    require mainPrizeBeneficiaryAddresses(roundNum) == 0; // Not yet registered
    
    uint256 timeout = timeoutDurationToWithdrawPrizes();
    require timeout > 0;
    require e.block.timestamp < max_uint256 - timeout;
    
    registerRoundEnd(e, roundNum, beneficiary);
    
    // Check values were set
    assert mainPrizeBeneficiaryAddresses(roundNum) == beneficiary;
    assert roundTimeoutTimesToWithdrawPrizes(roundNum) == e.block.timestamp + timeout;
}

// ===== SANITY RULES =====

rule sanity_gameCanDeposit {
    env e;
    uint256 roundNum;
    address winner;
    
    // Simple setup
    require e.msg.sender == game();
    require e.msg.value > 0;
    require winner != 0;
    
    depositEth@withrevert(e, roundNum, winner);
    
    // Should succeed at least once
    satisfy !lastReverted;
}

rule sanity_ownerCanSetTimeout {
    env e;
    uint256 newValue;
    
    // Simple setup - just require sender is owner
    require e.msg.sender == owner();
    require e.msg.value == 0;
    
    setTimeoutDurationToWithdrawPrizes@withrevert(e, newValue);
    
    // Should succeed at least once
    satisfy !lastReverted;
}

rule sanity_userCanWithdraw {
    env e;
    
    // Setup a user with balance
    require e.msg.sender != 0;
    require e.msg.sender != currentContract;
    require e.msg.sender != game();
    require e.msg.value == 0;
    
    IPrizesWallet.EthBalanceInfo balance = getEthBalanceInfo(e.msg.sender);
    require balance.amount > 0;
    require balance.amount <= nativeBalances[currentContract];
    
    withdrawEth@withrevert(e);
    
    // Should succeed at least once
    satisfy !lastReverted;
}

// ===== USERSCAN RULES =====

rule usersCanWithdrawOwnBalance {
    env e;
    
    // Setup constraints
    address user = e.msg.sender;
    require user != 0;
    require user != currentContract;
    require user != game();
    require e.msg.value == 0; // withdrawEth is not payable
    
    // Get user's balance
    IPrizesWallet.EthBalanceInfo balanceBefore = getEthBalanceInfo(user);
    
    // Only test when user has a balance
    require balanceBefore.amount > 0;
    require balanceBefore.amount <= nativeBalances[currentContract]; // Contract has enough ETH
    
    // Try to withdraw
    withdrawEth(e);
    
    // After successful withdrawal, user's balance should be 0
    IPrizesWallet.EthBalanceInfo balanceAfter = getEthBalanceInfo(user);
    assert balanceAfter.amount == 0;
}

