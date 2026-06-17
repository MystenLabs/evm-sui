use serde::{Deserialize, Serialize};

/// Inbound RFQ request containing the RFQ details and maker quotes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RfqRequest {
    pub rfq_id: String,
    pub base_token: String,
    pub quote_token: String,
    pub amount: u64,
    pub quotes: Vec<Quote>,
}

/// A single maker quote in response to an RFQ.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Quote {
    pub maker: String,
    pub price: u64,
    pub expiry_ms: u64,
}

/// Payload signed by the enclave after selecting the best quote.
/// Field order must match the corresponding Move struct for BCS compatibility.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RfqPayload {
    pub rfq_id: String,
    pub winning_maker: String,
    pub base_token: String,
    pub quote_token: String,
    pub amount: u64,
    pub price: u64,
    pub walrus_proof_blob_id: String,
}
