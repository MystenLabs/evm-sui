// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {EvmWalNFT} from "../src/EvmWalNFT.sol";

contract DeployEvmWalNFT is Script {
    function run() external {
        vm.startBroadcast();
        EvmWalNFT nft = new EvmWalNFT(msg.sender);
        console2.log("EvmWalNFT deployed at:", address(nft));
        vm.stopBroadcast();
    }
}
