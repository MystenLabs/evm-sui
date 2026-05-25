use crate::common::{to_signed_response, IntentMessage, ProcessDataRequest, ProcessedDataResponse};
use crate::{AppState, EnclaveError};
use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use std::sync::Arc;

#[derive(Serialize_repr, Deserialize_repr, Debug, Clone, Copy)]
#[repr(u8)]
pub enum IntentScope {
    PriceQuote = 0,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PriceRequest {
    pub coin_id: String,
    pub vs: String,
}

/// IMPORTANT: field order here must match `PricePayload` in
/// `move/price-oracle/sources/oracle.move`. BCS is positional.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PriceResponse {
    pub coin_id: String,
    pub vs: String,
    pub price_micro: u64,
}

pub async fn process_data(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ProcessDataRequest<PriceRequest>>,
) -> Result<Json<ProcessedDataResponse<IntentMessage<PriceResponse>>>, EnclaveError> {
    let url = reqwest::Url::parse_with_params(
        "https://api.coingecko.com/api/v3/simple/price",
        &[("ids", &req.payload.coin_id), ("vs_currencies", &req.payload.vs)],
    )
    .map_err(|e| EnclaveError::GenericError(format!("url: {e}")))?;

    let body: serde_json::Value = state
        .http_client
        .get(url)
        .send()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("coingecko: {e}")))?
        .json()
        .await
        .map_err(|e| EnclaveError::GenericError(format!("coingecko json: {e}")))?;

    let price = body[&req.payload.coin_id][&req.payload.vs]
        .as_f64()
        .ok_or_else(|| EnclaveError::GenericError("price missing in response".into()))?;

    let timestamp_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| EnclaveError::GenericError(format!("clock: {e}")))?
        .as_millis() as u64;

    let payload = PriceResponse {
        coin_id: req.payload.coin_id,
        vs: req.payload.vs,
        price_micro: {
            let scaled = price * 1_000_000.0;
            if !(scaled >= 0.0 && scaled < u64::MAX as f64) {
                return Err(EnclaveError::GenericError(format!(
                    "price out of representable range: {price}"
                )));
            }
            scaled as u64
        },
    };

    Ok(Json(to_signed_response(
        &state.signing_key,
        payload,
        timestamp_ms,
        IntentScope::PriceQuote as u8,
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::common::IntentMessage;

    /// Pinned BCS round-trip. The hex below was cross-checked against
    /// `move/price-oracle/tests/oracle_tests.move` and must stay in sync.
    /// Reordering fields in either struct will fail this assert *before*
    /// signature verification silently fails on-chain.
    /// See NAUTILUS_LOCAL_DEV.md §6.
    #[test]
    fn payload_bcs_layout() {
        let msg = IntentMessage::new(
            PriceResponse {
                coin_id: "sui".to_string(),
                vs: "usd".to_string(),
                price_micro: 3_450_000,
            },
            1_700_000_000_000u64,
            IntentScope::PriceQuote as u8,
        );
        let bytes = bcs::to_bytes(&msg).expect("bcs");
        assert_eq!(
            hex::encode(&bytes),
            "000068e5cf8b010000037375690375736490a4340000000000"
        );
    }
}
