// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC3156FlashLender} from "@openzeppelin/contracts/interfaces/IERC3156FlashLender.sol";

import {PatternToken} from "../src/01_FungibleToken.sol";
import {PatternNFT} from "../src/02_Nft.sol";
import {OwnedVault, RoleGuardedVault} from "../src/03_AccessControl.sol";
import {CounterV1, CounterV2} from "../src/04_UpgradeableCounter.sol";
import {AccountFactory, UserAccount} from "../src/05_Factory.sol";
import {NftEscrow} from "../src/06_Escrow.sol";
import {NftEscrow as EscrowForNft} from "../src/06_Escrow.sol";
import {TeamVesting} from "../src/07_Vesting.sol";
import {MultisigWallet} from "../src/08_Multisig.sol";
import {MerkleAirdrop} from "../src/09_MerkleAirdrop.sol";
import {PermitToken, PermitDeposits} from "../src/10_Permit.sol";
import {FlashToken, FlashBorrower} from "../src/11_FlashLoan.sol";
import {VulnerableVault, HardenedVault} from "../src/12_SecurityPatterns.sol";
import {MiniGovernor} from "../src/13_Governance.sol";

/// One smoke test per snippet: proves each pattern's happy path executes and,
/// where relevant, that its Solidity-specific hazard is real (reentrancy) or
/// defended (CEI/mutex).
contract PatternsTest is Test {
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    // 01 — ERC-20
    function test_01_token_mint_burn() public {
        PatternToken t = new PatternToken(address(this));
        t.mint(alice, 1000);
        assertEq(t.balanceOf(alice), 1000);
        vm.prank(alice);
        t.burn(400);
        assertEq(t.balanceOf(alice), 600);
    }

    // 02 — ERC-721
    function test_02_nft_mint() public {
        PatternNFT n = new PatternNFT(address(this));
        uint256 id = n.mint(alice, "ipfs://token/1");
        assertEq(n.ownerOf(id), alice);
        assertEq(n.tokenURI(id), "ipfs://token/1");
    }

    // 03 — access control
    function test_03_ownable_two_step() public {
        OwnedVault v = new OwnedVault(address(this));
        v.setParameter(42);
        assertEq(v.parameter(), 42);
        v.transferOwnership(alice); // pending until accepted
        assertEq(v.owner(), address(this));
        vm.prank(alice);
        v.acceptOwnership();
        assertEq(v.owner(), alice);
    }

    function test_03_roles() public {
        RoleGuardedVault v = new RoleGuardedVault(address(this));
        v.grantRole(v.SETTER_ROLE(), alice);
        vm.prank(alice);
        v.setParameter(7);
        assertEq(v.parameter(), 7);
        vm.prank(bob);
        vm.expectRevert();
        v.setParameter(9);
    }

    // 04 — UUPS upgrade
    function test_04_uups_upgrade_preserves_state() public {
        CounterV1 impl = new CounterV1();
        bytes memory init = abi.encodeCall(CounterV1.initialize, (address(this)));
        CounterV1 counter = CounterV1(address(new ERC1967Proxy(address(impl), init)));
        counter.increment();
        counter.increment();
        assertEq(counter.count(), 2);

        CounterV2 implV2 = new CounterV2();
        counter.upgradeToAndCall(address(implV2), abi.encodeCall(CounterV2.initializeV2, (5)));
        CounterV2 upgraded = CounterV2(address(counter));
        assertEq(upgraded.count(), 2); // state survived the upgrade
        upgraded.increment();
        assertEq(upgraded.count(), 7); // now steps by 5
    }

    // 05 — factory + clones
    function test_05_factory_clones() public {
        AccountFactory f = new AccountFactory();
        vm.prank(alice);
        address a1 = f.createAccount();
        assertEq(UserAccount(payable(a1)).owner(), alice);
        vm.prank(alice);
        vm.expectRevert(bytes("already created"));
        f.createAccount();
    }

    // 06 — escrow
    function test_06_escrow_buy() public {
        PatternNFT nft = new PatternNFT(address(this));
        uint256 id = nft.mint(alice, "ipfs://x");
        NftEscrow escrow = new NftEscrow();
        vm.startPrank(alice);
        nft.approve(address(escrow), id);
        uint256 dealId = escrow.list(nft, id, 1 ether);
        vm.stopPrank();

        vm.deal(bob, 1 ether);
        vm.prank(bob);
        escrow.buy{value: 1 ether}(dealId);
        assertEq(nft.ownerOf(id), bob);
        assertEq(alice.balance, 1 ether);
    }

    // 07 — vesting
    function test_07_vesting_linear_release() public {
        uint64 start = uint64(block.timestamp);
        uint64 duration = 100;
        TeamVesting v = new TeamVesting(alice, start, duration);
        vm.deal(address(v), 100 ether);
        vm.warp(start + 50);
        v.release(); // half vested
        assertEq(alice.balance, 50 ether);
        vm.warp(start + 100);
        v.release();
        assertEq(alice.balance, 100 ether);
    }

    // 08 — multisig
    function test_08_multisig_2of3() public {
        address[] memory owners = new address[](3);
        owners[0] = address(this);
        owners[1] = alice;
        owners[2] = bob;
        MultisigWallet w = new MultisigWallet(owners, 2);
        vm.deal(address(w), 5 ether);

        uint256 txId = w.submit(bob, 1 ether, "");
        w.confirm(txId);
        vm.prank(alice);
        w.confirm(txId);
        uint256 before = bob.balance;
        w.execute(txId);
        assertEq(bob.balance, before + 1 ether);
    }

    // 09 — merkle airdrop (2-leaf tree computed inline)
    function test_09_merkle_claim() public {
        PatternToken token = new PatternToken(address(this));
        uint256 amtA = 100;
        uint256 amtB = 200;
        bytes32 leafA = keccak256(bytes.concat(keccak256(abi.encode(alice, amtA))));
        bytes32 leafB = keccak256(bytes.concat(keccak256(abi.encode(bob, amtB))));
        bytes32 root = leafA < leafB
            ? keccak256(abi.encode(leafA, leafB))
            : keccak256(abi.encode(leafB, leafA));

        MerkleAirdrop drop = new MerkleAirdrop(IERC20(address(token)), root);
        token.mint(address(drop), 1000);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leafB;
        drop.claim(alice, amtA, proof);
        assertEq(token.balanceOf(alice), amtA);
        vm.expectRevert(bytes("already claimed"));
        drop.claim(alice, amtA, proof);
    }

    // 10 — permit (EIP-2612)
    function test_10_permit_deposit() public {
        uint256 pk = 0xA11CE;
        address owner = vm.addr(pk);
        PermitToken token = new PermitToken(0);
        deal(address(token), owner, 500);
        PermitDeposits sink = new PermitDeposits();

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner,
                address(sink),
                uint256(300),
                token.nonces(owner),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);

        sink.depositWithPermit(IERC20(address(token)), owner, 300, deadline, v, r, s);
        assertEq(sink.deposited(owner), 300);
        assertEq(token.balanceOf(address(sink)), 300);
    }

    // 11 — flash loan
    function test_11_flash_loan_repays_with_fee() public {
        FlashToken token = new FlashToken(1_000_000);
        FlashBorrower borrower = new FlashBorrower();
        uint256 loan = 100_000;
        uint256 fee = token.flashFee(address(token), loan);
        assertEq(fee, 100); // 0.1%
        // fund borrower with the fee so it can repay principal + fee
        token.transfer(address(borrower), fee);
        borrower.borrow(IERC3156FlashLender(address(token)), address(token), loan);
        // loan repaid + fee burned: supply shrinks by the fee
        assertEq(token.totalSupply(), 1_000_000 - fee);
    }

    // 12 — security: reentrancy is real on the vulnerable vault, blocked on hardened
    function test_12_vulnerable_is_drained() public {
        VulnerableVault vuln = new VulnerableVault();
        vm.deal(address(this), 1 ether);
        vuln.deposit{value: 1 ether}();
        Attacker atk = new Attacker(vuln);
        vm.deal(address(atk), 1 ether);
        atk.attack();
        // attacker withdrew more than it deposited — the vault is drained
        assertGt(address(atk).balance, 1 ether);
        assertEq(address(vuln).balance, 0);
    }

    function test_12_hardened_blocks_reentrancy() public {
        HardenedVault safe = new HardenedVault(address(this));
        vm.deal(address(this), 1 ether);
        safe.deposit{value: 1 ether}();
        HardenedAttacker atk = new HardenedAttacker(safe);
        vm.deal(address(atk), 1 ether);
        // the re-entrant withdraw hits the mutex and reverts; that bubbles
        // through the outer withdraw's require(ok), so the whole attack fails
        // atomically — nothing is stolen.
        vm.expectRevert();
        atk.attack();
        // state untouched: attacker keeps its 1 ether, vault keeps ours
        assertEq(address(atk).balance, 1 ether);
        assertEq(address(safe).balance, 1 ether);
    }

    // 13 — governance
    function test_13_governance_vote_execute() public {
        PatternToken token = new PatternToken(address(this));
        token.mint(alice, 700);
        token.mint(bob, 300);
        MiniGovernor gov = new MiniGovernor(IERC20(address(token)));
        uint256 id = gov.propose("raise the cap");
        vm.prank(alice);
        gov.castVote(id, true);
        vm.prank(bob);
        gov.castVote(id, false);
        vm.warp(block.timestamp + 3 days + 1);
        gov.execute(id); // yes(700) > no(300)
        (,,,, bool executed) = gov.proposals(id);
        assertTrue(executed);
    }
}

/// Reentrancy attacker for the vulnerable vault.
contract Attacker {
    VulnerableVault public vault;

    constructor(VulnerableVault v) {
        vault = v;
    }

    function attack() external payable {
        vault.deposit{value: 1 ether}();
        vault.withdraw();
    }

    receive() external payable {
        if (address(vault).balance >= 1 ether) {
            vault.withdraw(); // re-enter before balance is zeroed
        }
    }
}

/// Same attack against the hardened vault — the mutex reverts the re-entry.
contract HardenedAttacker {
    HardenedVault public vault;

    constructor(HardenedVault v) {
        vault = v;
    }

    function attack() external payable {
        vault.deposit{value: 1 ether}();
        vault.withdraw();
    }

    receive() external payable {
        if (address(vault).balance >= 1 ether) {
            vault.withdraw();
        }
    }
}
