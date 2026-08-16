// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/VJTITieredBadge.sol";

contract DeployVJTITieredBadge is Script {
    function run() external returns (VJTITieredBadge badge) {
        // Standard ERC-721 Data URIs for the 3 Tiers (Light Node, Synced Node, Validator)
        string memory tier1Uri = 'data:application/json;utf8,{"name":"VJTI ETH Light Node Badge","description":"Granted for attending the VJTI Blockchain Introduction Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafkreihg6vfx2mezfy3rwyz3dydqplhxoaxizbvuksm5vadlzmkzevq75q","attributes":[{"trait_type":"Tier","value":"Light Node"},{"trait_type":"Event","value":"Blockchain Introduction Workshop 2026"}]}';
        
        string memory tier2Uri = 'data:application/json;utf8,{"name":"VJTI ETH Synced Node Badge","description":"Granted for active participation and two-way interaction at the VJTI Blockchain Introduction Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafkreicvnkwltluuwp3phzesdmnlmgl2ksl43nzgd7rymww52gsm5zfnvi","attributes":[{"trait_type":"Tier","value":"Synced Node"},{"trait_type":"Event","value":"Blockchain Introduction Workshop 2026"}]}';
        
        string memory tier3Uri = 'data:application/json;utf8,{"name":"VJTI ETH Validator Badge","description":"Granted for exceptional contributions and insightful solutions at the VJTI Blockchain Introduction Workshop.","image":"https://red-managing-hyena-295.mypinata.cloud/ipfs/bafkreig4rl6cdtwjpeajbdaedlknkfmsymbunddn4bh2poeucpxgcmjuvq","attributes":[{"trait_type":"Tier","value":"Validator"},{"trait_type":"Event","value":"Blockchain Introduction Workshop 2026"}]}';

        vm.startBroadcast();
        badge = new VJTITieredBadge(tier1Uri, tier2Uri, tier3Uri);
        vm.stopBroadcast();

        console.log("VJTITieredBadge deployed at:", address(badge));
    }
}
