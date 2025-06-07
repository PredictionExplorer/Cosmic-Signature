methods {
    // Core access functions
    function game() external returns (address) envfree;
    function owner() external returns (address) envfree;
    
    // Critical operations
    function registerRoundEnd(uint256, address) external;
    function depositEth(uint256, address) external;
}

/// @title Only game can deposit ETH
rule onlyGameCanDepositEth {
    env e;
    uint256 roundNum;
    address winner;
    
    address gameAddr = game();
    require e.msg.sender != gameAddr;
    
    depositEth@withrevert(e, roundNum, winner);
    
    assert lastReverted;
}

/// @title Only game can register round end
rule onlyGameCanRegisterRound {
    env e;
    uint256 roundNum;
    address beneficiary;
    
    address gameAddr = game();
    require e.msg.sender != gameAddr;
    
    registerRoundEnd@withrevert(e, roundNum, beneficiary);
    
    assert lastReverted;
}

/**
 * CRITICAL FINDING: Unable to prove positive case
 * 
 * Despite extensive effort (15+ different approaches), we cannot prove that
 * the game contract can successfully call depositEth() even when all conditions
 * are met (e.msg.sender == game(), game() != 0, winner != 0).
 * 
 * This appears to be due to Certora's handling of OpenZeppelin's Context._msgSender()
 * pattern. The contract uses _msgSender() != game for access control, but Certora
 * cannot guarantee that _msgSender() returns e.msg.sender.
 * 
 * Approaches tried:
 * 1. Direct assertion with various constraints
 * 2. Hardcoded addresses
 * 3. Method summaries for _msgSender()
 * 4. Ghost variables and hooks
 * 5. Harness contracts
 * 6. Multiple constraint variations
 * 
 * IMPACT: While we verified that non-game addresses cannot deposit (negative case),
 * we cannot formally verify the positive case. This is a limitation but not
 * necessarily a vulnerability.
 */