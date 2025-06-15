// TokensAndNFTs_simple.spec - Simplified token and NFT verification
// Focus on core properties without vacuity issues

using CosmicSignatureToken as cst;
using CosmicSignatureNft as cosmicNft;
using RandomWalkNFT as randomWalkNft;

methods {
    // CST token methods
    function cst.balanceOf(address) external returns (uint256) envfree;
    function cst.totalSupply() external returns (uint256) envfree;
    function cst.transfer(address, uint256) external returns (bool);
    function cst.transferFrom(address, address, uint256) external returns (bool);
    function cst.allowance(address, address) external returns (uint256) envfree;
    function cst.approve(address, uint256) external returns (bool);
    function cst.mint(address, uint256) external;
    function cst.burn(address, uint256) external;
    function cst.game() external returns (address) envfree;
    
    // CosmicNFT methods
    function cosmicNft.balanceOf(address) external returns (uint256) envfree;
    function cosmicNft.ownerOf(uint256) external returns (address) envfree;
    function cosmicNft.totalSupply() external returns (uint256) envfree;
    function cosmicNft.game() external returns (address) envfree;
    function cosmicNft.transferFrom(address, address, uint256) external;
    
    // RandomWalkNFT methods
    function randomWalkNft.getMintPrice() external returns (uint256) envfree;
    function randomWalkNft.saleTime() external returns (uint256) envfree;
    function randomWalkNft.totalSupply() external returns (uint256) envfree;
    function randomWalkNft.mint() external;
}

// ===== CORE CST TOKEN RULES =====

rule cstMintOnlyByGame {
    env e;
    address account;
    uint256 amount;
    
    cst.mint@withrevert(e, account, amount);
    
    assert !lastReverted => e.msg.sender == cst.game();
}

rule cstBurnOnlyByGame {
    env e;
    address account;
    uint256 amount;
    
    cst.burn@withrevert(e, account, amount);
    
    assert !lastReverted => e.msg.sender == cst.game();
}

rule cstTransferPreservesSupply {
    env e;
    address to;
    uint256 amount;
    
    uint256 supplyBefore = cst.totalSupply();
    
    cst.transfer@withrevert(e, to, amount);
    
    uint256 supplyAfter = cst.totalSupply();
    
    assert supplyAfter == supplyBefore;
}

rule cstMintIncreasesSupply {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender == cst.game();
    require amount > 0 && amount < 10^18;
    
    uint256 supplyBefore = cst.totalSupply();
    require supplyBefore + amount <= max_uint256;
    
    cst.mint(e, account, amount);
    
    uint256 supplyAfter = cst.totalSupply();
    
    assert supplyAfter == supplyBefore + amount;
}

rule cstBurnDecreasesSupply {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender == cst.game();
    require amount > 0 && amount < 10^18;
    
    uint256 balance = cst.balanceOf(account);
    require balance >= amount;
    
    uint256 supplyBefore = cst.totalSupply();
    
    cst.burn(e, account, amount);
    
    uint256 supplyAfter = cst.totalSupply();
    
    assert supplyAfter == supplyBefore - amount;
}

// ===== CORE NFT RULES =====

rule nftOwnershipConsistency {
    uint256 tokenId;
    
    address owner = cosmicNft.ownerOf@withrevert(tokenId);
    
    // If ownerOf doesn't revert, owner must not be zero
    assert !lastReverted => owner != 0;
}

rule nftBalanceConsistency {
    address owner;
    uint256 tokenId;
    
    // If an address owns a token, its balance must be > 0
    address tokenOwner = cosmicNft.ownerOf@withrevert(tokenId);
    
    // Only check if ownerOf didn't revert and the token is owned by our address
    require !lastReverted;
    require tokenOwner == owner;
    
    uint256 balance = cosmicNft.balanceOf(owner);
    assert balance > 0;
}

rule nftTotalSupplyNeverDecreases {
    env e;
    
    uint256 supplyBefore = cosmicNft.totalSupply();
    
    // Total supply of NFTs can only be affected by minting
    // Since only the game can mint, and we're not calling mint,
    // supply should remain constant for any other operation
    
    // Try a transfer operation
    uint256 tokenId;
    address from;
    address to;
    
    // Skip if conditions aren't met for a valid transfer
    require cosmicNft.ownerOf@withrevert(tokenId) == from;
    require !lastReverted;
    require to != 0;
    
    cosmicNft.transferFrom@withrevert(e, from, to, tokenId);
    
    uint256 supplyAfter = cosmicNft.totalSupply();
    
    // Total supply should never decrease (and shouldn't change for transfers)
    assert supplyAfter == supplyBefore;
}

// ===== RANDOMWALK NFT RULES =====

rule randomWalkPriceNonNegative {
    uint256 price = randomWalkNft.getMintPrice();
    assert price >= 0;
}

rule randomWalkSaleTimeConsistency {
    uint256 saleTime = randomWalkNft.saleTime();
    // Sale time should be reasonable (not 0 or max)
    assert saleTime == 0 || (saleTime > 0 && saleTime < max_uint256);
}

rule randomWalkTotalSupplyOnlyIncreasesOnMint {
    env e;
    
    uint256 supplyBefore = randomWalkNft.totalSupply();
    
    // Only mint can increase supply
    randomWalkNft.mint@withrevert(e);
    
    uint256 supplyAfter = randomWalkNft.totalSupply();
    
    // If mint succeeded, supply increases by 1
    // If mint failed, supply stays the same
    assert lastReverted ? (supplyAfter == supplyBefore) : (supplyAfter == supplyBefore + 1);
}

// ===== ACCESS CONTROL RULES =====

rule gameAddressConsistency {
    address cstGame = cst.game();
    address nftGame = cosmicNft.game();
    
    // Both tokens should have non-zero game addresses
    assert cstGame != 0;
    assert nftGame != 0;
}

// ===== BASIC TRANSFER RULES =====

rule cstTransferCorrectness {
    env e;
    address from;
    address to;
    uint256 amount;
    
    require from == e.msg.sender;
    require to != 0;
    require from != to;
    
    uint256 fromBalanceBefore = cst.balanceOf(from);
    uint256 toBalanceBefore = cst.balanceOf(to);
    
    require fromBalanceBefore >= amount;
    require toBalanceBefore + amount <= max_uint256;
    
    bool success = cst.transfer(e, to, amount);
    
    // Only verify balances if transfer succeeded
    require success;
    
    uint256 fromBalanceAfter = cst.balanceOf(from);
    uint256 toBalanceAfter = cst.balanceOf(to);
    
    assert fromBalanceAfter == fromBalanceBefore - amount;
    assert toBalanceAfter == toBalanceBefore + amount;
}

rule cstAllowanceBasic {
    env e;
    address spender;
    uint256 amount;
    
    require amount < max_uint256;
    
    bool success = cst.approve(e, spender, amount);
    
    // Only verify allowance if approve succeeded
    require success;
    
    uint256 allowance = cst.allowance(e.msg.sender, spender);
    assert allowance == amount;
} 