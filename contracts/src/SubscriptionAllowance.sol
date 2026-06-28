// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SubscriptionAllowance {
    struct Permission {
        address owner;
        address token;
        address subChain;
        address merchant;
        uint256 planId;
        uint128 perChargeCap;
        uint128 periodCap;
        uint128 totalCap;
        uint64 minInterval;
        uint64 expiry;
        uint64 lastChargeAt;
        uint128 spentThisPeriod;
        uint128 totalSpent;
        uint32 periodIndex;
        bool revoked;
    }

    uint256 public permissionCount;
    mapping(uint256 => Permission) public permissions;

    event PermissionGranted(
        uint256 indexed permissionId,
        address indexed owner,
        address indexed subChain,
        uint256 planId,
        address merchant,
        address token
    );
    event PermissionRevoked(uint256 indexed permissionId, address indexed owner);
    event PermissionConsumed(uint256 indexed permissionId, uint256 indexed subscriptionId, uint128 amount, uint32 periodIndex);

    error InvalidPermission();
    error NotOwner();
    error Revoked();
    error Expired();
    error WrongTarget();
    error WrongMerchant();
    error WrongPlan();
    error WrongToken();
    error ChargeTooHigh();
    error PeriodCapExceeded();
    error TotalCapExceeded();
    error TooEarly();

    function grantAllowance(Permission calldata permission) external returns (uint256 permissionId) {
        if (
            permission.owner != msg.sender || permission.owner == address(0) || permission.token == address(0)
                || permission.subChain == address(0) || permission.merchant == address(0) || permission.planId == 0
                || permission.perChargeCap == 0 || permission.expiry <= block.timestamp
        ) {
            revert InvalidPermission();
        }

        permissionId = ++permissionCount;
        permissions[permissionId] = permission;
        emit PermissionGranted(permissionId, permission.owner, permission.subChain, permission.planId, permission.merchant, permission.token);
    }

    function revokeAllowance(uint256 permissionId) external {
        Permission storage permission = permissions[permissionId];
        if (permission.owner != msg.sender) revert NotOwner();
        permission.revoked = true;
        emit PermissionRevoked(permissionId, msg.sender);
    }

    function getPermission(uint256 permissionId) external view returns (Permission memory) {
        return permissions[permissionId];
    }

    function validateAndConsume(
        uint256 permissionId,
        uint256 subscriptionId,
        address token,
        address merchant,
        uint256 planId,
        uint128 amount,
        uint32 periodIndex
    ) external {
        Permission storage permission = permissions[permissionId];
        if (permission.owner == address(0)) revert InvalidPermission();
        if (permission.revoked) revert Revoked();
        if (block.timestamp > permission.expiry) revert Expired();
        if (msg.sender != permission.subChain) revert WrongTarget();
        if (merchant != permission.merchant) revert WrongMerchant();
        if (planId != permission.planId) revert WrongPlan();
        if (token != permission.token) revert WrongToken();
        if (amount > permission.perChargeCap) revert ChargeTooHigh();
        if (permission.minInterval != 0 && permission.lastChargeAt != 0 && block.timestamp < permission.lastChargeAt + permission.minInterval) {
            revert TooEarly();
        }

        if (periodIndex != permission.periodIndex) {
            permission.periodIndex = periodIndex;
            permission.spentThisPeriod = 0;
        }

        if (permission.periodCap != 0 && permission.spentThisPeriod + amount > permission.periodCap) {
            revert PeriodCapExceeded();
        }
        if (permission.totalCap != 0 && permission.totalSpent + amount > permission.totalCap) {
            revert TotalCapExceeded();
        }

        permission.spentThisPeriod += amount;
        permission.totalSpent += amount;
        permission.lastChargeAt = uint64(block.timestamp);

        emit PermissionConsumed(permissionId, subscriptionId, amount, periodIndex);
    }
}
