methods {
    // Core access functions
    function game() external returns (address) envfree;
    function owner() external returns (address) envfree;
    
    // Critical operations
    function registerRoundEnd(uint256, address) external;
    function depositEth(uint256, address) external;

    // KEY INSIGHT: Summarize _msgSender ONLY for the current contract
    // to avoid inheritance conflicts with Context and Ownable.
    function _msgSender() internal returns(address) with (env e) => e.msg.sender;
}

/// @title Negative case: non-game address cannot deposit ETH
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

/// @title Negative case: non-game address cannot register round end
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

/// @title Positive case: The authorized game contract CAN deposit ETH
rule gameCanDepositWhenAuthorized {
    env e;
    uint256 roundNum;
    address winner;

    // Constrain the environment to a valid, non-trivial state
    require(game() != 0);
    require(e.msg.sender == game());
    require(winner != 0);
    
    // Call the function under these ideal conditions
    depositEth@withrevert(e, roundNum, winner);
    
    // The function must not revert
    assert !lastReverted;
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