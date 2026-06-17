pub mod types;

use crate::common::{to_signed_response, ProcessDataRequest, ProcessedDataResponse};
use crate::{AppState, EnclaveError};
use axum::extract::State;
use axum::Json;
use std::sync::Arc;
use types::{Quote, RfqPayload, RfqRequest};

/// Intent scope for RFQ settlement.
const INTENT_RFQ: u8 = 0;

/// Select the best (lowest-price) quote from non-expired quotes.
fn select_best_quote(quotes: &[Quote], now_ms: u64) -> Option<&Quote> {
    quotes
        .iter()
        .filter(|q| q.expiry_ms > now_ms)
        .min_by_key(|q| q.price)
}

/// POST /process_data handler for the RFQ feature.
pub async fn process_data(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<RfqRequest>>,
) -> Result<Json<ProcessedDataResponse<RfqPayload>>, EnclaveError> {
    let req = &request.payload;

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| EnclaveError::GenericError(format!("Clock error: {e}")))?
        .as_millis() as u64;

    let best = select_best_quote(&req.quotes, now_ms)
        .ok_or_else(|| EnclaveError::GenericError("No valid quotes available".into()))?;

    // In production this would upload the full quote set to Walrus as an audit trail.
    let walrus_proof_blob_id = String::from("placeholder-blob-id");

    let payload = RfqPayload {
        rfq_id: req.rfq_id.clone(),
        winning_maker: best.maker.clone(),
        base_token: req.base_token.clone(),
        quote_token: req.quote_token.clone(),
        amount: req.amount,
        price: best.price,
        walrus_proof_blob_id,
    };

    Ok(Json(to_signed_response(
        &state.eph_kp,
        payload,
        now_ms,
        INTENT_RFQ,
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::common::ProcessDataRequest;
    use axum::extract::State;
    use axum::Json;
    use ed25519_dalek::SigningKey;

    fn far_future() -> u64 {
        // 2030-01-01 in ms
        1_893_456_000_000
    }

    #[test]
    fn test_select_best_quote_picks_lowest_price() {
        let now = 1_000_000;
        let quotes = vec![
            Quote { maker: "A".into(), price: 500, expiry_ms: far_future() },
            Quote { maker: "B".into(), price: 300, expiry_ms: far_future() },
            Quote { maker: "C".into(), price: 400, expiry_ms: far_future() },
        ];
        let best = select_best_quote(&quotes, now).unwrap();
        assert_eq!(best.maker, "B");
        assert_eq!(best.price, 300);
    }

    #[test]
    fn test_select_best_quote_filters_expired() {
        let now = 5_000;
        let quotes = vec![
            Quote { maker: "A".into(), price: 100, expiry_ms: 4_000 }, // expired
            Quote { maker: "B".into(), price: 200, expiry_ms: far_future() },
        ];
        let best = select_best_quote(&quotes, now).unwrap();
        assert_eq!(best.maker, "B");
    }

    #[tokio::test]
    async fn test_process_data_returns_signed_response() {
        let kp = SigningKey::from_bytes(&[42u8; 32]);
        let state = Arc::new(AppState { eph_kp: kp });
        let request = ProcessDataRequest {
            payload: RfqRequest {
                rfq_id: "rfq-001".into(),
                base_token: "SUI".into(),
                quote_token: "USDC".into(),
                amount: 1_000_000,
                quotes: vec![
                    Quote { maker: "maker-1".into(), price: 150, expiry_ms: far_future() },
                    Quote { maker: "maker-2".into(), price: 120, expiry_ms: far_future() },
                ],
            },
        };

        let result = process_data(State(state), Json(request)).await.unwrap();
        assert_eq!(result.response.data.winning_maker, "maker-2");
        assert_eq!(result.response.data.price, 120);
        assert_eq!(result.response.intent, INTENT_RFQ);
        // Signature is 64 bytes = 128 hex chars.
        assert_eq!(result.signature.len(), 128);
    }
}
