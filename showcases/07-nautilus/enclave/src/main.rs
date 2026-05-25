use anyhow::Result;
use axum::{routing::get, routing::post, Router};
use ed25519_dalek::SigningKey;
use nautilus_price_oracle::app::process_data;
use nautilus_price_oracle::common::{get_attestation, health_check};
use nautilus_price_oracle::AppState;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let signing_key = boot_signing_key();
    let pk_hex = hex::encode(signing_key.verifying_key().as_bytes());
    info!("enclave pubkey (hex): {pk_hex}");
    println!("ENCLAVE_PUBKEY_HEX={pk_hex}");

    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .expect("http client");

    let state = Arc::new(AppState { signing_key, http_client });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(|| async { "Pong!" }))
        .route("/get_attestation", get(get_attestation))
        .route("/process_data", post(process_data))
        .route("/health_check", get(health_check))
        .with_state(state)
        .layer(cors);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    info!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app.into_make_service()).await?;
    Ok(())
}

#[cfg(feature = "dev-key")]
fn boot_signing_key() -> SigningKey {
    // Deterministic 32-byte seed so the registered enclave pubkey stays
    // stable across restarts. Step 3 of NAUTILUS_LOCAL_DEV.md.
    let seed: [u8; 32] = [42u8; 32];
    SigningKey::from_bytes(&seed)
}

#[cfg(not(feature = "dev-key"))]
fn boot_signing_key() -> SigningKey {
    SigningKey::generate(&mut rand::rngs::OsRng)
}
