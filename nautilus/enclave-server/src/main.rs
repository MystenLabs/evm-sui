use anyhow::Result;
use axum::{routing::get, routing::post, Json, Router};
use defi_enclave_server::AppState;
use ed25519_dalek::SigningKey;
use ed25519_dalek::VerifyingKey;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

#[cfg(feature = "rfq")]
use defi_enclave_server::rfq::process_data;

#[cfg(feature = "liquidation")]
use defi_enclave_server::liquidation::process_data;

#[cfg(feature = "batch-swap")]
use defi_enclave_server::batch_swap::process_data;

#[tokio::main]
async fn main() -> Result<()> {
    // Deterministic key for local testing (stable pubkey across restarts).
    let eph_kp = if std::env::var("DETERMINISTIC_KEY").is_ok() {
        SigningKey::from_bytes(&[42u8; 32])
    } else {
        SigningKey::generate(&mut rand::rngs::OsRng)
    };

    let pk = VerifyingKey::from(&eph_kp);
    println!("Enclave pubkey: {}", hex::encode(pk.as_bytes()));

    let state = Arc::new(AppState { eph_kp });

    let cors = CorsLayer::new().allow_methods(Any).allow_headers(Any);

    let app = Router::new()
        .route("/health_check", get(health_check))
        .route("/process_data", post(process_data))
        .with_state(state)
        .layer(cors);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    println!("Listening on {}", listener.local_addr()?);
    axum::serve(listener, app.into_make_service()).await?;
    Ok(())
}

async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}
