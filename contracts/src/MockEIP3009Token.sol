// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockEIP3009Token is ERC20 {
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    constructor() ERC20("Mock EIP3009 USDC", "mEIP3009") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8,
        bytes32,
        bytes32
    ) external {
        require(block.timestamp > validAfter, "authorization not yet valid");
        require(block.timestamp < validBefore, "authorization expired");
        require(!authorizationState[from][nonce], "authorization used");
        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }
}
