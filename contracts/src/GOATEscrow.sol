// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title GOATEscrow
 * @dev A generic escrow smart contract for autonomous agent commerce on GOAT Network (EVM).
 * This contract acts as a secure custody layer for ERC-20 tokens until an external
 * settlement decision is made. It contains no negotiation or verification logic -
 * only fund custody and state management.
 *
 * Key Features:
 * - Secure ERC-20 token custody with SafeERC20
 * - Reentrancy protection on all state-changing functions
 * - Access control for escrow participants
 * - Custom errors for gas-efficient reverts
 * - Events for all state transitions
 * - Metadata hash for external agreement/transcript linkage
 * - Optional expiration timestamps
 * - Modular design for future settlement integration
 */
contract GOATEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============================================================
    // Types & Constants
    // ============================================================

    /// @dev Escrow lifecycle status
    enum EscrowStatus {
        Created,      // Escrow created but no funds deposited
        Funded,       // Buyer has deposited funds
        Active,       // Escrow is active and awaiting settlement
        Released,     // Funds released to seller
        Refunded,     // Funds refunded to buyer
        Cancelled,    // Escrow cancelled before funding/activation
        Expired       // Escrow expired (optional time-based expiry)
    }

    /// @dev Main escrow data structure
    struct Escrow {
        bytes32 escrowId;           // Unique escrow identifier (keccak256 of params)
        address buyer;              // Buyer address
        address seller;             // Seller address
        address token;              // ERC-20 token address
        uint256 amount;             // Amount in token's smallest unit
        EscrowStatus status;        // Current escrow status
        uint256 createdAt;          // Creation timestamp
        uint256 expiresAt;          // Optional expiration timestamp (0 = no expiry)
        bytes32 metadataHash;       // Hash of external agreement/transcript (keccak256)
        uint256 depositedAmount;    // Actual amount deposited (for partial deposits)
    }

    // ============================================================
    // State Variables
    // ============================================================

    /// @dev Mapping from escrowId to escrow data
    mapping(bytes32 => Escrow) private _escrows;

    /// @dev Array of all escrow IDs for enumeration
    bytes32[] private _escrowIds;

    /// @dev Mapping from address to escrow IDs they participate in
    mapping(address => bytes32[]) private _userEscrows;

    // ============================================================
    // Custom Errors
    // ============================================================

    error EscrowAlreadyExists(bytes32 escrowId);
    error EscrowNotFound(bytes32 escrowId);
    error InvalidEscrowId();
    error UnauthorizedCaller(address caller);
    error NotBuyer(address caller);
    error NotSeller(address caller);
    error NotParticipant(address caller);
    error InvalidStatus(EscrowStatus current, EscrowStatus expected);
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientBalance(uint256 required, uint256 available);
    error InsufficientAllowance(uint256 required, uint256 available);
    error TransferFailed();
    error EscrowAlreadyExpired(bytes32 escrowId);
    error EscrowNotExpired(bytes32 escrowId);
    error InvalidExpiration(uint256 expiresAt);
    error MetadataHashMismatch(bytes32 expected, bytes32 actual);
    error ReentrancyAttempt();
    error EscrowAlreadyFunded(bytes32 escrowId);
    error AmountMismatch(uint256 expected, uint256 actual);

    // ============================================================
    // Events
    // ============================================================

    /// @dev Emitted when a new escrow is created
    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        address token,
        uint256 amount,
        uint256 expiresAt,
        bytes32 metadataHash,
        uint256 createdAt
    );

    /// @dev Emitted when buyer deposits funds into escrow
    event EscrowFunded(
        bytes32 indexed escrowId,
        address indexed buyer,
        uint256 amount,
        uint256 totalDeposited,
        uint256 timestamp
    );

    /// @dev Emitted when escrow becomes active (after funding)
    event EscrowActivated(
        bytes32 indexed escrowId,
        uint256 timestamp
    );

    /// @dev Emitted when funds are released to seller
    event EscrowReleased(
        bytes32 indexed escrowId,
        address indexed seller,
        uint256 amount,
        uint256 timestamp
    );

    /// @dev Emitted when funds are refunded to buyer
    event EscrowRefunded(
        bytes32 indexed escrowId,
        address indexed buyer,
        uint256 amount,
        uint256 timestamp
    );

    /// @dev Emitted when escrow is cancelled
    event EscrowCancelled(
        bytes32 indexed escrowId,
        address indexed caller,
        uint256 timestamp
    );

    /// @dev Emitted when escrow expires
    event EscrowExpired(
        bytes32 indexed escrowId,
        uint256 timestamp
    );

    /// @dev Emitted when metadata hash is verified/updated
    event MetadataVerified(
        bytes32 indexed escrowId,
        bytes32 metadataHash,
        uint256 timestamp
    );

    // ============================================================
    // Constructor
    // ============================================================

    constructor() Ownable(msg.sender) {
        // Ownable sets deployer as owner for potential admin functions
    }

    // ============================================================
    // Core Lifecycle Functions
    // ============================================================

    /**
     * @dev Creates a new escrow with the specified parameters.
     * The escrow starts in 'Created' status - no funds are locked yet.
     * Caller must be the buyer.
     *
     * @param buyer Address of the buyer (funds provider)
     * @param seller Address of the seller (funds recipient)
     * @param token ERC-20 token contract address
     * @param amount Amount to escrow (in token's smallest unit)
     * @param expiresAt Optional expiration timestamp (0 = no expiry)
     * @param metadataHash Hash of external agreement/transcript (keccak256)
     * @return escrowId Unique identifier for the created escrow
     */
    function createEscrow(
        address buyer,
        address seller,
        address token,
        uint256 amount,
        uint256 expiresAt,
        bytes32 metadataHash
    ) external nonReentrant returns (bytes32 escrowId) {
        _validateCreateParams(buyer, seller, token, amount, expiresAt);

        // Caller must be the buyer
        if (msg.sender != buyer) {
            revert NotBuyer(msg.sender);
        }

        // Generate deterministic escrow ID
        escrowId = _generateEscrowId(buyer, seller, token, amount, expiresAt, metadataHash);

        // Check for duplicate
        if (_escrows[escrowId].buyer != address(0)) {
            revert EscrowAlreadyExists(escrowId);
        }

        uint256 createdAt = block.timestamp;

        // Initialize escrow
        _escrows[escrowId] = Escrow({
            escrowId: escrowId,
            buyer: buyer,
            seller: seller,
            token: token,
            amount: amount,
            status: EscrowStatus.Created,
            createdAt: createdAt,
            expiresAt: expiresAt,
            metadataHash: metadataHash,
            depositedAmount: 0
        });

        _escrowIds.push(escrowId);
        _userEscrows[buyer].push(escrowId);
        _userEscrows[seller].push(escrowId);

        emit EscrowCreated(escrowId, buyer, seller, token, amount, expiresAt, metadataHash, createdAt);
    }

    /**
     * @dev Allows the buyer to deposit ERC-20 funds into the escrow.
     * Can be called multiple times for partial deposits.
     * Transitions status from Created -> Funded -> Active when fully funded.
     *
     * @param escrowId The escrow identifier
     * @param amount Amount to deposit (in token's smallest unit)
     */
    function deposit(bytes32 escrowId, uint256 amount) external nonReentrant {
        Escrow storage escrow = _getEscrow(escrowId);

        // Caller must be the buyer
        if (msg.sender != escrow.buyer) {
            revert NotBuyer(msg.sender);
        }

        // Validate escrow is in a fundable state
        if (escrow.status != EscrowStatus.Created && escrow.status != EscrowStatus.Funded) {
            revert InvalidStatus(escrow.status, EscrowStatus.Created);
        }

        // Check expiration
        if (escrow.expiresAt != 0 && block.timestamp >= escrow.expiresAt) {
            _expireEscrow(escrowId, escrow);
            revert EscrowAlreadyExpired(escrowId);
        }

        if (amount == 0) {
            revert ZeroAmount();
        }

        // Check if adding this amount would exceed the total
        uint256 newDepositedAmount = escrow.depositedAmount + amount;
        if (newDepositedAmount > escrow.amount) {
            revert AmountMismatch(escrow.amount, newDepositedAmount);
        }

        // Transfer tokens from buyer to this contract
        IERC20(escrow.token).safeTransferFrom(escrow.buyer, address(this), amount);

        // Update deposited amount
        escrow.depositedAmount = newDepositedAmount;

        // Update status
        EscrowStatus previousStatus = escrow.status;
        if (newDepositedAmount == escrow.amount) {
            escrow.status = EscrowStatus.Active;
        } else {
            escrow.status = EscrowStatus.Funded;
        }

        emit EscrowFunded(escrowId, escrow.buyer, amount, newDepositedAmount, block.timestamp);

        // Emit activation event if fully funded
        if (previousStatus != EscrowStatus.Active && escrow.status == EscrowStatus.Active) {
            emit EscrowActivated(escrowId, block.timestamp);
        }
    }

    /**
     * @dev Allows cancellation of escrow before funds are deposited or activated.
     * Can be called by buyer or seller before any deposit, or by buyer if only partially funded.
     * After full funding/activation, cancellation is not allowed - use external settlement.
     *
     * @param escrowId The escrow identifier
     */
    function cancel(bytes32 escrowId) external nonReentrant {
        Escrow storage escrow = _getEscrow(escrowId);

        // Caller must be a participant
        if (msg.sender != escrow.buyer && msg.sender != escrow.seller) {
            revert NotParticipant(msg.sender);
        }

        // Check expiration first
        if (escrow.expiresAt != 0 && block.timestamp >= escrow.expiresAt) {
            _expireEscrow(escrowId, escrow);
            revert EscrowAlreadyExpired(escrowId);
        }

        // Can only cancel if no funds deposited or only partially funded by buyer
        if (escrow.status == EscrowStatus.Active || escrow.status == EscrowStatus.Released) {
            revert InvalidStatus(escrow.status, EscrowStatus.Created);
        }

        // If seller tries to cancel, no funds must be deposited
        if (msg.sender == escrow.seller && escrow.depositedAmount > 0) {
            revert UnauthorizedCaller(msg.sender);
        }

        // Refund any deposited funds to buyer
        if (escrow.depositedAmount > 0) {
            IERC20(escrow.token).safeTransfer(escrow.buyer, escrow.depositedAmount);
            escrow.depositedAmount = 0;
        }

        escrow.status = EscrowStatus.Cancelled;

        emit EscrowCancelled(escrowId, msg.sender, block.timestamp);
    }

    // ============================================================
    // Settlement Functions (for external settlement mechanisms)
    // ============================================================

    /**
     * @dev Releases escrowed funds to the seller.
     * This should be called by an authorized settlement mechanism (multisig, oracle, etc.)
     * after external verification is complete.
     *
     * @param escrowId The escrow identifier
     * @param amount Amount to release (must equal total deposited amount)
     */
    function release(bytes32 escrowId, uint256 amount) external nonReentrant {
        Escrow storage escrow = _getEscrow(escrowId);

        // Only owner (or authorized settlement contract) can call this
        if (msg.sender != owner()) {
            revert UnauthorizedCaller(msg.sender);
        }

        // Must be in Active status
        if (escrow.status != EscrowStatus.Active) {
            revert InvalidStatus(escrow.status, EscrowStatus.Active);
        }

        // Check expiration
        if (escrow.expiresAt != 0 && block.timestamp >= escrow.expiresAt) {
            _expireEscrow(escrowId, escrow);
            revert EscrowAlreadyExpired(escrowId);
        }

        if (amount != escrow.depositedAmount) {
            revert AmountMismatch(escrow.depositedAmount, amount);
        }

        if (amount == 0) {
            revert ZeroAmount();
        }

        // Transfer to seller
        IERC20(escrow.token).safeTransfer(escrow.seller, amount);
        escrow.depositedAmount = 0;
        escrow.status = EscrowStatus.Released;

        emit EscrowReleased(escrowId, escrow.seller, amount, block.timestamp);
    }

    /**
     * @dev Refunds escrowed funds to the buyer.
     * This should be called by an authorized settlement mechanism after
     * external verification determines the deal should be cancelled.
     *
     * @param escrowId The escrow identifier
     * @param amount Amount to refund (must equal total deposited amount)
     */
    function refund(bytes32 escrowId, uint256 amount) external nonReentrant {
        Escrow storage escrow = _getEscrow(escrowId);

        // Only owner (or authorized settlement contract) can call this
        if (msg.sender != owner()) {
            revert UnauthorizedCaller(msg.sender);
        }

        // Must be in Active or Funded status
        if (escrow.status != EscrowStatus.Active && escrow.status != EscrowStatus.Funded) {
            revert InvalidStatus(escrow.status, EscrowStatus.Active);
        }

        if (amount != escrow.depositedAmount) {
            revert AmountMismatch(escrow.depositedAmount, amount);
        }

        if (amount == 0) {
            revert ZeroAmount();
        }

        // Transfer back to buyer
        IERC20(escrow.token).safeTransfer(escrow.buyer, amount);
        escrow.depositedAmount = 0;
        escrow.status = EscrowStatus.Refunded;

        emit EscrowRefunded(escrowId, escrow.buyer, amount, block.timestamp);
    }

    /**
     * @dev Marks an escrow as expired if the expiration time has passed.
     * Can be called by anyone to trigger the expiry state transition.
     *
     * @param escrowId The escrow identifier
     */
    function expire(bytes32 escrowId) external nonReentrant {
        Escrow storage escrow = _getEscrow(escrowId);

        if (escrow.expiresAt == 0) {
            revert InvalidExpiration(0);
        }

        if (block.timestamp < escrow.expiresAt) {
            revert EscrowNotExpired(escrowId);
        }

        if (escrow.status == EscrowStatus.Expired ||
            escrow.status == EscrowStatus.Released ||
            escrow.status == EscrowStatus.Refunded ||
            escrow.status == EscrowStatus.Cancelled) {
            revert InvalidStatus(escrow.status, EscrowStatus.Active);
        }

        _expireEscrow(escrowId, escrow);
    }

    // ============================================================
    // Read Functions
    // ============================================================

    /**
     * @dev Returns the full escrow data for a given escrow ID.
     *
     * @param escrowId The escrow identifier
     * @return escrow The escrow data struct
     */
    function getEscrow(bytes32 escrowId) external view returns (Escrow memory escrow) {
        escrow = _escrows[escrowId];
        if (escrow.buyer == address(0)) {
            revert EscrowNotFound(escrowId);
        }
    }

    /**
     * @dev Returns the current status of an escrow.
     *
     * @param escrowId The escrow identifier
     * @return status The current escrow status
     */
    function getEscrowStatus(bytes32 escrowId) external view returns (EscrowStatus status) {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.buyer == address(0)) {
            revert EscrowNotFound(escrowId);
        }
        status = escrow.status;
    }

    /**
     * @dev Returns the deposited amount for an escrow.
     *
     * @param escrowId The escrow identifier
     * @return depositedAmount The amount currently deposited
     */
    function getDepositedAmount(bytes32 escrowId) external view returns (uint256 depositedAmount) {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.buyer == address(0)) {
            revert EscrowNotFound(escrowId);
        }
        depositedAmount = escrow.depositedAmount;
    }

    /**
     * @dev Returns the remaining amount needed to fully fund the escrow.
     *
     * @param escrowId The escrow identifier
     * @return remainingAmount The amount still needed
     */
    function getRemainingAmount(bytes32 escrowId) external view returns (uint256 remainingAmount) {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.buyer == address(0)) {
            revert EscrowNotFound(escrowId);
        }
        remainingAmount = escrow.amount - escrow.depositedAmount;
    }

    /**
     * @dev Checks if an escrow has expired.
     *
     * @param escrowId The escrow identifier
     * @return expired True if escrow has expired
     */
    function isExpired(bytes32 escrowId) external view returns (bool expired) {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.buyer == address(0)) {
            revert EscrowNotFound(escrowId);
        }
        expired = escrow.expiresAt != 0 && block.timestamp >= escrow.expiresAt;
    }

    /**
     * @dev Returns the contract's token balance for a specific token.
     *
     * @param token The ERC-20 token address
     * @return balance The contract's balance of that token
     */
    function getContractBalance(address token) external view returns (uint256 balance) {
        balance = IERC20(token).balanceOf(address(this));
    }

    /**
     * @dev Returns all escrow IDs for a given user (buyer or seller).
     *
     * @param user The user address
     * @return escrowIds Array of escrow IDs
     */
    function getUserEscrows(address user) external view returns (bytes32[] memory escrowIds) {
        return _userEscrows[user];
    }

    /**
     * @dev Returns the total number of escrows created.
     *
     * @return count Total escrow count
     */
    function getTotalEscrows() external view returns (uint256 count) {
        count = _escrowIds.length;
    }

    /**
     * @dev Returns an escrow ID by index.
     *
     * @param index The index in the escrow array
     * @return escrowId The escrow ID at that index
     */
    function getEscrowByIndex(uint256 index) external view returns (bytes32 escrowId) {
        if (index >= _escrowIds.length) {
            revert InvalidEscrowId();
        }
        escrowId = _escrowIds[index];
    }

    /**
     * @dev Verifies that the metadata hash matches the stored value.
     *
     * @param escrowId The escrow identifier
     * @param metadataHash The hash to verify
     * @return matches True if the hash matches
     */
    function verifyMetadata(bytes32 escrowId, bytes32 metadataHash) external view returns (bool matches) {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.buyer == address(0)) {
            revert EscrowNotFound(escrowId);
        }
        matches = escrow.metadataHash == metadataHash;
    }

    // ============================================================
    // Internal Helper Functions
    // ============================================================

    /// @dev Validates parameters for escrow creation
    function _validateCreateParams(
        address buyer,
        address seller,
        address token,
        uint256 amount,
        uint256 expiresAt
    ) internal view {
        if (buyer == address(0)) revert ZeroAddress();
        if (seller == address(0)) revert ZeroAddress();
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (buyer == seller) revert UnauthorizedCaller(buyer);
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert InvalidExpiration(expiresAt);
    }

    /// @dev Generates a deterministic escrow ID from parameters
    function _generateEscrowId(
        address buyer,
        address seller,
        address token,
        uint256 amount,
        uint256 expiresAt,
        bytes32 metadataHash
    ) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(
            buyer,
            seller,
            token,
            amount,
            expiresAt,
            metadataHash,
            block.chainid
        ));
    }

    /// @dev Retrieves escrow storage reference with existence check
    function _getEscrow(bytes32 escrowId) internal view returns (Escrow storage) {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.buyer == address(0)) {
            revert EscrowNotFound(escrowId);
        }
        return escrow;
    }

    /// @dev Internal logic to expire an escrow and refund buyer
    function _expireEscrow(bytes32 escrowId, Escrow storage escrow) internal {
        if (escrow.depositedAmount > 0) {
            IERC20(escrow.token).safeTransfer(escrow.buyer, escrow.depositedAmount);
            escrow.depositedAmount = 0;
        }
        escrow.status = EscrowStatus.Expired;
        emit EscrowExpired(escrowId, block.timestamp);
    }
}