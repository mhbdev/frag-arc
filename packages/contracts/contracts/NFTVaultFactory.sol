// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "./NFTVault.sol";

/**
 * @title NFTVaultFactory
 * @notice Factory contract that creates and registers bidirectional NFTVault instances on the Arc network.
 */
contract NFTVaultFactory {
    address[] public allVaults;
    mapping(address => address[]) public vaultsByCurator;
    mapping(address => mapping(uint256 => address)) public nftToVault;

    event VaultCreated(
        address indexed vault,
        address indexed curator,
        address indexed nftContract,
        uint256 tokenId,
        uint256 tokenAmount,
        uint8 tokenType,
        address fractionToken,
        string tokenName,
        string tokenSymbol,
        uint256 totalSupply,
        uint256 reservePrice,
        uint256 auctionLength
    );

    /**
     * @notice Creates a new NFT vault, transfers the NFT from the curator to the vault, and mints fraction tokens.
     */
    function createVault(
        address nftContract,
        uint256 tokenId,
        uint256 tokenAmount,
        NFTVault.TokenType tokenType,
        string memory tokenName,
        string memory tokenSymbol,
        uint256 initialSupply,
        uint256 reservePrice,
        uint256 auctionLength
    ) external returns (address vaultAddress) {
        require(nftContract != address(0), "Invalid NFT contract");
        require(initialSupply > 0, "Supply must be > 0");
        require(reservePrice > 0, "Reserve price must be > 0");

        if (tokenType == NFTVault.TokenType.ERC721) {
            require(tokenAmount == 1, "ERC721 amount must be 1");
        } else {
            require(tokenAmount > 0, "ERC1155 amount must be > 0");
        }

        // Deploy vault
        NFTVault vault = new NFTVault(
            nftContract,
            tokenId,
            tokenAmount,
            tokenType,
            address(this)
        );

        vaultAddress = address(vault);

        // Transfer NFT from curator into vault
        if (tokenType == NFTVault.TokenType.ERC721) {
            IERC721(nftContract).safeTransferFrom(msg.sender, vaultAddress, tokenId);
        } else {
            IERC1155(nftContract).safeTransferFrom(
                msg.sender,
                vaultAddress,
                tokenId,
                tokenAmount,
                ""
            );
        }

        // Initialize vault (which deploys FractionToken and mints to msg.sender)
        vault.initialize(
            tokenName,
            tokenSymbol,
            initialSupply,
            reservePrice,
            auctionLength,
            msg.sender
        );

        // Track vault
        allVaults.push(vaultAddress);
        vaultsByCurator[msg.sender].push(vaultAddress);
        nftToVault[nftContract][tokenId] = vaultAddress;

        emit VaultCreated(
            vaultAddress,
            msg.sender,
            nftContract,
            tokenId,
            tokenAmount,
            uint8(tokenType),
            address(vault.fractionToken()),
            tokenName,
            tokenSymbol,
            initialSupply,
            reservePrice,
            auctionLength
        );
    }

    function getAllVaults() external view returns (address[] memory) {
        return allVaults;
    }

    function getVaultCount() external view returns (uint256) {
        return allVaults.length;
    }

    function getVaultsByCurator(address curator) external view returns (address[] memory) {
        return vaultsByCurator[curator];
    }
}
