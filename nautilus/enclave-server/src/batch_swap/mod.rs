pub mod types;

use crate::common::{to_signed_response, ProcessDataRequest, ProcessedDataResponse};
use crate::{AppState, EnclaveError};
use axum::extract::State;
use axum::Json;
use std::sync::Arc;
use types::{BatchSwapPayload, BatchSwapRequest, Intent};

/// Intent scope for batch swap settlement.
const INTENT_BATCH_SWAP: u8 = 2;

/// Side constants.
const SIDE_BUY: u8 = 0;
const SIDE_SELL: u8 = 1;

/// Result of the crossing-order matching algorithm.
struct MatchResult {
    clearing_price: u64,
    total_buy_filled: u64,
    total_sell_filled: u64,
}

/// Crossing-order match: sort buys descending by limit price, sells ascending,
/// then walk both sides to find the clearing price at the midpoint where
/// cumulative buy volume meets cumulative sell volume.
fn crossing_order_match(intents: &[Intent]) -> Option<MatchResult> {
    let mut buys: Vec<&Intent> = intents.iter().filter(|i| i.side == SIDE_BUY).collect();
    let mut sells: Vec<&Intent> = intents.iter().filter(|i| i.side == SIDE_SELL).collect();

    if buys.is_empty() || sells.is_empty() {
        return None;
    }

    // Buys: highest price first (most aggressive first).
    buys.sort_by(|a, b| b.limit_price.cmp(&a.limit_price));
    // Sells: lowest price first (most aggressive first).
    sells.sort_by(|a, b| a.limit_price.cmp(&b.limit_price));

    // The best buy must be >= the best sell for any crossing to occur.
    if buys[0].limit_price < sells[0].limit_price {
        return None;
    }

    // Walk both sides accumulating volume until they cross.
    let mut cum_buy: u64 = 0;
    let mut cum_sell: u64 = 0;
    let mut buy_idx: usize = 0;
    let mut sell_idx: usize = 0;

    // Build a merged price ladder, processing whichever side is more aggressive next.
    let mut last_buy_price = buys[0].limit_price;
    let mut last_sell_price = sells[0].limit_price;

    loop {
        // Accumulate on the side that hasn't caught up.
        if cum_buy <= cum_sell {
            if buy_idx >= buys.len() {
                break;
            }
            cum_buy += buys[buy_idx].amount;
            last_buy_price = buys[buy_idx].limit_price;
            buy_idx += 1;
        } else {
            if sell_idx >= sells.len() {
                break;
            }
            cum_sell += sells[sell_idx].amount;
            last_sell_price = sells[sell_idx].limit_price;
            sell_idx += 1;
        }

        // Check if the current buy/sell prices still cross.
        if last_buy_price < last_sell_price {
            break;
        }
    }

    let filled = cum_buy.min(cum_sell);
    if filled == 0 {
        return None;
    }

    // Clearing price is the midpoint of the marginal buy and sell prices.
    let clearing_price = (last_buy_price + last_sell_price) / 2;

    Some(MatchResult {
        clearing_price,
        total_buy_filled: filled,
        total_sell_filled: filled,
    })
}

/// POST /process_data handler for the batch-swap feature.
pub async fn process_data(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<BatchSwapRequest>>,
) -> Result<Json<ProcessedDataResponse<BatchSwapPayload>>, EnclaveError> {
    let req = &request.payload;

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| EnclaveError::GenericError(format!("Clock error: {e}")))?
        .as_millis() as u64;

    let result = crossing_order_match(&req.intents)
        .ok_or_else(|| EnclaveError::GenericError("No crossing found".into()))?;

    let walrus_proof_blob_id = String::from("placeholder-blob-id");

    let payload = BatchSwapPayload {
        batch_id: req.batch_id.clone(),
        token_pair: req.token_pair.clone(),
        clearing_price: result.clearing_price,
        total_buy_filled: result.total_buy_filled,
        total_sell_filled: result.total_sell_filled,
        num_participants: req.intents.len() as u64,
        walrus_proof_blob_id,
    };

    Ok(Json(to_signed_response(
        &state.eph_kp,
        payload,
        now_ms,
        INTENT_BATCH_SWAP,
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::common::ProcessDataRequest;
    use axum::extract::State;
    use axum::Json;
    use ed25519_dalek::SigningKey;

    fn make_intent(participant: &str, side: u8, limit_price: u64, amount: u64) -> Intent {
        Intent {
            participant: participant.into(),
            side,
            limit_price,
            amount,
        }
    }

    #[test]
    fn test_crossing_order_match_basic() {
        let intents = vec![
            make_intent("buyer-1", SIDE_BUY, 110, 100),
            make_intent("buyer-2", SIDE_BUY, 105, 50),
            make_intent("seller-1", SIDE_SELL, 100, 80),
            make_intent("seller-2", SIDE_SELL, 108, 70),
        ];
        let result = crossing_order_match(&intents).unwrap();
        // Best buy=110, best sell=100 -> they cross.
        // Clearing price = midpoint of marginal prices.
        assert!(result.clearing_price > 0);
        assert!(result.total_buy_filled > 0);
        assert_eq!(result.total_buy_filled, result.total_sell_filled);
    }

    #[test]
    fn test_no_crossing_when_buy_below_sell() {
        let intents = vec![
            make_intent("buyer-1", SIDE_BUY, 90, 100),
            make_intent("seller-1", SIDE_SELL, 100, 100),
        ];
        assert!(crossing_order_match(&intents).is_none());
    }

    #[tokio::test]
    async fn test_process_data_returns_signed_response() {
        let kp = SigningKey::from_bytes(&[42u8; 32]);
        let state = Arc::new(AppState { eph_kp: kp });
        let request = ProcessDataRequest {
            payload: BatchSwapRequest {
                batch_id: "batch-001".into(),
                token_pair: "SUI/USDC".into(),
                intents: vec![
                    make_intent("buyer-1", SIDE_BUY, 110, 100),
                    make_intent("seller-1", SIDE_SELL, 100, 100),
                ],
            },
        };

        let result = process_data(State(state), Json(request)).await.unwrap();
        assert_eq!(result.response.data.batch_id, "batch-001");
        assert!(result.response.data.clearing_price > 0);
        assert_eq!(result.response.intent, INTENT_BATCH_SWAP);
        assert_eq!(result.signature.len(), 128);
    }
}
