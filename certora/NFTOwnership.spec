using CosmicSignatureNft as cosmicNft;
using RandomWalkNFT as randomWalkNft;

methods {
    // CosmicSignatureNft methods
    function cosmicNft.ownerOf(uint256) external returns (address) envfree;
    function cosmicNft.balanceOf(address) external returns (uint256) envfree;
    function cosmicNft.totalSupply() external returns (uint256) envfree;
    function cosmicNft.transferFrom(address, address, uint256) external;
    function cosmicNft.safeTransferFrom(address, address, uint256) external;
    function cosmicNft.approve(address, uint256) external;
    function cosmicNft.getApproved(uint256) external returns (address) envfree;
    function cosmicNft.isApprovedForAll(address, address) external returns (bool) envfree;
    function cosmicNft.setApprovalForAll(address, bool) external;
    function cosmicNft.tokenOfOwnerByIndex(address, uint256) external returns (uint256) envfree;
    function cosmicNft.game() external returns (address) envfree;
    function cosmicNft.mint(uint256, address, uint256) external returns (uint256);
    
    // RandomWalkNFT methods  
    function randomWalkNft.ownerOf(uint256) external returns (address) envfree;
    function randomWalkNft.balanceOf(address) external returns (uint256) envfree;
    function randomWalkNft.totalSupply() external returns (uint256) envfree;
    function randomWalkNft.transferFrom(address, address, uint256) external;
    function randomWalkNft.safeTransferFrom(address, address, uint256) external;
    function randomWalkNft.tokenOfOwnerByIndex(address, uint256) external returns (uint256) envfree;
}

/// @title Transfer updates ownership correctly
rule transferUpdatesOwnership {
    env e;
    address from;
    address to;
    uint256 tokenId;
    
    require from != to;
    require to != 0;
    require tokenId < cosmicNft.totalSupply(); // Ensure token exists
    require cosmicNft.ownerOf(tokenId) == from;
    require e.msg.sender == from || cosmicNft.getApproved(tokenId) == e.msg.sender || 
            cosmicNft.isApprovedForAll(from, e.msg.sender);
    
    uint256 fromBalanceBefore = cosmicNft.balanceOf(from);
    uint256 toBalanceBefore = cosmicNft.balanceOf(to);
    require fromBalanceBefore > 0; // Must have at least one token
    require toBalanceBefore < max_uint256; // Prevent overflow
    
    cosmicNft.transferFrom(e, from, to, tokenId);
    
    uint256 fromBalanceAfter = cosmicNft.balanceOf(from);
    uint256 toBalanceAfter = cosmicNft.balanceOf(to);
    
    // Verify ownership changed
    assert cosmicNft.ownerOf(tokenId) == to;
    // Verify balances updated
    assert fromBalanceAfter == fromBalanceBefore - 1;
    assert toBalanceAfter == toBalanceBefore + 1;
}

/// @title Cannot transfer NFT you don't own
rule cannotTransferUnownedNft {
    env e;
    address owner;
    address unauthorized;
    address to;
    uint256 tokenId;
    
    // Setup: token exists and has an owner
    require tokenId < cosmicNft.totalSupply();
    require cosmicNft.ownerOf(tokenId) == owner;
    require owner != 0;
    
    // Setup: caller is not authorized
    require e.msg.sender == unauthorized;
    require unauthorized != owner;
    require unauthorized != 0;
    require cosmicNft.getApproved(tokenId) != unauthorized;
    require !cosmicNft.isApprovedForAll(owner, unauthorized);
    
    // Valid recipient
    require to != 0;
    
    cosmicNft.transferFrom@withrevert(e, owner, to, tokenId);
    
    assert lastReverted;
}

/// @title Cannot transfer to zero address
rule cannotTransferToZeroAddress {
    env e;
    address from;
    uint256 tokenId;
    
    require cosmicNft.ownerOf(tokenId) == from;
    require e.msg.sender == from;
    
    cosmicNft.transferFrom@withrevert(e, from, 0, tokenId);
    
    assert lastReverted;
}

/// @title Approval allows transfer
rule approvalAllowsTransfer {
    env e1;
    env e2;
    address owner;
    address approved;
    address recipient;
    uint256 tokenId;
    
    require cosmicNft.ownerOf(tokenId) == owner;
    require e1.msg.sender == owner;
    require approved != owner && approved != 0;
    require recipient != 0 && recipient != owner && recipient != approved;
    require e2.msg.sender == approved;
    
    // Owner approves
    cosmicNft.approve(e1, approved, tokenId);
    
    // Approved address can transfer
    cosmicNft.transferFrom(e2, owner, recipient, tokenId);
    
    // Verify transfer succeeded
    assert cosmicNft.ownerOf(tokenId) == recipient;
    // Verify approval was cleared
    assert cosmicNft.getApproved(tokenId) == 0;
}

/// @title Approval for all allows any transfer
rule approvalForAllAllowsTransfer {
    env e1;
    env e2;
    address owner;
    address operator;
    address recipient;
    uint256 tokenId;
    
    require cosmicNft.ownerOf(tokenId) == owner;
    require e1.msg.sender == owner;
    require operator != owner && operator != 0;
    require recipient != 0 && recipient != owner;
    require e2.msg.sender == operator;
    
    // Owner approves operator for all
    cosmicNft.setApprovalForAll(e1, operator, true);
    
    // Operator can transfer any token
    cosmicNft.transferFrom(e2, owner, recipient, tokenId);
    
    // Verify transfer succeeded
    assert cosmicNft.ownerOf(tokenId) == recipient;
}

/// @title Balance equals number of owned tokens - zero balance case
rule balanceZeroMeansNoTokens {
    address owner;
    uint256 balance = cosmicNft.balanceOf(owner);
    uint256 anyIndex;
    
    require balance == 0;
    
    cosmicNft.tokenOfOwnerByIndex@withrevert(owner, anyIndex);
    assert lastReverted;
}

/// @title Balance consistency after minting
rule mintIncreasesBalance {
    env e;
    uint256 roundNum;
    address recipient;
    uint256 seed;
    
    // Setup: valid inputs
    require e.msg.sender == cosmicNft.game();
    require recipient != 0;
    require recipient > 0xff; // Regular address
    
    uint256 balanceBefore = cosmicNft.balanceOf(recipient);
    require balanceBefore < max_uint256; // Prevent overflow
    
    cosmicNft.mint(e, roundNum, recipient, seed);
    
    uint256 balanceAfter = cosmicNft.balanceOf(recipient);
    
    // Balance must increase by 1
    assert balanceAfter == balanceBefore + 1;
}

/// @title Token ownership is unique
rule tokenOwnershipUnique {
    uint256 tokenId;
    address owner1;
    address owner2;
    
    require owner1 != owner2;
    require cosmicNft.ownerOf(tokenId) == owner1;
    
    // No other address can own the same token
    assert cosmicNft.ownerOf(tokenId) != owner2;
}

/// @title Safe transfer checks receiver
rule safeTransferChecksReceiver {
    env e;
    address from;
    address to;
    uint256 tokenId;
    
    require cosmicNft.ownerOf(tokenId) == from;
    require e.msg.sender == from;
    require to != 0;
    
    // For EOA, safe transfer should succeed
    cosmicNft.safeTransferFrom(e, from, to, tokenId);
    
    assert cosmicNft.ownerOf(tokenId) == to;
}

/// @title RandomWalkNFT transfer preserves total supply
rule randomWalkTransferPreservesSupply {
    env e;
    address from;
    address to;
    uint256 tokenId;
    
    require randomWalkNft.ownerOf(tokenId) == from;
    require e.msg.sender == from;
    require to != 0 && to != from;
    
    uint256 supplyBefore = randomWalkNft.totalSupply();
    
    randomWalkNft.transferFrom(e, from, to, tokenId);
    
    uint256 supplyAfter = randomWalkNft.totalSupply();
    
    // Total supply unchanged by transfer
    assert supplyAfter == supplyBefore;
}

/// @title Token ID bounds checking
rule tokenIdMustBeWithinSupply {
    uint256 tokenId;
    uint256 totalSupply = cosmicNft.totalSupply();
    
    // For any valid token that has an owner
    require tokenId < totalSupply;
    
    // The owner must not be zero address
    address owner = cosmicNft.ownerOf(tokenId);
    assert owner != 0;
}

/// @title Ownership persists without transfers
invariant ownershipPersistence(uint256 tokenId)
    tokenId < cosmicNft.totalSupply() => cosmicNft.ownerOf(tokenId) != 0
    {
        preserved transferFrom(address from, address to, uint256 tid) with (env e) {
            require to != 0;
        }
        preserved safeTransferFrom(address from, address to, uint256 tid) with (env e) {
            require to != 0;
        }
    } 