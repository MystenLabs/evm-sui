use crate::{AppState, EnclaveError};
use axum::{extract::State, Json};
use ed25519_dalek::Signer;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tracing::info;

/// Generic envelope: an `intent` byte + `timestamp_ms` + the typed `data`.
/// BCS is positional — the Move-side struct must declare these three fields
/// in the same order or signature verification will silently fail.
#[derive(Serialize, Deserialize, Clone)]
pub struct IntentMessage<T: Serialize> {
    pub intent: u8,
    pub timestamp_ms: u64,
    pub data: T,
}

impl<T: Serialize> IntentMessage<T> {
    pub fn new(data: T, timestamp_ms: u64, intent: u8) -> Self {
        Self { intent, timestamp_ms, data }
    }
}

#[derive(Serialize, Deserialize)]
pub struct ProcessedDataResponse<T> {
    pub response: T,
    pub signature: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessDataRequest<T> {
    pub payload: T,
}

/// BCS-serialize the intent message and sign the bytes with the enclave key.
pub fn to_signed_response<T: Serialize + Clone>(
    key: &ed25519_dalek::SigningKey,
    payload: T,
    timestamp_ms: u64,
    intent: u8,
) -> ProcessedDataResponse<IntentMessage<T>> {
    let intent_msg = IntentMessage::new(payload, timestamp_ms, intent);
    let bytes = bcs::to_bytes(&intent_msg).expect("bcs encode");
    let sig = key.sign(&bytes);
    ProcessedDataResponse {
        response: intent_msg,
        signature: hex::encode(sig.to_bytes()),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetAttestationResponse {
    pub attestation: String,
}

/// Attestation only works inside a real Nitro Enclave. Locally it returns 400.
#[cfg(feature = "nitro")]
pub async fn get_attestation(
    State(state): State<Arc<AppState>>,
) -> Result<Json<GetAttestationResponse>, EnclaveError> {
    use nsm_api::api::{Request as NsmRequest, Response as NsmResponse};
    use nsm_api::driver;
    use serde_bytes::ByteBuf;

    info!("get_attestation called");
    let pk = state.signing_key.verifying_key();
    let fd = driver::nsm_init();
    let request = NsmRequest::Attestation {
        user_data: None,
        nonce: None,
        public_key: Some(ByteBuf::from(pk.as_bytes().to_vec())),
    };
    match driver::nsm_process_request(fd, request) {
        NsmResponse::Attestation { document } => {
            driver::nsm_exit(fd);
            Ok(Json(GetAttestationResponse { attestation: hex::encode(document) }))
        }
        _ => {
            driver::nsm_exit(fd);
            Err(EnclaveError::GenericError("nsm: unexpected response".into()))
        }
    }
}

#[cfg(not(feature = "nitro"))]
pub async fn get_attestation(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<GetAttestationResponse>, EnclaveError> {
    Err(EnclaveError::GenericError(
        "get_attestation requires the NSM driver — only available inside a real AWS Nitro Enclave. \
         Run with --features=nitro on a Nitro instance, or skip this endpoint for local dev."
            .to_string(),
    ))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthCheckResponse {
    pub pk: String,
    pub endpoints_status: HashMap<String, bool>,
}

pub async fn health_check(
    State(state): State<Arc<AppState>>,
) -> Result<Json<HealthCheckResponse>, EnclaveError> {
    let pk_hex = hex::encode(state.signing_key.verifying_key().as_bytes());

    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| EnclaveError::GenericError(format!("client: {e}")))?;

    let mut status = HashMap::new();
    if let Ok(yaml) = std::fs::read_to_string("allowed_endpoints.yaml") {
        if let Ok(value) = serde_yaml::from_str::<serde_yaml::Value>(&yaml) {
            if let Some(list) = value.get("endpoints").and_then(|e| e.as_sequence()) {
                for ep in list.iter().filter_map(|v| v.as_str()) {
                    let url = format!("https://{ep}");
                    let ok = client.get(&url).send().await.map(|r| r.status().is_success()).unwrap_or(false);
                    info!("endpoint {ep}: reachable = {ok}");
                    status.insert(ep.to_string(), ok);
                }
            }
        }
    }

    Ok(Json(HealthCheckResponse { pk: pk_hex, endpoints_status: status }))
}
