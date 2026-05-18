// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {QuiltedCollection} from "../src/QuiltedCollection.sol";

/// Deploy script for `QuiltedCollection`. All constructor args are read from
/// the environment so the off-chain TS wrapper (showcases/06-quilted-collection/
/// src/deploy.ts) can drive this without re-encoding calldata.
///
/// Required env:
///   - QC_NAME        collection name
///   - QC_SYMBOL      token symbol
///   - QC_QUILT_ID    base64url quiltId (already in the form the aggregator URL uses)
///   - QC_AGGREGATOR  e.g. https://aggregator.walrus-testnet.walrus.space
///   - QC_MAX_SUPPLY  positive integer
contract DeployQuiltedCollection is Script {
    function run() external {
        string memory name_ = vm.envString("QC_NAME");
        string memory symbol_ = vm.envString("QC_SYMBOL");
        string memory quiltId_ = vm.envString("QC_QUILT_ID");
        string memory aggregator_ = vm.envString("QC_AGGREGATOR");
        uint256 maxSupply_ = vm.envUint("QC_MAX_SUPPLY");

        vm.startBroadcast();
        QuiltedCollection collection = new QuiltedCollection(
            name_,
            symbol_,
            quiltId_,
            aggregator_,
            maxSupply_,
            msg.sender
        );
        console2.log("QuiltedCollection deployed at:", address(collection));
        console2.log("  name:       ", name_);
        console2.log("  symbol:     ", symbol_);
        console2.log("  quiltId:    ", quiltId_);
        console2.log("  aggregator: ", aggregator_);
        console2.log("  maxSupply:  ", maxSupply_);
        vm.stopBroadcast();
    }
}
