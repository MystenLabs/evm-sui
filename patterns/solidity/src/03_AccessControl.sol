// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title 03 — Access control (Ownable / AccessControl)
/// @notice #3 most-deployed OZ category (115k+). Every privileged path is an
///         identity check: "is msg.sender on the list?" — the list being a
///         storage slot an attacker only needs one bug to rewrite.
/// @dev Sui counterpart: `access_control.move` — authority is an OBJECT you
///      hold (`AdminCap`), checked by the type system at call time. The
///      OZ-for-Sui `openzeppelin_access` package layers familiar role-based
///      semantics (and two-step transfer) on top of that capability model.

/// Single-admin flavor. `Ownable2Step` = transfer must be accepted by the
/// recipient, preventing ownership burns via typo'd addresses.
contract OwnedVault is Ownable2Step {
    uint256 public parameter;

    constructor(address admin) Ownable(admin) {}

    function setParameter(uint256 value) external onlyOwner {
        parameter = value;
    }
}

/// Multi-role flavor: separate roles per privilege, admin can grant/revoke.
contract RoleGuardedVault is AccessControl {
    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");
    bytes32 public constant DRAINER_ROLE = keccak256("DRAINER_ROLE");

    uint256 public parameter;

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function setParameter(uint256 value) external onlyRole(SETTER_ROLE) {
        parameter = value;
    }

    function drain(address payable to) external onlyRole(DRAINER_ROLE) {
        to.transfer(address(this).balance);
    }

    receive() external payable {}
}
