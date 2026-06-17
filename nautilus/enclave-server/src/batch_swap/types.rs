use serde::{Deserialize, Serialize};

/// Inbound batch swap request with participant intents.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchSwapRequest {
    pub batch_id: String,
    pub token_pair: String,
    pub intents: Vec<Intent>,
}

/// A single participant's swap intent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Intent {
    pub participant: String,
    /// 0 = buy, 1 = sell
    pub side: u8,
    pub limit_price: u64,
    pub amount: u64,
}

/// Payload signed by the enclave after computing the clearing price.
/// Field order must match the corresponding Move struct for BCS compatibility.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchSwapPayload {
    pub batch_id: String,
    pub token_pair: String,
    pub clearing_price: u64,
    pub total_buy_filled: u64,
    pub total_sell_filled: u64,
    pub num_participants: u64,
    pub walrus_proof_blob_id: String,
}
