// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./FractionToken.sol";

/**
 * @title NFTVault
 * @notice Production-grade bidirectional decentralized vault for fractionalizing NFTs on the Arc network.
 * @dev Arc's native currency is USDC with 18 decimals. All buyout bids, refunds, and payouts
 * operate natively in USDC.
 */
contract NFTVault is IERC721Receiver, IERC1155Receiver, ReentrancyGuard {
    enum VaultState {
        INACTIVE,
        ACTIVE,
        AUCTION,
        REDEEMED,
        BOUGHT_OUT
    }

    enum TokenType {
        ERC721,
        ERC1155
    }

    // --- State Variables ---
    address public immutable factory;
    address public immutable nftContract;
    uint256 public immutable tokenId;
    uint256 public immutable tokenAmount; // 1 for ERC721, >= 1 for ERC1155
    TokenType public immutable tokenType;

    FractionToken public fractionToken;
    address public curator;
    uint256 public reservePrice; // in native USDC wei (18 decimals)
    VaultState public state;

    // Auction variables
    uint256 public auctionLength;
    uint256 public auctionEndTime;
    uint256 public currentBid; // in native USDC wei
    address public currentBidder;
    uint256 public totalBuyoutProceeds; // locked for fraction token burn claims

    // Constants
    uint256 public constant MIN_BID_INCREMENT_BPS = 500; // 5%
    uint256 public constant ANTI_SNIPE_WINDOW = 15 minutes;
    uint256 public constant ANTI_SNIPE_EXTENSION = 15 minutes;

    // Pull-over-push withdrawals for outbid amounts
    mapping(address => uint256) public pendingWithdrawals;

    // --- Events ---
    event VaultInitialized(
        address indexed fractionToken,
        address indexed curator,
        uint256 totalSupply,
        uint256 reservePrice,
        uint256 auctionLength
    );
    event VaultRedeemed(address indexed redeemer, address indexed nftContract, uint256 tokenId);
    event BuyoutAuctionStarted(address indexed bidder, uint256 bidAmount, uint256 auctionEndTime);
    event BuyoutBidPlaced(address indexed bidder, uint256 bidAmount, uint256 auctionEndTime);
    event RefundCredited(address indexed previousBidder, uint256 amount);
    event RefundWithdrawn(address indexed recipient, uint256 amount);
    event BuyoutAuctionConcluded(address indexed winner, uint256 finalPrice);
    event FractionsBurnedAndClaimed(
        address indexed claimant,
        uint256 fractionAmount,
        uint256 usdcPayout
    );
    event ReservePriceUpdated(uint256 newReservePrice);
    event CuratorTransferred(address indexed previousCurator, address indexed newCurator);

    // --- Modifiers ---
    modifier onlyCurator() {
        require(msg.sender == curator, "Only curator can call");
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "Only factory can call");
        _;
    }

    constructor(
        address nftContract_,
        uint256 tokenId_,
        uint256 tokenAmount_,
        TokenType tokenType_,
        address factory_
    ) {
        require(nftContract_ != address(0), "Invalid NFT contract");
        require(factory_ != address(0), "Invalid factory");
        nftContract = nftContract_;
        tokenId = tokenId_;
        tokenAmount = tokenAmount_;
        tokenType = tokenType_;
        factory = factory_;
        state = VaultState.INACTIVE;
    }

    /**
     * @notice Initializes the vault, deploys the FractionToken, and distributes initial fractions.
     */
    function initialize(
        string memory tokenName,
        string memory tokenSymbol,
        uint256 initialSupply,
        uint256 reservePrice_,
        uint256 auctionLength_,
        address curator_
    ) external onlyFactory {
        require(state == VaultState.INACTIVE, "Already initialized");
        require(curator_ != address(0), "Invalid curator");
        require(initialSupply > 0, "Initial supply must be > 0");
        require(reservePrice_ > 0, "Reserve price must be > 0");
        require(auctionLength_ >= 10 minutes, "Auction length too short");

        curator = curator_;
        reservePrice = reservePrice_;
        auctionLength = auctionLength_;

        // Deploy FractionToken owned by this vault
        fractionToken = new FractionToken(
            tokenName,
            tokenSymbol,
            18,
            address(this),
            initialSupply,
            curator_
        );

        state = VaultState.ACTIVE;

        emit VaultInitialized(
            address(fractionToken),
            curator_,
            initialSupply,
            reservePrice_,
            auctionLength_
        );
    }

    // =========================================================================
    // BIDIRECTIONAL REDEMPTION PATH 1: DIRECT 100% FRACTION BURN
    // =========================================================================

    /**
     * @notice Direct reconstitution of the NFT by burning 100% of fractional tokens.
     * @dev Caller must hold the entire total supply of fractional tokens.
     */
    function redeem() external nonReentrant {
        require(state == VaultState.ACTIVE, "Vault is not active");
        uint256 total = fractionToken.totalSupply();
        require(total > 0, "Total supply must be > 0");
        require(
            fractionToken.balanceOf(msg.sender) == total,
            "Must hold 100% of fractional tokens to redeem"
        );

        // Vault burns the 100% supply from caller
        fractionToken.vaultBurn(msg.sender, total);

        state = VaultState.REDEEMED;

        // Release underlying NFT to caller
        _transferNFT(msg.sender);

        emit VaultRedeemed(msg.sender, nftContract, tokenId);
    }

    // =========================================================================
    // BIDIRECTIONAL REDEMPTION PATH 2: USDC BUYOUT AUCTION & PRO-RATA BURN
    // =========================================================================

    /**
     * @notice Initiates a buyout auction by depositing native USDC (18 decimals).
     * @dev On Arc, msg.value is native USDC.
     */
    function startBuyout() external payable nonReentrant {
        require(state == VaultState.ACTIVE, "Vault is not active");
        require(msg.value >= reservePrice, "Bid below reserve price");

        state = VaultState.AUCTION;
        currentBid = msg.value;
        currentBidder = msg.sender;
        auctionEndTime = block.timestamp + auctionLength;

        emit BuyoutAuctionStarted(msg.sender, msg.value, auctionEndTime);
    }

    /**
     * @notice Places a higher bid during an active buyout auction.
     */
    function bid() external payable nonReentrant {
        require(state == VaultState.AUCTION, "Auction not active");
        require(block.timestamp < auctionEndTime, "Auction already ended");

        uint256 minIncrement = (currentBid * MIN_BID_INCREMENT_BPS) / 10000;
        uint256 minRequiredBid = currentBid + minIncrement;
        require(msg.value >= minRequiredBid, "Bid increment too low");

        // Credit previous bidder's funds for withdrawal (Pull-over-Push pattern)
        address prevBidder = currentBidder;
        uint256 prevBid = currentBid;
        pendingWithdrawals[prevBidder] += prevBid;
        emit RefundCredited(prevBidder, prevBid);

        // Update current auction state
        currentBid = msg.value;
        currentBidder = msg.sender;

        // Anti-sniping extension
        if (auctionEndTime - block.timestamp < ANTI_SNIPE_WINDOW) {
            auctionEndTime = block.timestamp + ANTI_SNIPE_EXTENSION;
        }

        emit BuyoutBidPlaced(msg.sender, msg.value, auctionEndTime);
    }

    /**
     * @notice Allows an outbid bidder to securely withdraw their refunded USDC.
     */
    function withdrawPendingFunds() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No pending funds");

        pendingWithdrawals[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Refund transfer failed");

        emit RefundWithdrawn(msg.sender, amount);
    }

    /**
     * @notice Concludes an expired buyout auction, sends NFT to winner, and locks proceeds for claims.
     */
    function endBuyout() external nonReentrant {
        require(state == VaultState.AUCTION, "Auction not active");
        require(block.timestamp >= auctionEndTime, "Auction has not ended yet");

        state = VaultState.BOUGHT_OUT;
        totalBuyoutProceeds = currentBid;

        // Transfer underlying NFT to winning bidder
        _transferNFT(currentBidder);

        emit BuyoutAuctionConcluded(currentBidder, currentBid);
    }

    /**
     * @notice Fraction token holders burn their tokens to claim their exact pro-rata share of the winning USDC buyout.
     * @param fractionAmount Amount of fractional tokens to burn.
     */
    function burnAndClaim(uint256 fractionAmount) external nonReentrant {
        require(state == VaultState.BOUGHT_OUT, "Vault has not been bought out");
        require(fractionAmount > 0, "Fraction amount must be > 0");
        require(
            fractionToken.balanceOf(msg.sender) >= fractionAmount,
            "Insufficient fraction balance"
        );

        uint256 currentSupply = fractionToken.totalSupply();
        require(currentSupply > 0, "No fractions left to burn");

        // Calculate pro-rata payout
        uint256 usdcPayout = (fractionAmount * totalBuyoutProceeds) / currentSupply;
        require(usdcPayout > 0, "Payout is zero");

        // Deduct payout from total proceeds for remaining holders
        totalBuyoutProceeds -= usdcPayout;

        // Burn caller's fractional tokens
        fractionToken.vaultBurn(msg.sender, fractionAmount);

        // Transfer native USDC payout to claimant
        (bool success, ) = payable(msg.sender).call{value: usdcPayout}("");
        require(success, "USDC payout transfer failed");

        emit FractionsBurnedAndClaimed(msg.sender, fractionAmount, usdcPayout);
    }

    // =========================================================================
    // CURATOR GOVERNANCE
    // =========================================================================

    /**
     * @notice Updates the buyout reserve price before an auction has started.
     */
    function updateReservePrice(uint256 newReservePrice) external onlyCurator {
        require(state == VaultState.ACTIVE, "Can only update while active");
        require(newReservePrice > 0, "Reserve price must be > 0");
        reservePrice = newReservePrice;
        emit ReservePriceUpdated(newReservePrice);
    }

    /**
     * @notice Transfers curator role to a new address.
     */
    function transferCurator(address newCurator) external onlyCurator {
        require(newCurator != address(0), "Invalid new curator");
        address prev = curator;
        curator = newCurator;
        emit CuratorTransferred(prev, newCurator);
    }

    // =========================================================================
    // INTERNAL HELPERS & RECEIVER HOOKS
    // =========================================================================

    function _transferNFT(address to) internal {
        require(to != address(0), "Cannot transfer NFT to zero address");
        if (tokenType == TokenType.ERC721) {
            IERC721(nftContract).safeTransferFrom(address(this), to, tokenId);
        } else {
            IERC1155(nftContract).safeTransferFrom(address(this), to, tokenId, tokenAmount, "");
        }
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external view override returns (bytes4) {
        require(msg.sender == nftContract, "Unauthorized NFT transfer");
        return this.onERC721Received.selector;
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external view override returns (bytes4) {
        require(msg.sender == nftContract, "Unauthorized NFT transfer");
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        revert("Batch received not supported");
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == type(IERC721Receiver).interfaceId ||
            interfaceId == type(IERC1155Receiver).interfaceId;
    }
}
