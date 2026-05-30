//! Seal bootstrap: deterministic wallet, key caching, and placeholder encryption.
//!
//! In production, the `encrypt_checkpoint` / `decrypt_checkpoint` functions would
//! use `seal_sdk::encrypt` / `seal_sdk::decrypt` with IBE keys fetched from Seal
//! key servers. This module uses a simple XOR placeholder to keep the example
//! self-contained and testable without the full Seal dependency chain.

use blake2b_simd::Params as Blake2bParams;
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};

/// Deterministic seed for the Seal wallet key (distinct from the ephemeral key seed).
const WALLET_SEED: [u8; 32] = [43u8; 32];

/// XOR pad byte used for the placeholder encryption.
const XOR_PAD: u8 = 0xAB;

/// Tracks whether Seal keys have been cached after a successful bootstrap.
static CACHED_KEYS_LOADED: AtomicBool = AtomicBool::new(false);

/// Seal state held by the enclave.
pub struct SealState {
    /// Deterministic wallet signing key used for Seal authentication.
    wallet_key: SigningKey,
}

/// Configuration loaded from a YAML file pointing to Seal key servers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SealConfig {
    pub key_servers: Vec<String>,
    pub package_id: String,
}

/// Encoded request returned by `init_seal_key_load`.
#[derive(Debug, Serialize, Deserialize)]
pub struct FetchKeyRequest {
    pub wallet_address: String,
    pub wallet_pk_hex: String,
    pub signature_hex: String,
    pub ephemeral_pk_hex: String,
}

/// Encrypted checkpoint blob (placeholder: XOR with constant pad).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedCheckpoint {
    pub ciphertext: Vec<u8>,
}

impl SealState {
    /// Create a new SealState with a deterministic wallet key.
    pub fn new() -> Self {
        Self {
            wallet_key: SigningKey::from_bytes(&WALLET_SEED),
        }
    }

    /// Derive the Sui-style address for this wallet: `blake2b_256(0x00 || pk)`.
    pub fn wallet_address(&self) -> [u8; 32] {
        let pk = VerifyingKey::from(&self.wallet_key);
        let mut hasher = Blake2bParams::new()
            .hash_length(32)
            .to_state();
        hasher.update(&[0x00]); // Ed25519 scheme flag
        hasher.update(pk.as_bytes());
        let hash = hasher.finalize();
        let mut addr = [0u8; 32];
        addr.copy_from_slice(hash.as_bytes());
        addr
    }

    /// Phase 1 of the two-phase Seal bootstrap.
    ///
    /// Signs the wallet public key with the enclave ephemeral key so the host
    /// can submit a `FetchKeyRequest` to each Seal key server.
    pub fn init_seal_key_load(&self, ephemeral_kp: &SigningKey) -> FetchKeyRequest {
        let wallet_pk = VerifyingKey::from(&self.wallet_key);
        let eph_pk = VerifyingKey::from(ephemeral_kp);

        // The message the ephemeral key signs: the wallet's public key bytes.
        let sig = ephemeral_kp.sign(wallet_pk.as_bytes());

        FetchKeyRequest {
            wallet_address: hex::encode(self.wallet_address()),
            wallet_pk_hex: hex::encode(wallet_pk.as_bytes()),
            signature_hex: hex::encode(sig.to_bytes()),
            ephemeral_pk_hex: hex::encode(eph_pk.as_bytes()),
        }
    }

    /// Phase 2: mark Seal keys as cached after the host completes the fetch.
    pub fn complete_seal_key_load(&self) {
        CACHED_KEYS_LOADED.store(true, Ordering::SeqCst);
    }

    /// Whether Seal keys have been loaded.
    pub fn keys_loaded(&self) -> bool {
        CACHED_KEYS_LOADED.load(Ordering::SeqCst)
    }

    /// Placeholder encryption (XOR).
    ///
    /// In production, this calls `seal_sdk::encrypt` with the IBE public key
    /// for the target policy. The XOR placeholder preserves the same API shape
    /// so the rest of the server can be tested end-to-end.
    pub fn encrypt_checkpoint(&self, plaintext: &[u8]) -> EncryptedCheckpoint {
        let ciphertext = plaintext.iter().map(|b| b ^ XOR_PAD).collect();
        EncryptedCheckpoint { ciphertext }
    }

    /// Placeholder decryption (reverse XOR). Requires keys to be cached.
    pub fn decrypt_checkpoint(
        &self,
        encrypted: &EncryptedCheckpoint,
    ) -> Result<Vec<u8>, String> {
        if !self.keys_loaded() {
            return Err("Seal keys not loaded; call complete_seal_key_load first".into());
        }
        let plaintext = encrypted.ciphertext.iter().map(|b| b ^ XOR_PAD).collect();
        Ok(plaintext)
    }
}

impl Default for SealState {
    fn default() -> Self {
        Self::new()
    }
}

/// Load a SealConfig from a YAML string.
pub fn load_config(yaml: &str) -> Result<SealConfig, serde_yaml::Error> {
    serde_yaml::from_str(yaml)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let state = SealState::new();
        let plaintext = b"checkpoint data for RFQ #42";
        let encrypted = state.encrypt_checkpoint(plaintext);

        // Decryption fails before keys are loaded.
        assert!(state.decrypt_checkpoint(&encrypted).is_err());

        // Load keys, then decrypt.
        state.complete_seal_key_load();
        let decrypted = state.decrypt_checkpoint(&encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_deterministic_wallet_address() {
        let s1 = SealState::new();
        let s2 = SealState::new();
        assert_eq!(s1.wallet_address(), s2.wallet_address());

        // Address should be 32 bytes and non-zero.
        let addr = s1.wallet_address();
        assert_ne!(addr, [0u8; 32]);
    }

    #[test]
    fn test_init_seal_key_load_signature() {
        let state = SealState::new();
        let eph_kp = SigningKey::from_bytes(&[42u8; 32]);
        let req = state.init_seal_key_load(&eph_kp);

        // Verify lengths: 32-byte pubkey = 64 hex, 64-byte sig = 128 hex, 32-byte addr = 64 hex.
        assert_eq!(req.wallet_pk_hex.len(), 64);
        assert_eq!(req.signature_hex.len(), 128);
        assert_eq!(req.ephemeral_pk_hex.len(), 64);
        assert_eq!(req.wallet_address.len(), 64);
    }

    #[test]
    fn test_load_config() {
        let yaml = r#"
key_servers:
  - "https://seal-ks1.example.com"
  - "https://seal-ks2.example.com"
package_id: "0xdeadbeef"
"#;
        let config = load_config(yaml).unwrap();
        assert_eq!(config.key_servers.len(), 2);
        assert_eq!(config.package_id, "0xdeadbeef");
    }
}
