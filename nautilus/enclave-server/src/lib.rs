use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use ed25519_dalek::SigningKey;
use serde_json::json;
use std::fmt;

// Compile-time guard: exactly one DeFi feature must be enabled.
#[cfg(not(any(feature = "rfq", feature = "liquidation", feature = "batch-swap")))]
compile_error!("Enable exactly one DeFi feature: rfq, liquidation, or batch-swap");

#[cfg(any(
    all(feature = "rfq", feature = "liquidation"),
    all(feature = "rfq", feature = "batch-swap"),
    all(feature = "liquidation", feature = "batch-swap"),
))]
compile_error!("Enable exactly one DeFi feature: rfq, liquidation, or batch-swap");

// Feature-gated DeFi modules.
#[cfg(feature = "rfq")]
pub mod rfq;

#[cfg(feature = "liquidation")]
pub mod liquidation;

#[cfg(feature = "batch-swap")]
pub mod batch_swap;

pub mod common;
pub mod walrus;
pub mod seal_bootstrap;

/// Application state shared across handlers.
pub struct AppState {
    /// Ephemeral Ed25519 signing key generated on boot.
    pub eph_kp: SigningKey,
}

/// Enclave error type for HTTP error responses.
#[derive(Debug)]
pub enum EnclaveError {
    GenericError(String),
}

impl fmt::Display for EnclaveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EnclaveError::GenericError(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for EnclaveError {}

impl IntoResponse for EnclaveError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            EnclaveError::GenericError(e) => (StatusCode::BAD_REQUEST, e),
        };
        let body = Json(json!({
            "error": error_message,
        }));
        (status, body).into_response()
    }
}
