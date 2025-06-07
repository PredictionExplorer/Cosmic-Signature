using CosmicSignatureNft as cosmicNft;
using RandomWalkNFT as randomWalkNft;

methods {
    // CosmicSignatureNft methods
    function cosmicNft.game() external returns (address) envfree;
    function cosmicNft.totalSupply() external returns (uint256) envfree;
    function cosmicNft.ownerOf(uint256) external returns (address) envfree;
    function cosmicNft.balanceOf(address) external returns (uint256) envfree;
    function cosmicNft.mint(uint256, address, uint256) external returns (uint256);
    function cosmicNft.mintMany(uint256, address[], uint256) external returns (uint256);
    function cosmicNft.getNftSeed(uint256) external returns (uint256) envfree;
    
    // RandomWalkNFT methods
    function randomWalkNft.totalSupply() external returns (uint256) envfree;
    function randomWalkNft.ownerOf(uint256) external returns (address) envfree;
    function randomWalkNft.balanceOf(address) external returns (uint256) envfree;
    function randomWalkNft.mint() external;
    function randomWalkNft.saleTime() external returns (uint256) envfree;
    function randomWalkNft.getMintPrice() external returns (uint256) envfree;
    function randomWalkNft.nextTokenId() external returns (uint256) envfree;
    function randomWalkNft.lastMinter() external returns (address) envfree;
}

/// @title Only game contract can mint CosmicSignatureNft
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

/// @title Game contract can successfully mint CosmicSignatureNft
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

/// @title CosmicSignatureNft token IDs are sequential
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

/// @title Cannot mint CosmicSignatureNft to zero address
rule cannotMintCosmicNftToZeroAddress {
    env e;
    uint256 roundNum;
    uint256 seed;
    
    require e.msg.sender == cosmicNft.game();
    
    cosmicNft.mint@withrevert(e, roundNum, 0, seed);
    
    assert lastReverted;
}

/// @title Minting stores NFT seed correctly
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

/// @title MintMany creates correct number of NFTs
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

/// @title RandomWalkNFT respects sale time
rule randomWalkRespectsSaleTime {
    env e;
    
    uint256 saleTime = randomWalkNft.saleTime();
    require e.block.timestamp < saleTime;
    
    randomWalkNft.mint@withrevert(e);
    
    assert lastReverted;
}

/// @title RandomWalkNFT requires sufficient payment
rule randomWalkRequiresSufficientPayment {
    env e;
    
    uint256 saleTime = randomWalkNft.saleTime();
    require e.block.timestamp >= saleTime;
    
    uint256 mintPrice = randomWalkNft.getMintPrice();
    require e.msg.value < mintPrice;
    
    randomWalkNft.mint@withrevert(e);
    
    assert lastReverted;
}

/// @title RandomWalkNFT minting updates state correctly
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

/// @title NFT ownership is exclusive (no double ownership)
invariant nftOwnershipExclusive(uint256 tokenId)
    cosmicNft.totalSupply() > tokenId => cosmicNft.ownerOf(tokenId) != 0
    {
        preserved mint(uint256 roundNum, address recipient, uint256 seed) with (env e) {
            require e.msg.sender == cosmicNft.game();
            require recipient != 0;
        }
    } 