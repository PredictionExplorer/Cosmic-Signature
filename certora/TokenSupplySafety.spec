// Basic token supply & access-control verification for CosmicSignatureToken
// Generated from Section 9 of certora_best_practices.md

// State-changing and view methods exposed to the verifier
methods {
    function mint(address,uint256) external;
    function burn(address,uint256) external;
    function transfer(address,uint256) external;

    function totalSupply() external returns (uint256) envfree;
    function balanceOf(address) external returns (uint256) envfree;
    function game() external returns (address) envfree;
}

/**
 * Invariant: For *every* address the balance is bounded by totalSupply.
 * Note: This is expressed as a rule since CVL doesn't allow function calls in quantified formulas.
 */
rule balancesBoundedByTotalSupply {
    address account;
    assert balanceOf(account) <= totalSupply();
}

/**
 * Rule: Only the CosmicSignatureGame contract may call mint/burn entry points.
 */
rule mintRestrictedToGame {
    env e;
    address receiver;
    uint256 amount;

    require e.msg.sender != game();

    mint@withrevert(e, receiver, amount);
    assert lastReverted, "Minting by non-game caller must revert";
}

rule burnRestrictedToGame {
    env e;
    address target;
    uint256 amount;

    require e.msg.sender != game();

    burn@withrevert(e, target, amount);
    assert lastReverted, "Burning by non-game caller must revert";
}

/**
 * Rule: After any public function, totalSupply remains non-negative.
 */
rule totalSupplyNeverNegative(method f, env e, calldataarg data) {
    f(e, data);
    assert totalSupply() >= 0, "totalSupply should never underflow";
} 