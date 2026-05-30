use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use ed25519_dalek::SigningKey;
use serde_json::json;
use std::fmt;

pub mod apps;
pub mod common;

pub use apps::price_oracle as app;

/// Process-wide state. Holds the enclave's ephemeral signing key for the lifetime of the server.
pub struct AppState {
    pub signing_key: SigningKey,
    pub http_client: reqwest::Client,
}

#[derive(Debug)]
pub enum EnclaveError {
    GenericError(String),
}

impl IntoResponse for EnclaveError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            EnclaveError::GenericError(e) => (StatusCode::BAD_REQUEST, e),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

impl fmt::Display for EnclaveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EnclaveError::GenericError(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for EnclaveError {}
