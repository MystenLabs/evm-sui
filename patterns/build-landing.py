#!/usr/bin/env python3
"""Generate docs/patterns.html — the "Diff Terminal" pattern browser.

Reads each Solidity + Move (or native) pair and emits a keyboard-first,
IDE-styled browser: file tree on the left, the two panes side by side,
`d` morphs the pair into a unified diff, `⌘K` opens a jump palette.
The page is self-contained (own stylesheet, inline JS, no dependencies)
and degrades to a plain stacked document when JS is unavailable.

    python3 patterns/build-landing.py
"""
import html
import json
import pathlib
import re

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

# ─── syntax highlighting (build-time, phosphor palette) ────────────────────

KEYWORDS = {
    "solidity": "pragma solidity contract interface library abstract is constructor function modifier event error struct enum mapping returns return emit revert require assert if else for while do break continue new delete import using memory storage calldata public external internal private view pure payable virtual override immutable constant indexed anonymous unchecked try catch address bool string bytes uint int uint8 uint16 uint32 uint64 uint128 uint256 int256 bytes4 bytes32 true false",
    "move": "module use public entry fun native struct enum has key store copy drop const let mut if else while loop match return abort assert! vector as phantom friend macro fun spec true false",
    "bash": "if then elif else fi for in do done while case esac function echo export local return exit set read shift",
    "typescript": "import export from const let var function return async await new class interface type extends implements if else for while switch case break continue throw try catch finally typeof instanceof of in true false null undefined void this",
}

COMMENT = {"solidity": "//", "move": "//", "bash": "#", "typescript": "//"}


def _lang_regex(lang):
    kws = "|".join(re.escape(k) for k in KEYWORDS[lang].split())
    cmt = re.escape(COMMENT[lang])
    parts = [
        r"(?P<str>&quot;.*?&quot;|&#x27;.*?&#x27;|`.*?`)",
        rf"(?P<com>{cmt}.*$)",
        rf"(?P<kw>\b(?:{kws})\b|assert!)",
        r"(?P<num>\b\d[\d_]*\b|\b0x[0-9a-fA-F_]+\b)",
        r"(?P<typ>\b[A-Z][A-Za-z0-9_]*\b)",
    ]
    return re.compile("|".join(parts))


REGEX = {lang: _lang_regex(lang) for lang in KEYWORDS}
CLS = {"str": "s", "com": "c", "kw": "k", "num": "n", "typ": "t"}


def highlight(code, lang):
    """Escape + span-wrap tokens. Spans never cross line boundaries, which the
    diff-morph JS relies on to split panes into lines."""
    rx = REGEX[lang]
    out_lines = []
    in_block = False
    for line in code.split("\n"):
        esc = html.escape(line)
        if in_block:
            end = esc.find("*/")
            if end == -1:
                out_lines.append(f'<span class="c">{esc}</span>')
                continue
            head, esc = esc[: end + 2], esc[end + 2:]
            prefix = f'<span class="c">{head}</span>'
        else:
            prefix = ""
        # block comment opening on this line (no strings straddle it in our snippets)
        start = esc.find("/*") if lang != "bash" else -1
        tail = ""
        if start != -1 and COMMENT[lang] == "//" and "//" not in esc[:start]:
            body, rest = esc[:start], esc[start:]
            end = rest.find("*/")
            if end == -1:
                in_block = True
                tail = f'<span class="c">{rest}</span>'
                esc = body
            else:
                tail = f'<span class="c">{rest[: end + 2]}</span>'
                esc, trailing = body, rest[end + 2:]
                tail += rx.sub(_wrap, trailing)
        out_lines.append(prefix + rx.sub(_wrap, esc) + tail)
    return "\n".join(out_lines)


def _wrap(m):
    return f'<span class="{CLS[m.lastgroup]}">{m.group(0)}</span>'


def read(path):
    try:
        return path.read_text().rstrip("\n")
    except FileNotFoundError:
        return f"// (pending) {path.name} not found — build the Move package first"


def slug(right_label):
    return pathlib.Path(right_label).stem


def pane(path, source_hint, side):
    ext = path.suffix
    lang = LANG.get(ext, "text")
    body = highlight(read(path), lang if lang in KEYWORDS else "bash")
    return (
        f'<div class="pane {side}" data-lang="{lang}">'
        f'<div class="codehead"><span class="fname">{html.escape(source_hint)}</span>'
        f'<span class="lang">{lang}</span></div>'
        f'<pre class="code"><code>{body}</code></pre></div>'
    )


def section(num, title, blurb, sol_file, right_label, right_path):
    left = pane(SOL / sol_file, f"solidity/src/{sol_file}", "sol")
    right_hint = right_label if "/" in right_label else f"move/patterns/sources/{right_label}"
    right = pane(right_path, right_hint, "move")
    warn = ""
    if num == "12":
        warn = ('<div class="warn-strip">⚠ <code>VulnerableVault</code> in the Solidity file is '
                'deliberately exploitable — a teaching artifact. Never deploy it.</div>')
    return f"""
<section class="pattern" id="p{num}" data-n="{num}">
  <header class="phead">
    <span class="pnum">pattern {num}/13</span>
    <h2>{html.escape(title)}</h2>
    <p class="blurb">{blurb}</p>
    {warn}
  </header>
  <div class="pair">
    {left}
    {right}
  </div>
  <div class="uniwrap" aria-hidden="true"></div>
</section>"""


def tree_items():
    items = []
    for i, (num, title, _b, sol_file, right_label, _p) in enumerate(PATTERNS):
        items.append(
            f'<a class="titem" href="#p{num}" data-i="{i}">'
            f'<span class="tn">{num}</span><span class="tt">{html.escape(title)}</span>'
            f'<span class="tf">{html.escape(pathlib.Path(sol_file).name)} · {html.escape(pathlib.Path(right_label).name)}</span></a>'
        )
    return "\n".join(items)


TITLES = json.dumps(
    [{"n": n, "t": t, "slug": slug(r)} for n, t, _b, _s, r, _p in PATTERNS]
)

TEMPLATE = r"""<!doctype html>
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
/* ─── diff terminal — committed phosphor world ─────────────────────────── */
:root {
  --bg: #050705;
  --panel: #0b0e0b;
  --panel-2: #0f130f;
  --line: #1c2b1e;
  --line-2: #182418;
  --green: #33FF66;
  --green-soft: #7fb98a;
  --green-dim: #3f5a44;
  --text: #b9e8c4;
  --bright: #eafff0;
  --amber: #FFB000;
  --amber-soft: #d9a45a;
  --syn-k: #4dff7f;
  --syn-s: #ffcf6b;
  --syn-n: #ffe9b0;
  --syn-c: #4a6b52;
  --syn-t: #a8f5c0;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); }
body { font-family: var(--mono); font-size: 14px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
::selection { background: rgba(51, 255, 102, 0.25); color: var(--bright); }
a { color: var(--green); text-decoration: none; }
a:hover, a:focus-visible { color: var(--bright); outline: none; }
a:focus-visible, button:focus-visible { outline: 1px solid var(--green); outline-offset: 2px; }
code { color: var(--syn-s); }

/* app shell */
body.app { height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }
body.app .hero, body.app footer.docfoot { display: none; }
.doc-only { display: initial; }
body.app .doc-only { display: none; }

/* ─── rail ─────────────────────────────────────────────────────────────── */
.rail { border-bottom: 1px solid var(--line); background: var(--panel); flex: none; }
.rail-inner { display: flex; align-items: center; justify-content: space-between; padding: 10px 18px; font-size: 12px; }
.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--bright); }
.brand svg { display: block; }
.brand a { color: inherit; letter-spacing: 0.06em; }
.brand .prompt { color: var(--green-dim); }
.nav { display: flex; gap: 18px; font-size: 12px; }
.nav a { color: var(--green-soft); }
.nav a[aria-current] { color: var(--green); text-shadow: 0 0 8px rgba(51, 255, 102, 0.5); }
.nav a:hover { color: var(--bright); }

/* ─── hero (doc mode / SEO) ────────────────────────────────────────────── */
.hero { padding: 56px 18px 36px; border-bottom: 1px solid var(--line); max-width: 1080px; margin: 0 auto; }
.hero .eyebrow { color: var(--amber); font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; }
h1 { color: var(--bright); font-size: clamp(26px, 4.4vw, 40px); margin: 14px 0 12px; line-height: 1.1; font-weight: 600; letter-spacing: -0.01em; }
h1 em { font-style: normal; color: var(--green); text-shadow: 0 0 14px rgba(51, 255, 102, 0.4); }
.hero p { color: var(--green-soft); max-width: 74ch; margin: 0 0 10px; }
.hero .hint { color: var(--green-dim); font-size: 12.5px; }
.hero .hint kbd { color: var(--green); border: 1px solid var(--line); border-radius: 4px; padding: 0 6px; background: var(--panel); }

/* ─── workbench ────────────────────────────────────────────────────────── */
.workbench { display: block; }
body.app .workbench { flex: 1; display: grid; grid-template-columns: 236px minmax(0, 1fr); min-height: 0; }

/* tree */
#tree { border-right: 1px solid var(--line); background: var(--panel); overflow-y: auto; padding: 10px 0; }
body.doc #tree { max-width: 1080px; margin: 0 auto; border: 1px solid var(--line); border-radius: 8px; padding: 8px; margin-top: 28px; }
.tlabel { display: block; padding: 4px 16px 8px; color: var(--green-dim); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; }
.titem { display: block; padding: 7px 16px; border-left: 2px solid transparent; color: var(--green-soft); font-size: 12.5px; line-height: 1.45; }
.titem:hover { background: var(--panel-2); color: var(--bright); }
.titem .tn { color: var(--amber); margin-right: 8px; }
.titem .tt { color: inherit; }
.titem .tf { display: block; color: var(--green-dim); font-size: 10.5px; padding-left: 26px; }
.titem.sel { border-left-color: var(--green); background: var(--panel-2); color: var(--bright); }
.titem.sel .tt { text-shadow: 0 0 8px rgba(51, 255, 102, 0.45); }

/* stage */
#stage { min-width: 0; }
body.app #stage { overflow-y: auto; padding: 20px 22px 28px; }
body.doc #stage { max-width: 1080px; margin: 0 auto; padding: 0 18px; }
section.pattern { padding: 28px 0 8px; }
body.doc section.pattern { border-bottom: 1px solid var(--line); padding-bottom: 36px; }
body.app section.pattern { display: none; }
body.app section.pattern.active { display: block; padding-top: 0; }
.phead .pnum { color: var(--amber); font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; }
.phead h2 { color: var(--bright); font-size: 24px; margin: 6px 0 8px; font-weight: 600; }
.phead .blurb { color: var(--green-soft); max-width: 88ch; margin: 0 0 18px; font-size: 13.5px; }
.phead .blurb::before { content: "// "; color: var(--green-dim); }
.phead .blurb em { color: var(--bright); font-style: normal; }
.warn-strip { border: 1px solid rgba(255, 176, 0, 0.4); background: rgba(255, 176, 0, 0.07); color: var(--amber-soft);
  border-radius: 6px; padding: 10px 14px; margin: 0 0 16px; font-size: 12.5px; }
.warn-strip code { color: var(--amber); }

/* panes */
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
@media (max-width: 980px) { .pair { grid-template-columns: 1fr; } }
.pane { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); overflow: hidden; min-width: 0; }
.pane.sol { border-top: 2px solid var(--amber); }
.pane.move { border-top: 2px solid var(--green); }
section.focus-move .pane.sol, section.focus-sol .pane.move { display: none; }
section.focus-move .pair, section.focus-sol .pair { grid-template-columns: 1fr; }
.codehead { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px;
  border-bottom: 1px solid var(--line-2); background: var(--panel-2); }
.codehead .fname { font-size: 11px; color: var(--green-soft); }
.codehead .lang { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; }
.pane.sol .codehead .lang { color: var(--amber); }
.pane.move .codehead .lang { color: var(--green); }
pre.code { margin: 0; padding: 14px; overflow-x: auto; font-size: 12.5px; line-height: 1.58; max-height: 62vh; overflow-y: auto; }
body.doc pre.code { max-height: 560px; }
pre.code code { white-space: pre; display: block; }
.k { color: var(--syn-k); }
.s { color: var(--syn-s); }
.n { color: var(--syn-n); }
.c { color: var(--syn-c); font-style: italic; }
.t { color: var(--syn-t); }

/* unified diff */
.uniwrap { display: none; }
section.diff .pair { display: none; }
section.diff .uniwrap { display: block; }
.unified { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); overflow: hidden; }
.unified .udh { padding: 8px 14px; border-bottom: 1px solid var(--line-2); background: var(--panel-2);
  color: var(--green-dim); font-size: 11px; }
.unified .udh b { color: var(--green); font-weight: 400; }
.uscroll { overflow: auto; max-height: 74vh; padding: 12px 0; }
.ln { white-space: pre; padding: 0 14px; font-size: 12.5px; line-height: 1.58; min-width: max-content; }
.ln .g { display: inline-block; width: 1.4em; }
.ln.hdr { color: var(--green-dim); font-style: italic; }
.ln.del { background: rgba(255, 176, 0, 0.05); }
.ln.del, .ln.del span { color: var(--amber-soft); }
.ln.del .g { color: var(--amber); }
.ln.add .g { color: var(--green); }
.ln.add { background: rgba(51, 255, 102, 0.04); }
@media (prefers-reduced-motion: no-preference) {
  section.diff .ln { opacity: 0; animation: materialize 240ms forwards; animation-delay: calc(var(--i) * 14ms); }
  @keyframes materialize { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
  .cursor { animation: blink 1.1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
}

/* ─── status bar ───────────────────────────────────────────────────────── */
#statusbar { flex: none; display: none; align-items: center; justify-content: space-between; gap: 14px;
  border-top: 1px solid var(--line); background: var(--panel); padding: 7px 16px; font-size: 12px; color: var(--green-soft); }
body.app #statusbar { display: flex; }
#sb-pos { color: var(--green); text-shadow: 0 0 8px rgba(51, 255, 102, 0.35); white-space: nowrap; }
#sb-keys { color: var(--green-dim); text-align: right; }
#sb-keys kbd { color: var(--green-soft); }
#statusbar button { background: none; border: 1px solid var(--line); color: var(--green-soft); font-family: var(--mono);
  font-size: 12px; border-radius: 4px; padding: 2px 10px; cursor: pointer; }
#statusbar button:hover { color: var(--bright); border-color: var(--green-dim); }
@media (max-width: 860px) {
  body.app .workbench { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  #tree { display: flex; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--line); padding: 6px 8px; }
  .tlabel, .titem .tf { display: none; }
  .titem { border-left: 0; border-bottom: 2px solid transparent; white-space: nowrap; padding: 5px 10px; }
  .titem.sel { border-bottom-color: var(--green); }
  #sb-keys { display: none; }
}

/* ─── overlays ─────────────────────────────────────────────────────────── */
.overlay { position: fixed; inset: 0; background: rgba(2, 4, 2, 0.75); display: none; z-index: 40; }
.overlay.open { display: block; }
.sheet { position: absolute; top: 12%; left: 50%; transform: translateX(-50%); width: min(560px, 92vw);
  background: var(--panel); border: 1px solid var(--green-dim); border-radius: 8px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.8), 0 0 40px rgba(51, 255, 102, 0.08); }
#palette input { width: 100%; background: var(--panel-2); color: var(--bright); border: 0; border-bottom: 1px solid var(--line);
  font-family: var(--mono); font-size: 14px; padding: 12px 16px; outline: none; border-radius: 8px 8px 0 0; }
#plist { max-height: 320px; overflow-y: auto; padding: 6px 0; margin: 0; list-style: none; }
#plist li { padding: 7px 16px; font-size: 13px; color: var(--green-soft); cursor: pointer; }
#plist li .tn { color: var(--amber); margin-right: 10px; }
#plist li .slug { color: var(--green-dim); float: right; font-size: 11.5px; }
#plist li.sel { background: var(--panel-2); color: var(--bright); border-left: 2px solid var(--green); padding-left: 14px; }
#help .sheet { padding: 20px 24px; font-size: 13px; }
#help h3 { color: var(--bright); margin: 0 0 12px; font-size: 14px; letter-spacing: 0.1em; text-transform: uppercase; }
#help table { border-collapse: collapse; width: 100%; margin-bottom: 14px; }
#help td { padding: 4px 0; color: var(--green-soft); }
#help td:first-child { width: 110px; }
#help kbd { color: var(--green); border: 1px solid var(--line); border-radius: 4px; padding: 0 7px; background: var(--panel-2); }
#help p { color: var(--green-dim); font-size: 12px; line-height: 1.7; margin: 0 0 8px; }
#help p a { color: var(--green-soft); text-decoration: underline; }

/* doc-mode footer */
footer.docfoot { max-width: 1080px; margin: 0 auto; padding: 32px 18px 64px; color: var(--green-dim); font-size: 12.5px; }
footer.docfoot a { text-decoration: underline; color: var(--green-soft); }

/* CRT garnish on chrome only, never on code */
.rail, #statusbar { position: relative; }
.rail::after, #statusbar::after { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(51, 255, 102, 0.03) 0 1px, transparent 1px 3px); }
</style>
</head>
<body class="doc">

<div class="rail">
  <div class="rail-inner">
    <span class="brand">
      <svg width="15" height="19" viewBox="0 0 783 1000" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fill-rule="evenodd" clip-rule="evenodd" d="@@DROPLET@@" fill="#33FF66"/>
      </svg>
      <a href="./">evm-sui</a><span class="prompt">:~/patterns $<span class="cursor">▊</span></span>
    </span>
    <span class="nav">
      <a href="walrus.html">walrus</a>
      <a href="patterns.html" aria-current="page">patterns</a>
      <a href="https://github.com/MystenLabs/evm-sui">github</a>
    </span>
  </div>
</div>

<header class="hero">
  <span class="eyebrow">Chapter 2 · Solidity → Sui</span>
  <h1>Everyday Solidity, <em>done on Sui</em>.</h1>
  <p>
    Thirteen of the most common Solidity/EVM patterns — ranked by real-world prevalence — each paired with
    its idiomatic Sui Move equivalent. Read the left pane in a language you know; read the right to see how
    the object model, capabilities, and native features change the shape of the answer. Where
    <a href="https://docs.openzeppelin.com/contracts-sui">OpenZeppelin Contracts for Sui</a> applies, we use it.
  </p>
  <p class="hint app-hint" hidden><kbd>j</kbd>/<kbd>k</kbd> next / prev pattern · <kbd>d</kbd> diff morph · <kbd>⌘K</kbd> jump · <kbd>?</kbd> all keys</p>
</header>

<div class="workbench">
  <aside id="tree" aria-label="Patterns">
    <span class="tlabel">patterns/ · 13 pairs</span>
@@TREE@@
  </aside>
  <main id="stage">
@@SECTIONS@@
  </main>
</div>

<footer class="docfoot">
  Pattern selection from a prevalence-ranked deep-research report. Two patterns (multisig, gasless) have no
  contract on Sui — the platform provides them — so their right pane is a shell/TS snippet, which is the lesson.
  See <a href="https://github.com/MystenLabs/evm-sui/tree/main/patterns">patterns/README.md</a> to build and test both sides.
</footer>

<div id="statusbar">
  <span id="sb-pos">01/13 · fungible_token</span>
  <span>
    <button id="bt-prev" aria-label="Previous pattern">‹ prev</button>
    <button id="bt-next" aria-label="Next pattern">next ›</button>
  </span>
  <span id="sb-keys">[j/k] pattern · [d]iff · [m] panes · [⌘k] jump · [?] help</span>
</div>

<div class="overlay" id="palette" role="dialog" aria-label="Jump to pattern">
  <div class="sheet">
    <input id="pinput" type="text" placeholder="jump to pattern…" autocomplete="off" spellcheck="false" />
    <ul id="plist"></ul>
  </div>
</div>

<div class="overlay" id="help" role="dialog" aria-label="Keyboard help">
  <div class="sheet">
    <h3>Keys</h3>
    <table>
      <tr><td><kbd>j</kbd> / <kbd>k</kbd></td><td>next / previous pattern (also <kbd>←</kbd>/<kbd>→</kbd>)</td></tr>
      <tr><td><kbd>d</kbd></td><td>morph the pair into a unified diff — Solidity out, Move in</td></tr>
      <tr><td><kbd>m</kbd></td><td>cycle panes: both → move only → solidity only</td></tr>
      <tr><td><kbd>⌘K</kbd> / <kbd>ctrl K</kbd></td><td>jump palette</td></tr>
      <tr><td><kbd>?</kbd></td><td>this help · <kbd>esc</kbd> closes</td></tr>
    </table>
    <p>Pattern selection from a prevalence-ranked deep-research report. Two patterns (multisig, gasless) have
    no contract on Sui — the platform provides them — so their right pane is a shell/TS snippet, which is the lesson.</p>
    <p>Solidity: Foundry · OZ v5 · 15 passing tests — Sui: Move 2024 · OZ Contracts for Sui.
    Sources: <a href="https://github.com/MystenLabs/evm-sui/tree/main/patterns">patterns/</a></p>
  </div>
</div>

<script>
(function () {
  "use strict";
  var TITLES = @@TITLES@@;
  var secs = Array.prototype.slice.call(document.querySelectorAll("section.pattern"));
  var items = Array.prototype.slice.call(document.querySelectorAll(".titem"));
  var stage = document.getElementById("stage");
  var sbPos = document.getElementById("sb-pos");
  var palette = document.getElementById("palette");
  var pinput = document.getElementById("pinput");
  var plist = document.getElementById("plist");
  var help = document.getElementById("help");
  var idx = 0, psel = 0, pmatches = [];

  document.body.classList.remove("doc");
  document.body.classList.add("app");
  var hint = document.querySelector(".app-hint");
  if (hint) hint.hidden = false;

  function go(i) {
    idx = Math.max(0, Math.min(secs.length - 1, i));
    secs.forEach(function (s, k) { s.classList.toggle("active", k === idx); });
    items.forEach(function (t, k) { t.classList.toggle("sel", k === idx); });
    sbPos.textContent = TITLES[idx].n + "/13 · " + TITLES[idx].slug;
    history.replaceState(null, "", "#p" + TITLES[idx].n);
    stage.scrollTop = 0;
    var sel = items[idx];
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function paneLines(sec, side) {
    var code = sec.querySelector(".pane." + side + " pre.code code");
    return code ? code.innerHTML.split("\n") : [];
  }

  function buildDiff(sec) {
    var wrap = sec.querySelector(".uniwrap");
    if (wrap.firstChild) return;
    var solName = sec.querySelector(".pane.sol .fname").textContent;
    var moveName = sec.querySelector(".pane.move .fname").textContent;
    var h = ['<div class="unified"><div class="udh">unified diff · <b>' +
             solName + " → " + moveName + "</b></div>", '<div class="uscroll">'];
    var i = 0;
    function push(cls, gut, content) {
      var d = Math.min(i++, 44);
      h.push('<div class="ln ' + cls + '" style="--i:' + d + '"><span class="g">' + gut + "</span>" + content + "</div>");
    }
    push("hdr", " ", "--- " + solName);
    paneLines(sec, "sol").forEach(function (l) { push("del", "-", l || " "); });
    push("hdr", " ", " ");
    push("hdr", " ", "+++ " + moveName);
    paneLines(sec, "move").forEach(function (l) { push("add", "+", l || " "); });
    h.push("</div></div>");
    wrap.innerHTML = h.join("");
  }

  function toggleDiff() {
    var sec = secs[idx];
    if (!sec.classList.contains("diff")) buildDiff(sec);
    sec.classList.toggle("diff");
  }

  function cyclePanes() {
    var sec = secs[idx];
    if (sec.classList.contains("focus-move")) { sec.classList.remove("focus-move"); sec.classList.add("focus-sol"); }
    else if (sec.classList.contains("focus-sol")) { sec.classList.remove("focus-sol"); }
    else { sec.classList.add("focus-move"); }
  }

  /* palette */
  function renderPalette() {
    var q = pinput.value.trim().toLowerCase();
    pmatches = TITLES.map(function (t, i) { return { t: t, i: i }; }).filter(function (e) {
      return !q || (e.t.n + " " + e.t.t + " " + e.t.slug).toLowerCase().indexOf(q) !== -1;
    });
    psel = Math.min(psel, Math.max(0, pmatches.length - 1));
    plist.innerHTML = pmatches.map(function (e, k) {
      return '<li data-i="' + e.i + '" class="' + (k === psel ? "sel" : "") + '"><span class="tn">' +
             e.t.n + "</span>" + e.t.t + '<span class="slug">' + e.t.slug + "</span></li>";
    }).join("");
  }
  function openPalette() { palette.classList.add("open"); pinput.value = ""; psel = 0; renderPalette(); pinput.focus(); }
  function closeOverlays() { palette.classList.remove("open"); help.classList.remove("open"); }

  pinput.addEventListener("input", function () { psel = 0; renderPalette(); });
  pinput.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { psel = Math.min(psel + 1, pmatches.length - 1); renderPalette(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { psel = Math.max(psel - 1, 0); renderPalette(); e.preventDefault(); }
    else if (e.key === "Enter") { if (pmatches[psel]) { go(pmatches[psel].i); closeOverlays(); } e.preventDefault(); }
    else if (e.key === "Escape") { closeOverlays(); }
    e.stopPropagation();
  });
  plist.addEventListener("click", function (e) {
    var li = e.target.closest("li");
    if (li) { go(+li.getAttribute("data-i")); closeOverlays(); }
  });
  [palette, help].forEach(function (ov) {
    ov.addEventListener("click", function (e) { if (e.target === ov) closeOverlays(); });
  });

  items.forEach(function (t) {
    t.addEventListener("click", function (e) { e.preventDefault(); go(+t.getAttribute("data-i")); });
  });
  document.getElementById("bt-prev").addEventListener("click", function () { go(idx - 1); });
  document.getElementById("bt-next").addEventListener("click", function () { go(idx + 1); });

  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { openPalette(); e.preventDefault(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    switch (e.key) {
      case "j": case "ArrowRight": go(idx + 1); break;
      case "k": case "ArrowLeft": go(idx - 1); break;
      case "d": toggleDiff(); break;
      case "m": cyclePanes(); break;
      case "?": help.classList.toggle("open"); break;
      case "Escape": closeOverlays(); break;
      default: return;
    }
    e.preventDefault();
  });

  window.addEventListener("hashchange", function () { fromHash(); });
  function fromHash() {
    var m = (location.hash || "").match(/^#p(\d\d)$/);
    if (!m) return false;
    var i = TITLES.findIndex(function (t) { return t.n === m[1]; });
    if (i !== -1) { go(i); return true; }
    return false;
  }

  if (!fromHash()) go(0);
})();
</script>

</body>
</html>
"""

DROPLET = "M626.027 417.029C666.817 468.244 691.209 533.014 691.209 603.469C691.209 673.925 666.076 740.673 624.214 792.176L620.588 796.626L619.641 790.981C618.817 786.201 617.869 781.34 616.757 776.478C595.785 684.349 527.471 605.365 415.03 541.378C339.095 498.28 295.626 446.448 284.213 387.487C276.838 349.375 282.318 311.098 292.907 278.301C303.496 245.545 319.235 218.063 332.626 201.541L376.383 148.06C384.046 138.666 398.426 138.666 406.09 148.06L626.068 417.029H626.027ZM695.206 363.59L402.01 5.12968C396.407 -1.70989 385.942 -1.70989 380.338 5.12968L87.184 363.59L86.2363 364.784C32.3026 431.738 0 516.821 0 609.444C0 825.138 175.151 1000 391.174 1000C607.198 1000 782.349 825.138 782.349 609.444C782.349 516.821 750.046 431.738 696.112 364.826L695.165 363.631L695.206 363.59ZM157.351 415.876L183.556 383.779L184.339 389.712C184.957 394.409 185.74 399.106 186.646 403.844C203.622 492.883 264.23 567.088 365.546 624.565C453.637 674.708 504.934 732.35 519.684 795.554C525.864 821.924 526.936 847.881 524.258 870.584L524.093 871.985L522.816 872.603C483.055 892.009 438.351 902.927 391.133 902.927C225.459 902.927 91.1394 768.855 91.1394 603.428C91.1394 532.396 115.902 467.172 157.269 415.793L157.351 415.876Z"

sections = "\n".join(section(*p) for p in PATTERNS)
doc = (TEMPLATE
       .replace("@@DROPLET@@", DROPLET)
       .replace("@@TREE@@", tree_items())
       .replace("@@SECTIONS@@", sections)
       .replace("@@TITLES@@", TITLES))

OUT.write_text(doc)
print(f"wrote {OUT} ({len(doc):,} bytes, {len(PATTERNS)} patterns)")
