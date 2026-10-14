// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FractionToken
 * @notice ERC-20 token representing fractional ownership of an underlying NFT locked in an NFTVault.
 * @dev Minted upon vault creation; only the parent vault (owner) can call vaultBurn when users redeem or claim.
 */
contract FractionToken is ERC20, ERC20Burnable, Ownable {
    uint8 private immutable _customDecimals;

    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address vaultOwner_,
        uint256 initialSupply_,
        address recipient_
    ) ERC20(name_, symbol_) Ownable(vaultOwner_) {
        require(vaultOwner_ != address(0), "Vault cannot be zero address");
        require(recipient_ != address(0), "Recipient cannot be zero address");
        require(initialSupply_ > 0, "Initial supply must be greater than 0");

        _customDecimals = decimals_;
        _mint(recipient_, initialSupply_);
        emit TokensMinted(recipient_, initialSupply_);
    }

    function decimals() public view virtual override returns (uint8) {
        return _customDecimals;
    }

    /**
     * @notice Allows the vault contract to burn tokens directly from a user during redemption or buyout claiming.
     * @param from Address whose tokens are being burned.
     * @param amount Amount of fractional tokens to burn.
     */
    function vaultBurn(address from, uint256 amount) external onlyOwner {
        require(from != address(0), "Cannot burn from zero address");
        _burn(from, amount);
        emit TokensBurned(from, amount);
    }
}
