use serde::{Deserialize, Serialize};

/// Inbound liquidation request with position details and bidder list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiquidationRequest {
    pub position_id: String,
    pub borrower: String,
    pub collateral_token: String,
    pub debt_token: String,
    pub collateral_amount: u64,
    pub debt_amount: u64,
    pub bids: Vec<Bid>,
}

/// A single liquidator bid.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bid {
    pub bidder: String,
    pub liquidation_bonus_bps: u64,
}

/// Payload signed by the enclave after selecting the winning bid.
/// Field order must match the corresponding Move struct for BCS compatibility.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiquidationPayload {
    pub position_id: String,
    pub borrower: String,
    pub winning_bidder: String,
    pub collateral_token: String,
    pub debt_token: String,
    pub collateral_amount: u64,
    pub debt_amount: u64,
    pub liquidation_bonus_bps: u64,
    pub walrus_proof_blob_id: String,
}
