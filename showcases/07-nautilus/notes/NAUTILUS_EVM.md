# Nautilus for EVM Developers: An Honest Field Report on Verifiable Off-Chain Compute, and Whether It's Worth Leaving Ethereum For

## Executive Summary

EVM developers keep hitting the same wall, in different costumes. Whether it's a $117M oracle drain on Mango Markets, a $624M signer compromise on the Ronin bridge, a $293M forged LayerZero message into KelpDAO, or just a Solidity dev on GitHub asking how to keep poker cards secret, the underlying problem is identical: **smart contracts can't safely do anything that requires private state, real secrets, or computation that's too expensive (or too sensitive) to run on-chain.** The workaround economy — commit-reveal schemes, threshold-encrypted DON secrets that Chainlink itself stamps "BETA, at your own risk," TWAPs, multi-oracle medians, off-chain workers with multisig attestation — is a tax that auditors like samczsun, Trail of Bits, and OpenZeppelin have flagged for years.

Sui's Nautilus framework, now live on mainnet, attacks this category directly: write your sensitive logic in Rust, run it inside an AWS Nitro Enclave, register the enclave's PCR measurements and ephemeral public key on-chain via a Move contract, and have the contract cryptographically verify every signed payload from the enclave. It's the "TEE + on-chain attestation" pattern, but Mysten-built, Move-native, BCS-encoded, reproducible by default, and free to test locally before you pay AWS a dollar.

The honest contrast: Nautilus is not the first TEE-for-blockchain product. Phala, Marlin Oyster, Oasis Sapphire, Secret, Automata, iExec, and Flashbots' SGX/TDX work all exist and most of them are reachable from Ethereum without leaving Solidity. Nautilus's win is *not* "we invented TEEs"; it's that the TEE↔chain contract is unusually tight, the build pipeline is reproducible, and the developer surface is small. The honest weakness is equally clear: **you have to migrate to Sui and learn Move**. That's the question this report is built around. We pulled direct dev voices, mapped them to twelve concrete problem categories, and tried to answer it without selling anything.

## Methodology

Sources were prioritized in this order:

1. Postmortems and forensic write-ups of specific named incidents (bZx, Mango Markets, Ronin, KelpDAO, CrossCurve) where the trust failure is documented.
2. Audit-grade developer voices — samczsun's price-oracle essay, Trail of Bits incident reviews — because they are signed, defensible, and the community already accepts them as canon.
3. Project documentation that admits its own limits — most notably Chainlink Functions' own "BETA / at your own risk / may reveal the secret" disclaimer, which is the single most quotable concession in this category.
4. Developer-written content (Medium, hackathon READMEs, personal blogs) where a Solidity engineer explicitly says "I wanted X, the chain can't do it, here's my workaround." James Bachini, Ping Chen (Taipei Ethereum Meetup), and the dxganta poker-solidity repo are representative.
5. Official docs for the contrast set: Nautilus, Marlin Oyster, Phala, Oasis Sapphire, Secret Network, Flashbots SUAVE/SGX, iExec, Chainlink Functions.

**Caveats**: Discord and Telegram are mostly opaque to web search; quotes from those venues are paraphrased to representative public sources where possible. Stack Exchange `site:` queries were spotty in this run, but the patterns are independently corroborated by GitHub READMEs and Medium posts from the same developer cohort. Where evidence for a category is thin, we say so in-line rather than pad it.

---

## The Findings

### Category 1 — Oracle trust and price-feed manipulation

**What EVM devs are saying.** samczsun (Paradigm research partner, the most-cited auditor in DeFi) wrote the canonical essay in 2020 and was already exhausted by then: *"Price oracles are a critical, but often overlooked, component of DeFi security. Safely using price oracles is hard and there's plenty of ways to shoot both yourself and your users in the foot."* He notes that even after publishing the warning, *"numerous projects have since made very similar mistakes,"* and that any oracle solution forces the dev to *"delegate trust to a third party… during times of high market volatility and chain congestion, price updates may not arrive on time."* Chainalysis put the 2022 oracle-attack tab at **$403.2M across 41 separate incidents**, with Mango Markets alone accounting for $117M (Avraham Eisenberg, October 2022). The two bZx attacks of February 2020 stole **$954,000 in total** — approximately $350,000 in the first attack on February 14 and approximately $633,000 in the second on February 18 — by manipulating Kyber/Uniswap reserves that bZx was using as a single-source oracle.

**Why it's hard on EVM today.** A Solidity contract is a pure function of on-chain state. To consume any price, it must either (a) read an on-chain DEX pool (manipulable in one block via flash loan), (b) read a pushed feed from Chainlink/Pyth (centralized signer set, push cadence, gas overhead), or (c) hand-roll a TWAP (smoothed, but still lossy and slow to react). None of these prove that an *honest computation over real data* happened off-chain. The bZx team's own postmortem admitted they had to scramble: *"We will also be implementing Chainlink oracles as a supplement to the Kyber price feed… We are taking great care to ensure that Chainlink does not become a central point of failure in our oracle model."*

**How EVM devs solve it now.** Multi-oracle medians (Chainlink + Pyth + Uniswap TWAP), Chronicle-style signed feeds, Pyth pull-style, or rolling their own off-chain worker behind a multisig. The state of the art is "trust more validators."

**How Nautilus addresses this.** The Nautilus + Sui blog post explicitly walks through *"Price feeds that fetch exchange rates from a web API and update AMMs (Automated Market Makers)"* as the canonical use case. You write a Rust fetcher, run it inside a Nitro Enclave, the enclave signs `{response, signature}`, and a Move contract calls `verify_signature()` against the enclave's registered public key and PCRs. The price didn't come from a validator quorum — it came from *attested code running attested binary against an attested API endpoint*. The Marlin Oyster team published a working *"decentralized price oracle using Oyster enclaves"* reference implementation against Nautilus PCR attestation on Sui.

**Honest contrast.** Chainlink Price Feeds win on liquidity, brand, and you don't have to leave EVM. Nautilus wins on *what the trust assumption actually is* — instead of "16-of-31 Chainlink nodes are honest," it's "AWS Nitro hardware is not broken and our published Rust source matches what the PCR says it does." That's a different threat model, not strictly better — if AWS Nitro has a zero-day, Nautilus is worse; if Chainlink's signer set is compromised or simply too slow during a volatility spike (samczsun's exact warning), Nautilus is better. For app-specific feeds (private API, non-supported asset, exotic aggregation) Nautilus is a much cleaner story than building a custom DON.

---

### Category 2 — Verifiable off-chain computation (heavy compute, ML, aggregations)

**What EVM devs are saying.** Trail of Bits notes oracle/off-chain trust has shifted from *"a novel threat at the time"* to a systemic class. Phala's own positioning admits the gap candidly in the Phala Cloud oracle template README: *"This template is a robust solution to a core problem faced by trust-minimized systems. For blockchains, this is the classic 'oracle problem': as deterministic systems, they cannot safely fetch external data."* Note this is a *Phala* engineer framing the EVM gap — they are selling the same shaped solution as Nautilus.

**Why it's hard on EVM today.** EVM gas costs make anything beyond simple loops uneconomic. Doing an ML inference, a complex statistical aggregation, or even an HMAC on a few hundred KB of data on-chain is impractical. ZK is one answer but proving costs are still high and the toolchain is rough.

**How EVM devs solve it now.** Chainlink Functions (Deno-sandbox JS, threshold-encrypted secrets, OCR consensus), iExec (worker pool with stake-slashing), Phala Phat Contracts / Phala Cloud (Intel SGX/TDX), Marlin Oyster (AWS Nitro enclave marketplace), Space and Time (zk-proven SQL), or just "trust our backend."

**How Nautilus addresses this.** Identical pattern, integrated tighter to one chain. The Mysten reproducible-build template hashes into PCR0/PCR1/PCR2; any byte-level change in the EIF flips the PCR and the on-chain `EnclaveConfig` object rejects the signature. The Move-side `Enclave` object holds the ephemeral public key and metadata. Verification cost is *one signature check* after registration (which itself does the heavy P-384 cert-chain work once).

**Honest contrast.** Marlin Oyster is arguably the closest direct analog and *both* work with EVM and Sui — Marlin published their on-chain Nitro attestation verifier for Solidity at **less than 70M gas, down from 400M, then 150M, after two rounds of optimization** including splitting attestation into a certificate-chain stage (~12-13M gas per cert, reusable) and a final attestation stage (under 20M gas). Sui's Move runtime keeps attestation verification cheap enough that it's recommended at registration only, with subsequent signed-payload verification being trivial. Chainlink Functions is fine for many use cases but explicitly *not* a TEE — its trust model is the DON quorum, not hardware attestation.

---

### Category 3 — Secret management (API keys, credentials)

**What EVM devs are saying.** This is the single most quotable failure mode in EVM today. Chainlink Functions is the closest thing to a production answer, and Chainlink's own documentation says on every single secrets-related page: *"Chainlink Functions is still in BETA. The use of secrets in your requests is an experimental feature that may not operate as expected and is subject to change. Use of this feature is at your own risk and may result in unexpected errors, possible revealing of the secret as new versions are released, or other issues."* That is the vendor of the leading EVM solution telling you, in writing, that the secret may leak. They also push responsibility for self-hosted secrets entirely to the developer: *"Self-hosted secrets: Developers are responsible for securing self-hosted secrets, monitoring unauthorized access, auditing permissions..."*

**Why it's hard on EVM today.** Everything on-chain is public. Storing a Stripe API key, an OpenAI key, a Twitter API key, or any HMAC secret in contract storage is equivalent to publishing it. Even `private` Solidity variables are read directly from chain storage. The only way to use a secret from a smart contract is to push it to an off-chain process you trust or to a TEE.

**How EVM devs solve it now.** Three options: (a) Chainlink Functions DON-hosted threshold-encrypted secrets (the BETA path), (b) hand-roll an off-chain server with a multisig-attested signing key (the "trust us" approach), or (c) Phala/Oasis Sapphire/iExec/Marlin TEE flows.

**How Nautilus addresses this.** Nautilus's "Using Nautilus" guide demonstrates this exact pattern with a Weather API example: *"This step demonstrates how to store a secret (an API key) using AWS Secrets Manager, so the secret does not need to be included in the public application code."* The key is fetched at enclave-startup time over an attested channel, lives only inside the enclave's isolated memory, is never written to disk, and never appears in the EIF (so it doesn't show up in PCRs). The Nautilus-Twitter example is literally an X/Twitter API integration that proves a user posted a specific tweet on-chain — impossible on vanilla EVM, awkward on Chainlink Functions, native on Nautilus.

**Honest contrast.** Chainlink Functions is faster to start with if you're already on EVM, has more chains supported, and you don't have to learn Move. But the vendor disclaimer is brutal, and threshold decryption distributes trust across DON operators rather than placing it in tamper-evident hardware. Phala Cloud and Marlin Oyster offer similar TEE-backed secret pipelines accessible from EVM. Nautilus's edge is the Sui-Move↔enclave handshake: the Move contract knows *exactly* which PCRs are allowed to sign for which secret, and rotation is a Move transaction.

---

### Category 4 — MEV and frontrunning of sensitive operations

**What EVM devs are saying.** Flashbots themselves migrated to TEEs because nothing else worked: per their writings, *"With software solutions falling short, Flashbots turned to TEEs."* Their SGX block builder is live on mainnet; their TDX builder/searcher came next. The SUAVE roadmap calls for *"SGX-based orderflow auction to remove trust in Flashbots"* — i.e. Flashbots is using TEEs to remove trust *in Flashbots*. A 2025 paper ("Cross-Chain Sealed-Bid Auctions Using Confidential Compute Blockchains" by Gebele, Mutzel, Öz, and Matthes of TU Munich, arXiv 2510.19491, presented at ACM DeFi '25 in Taipei in October 2025) implements precisely this pattern on SUAVE with Ethereum settlement and concludes that EVM's transparency makes confidential auctions and dark pools structurally impossible without external compute. Researchers building LibSubmarine put it plainly: *"In a sealed bid auction, it must be possible to credibly commit to a price without revealing it publicly. If the bid is in ETH, it's impossible to hide the price with normal commit/reveal."*

**Why it's hard on EVM today.** The mempool is public. Even with commit-reveal, the reveal transaction has to land before timeout, exposing the value before settlement. Submarine sends are gas-heavy and UX-bad. Flashbots Protect / MEV-Share help, but they re-introduce trust in Flashbots.

**How EVM devs solve it now.** Commit-reveal (gas-expensive, leaky), Flashbots private mempool (trusted), threshold encryption schemes like Shutter Network, or move to a confidential EVM like Oasis Sapphire (the only production confidential EVM as of 2024).

**How Nautilus addresses this.** Run the order book / auction matching engine inside the enclave. Users submit encrypted orders to the enclave's TLS endpoint, the enclave matches and signs the settlement payload, the Move contract verifies and executes settlement. The 2025 SUAVE sealed-bid paper validates the architecture is sound; Nautilus implements it without needing a custom L2.

**Honest contrast.** Flashbots SUAVE / BuilderNet (TEE on Ethereum) is the right answer if you're building MEV infrastructure *for Ethereum* — Nautilus can't reach Ethereum's order flow. Oasis Sapphire is the right answer for confidential DeFi *in Solidity* — port your contracts and go. Nautilus's lane is Sui-native sealed-bid auctions, dark pools, and intent matching with a Move settlement layer. If your users are on Ethereum, Nautilus is the wrong tool; if your project is greenfield or you're already considering Sui, the trust story is cleaner because everything goes through one Move package.

---

### Category 5 — Cross-chain bridges and message verification

**What EVM devs are saying.** Chainlink's own bridge education hub cites total bridge losses *"more than $2.8 billion"* to date. Ronin lost $624M because *"attackers obtained control of five of nine validator keys, including four from Sky Mavis infrastructure and one from Axie DAO."* The April 2026 KelpDAO/LayerZero exploit (Chainalysis writeup) drained $293M because internal RPC nodes used by a 1-of-1 DVN were poisoned — *"the LayerZero Labs DVN, reading only from those nodes, confirmed the corresponding cross-chain message as valid."* Chainalysis's conclusion is exactly the trust pattern Nautilus is designed to eliminate: *"quorum design is security design. A signer or DVN set that relies on one party is not a quorum; it is a single point of failure with extra steps."*

**Why it's hard on EVM today.** Validator-based bridges can be socially engineered. Optimistic bridges depend on watchers showing up. Light-client bridges are expensive in gas for chains with non-EVM consensus. There is no native primitive to say "this message was signed by a specific binary I trust."

**How EVM devs solve it now.** Multi-network bridges (Chainlink CCIP), light-client bridges (Succinct, Polymer, zkBridge), or external signer sets (LayerZero, Wormhole, Axelar) with rotating validator committees.

**How Nautilus addresses this.** A Nautilus enclave can be a bridge relayer with provable code. The Move contract verifying the destination side checks the enclave's PCRs and signature; the relayer can't lie about a source-chain event because the PCR commits to which source-chain client/light-client code is running inside it. This is structurally similar to what Marlin Oyster does for cross-chain attestation, but on the Sui side it's a Move object, not an external signer set.

**Honest contrast.** This is *not* a category where Nautilus has obvious dominance over EVM-side solutions. Light-client / ZK bridges are the cleaner long-term answer for trust minimization; TEE bridges are pragmatically better than validator quorums but worse than valid proof systems. Nautilus is a reasonable substrate for Sui-side bridge messages, but for the EVM-to-EVM bridge problem it's not a contender. We're honest about that.

---

### Category 6 — Game logic with hidden state (poker, hidden information games)

**What EVM devs are saying.** This is one of the cleanest dev-voice categories. Solidity engineer **Diganta** in the dxganta/poker-solidity README states the problem and the dirty workaround in two paragraphs: *"Creating fully decentralized Card Games has always been a difficult task due to the open nature of blockchains. Card games require a certain level of privacy… if we think of a very general solution where the smart contract randomly chooses a card from the deck and returns it to the user, this will cause the problem that any other malicious actor will also be able to view that card since no data on the blockchain is really private."* His workaround: *"The contract owner will hash each card pair for each player with a unique secret key and then publish these keys… The only centralization here is that the players have to trust that the contract owner will randomize the cards correctly offchain."*

**James Bachini** (Solidity dev tutorial author) writes the same admission for shuffling: *"In most card games the cards and order of the shuffle are concealed from the players but this difficult to do on a public blockchain network where all transactions and state are transparent."* And **Ping Chen** (Taipei Ethereum Meetup) on randomness: *"Theoretically, any instantly generated onchain random number is vulnerable. We can restrict contract interaction to mitigate risk. The mitigation is far from perfect, but it is the tradeoff that we have to accept."*

TEN Protocol's own write-up on building poker says it more bluntly: *"This is just one of many X posts beginning with 'Why TF hasn't anyone built Poker in Web3?' The honest answer is that it was impossible — until now."*

**Why it's hard on EVM today.** All EVM storage is publicly readable. There is no primitive for "this state is visible only to this player." `private` in Solidity is purely a compiler annotation, not encryption. Commit-reveal works for single hidden values, not for ongoing hidden state with conditional reveals.

**How EVM devs solve it now.** (a) Off-chain trusted dealer (dxganta's approach — destroys decentralization), (b) FHE via Fhenix / Zama (still very expensive in 2024-2026), (c) confidential EVM via Oasis Sapphire or TEN Protocol, (d) MPC card protocols (high latency).

**How Nautilus addresses this.** Game state lives inside the enclave. Player-specific reveals are signed messages encrypted to that player's session key. The Move contract enforces betting rules and settlement on the public commitments; the enclave provides the private dealing logic and proves it ran the published shuffle code by attesting PCRs. This is exactly Phala/Oasis territory but with Sui's parallel object model letting many tables run concurrently without contention.

**Honest contrast.** Oasis Sapphire is the most direct EVM-side competitor; Solidity port, end-to-end encryption, same general TEE trust model. TEN Protocol on Ethereum L2 hits the same shape. Nautilus is no better cryptographically — its advantage is the Sui object model for the public game state (chips, blinds, hands history) and that Mysten owns the framework, so the Move bindings are first-party.

---

### Category 7 — KYC / identity attestations that need privacy

**What EVM devs are saying.** The substack walkthrough of Nautilus puts the use case bluntly: *"Imagine a decentralized exchange needing to comply with KYC/AML laws while preserving user privacy. With Nautilus enclaves, identity checks and blacklist verifications are performed securely off-chain. Regulatory compliance is cryptographically attested without exposing any sensitive user data."* The dev voice here is mostly indirect — but the demand is real, as evidenced by the proliferation of zkPassport / Holonym / Worldcoin-style approaches.

**Why it's hard on EVM today.** Compliance data (full names, document scans, sanctions-list hits) cannot live on-chain. Existing solutions punt to centralized providers (Persona, Sumsub) and store a binary "is verified" bit on-chain — defeating the user-controlled disclosure model.

**How EVM devs solve it now.** Off-chain provider + signed attestation; ZK identity (zkPassport, Polygon ID, Sismo); centralized KYC + on-chain allowlist.

**How Nautilus addresses this.** Enclave receives identity documents, performs the check against an in-enclave sanctions list, signs an attestation `{user_pubkey, eligibility_tier, expiry}`, Move contract verifies and grants role. The document itself never persists.

**Honest contrast.** ZK identity is more elegant for narrow claims ("I am over 18", "I am not US person"); TEE-based identity is more practical for richer checks (full sanctions screening, document liveness). Sapphire and Phala compete here from EVM. Nautilus's advantage is purely "you're already on Sui."

---

### Category 8 — AI agent integration with smart contracts

**What EVM devs are saying.** The agentic wallet category exists *because* this is unsolved. Cobo, OKX, Crossmint, Coinbase Agentic Wallet — every one of them is selling MPC or TEE wallets for AI agents *because* you can't put OpenAI API keys or autonomous-trading credentials inside a contract. OKX's product page: *"Built on TEE (Trusted Execution Environment) technology, where private key generation, storage, and signing all occur inside secure enclaves—ensuring that no one, including OKX, can access the private keys."* That's the EVM ecosystem solving the problem outside the chain because the chain can't do it.

**Why it's hard on EVM today.** Agents need to call paid APIs (LLMs, market data, weather, sports) and hold spending authority over funds. The API keys must be secret. The signing authority must be bounded. EIP-7702 helps for session-bounded signing but does nothing about API secrets.

**How EVM devs solve it now.** TEE wallets (Cobo, Phala Dstack, MPC custodians), session keys via EIP-7702, externally hosted agent infrastructure with on-chain spend caps.

**How Nautilus addresses this.** Run the agent itself inside the enclave. The agent's wallet key is generated and sealed inside. API keys are pulled from AWS Secrets Manager at startup. The agent's actions are signed and submitted to Sui; the Move contract enforces spend caps, allowlists, and revocation. The enclave's PCRs commit to which agent code is running — so users can verify "this is the exact Eliza/AutoGPT/etc binary, not a modified one." Nautilus-Twitter already demonstrates the Twitter/X integration shape.

**Honest contrast.** Phala has built a strong AI-agent narrative (Eliza on Phala Cloud, agent contracts, Dstack jointly with Flashbots). For EVM-resident agents Phala is the strongest competitor; their `dstack` SDK is mature. Nautilus's pitch is integration depth on Sui, not category leadership in AI agents.

---

### Category 9 — Verifiable randomness with external sources

**What EVM devs are saying.** Ping Chen's quote above: *"any instantly generated onchain random number is vulnerable… the mitigation is far from perfect."* Phala's Cloud VRF docs note that even Chainlink VRF has *"multi-node consensus mechanisms to secure secret keys, requiring time-consuming coordination between nodes,"* and pitch *"2-4 seconds latency end-to-end"* as the TEE alternative.

**Why it's hard on EVM today.** Native `block.prevrandao` is biaseable by proposers within a slot. Commit-reveal requires liveness. Chainlink VRF is solid but adds latency and per-call cost.

**How EVM devs solve it now.** Chainlink VRF, Pyth Entropy, Drand-based randomness, or block.prevrandao for low-stakes use.

**How Nautilus addresses this.** Sui already has `Random` as a first-class on-chain primitive (managed by validators via DKG, not enclave-dependent). The Nautilus-specific win is *combining* on-chain randomness with off-chain inputs — e.g., a verifiable random shuffle that uses external entropy from a TEE plus the on-chain randomness primitive. This is a category where Nautilus is overkill for most use cases — Sui's native randomness is usually enough.

**Honest contrast.** For pure VRF, Chainlink VRF on EVM is fine and Sui's onchain randomness on Sui is fine. Use a TEE only when the randomness must be combined with private state or external API data.

---

### Category 10 — Real-world data ingestion (sports, weather, social, niche feeds)

**What EVM devs are saying.** This is exactly the category Chainlink Functions targets, and where the BETA disclaimer hurts most. The Phala Cloud oracle template framing nails the broader truth: *"For autonomous AI agents, it is a data integrity problem: they require verifiable, untampered data to make critical decisions."* And notably, Phala flags a subtle gotcha Nautilus devs should respect: *"A TEE's guarantee stops at its own boundary; it cannot natively verify that network data is authentic. An attacker could perform a Man-in-the-Middle attack (e.g., via DNS hijacking) to feed the TEE malicious data."*

**Why it's hard on EVM today.** Long tail of data sources (sports scores, weather stations, social media events, IoT sensors) is not covered by Chainlink Data Feeds. Building a custom oracle requires either trust in your own backend or wrestling with Chainlink Functions' beta secrets.

**How EVM devs solve it now.** Chainlink Functions for ad-hoc HTTP fetches, custom DON-style worker pools, or single-signer attested feeds.

**How Nautilus addresses this.** The Sui blog explicitly lists the use cases: *"Reputation or scoring systems… Geolocation or weather-based NFTs, where the oracle verifies external conditions before minting rewards. Trust-minimized social-linked flows, that verify a user's tweet or Venmo payment before triggering on-chain asset transfers."* The Nautilus-Twitter reference app is the canonical demo. The enclave fetches via TLS (with a curated `allowed_endpoints.yaml` to prevent the MITM Phala warns about), signs `{response, signature}`, Move verifies.

**Honest contrast.** Chainlink Functions wins if your data must reach an EVM contract and you accept the BETA caveat. Nautilus wins on cleanliness when the contract is on Sui and you want a single attested binary controlling the fetch + transform + sign pipeline.

---

### Category 11 — Confidential DeFi (private positions, sealed orders, encrypted balances)

**What EVM devs are saying.** Oasis's positioning is candid: *"the Oasis Network and Sapphire ParaTime ensures that data remains confidential and is not disclosed to the node operator or application developer."* They explicitly target *"the powerful cohort of Solidity developers looking to build privacy-enabled dApps."* Mysten's own Adeniyi Abiodun has publicly stated *"Private transactions are coming to Sui Network in 2026"* and that *"It's impossible to get mass global consumer adoption for anything payments related without privacy."*

**Why it's hard on EVM today.** Same as Category 4 + Category 6: state is public, mempool is public, balances are public. ZK can hide ownership (Tornado, Aztec) but composability with the rest of DeFi is brutal.

**How EVM devs solve it now.** Oasis Sapphire (production confidential EVM, Solidity port), Aztec (ZK rollup, programmability constraints), Fhenix/Zama (FHE, expensive), Secret Network from Cosmos.

**How Nautilus addresses this.** Confidential matching engine pattern from Category 4, generalized. Note that Sui's roadmap private-transactions primitive will likely become the on-chain partner to Nautilus's off-chain confidential compute, but as of mid-2026 only the Nautilus side is live.

**Honest contrast.** **This is one place to call out a real Nautilus weakness today.** Oasis Sapphire is *fully confidential EVM* — every contract call's calldata and storage is encrypted by default. Nautilus is *selective* confidentiality — the Move contract on Sui remains public; only what runs inside the enclave is private. For an app where you want everything private all the time and you can stay in Solidity, Sapphire is the cleaner answer. Nautilus is the right pick when the public/private boundary is well-defined (the matching engine is private, settlement and ledger are public).

---

### Category 12 — Account abstraction with off-chain signers needing verifiability

**What EVM devs are saying.** The agentic wallet ecosystem (Cobo, Crossmint, Coinbase, OKX) is the dev voice — every product page mentions either MPC or TEE because *"giving an AI agent a standard private key creates potentially catastrophic risk."*

**Why it's hard on EVM today.** EIP-4337 and EIP-7702 give you scoped signing, but the actual signer infrastructure (where the key lives, what code uses it) is still a centralized server you have to trust.

**How EVM devs solve it now.** MPC custodians, TEE wallets, hardware enclaves on user devices, paymasters with policy engines.

**How Nautilus addresses this.** Signer logic lives in enclave. The Move contract trusts a signer object whose `pubkey` was registered via an attested PCR set — so you have on-chain proof of *which signer code* is authorized, not just which key. Rotation = redeploy enclave + re-register PCRs + Move governance vote.

**Honest contrast.** For EVM agents, Phala Dstack and Cobo MPC are mature. Nautilus's gain is Sui-native integration; the loss is that all of Sui's wallet UX is still maturing relative to EVM's.

---

## Cross-cutting Nautilus value props (what came up repeatedly)

Across all twelve categories, a few Nautilus properties came up over and over.

**Reproducible builds.** Mysten's template uses Nix-style reproducibility (similar to Marlin Oyster's approach). The PCR0 of the enclave image is a function of your published source. Anyone — auditor, user, regulator — can rebuild and compare. This is the difference between "trust the enclave operator" and "trust the cryptography." It's also a real engineering pain Marlin's own blog has written about: *"Base Docker images change over time and so do package registries… Several tools, including Docker itself, insert timestamps and file paths into the build process which will not be the same across builds."* Mysten + Marlin have both invested in solving this.

**Tight Move↔enclave coupling via BCS.** Payloads are BCS-encoded the same way Sui encodes objects. Move's verifier checks the signature using the registered enclave's pubkey, then deserializes directly. There is no "intermediate JSON, then ABI-encode, then verify" hop that exists in most EVM TEE bridges.

**Free local dev mode.** You can run the entire stack outside an actual Nitro Enclave for development. AWS bills only when you go to production. This is genuinely lower friction than spinning up a Phala worker or paying SGX cloud time.

**First-party Mysten maintenance.** Nautilus is a Mysten Labs framework. Bug fixes, breaking-change communications, and the docs path go through the same team that ships the Sui runtime. For EVM TEE solutions, you're integrating across two or three vendor relationships (Chainlink + AWS + your protocol; Phala + your protocol; Marlin + your protocol).

**One-attestation registration.** Verifying the AWS Nitro certificate chain on-chain is expensive (Marlin's optimized Solidity verifier hit ~70M gas; the Sui Move version is cheaper but still non-trivial). Nautilus's recommended pattern: do the heavy attestation *once* at enclave registration, then verify cheap signatures forever after.

---

## The migration cost — what an EVM dev would actually have to learn

This is the part the marketing decks skip. Be honest with yourself before you commit.

**1. Move.** It's not Solidity. Resource semantics, the object model, abilities (`key`, `store`, `copy`, `drop`), and Programmable Transaction Blocks are all new. The good news: Move is genuinely safer than Solidity for the kind of code you'd write (no reentrancy as we know it, explicit resource flow). The bad news: every Solidity pattern in your head needs translation, and tooling (linters, formatters, fuzzers) is younger than the EVM equivalent.

**2. Sui's object-centric model.** Sui isn't account-based. State lives in *objects* with owners. This is great for parallelism but it's a different mental model. Shared objects (which is what you'll use for most DeFi-shaped things) re-introduce sequencing through Sui's consensus, but the design surface is different from "shared mutable contract state."

**3. Rust for enclave code.** If you're a TypeScript-on-Hardhat dev, Rust is the bigger lift than Move. The Nautilus template gives you a working HTTP server skeleton, so you don't have to start from scratch, but you'll need to be comfortable with `tokio`, `serde`, BCS, and the AWS Nitro SDK.

**4. AWS Nitro operations.** Even if you use Marlin Oyster as a marketplace, *somebody* in your team needs to understand enclave images, `nitro-cli`, vsock proxies, and the reproducible build pipeline. Marlin's "Networking within AWS Nitro Enclaves: A Tale of Two Proxies" blog post is sobering: *"Enclaves have no connection to the outside world except a vsock interface… any application that uses the network needs to be modified to use vsocks instead of IP sockets. This is easier said than done because any reasonably complex application uses networking libraries that assume the existence and usage of IP stacks."*

**5. New chain economics, fewer users, less liquidity (today).** As of May 2026, Sui's DeFi TVL peaked at approximately **$2.6 billion** (per MEXC's Sui three-year-anniversary report citing Mysten data), while Ethereum's DeFi TVL was approximately **$43.2 billion** per DefiLlama — roughly a **17× gap**. If your app needs deep liquidity from day one, this is a real cost.

**6. AWS / Marlin lock-in.** Nautilus is AWS Nitro–first. Marlin Oyster integration relaxes the operational lock-in (you can rent enclaves on a decentralized marketplace), but the *trust root* is still AWS's Nitro root certificate. Mysten's docs are explicit: *"We chose to initially support AWS Nitro Enclaves due to their maturity and support for reproducible builds. Support for additional TEE providers may be considered in the future."* If multi-cloud TEE is mandatory for your threat model, this is a gap. Phala's pitch of decentralized attestation across SGX/TDX/SEV/H100 is genuinely broader.

**7. What you give up.** You're leaving Foundry, Hardhat, Tenderly, OpenZeppelin's Solidity libraries, the entire mature audit-firm ecosystem (though TOB/OZ/Spearbit do increasingly audit Move), Etherscan-class explorers, and the muscle memory your team has built. None of this is a dealbreaker, but be honest that it's the cost.

---

## Where Nautilus wins outright vs alternatives

- **Greenfield Sui-native apps that need verified off-chain compute.** Tightest framework, lowest friction, first-party tooling. No contest within Sui.
- **App-specific oracles (real-world data, social media, sports) where you control the fetch logic.** The Nautilus-Twitter pattern is the canonical example and significantly cleaner than Chainlink Functions for the same shape.
- **Confidential matching engines on Sui** where settlement is public Move and matching is private enclave. Sui's parallel object model gives you concurrency that's hard to replicate on an EVM L1.
- **AI agents with provable code.** Same TEE story Phala has, but with Sui object-model integration for the agent's on-chain footprint.
- **Reproducible-build correctness audits.** The Mysten + Marlin push on reproducible builds is genuinely ahead of most TEE platforms.

## Where Nautilus is not the right choice

- **You must remain on Ethereum L1 or an EVM L2 for liquidity / user-base reasons.** Use Phala, Marlin Oyster from EVM, Oasis Sapphire (port to it), or Flashbots TEE infra. Nautilus can't help.
- **Fully confidential EVM by default.** Oasis Sapphire is purpose-built for this; Solidity port; Web3 wallet works.
- **MEV infrastructure on Ethereum.** Flashbots SUAVE/BuilderNet/Andromeda is the right home.
- **You need multi-cloud TEE diversity (AWS + GCP + Intel + AMD).** Phala's roadmap is broader; Marlin Oyster has heterogeneous plans; Nautilus is AWS Nitro–first today.
- **Pure VRF or pure timestamping.** Sui has primitives; Nautilus is overkill.
- **You can't afford a team learning curve.** Realistic onboarding cost is ~4–8 engineer-weeks before a Solidity team is productive in Move + Rust enclave dev.

---

## Decision framework: "If I were an EVM dev hitting problem X, would I move to Sui for Nautilus?"

Use this in order:

**Q1: Are you locked to EVM by users, liquidity, or partners?**
→ If yes: stop. Use Phala, Marlin Oyster (EVM-side), Oasis Sapphire (for confidential EVM), or Chainlink Functions (knowing the BETA caveat). Nautilus is not for you yet.
→ If no: continue.

**Q2: Is your core trust failure a TEE-solvable one — secrets, private state, attested off-chain compute, or app-specific oracle?**
→ If no (e.g., your problem is ZK light client bridges, or pure on-chain governance): Nautilus doesn't help much.
→ If yes: continue.

**Q3: Do you need fully confidential smart contracts (calldata, state, events all encrypted)?**
→ If yes: Oasis Sapphire or TEN Protocol are better fits today. Nautilus is selective-confidentiality, not default-confidentiality.
→ If selective confidentiality is acceptable: continue.

**Q4: Can your team absorb ~4–8 weeks of Move + Rust ramp-up?**
→ If no: stay on EVM with Phala / Marlin / Sapphire.
→ If yes: continue.

**Q5: Are you comfortable with AWS Nitro as your TEE root of trust (optionally via Marlin Oyster as marketplace)?**
→ If you need multi-vendor TEE: Phala is broader.
→ If yes: **Nautilus is a strong choice.** Build a prototype with the free local dev path before committing.

---

## Closing CTA

If you got here and the framework makes sense for your problem, the path of least regret is to spend a weekend with the local dev mode before writing a single AWS check.

- Start with the framework repo: **MystenLabs/nautilus** on GitHub. The reproducible-build template runs entirely on your laptop.
- Read the design page first: **docs.sui.io/sui-stack/nautilus/nautilus-design** — it's the shortest path to understanding the trust model.
- Clone the working example: **MystenLabs/nautilus-twitter**. It's a Twitter/X integration that proves a tweet on-chain via an attested fetch — the same shape as the price oracle, weather oracle, and AI-agent oracle patterns above.
- If you'd rather not run AWS at all, look at **Marlin Oyster's Sui integration** (`marlinprotocol/sui-oyster-demo`) — same Nautilus primitives, but Oyster operators run the actual Nitro instances and bill in stablecoins.
- The honest test: deploy the template against testnet, register PCRs, call `/process_data`, watch the Move contract verify the signature. If that loop is satisfying for your use case, the migration math is worth running. If it isn't, you've spent a weekend and learned a lot about TEE attestation either way.

Nautilus is not a silver bullet. It is a clean, reproducible, well-integrated implementation of a known good pattern (TEE + on-chain attestation), executed by the team that ships the Sui runtime. That, plus the Marlin Oyster marketplace path, plus an honest acknowledgement of its weaknesses, is what makes it worth a serious look — even if you've been writing Solidity for five years.