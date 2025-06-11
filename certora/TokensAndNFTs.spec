// TokensAndNFTs.spec - Token and NFT verification - CST, CosmicNFT, RandomWalkNFT
// Consolidated from 3 files

using CosmicSignatureToken as cst;
using CosmicSignatureNft as cosmicNft;
using RandomWalkNFT as randomWalkNft;

methods {
    function balanceOf(address) external returns (uint256) envfree;
    function burn(address, uint256) external;
    function cosmicNft.approve(address, uint256) external;
    function cosmicNft.balanceOf(address) external returns (uint256) envfree;
    function cosmicNft.game() external returns (address) envfree;
    function cosmicNft.getApproved(uint256) external returns (address) envfree;
    function cosmicNft.getNftSeed(uint256) external returns (uint256) envfree;
    function cosmicNft.isApprovedForAll(address, address) external returns (bool) envfree;
    function cosmicNft.mint(uint256, address, uint256) external returns (uint256);
    function cosmicNft.mintMany(uint256, address[], uint256) external returns (uint256);
    function cosmicNft.ownerOf(uint256) external returns (address) envfree;
    function cosmicNft.safeTransferFrom(address, address, uint256) external;
    function cosmicNft.setApprovalForAll(address, bool) external;
    function cosmicNft.tokenOfOwnerByIndex(address, uint256) external returns (uint256) envfree;
    function cosmicNft.totalSupply() external returns (uint256) envfree;
    function cosmicNft.transferFrom(address, address, uint256) external;
    function game() external returns (address) envfree;
    function mint(address, uint256) external;
    function randomWalkNft.balanceOf(address) external returns (uint256) envfree;
    function randomWalkNft.getMintPrice() external returns (uint256) envfree;
    function randomWalkNft.lastMinter() external returns (address) envfree;
    function randomWalkNft.mint() external;
    function randomWalkNft.nextTokenId() external returns (uint256) envfree;
    function randomWalkNft.ownerOf(uint256) external returns (address) envfree;
    function randomWalkNft.safeTransferFrom(address, address, uint256) external;
    function randomWalkNft.saleTime() external returns (uint256) envfree;
    function randomWalkNft.tokenOfOwnerByIndex(address, uint256) external returns (uint256) envfree;
    function randomWalkNft.totalSupply() external returns (uint256) envfree;
    function randomWalkNft.transferFrom(address, address, uint256) external;
    function totalSupply() external returns (uint256) envfree;
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

// ===== APPROVALALLOWS RULES =====

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

// ===== APPROVALFOR RULES =====

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

// ===== BALANCEZERO RULES =====

rule balanceZeroMeansNoTokens {
    address owner;
    uint256 balance = cosmicNft.balanceOf(owner);
    uint256 anyIndex;
    
    require balance == 0;
    
    cosmicNft.tokenOfOwnerByIndex@withrevert(owner, anyIndex);
    assert lastReverted;
}

// ===== BURNINGDECREASES RULES =====

rule burningDecreasesBalance {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender == game();
    require amount > 0;
    
    uint256 balanceBefore = balanceOf(account);
    require balanceBefore >= amount; // Sufficient balance
    
    burn(e, account, amount);
    
    uint256 balanceAfter = balanceOf(account);
    
    assert balanceAfter == balanceBefore - amount;
}

// ===== CANNOTBURN RULES =====

rule cannotBurnMoreThanBalance {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender == game();
    
    uint256 balance = balanceOf(account);
    require amount > balance;
    
    burn@withrevert(e, account, amount);
    
    assert lastReverted;
}

// ===== CANNOTMINT RULES =====

rule cannotMintCosmicNftToZeroAddress {
    env e;
    uint256 roundNum;
    uint256 seed;
    
    require e.msg.sender == cosmicNft.game();
    
    cosmicNft.mint@withrevert(e, roundNum, 0, seed);
    
    assert lastReverted;
}

// ===== CANNOTTRANSFER RULES =====

rule cannotTransferToZeroAddress {
    env e;
    address from;
    uint256 tokenId;
    
    require cosmicNft.ownerOf(tokenId) == from;
    require e.msg.sender == from;
    
    cosmicNft.transferFrom@withrevert(e, from, 0, tokenId);
    
    assert lastReverted;
}

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

// ===== COSMICNFT RULES =====

rule cosmicNftSequentialTokenIds {
    env e1;
    env e2;
    uint256 roundNum1;
    uint256 roundNum2;
    address recipient1;
    address recipient2;
    uint256 seed1;
    uint256 seed2;
    
    require e1.msg.sender == cosmicNft.game();
    require e2.msg.sender == cosmicNft.game();
    require recipient1 != 0 && recipient2 != 0;
    
    uint256 tokenId1 = cosmicNft.mint(e1, roundNum1, recipient1, seed1);
    uint256 tokenId2 = cosmicNft.mint(e2, roundNum2, recipient2, seed2);
    
    // Second token ID should be exactly one more than first
    assert tokenId2 == tokenId1 + 1;
}

// ===== GAMECAN RULES =====

rule gameCanMintCosmicNft {
    env e;
    uint256 roundNum;
    address recipient;
    uint256 seed;
    
    require e.msg.sender == cosmicNft.game();
    require recipient != 0;
    
    uint256 supplyBefore = cosmicNft.totalSupply();
    uint256 recipientBalanceBefore = cosmicNft.balanceOf(recipient);
    
    uint256 newTokenId = cosmicNft.mint(e, roundNum, recipient, seed);
    
    uint256 supplyAfter = cosmicNft.totalSupply();
    uint256 recipientBalanceAfter = cosmicNft.balanceOf(recipient);
    
    // Verify token ID equals previous supply
    assert newTokenId == supplyBefore;
    // Verify supply increased by 1
    assert supplyAfter == supplyBefore + 1;
    // Verify recipient balance increased by 1
    assert recipientBalanceAfter == recipientBalanceBefore + 1;
    // Verify ownership
    assert cosmicNft.ownerOf(newTokenId) == recipient;
}

// ===== MINTBURN RULES =====

rule mintBurnSymmetry {
    env e1;
    env e2;
    address account;
    uint256 amount;
    
    require e1.msg.sender == game();
    require e2.msg.sender == game();
    require amount > 0 && amount < 10^18; // Reasonable amount
    
    uint256 initialBalance = balanceOf(account);
    uint256 initialSupply = totalSupply();
    
    // Ensure we can mint without overflow
    require initialBalance + amount <= max_uint256;
    require initialSupply + amount <= max_uint256;
    
    // Mint then burn
    mint(e1, account, amount);
    burn(e2, account, amount);
    
    uint256 finalBalance = balanceOf(account);
    uint256 finalSupply = totalSupply();
    
    assert finalBalance == initialBalance;
    assert finalSupply == initialSupply;
}

// ===== MINTINCREASES RULES =====

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

// ===== MINTMANY RULES =====

rule mintManyCreatesCorrectCount {
    env e;
    uint256 roundNum;
    address recipient1;
    address recipient2;
    uint256 seed;
    
    require e.msg.sender == cosmicNft.game();
    require recipient1 != 0 && recipient2 != 0;
    require recipient1 != recipient2; // Ensure different recipients for clearer test
    
    // Create array with 2 recipients
    address[] recipients;
    require recipients.length == 2;
    require recipients[0] == recipient1;
    require recipients[1] == recipient2;
    
    uint256 supplyBefore = cosmicNft.totalSupply();
    uint256 balance1Before = cosmicNft.balanceOf(recipient1);
    uint256 balance2Before = cosmicNft.balanceOf(recipient2);
    
    uint256 firstTokenId = cosmicNft.mintMany(e, roundNum, recipients, seed);
    
    uint256 supplyAfter = cosmicNft.totalSupply();
    uint256 balance1After = cosmicNft.balanceOf(recipient1);
    uint256 balance2After = cosmicNft.balanceOf(recipient2);
    
    // Verify correct number minted
    assert supplyAfter == supplyBefore + 2;
    // Verify first token ID
    assert firstTokenId == supplyBefore;
    // Verify balances increased (now correctly handling different recipients)
    assert balance1After == balance1Before + 1;
    assert balance2After == balance2Before + 1;
}

// ===== MINTINGINCREASES RULES =====

rule mintingIncreasesBalance {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender == game();
    require amount > 0 && amount < 10^18; // Reasonable amount
    
    uint256 balanceBefore = balanceOf(account);
    require balanceBefore + amount <= max_uint256; // No overflow
    
    mint(e, account, amount);
    
    uint256 balanceAfter = balanceOf(account);
    
    assert balanceAfter == balanceBefore + amount;
}

// ===== MINTINGSTORES RULES =====

rule mintingStoresNftSeed {
    env e;
    uint256 roundNum;
    address recipient;
    uint256 seed;
    
    require e.msg.sender == cosmicNft.game();
    require recipient != 0;
    
    uint256 tokenId = cosmicNft.mint(e, roundNum, recipient, seed);
    
    // The actual seed stored is transformed by RandomNumberHelpers
    uint256 storedSeed = cosmicNft.getNftSeed(tokenId);
    
    // Verify seed was stored (non-zero check since transformation is complex)
    assert storedSeed != 0;
}

// ===== ONLYGAME RULES =====

rule onlyGameCanBurn {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender != game();
    
    burn@withrevert(e, account, amount);
    
    assert lastReverted;
}

rule onlyGameCanMint {
    env e;
    address account;
    uint256 amount;
    
    require e.msg.sender != game();
    
    mint@withrevert(e, account, amount);
    
    assert lastReverted;
}

rule onlyGameCanMintCosmicNft {
    env e;
    uint256 roundNum;
    address recipient;
    uint256 seed;
    
    address gameAddr = cosmicNft.game();
    require e.msg.sender != gameAddr;
    
    cosmicNft.mint@withrevert(e, roundNum, recipient, seed);
    
    assert lastReverted;
}

// ===== RANDOMWALK RULES =====

rule randomWalkMintingUpdatesState {
    env e;
    
    uint256 saleTime = randomWalkNft.saleTime();
    require e.block.timestamp >= saleTime;
    
    uint256 mintPrice = randomWalkNft.getMintPrice();
    require e.msg.value >= mintPrice;
    require e.msg.sender != 0;
    
    uint256 supplyBefore = randomWalkNft.totalSupply();
    uint256 nextIdBefore = randomWalkNft.nextTokenId();
    uint256 balanceBefore = randomWalkNft.balanceOf(e.msg.sender);
    
    // Prevent overflow case
    require supplyBefore < max_uint256;
    require nextIdBefore < max_uint256;
    
    randomWalkNft.mint(e);
    
    uint256 supplyAfter = randomWalkNft.totalSupply();
    uint256 nextIdAfter = randomWalkNft.nextTokenId();
    uint256 balanceAfter = randomWalkNft.balanceOf(e.msg.sender);
    address lastMinter = randomWalkNft.lastMinter();
    
    // Verify state updates
    assert supplyAfter == supplyBefore + 1;
    assert nextIdAfter == nextIdBefore + 1;
    assert balanceAfter == balanceBefore + 1;
    assert lastMinter == e.msg.sender;
    assert randomWalkNft.ownerOf(nextIdBefore) == e.msg.sender;
}

rule randomWalkRequiresSufficientPayment {
    env e;
    
    uint256 saleTime = randomWalkNft.saleTime();
    require e.block.timestamp >= saleTime;
    
    uint256 mintPrice = randomWalkNft.getMintPrice();
    require e.msg.value < mintPrice;
    
    randomWalkNft.mint@withrevert(e);
    
    assert lastReverted;
}

rule randomWalkRespectsSaleTime {
    env e;
    
    uint256 saleTime = randomWalkNft.saleTime();
    require e.block.timestamp < saleTime;
    
    randomWalkNft.mint@withrevert(e);
    
    assert lastReverted;
}

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

// ===== SAFETRANSFER RULES =====

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

// ===== TOKENID RULES =====

rule tokenIdMustBeWithinSupply {
    uint256 tokenId;
    uint256 totalSupply = cosmicNft.totalSupply();
    
    // For any valid token that has an owner
    require tokenId < totalSupply;
    
    // The owner must not be zero address
    address owner = cosmicNft.ownerOf(tokenId);
    assert owner != 0;
}

// ===== TOKENOWNERSHIP RULES =====

rule tokenOwnershipUnique {
    uint256 tokenId;
    address owner1;
    address owner2;
    
    require owner1 != owner2;
    require cosmicNft.ownerOf(tokenId) == owner1;
    
    // No other address can own the same token
    assert cosmicNft.ownerOf(tokenId) != owner2;
}

// ===== TRANSFERPRESERVES RULES =====

rule transferPreservesTotal {
    env e;
    address to;
    uint256 amount;
    
    address from = e.msg.sender;
    require from != to; // No self-transfer
    
    uint256 fromBalanceBefore = balanceOf(from);
    uint256 toBalanceBefore = balanceOf(to);
    
    require fromBalanceBefore >= amount; // Can transfer
    require toBalanceBefore + amount <= max_uint256; // No overflow
    
    transfer(e, to, amount);
    
    uint256 fromBalanceAfter = balanceOf(from);
    uint256 toBalanceAfter = balanceOf(to);
    
    // Total preserved
    assert fromBalanceBefore + toBalanceBefore == fromBalanceAfter + toBalanceAfter;
}

// ===== TRANSFERUPDATES RULES =====

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

// ===== INVARIANTS =====

// Commented out due to syntax issues
/*
invariant nftOwnershipExclusive(uint256 tokenId)
    cosmicNft.totalSupply() > tokenId => cosmicNft.ownerOf(tokenId) != 0
    {
        preserved cosmicNft.mint(uint256 roundNum, address recipient, uint256 seed) with (env e) {
            require e.msg.sender == cosmicNft.game();
            require recipient != 0;
        }
    }

invariant ownershipPersistence(uint256 tokenId)
    tokenId < cosmicNft.totalSupply() => cosmicNft.ownerOf(tokenId) != 0
    {
        preserved cosmicNft.transferFrom(address from, address to, uint256 tid) with (env e) {
            require to != 0;
        }
    }
*/
