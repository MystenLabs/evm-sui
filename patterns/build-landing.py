#!/usr/bin/env python3
"""Generate docs/patterns.html from the real snippet sources.

Reads each Solidity + Move (or native) pair and emits a side-by-side landing
page in the repo's shared theme (the inline <style> block is inherited from
docs/index.html). Run after the Move package is in place:

    python3 patterns/build-landing.py
"""
import html
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SOL = ROOT / "solidity" / "src"
MOVE = ROOT / "move" / "patterns" / "sources"
NATIVE = ROOT / "native"
OUT = ROOT.parent / "docs" / "patterns.html"

# (num, title, blurb, solidity_file, right_label, right_file)
PATTERNS = [
    ("01", "Fungible token", "ERC-20 keeps every balance in one contract mapping; nobody holds anything. On Sui, <code>Coin&lt;T&gt;</code> objects <em>are</em> the balances and holders own them directly.", "01_FungibleToken.sol", "fungible_token.move", MOVE / "fungible_token.move"),
    ("02", "NFT", "One contract per ERC-721 collection, metadata behind a URI. On Sui each NFT is a first-class object and <code>Display</code> renders metadata natively.", "02_Nft.sol", "nft.move", MOVE / "nft.move"),
    ("03", "Access control", "<code>Ownable</code>/<code>AccessControl</code> gate on \"is msg.sender on the list?\". Sui checks possession of a capability <em>object</em> — OpenZeppelin Contracts for Sui layers familiar roles on top.", "03_AccessControl.sol", "access_control.move", MOVE / "access_control.move"),
    ("04", "Upgradeability", "UUPS proxies <code>delegatecall</code> an implementation so code changes while storage stays — append-only forever. Sui upgrades packages natively; the chain enforces layout compatibility.", "04_UpgradeableCounter.sol", "versioned.move", MOVE / "versioned.move"),
    ("05", "Factory / clones", "Factories mint &gt;90% of all EVM contracts (Ethereum + Polygon since 2020); the cheapest ones stamp out 45-byte ERC-1167 clones. On Sui the pattern vanishes: one package serves unlimited object instances.", "05_Factory.sol", "no_factory.move", MOVE / "no_factory.move"),
    ("06", "Escrow", "The EVM escrow takes custody and must hand assets back correctly on every path. On Sui the item is a shared object that can't be silently dropped.", "06_Escrow.sol", "escrow.move", MOVE / "escrow.move"),
    ("07", "Vesting", "OZ <code>VestingWallet</code> releases linearly over time. On Sui the wallet is an object the beneficiary owns, releasing against the on-chain <code>Clock</code> — the same mental model OpenZeppelin Contracts for Sui's finance package packages for production.", "07_Vesting.sol", "vesting.move", MOVE / "vesting.move"),
    ("08", "Multisig", "Shared custody on EVM is a Safe contract with a confirmation transaction per co-signer. On Sui multisig is a <em>native key scheme</em> — signatures combine off-chain, no contract at all.", "08_Multisig.sol", "native/multisig.sh", NATIVE / "multisig.sh"),
    ("09", "Merkle airdrop", "Pushing to thousands of recipients is too costly, so EVM airdrops publish a merkle root and make claimers prove membership. Sui's parallelism makes direct distribution viable — no proofs.", "09_MerkleAirdrop.sol", "airdrop.move", MOVE / "airdrop.move"),
    ("10", "Gasless UX", "EIP-2612 <code>permit</code> replaces an <code>approve</code> tx with a signed message, per token. Sui makes gas sponsorship native to <em>every</em> transaction — no per-asset opt-in.", "10_Permit.sol", "native/sponsored-tx.ts", NATIVE / "sponsored-tx.ts"),
    ("11", "Flash loan", "ERC-3156 requires a callback and checks balances after — the re-entry surface behind many exploits. Sui's hot-potato <code>Receipt</code> has no abilities, so the tx literally cannot end unpaid.", "11_FlashLoan.sol", "flash_loan.move", MOVE / "flash_loan.move"),
    ("12", "Security canon", "CEI, reentrancy guards and SafeMath defend against dynamic dispatch and silent overflow. Move has neither — most of the canon is moot; what remains is rounding and access.", "12_SecurityPatterns.sol", "security.move", MOVE / "security.move"),
    ("13", "Governance", "Token-weighted propose/vote/execute. On Sui a shared <code>Proposal</code> object is mutated concurrently by voters, with the <code>Clock</code> as deadline.", "13_Governance.sol", "governance.move", MOVE / "governance.move"),
]

LANG = {".sol": "solidity", ".move": "move", ".sh": "bash", ".ts": "typescript"}

INDEX = OUT.parent / "index.html"


def shared_style():
    """Extract the inline <style>…</style> block from docs/index.html so the
    patterns page inherits the exact same theme (this branch inlines its CSS
    rather than shipping a style.css file)."""
    text = INDEX.read_text()
    start = text.index("<style>") + len("<style>")
    end = text.index("</style>", start)
    return text[start:end]


def read(path):
    try:
        return path.read_text()
    except FileNotFoundError:
        return f"// (pending) {path.name} not found — build the Move package first"


def code_block(path, source_hint):
    ext = path.suffix
    body = html.escape(read(path))
    lang = LANG.get(ext, "text")
    return (
        f'<div class="codehead"><span class="fname">{html.escape(source_hint)}</span>'
        f'<span class="lang">{lang}</span></div>'
        f'<pre class="code {lang}"><code>{body}</code></pre>'
    )


def section(num, title, blurb, sol_file, right_label, right_path):
    left = code_block(SOL / sol_file, f"solidity/src/{sol_file}")
    right = code_block(right_path, right_label if "/" in right_label else f"move/patterns/sources/{right_label}")
    warn = ""
    if num == "12":
        warn = ('<div class="warn-strip">⚠️ <code>VulnerableVault</code> in the Solidity file is '
                'deliberately exploitable — a teaching artifact. Never deploy it.</div>')
    return f"""
<section id="p{num}">
  <div class="shell">
    <div class="section-head">
      <span class="section-num">Pattern {num}</span>
      <h2>{html.escape(title)}</h2>
    </div>
    <p class="section-sub">{blurb}</p>
    {warn}
    <div class="pair">
      <div class="col col-sol"><div class="col-tag sol">Solidity · EVM</div>{left}</div>
      <div class="col col-move"><div class="col-tag move">Move · Sui</div>{right}</div>
    </div>
  </div>
</section>"""


def toc_cards():
    cards = []
    for num, title, *_ in PATTERNS:
        cards.append(
            f'<a class="toc-card" href="#p{num}"><span class="toc-num">{num}</span>'
            f'<span class="toc-title">{html.escape(title)}</span></a>'
        )
    return "\n".join(cards)


sections = "\n".join(section(*p) for p in PATTERNS)

DOC = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Everyday Solidity, done on Sui · 13 patterns side by side</title>
<meta name="description" content="Thirteen of the most common Solidity/EVM patterns — tokens, access control, upgrades, factories, escrow, vesting, multisig, airdrops, permit, flash loans, governance — each paired with its idiomatic Sui Move equivalent." />
<meta property="og:title" content="Everyday Solidity, done on Sui" />
<meta property="og:description" content="Thirteen everyday Solidity patterns paired side by side with their idiomatic Sui Move equivalents." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://mystenlabs.github.io/evm-sui/patterns.html" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="Everyday Solidity, done on Sui" />
<meta name="twitter:description" content="13 Solidity patterns paired with idiomatic Sui Move." />
<link rel="canonical" href="https://mystenlabs.github.io/evm-sui/patterns.html" />
<style>
{shared_style()}
</style>
<style>
  /* patterns page — extends the shared token system inherited above */
  .pair {{ display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }}
  @media (max-width: 980px) {{ .pair {{ grid-template-columns: 1fr; }} }}
  .col {{ border: 1px solid var(--line); border-radius: 10px; background: var(--bg-card); overflow: hidden; }}
  .col-tag {{ font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
    padding: 10px 14px; border-bottom: 1px solid var(--line); }}
  .col-tag.sol {{ color: var(--warn); background: var(--warn-soft); }}
  .col-tag.move {{ color: var(--accent); background: var(--accent-soft); }}
  .codehead {{ display: flex; justify-content: space-between; align-items: center;
    padding: 8px 14px; border-bottom: 1px solid var(--line-soft); background: var(--bg-soft); }}
  .codehead .fname {{ font-family: var(--mono); font-size: 11px; color: var(--text-soft); }}
  .codehead .lang {{ font-family: var(--mono); font-size: 10px; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: 0.1em; }}
  pre.code {{ margin: 0; padding: 16px 14px; overflow-x: auto; font-family: var(--mono);
    font-size: 12.5px; line-height: 1.55; color: var(--text); background: var(--bg-soft); max-height: 560px; }}
  pre.code code {{ background: none; border: 0; padding: 0; color: inherit; font-size: inherit; white-space: pre; }}
  .warn-strip {{ border: 1px solid rgba(240,180,41,0.35); background: var(--warn-soft); color: var(--text);
    border-radius: 8px; padding: 12px 16px; margin: 0 0 20px; font-size: 14px; }}
  .warn-strip code {{ color: var(--warn); }}
  .toc-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }}
  @media (max-width: 880px) {{ .toc-grid {{ grid-template-columns: repeat(2, 1fr); }} }}
  .toc-card {{ display: flex; align-items: center; gap: 12px; border: 1px solid var(--line);
    border-radius: 8px; padding: 14px 16px; background: var(--bg-card); color: var(--text); }}
  .toc-card:hover {{ border-color: var(--accent-line); }}
  .toc-num {{ font-family: var(--mono); font-size: 12px; color: var(--accent); }}
  .toc-title {{ font-size: 14px; font-weight: 500; }}
</style>
</head>
<body>

<div class="rail">
  <div class="shell rail-inner">
    <span class="brand">
      <svg width="17" height="22" viewBox="0 0 783 1000" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M626.027 417.029C666.817 468.244 691.209 533.014 691.209 603.469C691.209 673.925 666.076 740.673 624.214 792.176L620.588 796.626L619.641 790.981C618.817 786.201 617.869 781.34 616.757 776.478C595.785 684.349 527.471 605.365 415.03 541.378C339.095 498.28 295.626 446.448 284.213 387.487C276.838 349.375 282.318 311.098 292.907 278.301C303.496 245.545 319.235 218.063 332.626 201.541L376.383 148.06C384.046 138.666 398.426 138.666 406.09 148.06L626.068 417.029H626.027ZM695.206 363.59L402.01 5.12968C396.407 -1.70989 385.942 -1.70989 380.338 5.12968L87.184 363.59L86.2363 364.784C32.3026 431.738 0 516.821 0 609.444C0 825.138 175.151 1000 391.174 1000C607.198 1000 782.349 825.138 782.349 609.444C782.349 516.821 750.046 431.738 696.112 364.826L695.165 363.631L695.206 363.59ZM157.351 415.876L183.556 383.779L184.339 389.712C184.957 394.409 185.74 399.106 186.646 403.844C203.622 492.883 264.23 567.088 365.546 624.565C453.637 674.708 504.934 732.35 519.684 795.554C525.864 821.924 526.936 847.881 524.258 870.584L524.093 871.985L522.816 872.603C483.055 892.009 438.351 902.927 391.133 902.927C225.459 902.927 91.1394 768.855 91.1394 603.428C91.1394 532.396 115.902 467.172 157.269 415.793L157.351 415.876Z" fill="#298DFF"/>
      </svg>
      <a href="./">EVM × Sui</a>
    </span>
    <span class="nav">
      <a href="walrus.html">Walrus</a>
      <a href="patterns.html" style="color: var(--text);">Patterns</a>
      <a href="https://github.com/MystenLabs/evm-sui">GitHub</a>
    </span>
  </div>
</div>

<header class="hero">
  <div class="shell hero-inner">
    <span class="eyebrow">Chapter 2 · Solidity → Sui</span>
    <h1>Everyday Solidity, <em>done on Sui</em>.</h1>
    <p class="lede">
      Thirteen of the most common Solidity/EVM patterns — ranked by real-world prevalence — each paired with
      its idiomatic Sui Move equivalent. Read the left column in a language you know; read the right to see how
      the object model, capabilities, and native features change the shape of the answer. Where
      <a href="https://docs.openzeppelin.com/contracts-sui">OpenZeppelin Contracts for Sui</a> applies, we use it.
    </p>
    <div class="meta">
      <span><strong>Source:</strong> <a href="https://github.com/MystenLabs/evm-sui/tree/main/patterns">patterns/</a></span>
      <span><strong>Solidity:</strong> Foundry · OZ v5 · 15 passing tests</span>
      <span><strong>Sui:</strong> Move 2024 · OZ Contracts for Sui</span>
    </div>
  </div>
</header>

<section class="tight">
  <div class="shell">
    <div class="section-head"><span class="section-num">Index</span><h2>The thirteen patterns</h2></div>
    <div class="toc-grid">
{toc_cards()}
    </div>
  </div>
</section>

{sections}

<footer class="hero" style="border-top:1px solid var(--line);border-bottom:0;padding:56px 0;">
  <div class="shell hero-inner">
    <p class="section-sub" style="margin:0;">
      Pattern selection from a prevalence-ranked deep-research report. Two patterns (multisig, gasless) have no
      contract on Sui — the platform provides them — so their right column is a shell/TS snippet, which is the lesson.
      See <a href="https://github.com/MystenLabs/evm-sui/tree/main/patterns">patterns/README.md</a> to build and test both sides.
    </p>
  </div>
</footer>

</body>
</html>
"""

OUT.write_text(DOC)
print(f"wrote {OUT} ({len(DOC):,} bytes, {len(PATTERNS)} patterns)")
