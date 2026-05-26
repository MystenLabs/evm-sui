pub mod types;

use crate::common::{to_signed_response, ProcessDataRequest, ProcessedDataResponse};
use crate::{AppState, EnclaveError};
use axum::extract::State;
use axum::Json;
use std::sync::Arc;
use types::{Bid, LiquidationPayload, LiquidationRequest};

/// Intent scope for liquidation settlement.
const INTENT_LIQUIDATION: u8 = 1;

/// Select the best bid: the one offering the highest liquidation bonus (bps).
fn select_best_bid(bids: &[Bid]) -> Option<&Bid> {
    bids.iter().max_by_key(|b| b.liquidation_bonus_bps)
}

/// POST /process_data handler for the liquidation feature.
pub async fn process_data(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<LiquidationRequest>>,
) -> Result<Json<ProcessedDataResponse<LiquidationPayload>>, EnclaveError> {
    let req = &request.payload;

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| EnclaveError::GenericError(format!("Clock error: {e}")))?
        .as_millis() as u64;

    let best = select_best_bid(&req.bids)
        .ok_or_else(|| EnclaveError::GenericError("No bids available".into()))?;

    let walrus_proof_blob_id = String::from("placeholder-blob-id");

    let payload = LiquidationPayload {
        position_id: req.position_id.clone(),
        borrower: req.borrower.clone(),
        winning_bidder: best.bidder.clone(),
        collateral_token: req.collateral_token.clone(),
        debt_token: req.debt_token.clone(),
        collateral_amount: req.collateral_amount,
        debt_amount: req.debt_amount,
        liquidation_bonus_bps: best.liquidation_bonus_bps,
        walrus_proof_blob_id,
    };

    Ok(Json(to_signed_response(
        &state.eph_kp,
        payload,
        now_ms,
        INTENT_LIQUIDATION,
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_select_best_bid_picks_highest_bonus() {
        let bids = vec![
            Bid { bidder: "A".into(), liquidation_bonus_bps: 200 },
            Bid { bidder: "B".into(), liquidation_bonus_bps: 500 },
            Bid { bidder: "C".into(), liquidation_bonus_bps: 350 },
        ];
        let best = select_best_bid(&bids).unwrap();
        assert_eq!(best.bidder, "B");
        assert_eq!(best.liquidation_bonus_bps, 500);
    }

    #[tokio::test]
    async fn test_process_data_returns_signed_response() {
        let kp = ed25519_dalek::SigningKey::from_bytes(&[42u8; 32]);
        let state = Arc::new(AppState { eph_kp: kp });
        let request = ProcessDataRequest {
            payload: LiquidationRequest {
                position_id: "pos-001".into(),
                borrower: "0xborrower".into(),
                collateral_token: "ETH".into(),
                debt_token: "USDC".into(),
                collateral_amount: 10_000,
                debt_amount: 8_000,
                bids: vec![
                    Bid { bidder: "liq-1".into(), liquidation_bonus_bps: 300 },
                    Bid { bidder: "liq-2".into(), liquidation_bonus_bps: 450 },
                ],
            },
        };

        let result = process_data(State(state), Json(request)).await.unwrap();
        assert_eq!(result.response.data.winning_bidder, "liq-2");
        assert_eq!(result.response.data.liquidation_bonus_bps, 450);
        assert_eq!(result.response.intent, INTENT_LIQUIDATION);
        assert_eq!(result.signature.len(), 128);
    }
}
