// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockArcNFT
 * @notice Demo NFT collection ("ArcGenesis") for testing fragmentation and bidirectional redemption on Arc.
 */
contract MockArcNFT is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    event Minted(address indexed to, uint256 indexed tokenId, string tokenURI);

    constructor() ERC721("ArcGenesis", "ARCGEN") Ownable(msg.sender) {}

    /**
     * @notice Public minting function to facilitate easy testnet faucet testing.
     */
    function mint(address to, string memory uri) external returns (uint256) {
        require(to != address(0), "Cannot mint to zero address");
        uint256 tokenId = ++_nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        emit Minted(to, tokenId, uri);
        return tokenId;
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }
}
