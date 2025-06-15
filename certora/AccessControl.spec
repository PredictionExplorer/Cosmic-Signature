// AccessControl.spec - Access control and ownership verification
// Migrated from GameOwnership.spec

methods {
    function owner() external returns (address);
    function renounceOwnership() external;
    function transferOwnership(address newOwner) external;
}

// ===== RENOUNCEOWNERSHIP RULES =====

rule renounceOwnership_onlyOwner_cannot_change {
    env e;
    address currentOwner = owner(e);
    address nonOwner;

    // Preconditions
    require currentOwner != 0;            // There is a current owner
    require nonOwner != currentOwner;     // Caller is not the current owner
    require e.msg.sender == nonOwner;     // The transaction sender is the non-owner

    // Store owner before the call
    address ownerBefore = owner(e);

    // Action - we expect this might revert, but if it doesn't, owner shouldn't change
    renounceOwnership@withrevert(e);

    // Postcondition: either the call reverted or the owner didn't change
    assert lastReverted || owner(e) == ownerBefore, 
           "Owner should not change when renounceOwnership is called by a non-owner";
}

rule renounceOwnership_success {
    env e;
    address currentOwner = owner(e);

    // Preconditions
    require currentOwner != 0;             // There is a current owner (initialized)
    require e.msg.sender == currentOwner;  // Called by the current owner

    // Action
    renounceOwnership(e);

    // Postcondition
    assert owner(e) == 0, "Owner should be the zero address after renouncement";
}

// ===== TRANSFEROWNERSHIP RULES =====

rule transferOwnership_onlyOwner_cannot_change {
    env e;
    address currentOwner = owner(e);
    address nonOwner;
    address newOwnerCandidate;

    // Preconditions
    require currentOwner != 0;                 // There is a current owner
    require nonOwner != currentOwner;          // Caller is not the current owner
    require e.msg.sender == nonOwner;          // The transaction sender is the non-owner

    // Store owner before the call
    address ownerBefore = owner(e);

    // Action - we expect this might revert, but if it doesn't, owner shouldn't change
    transferOwnership@withrevert(e, newOwnerCandidate);

    // Postcondition: either the call reverted or the owner didn't change
    assert lastReverted || owner(e) == ownerBefore, 
           "Owner should not change when transferOwnership is called by a non-owner";
}

rule transferOwnership_success {
    env e;
    address currentOwner = owner(e);
    address newOwnerCandidate;

    // Preconditions
    require currentOwner != 0;                    // There is a current owner (initialized)
    require e.msg.sender == currentOwner;         // Called by the current owner
    require newOwnerCandidate != 0;               // New owner is not the zero address
    require newOwnerCandidate != currentOwner;    // New owner is different from current owner

    // Action
    transferOwnership(e, newOwnerCandidate);

    // Postcondition
    assert owner(e) == newOwnerCandidate, "Owner should be updated to newOwnerCandidate";
} 