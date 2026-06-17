use anyhow::{anyhow, Result};
use serde::Deserialize;

const WALRUS_PUBLISHER: &str = "https://publisher.walrus-testnet.walrus.space";
const WALRUS_AGGREGATOR: &str = "https://aggregator.walrus-testnet.walrus.space";

/// Walrus blob identifier returned after upload.
pub type BlobId = String;

/// Client for uploading to and fetching from Walrus testnet.
pub struct WalrusClient {
    http: reqwest::Client,
}

/// Top-level JSON envelope from the Walrus publisher response.
#[derive(Deserialize)]
#[serde(untagged)]
#[allow(non_snake_case)]
enum PublishResponse {
    NewlyCreated { newlyCreated: NewlyCreatedInfo },
    AlreadyCertified { alreadyCertified: AlreadyCertifiedInfo },
}

#[derive(Deserialize)]
#[allow(dead_code, non_snake_case)]
struct NewlyCreatedInfo {
    blobObject: BlobObject,
}

#[derive(Deserialize)]
#[allow(dead_code, non_snake_case)]
struct AlreadyCertifiedInfo {
    blobId: String,
}

#[derive(Deserialize)]
#[allow(dead_code, non_snake_case)]
struct BlobObject {
    blobId: String,
}

impl WalrusClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
        }
    }

    /// Upload raw bytes to Walrus and return the blob ID.
    pub async fn upload(&self, bytes: &[u8]) -> Result<BlobId> {
        let url = format!("{}/v1/blobs", WALRUS_PUBLISHER);
        let resp = self
            .http
            .put(&url)
            .header("Content-Type", "application/octet-stream")
            .body(bytes.to_vec())
            .send()
            .await
            .map_err(|e| anyhow!("Walrus upload failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Walrus upload HTTP {status}: {body}"));
        }

        let parsed: PublishResponse = resp
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse Walrus response: {e}"))?;

        match parsed {
            PublishResponse::NewlyCreated { newlyCreated } => {
                Ok(newlyCreated.blobObject.blobId)
            }
            PublishResponse::AlreadyCertified { alreadyCertified } => {
                Ok(alreadyCertified.blobId)
            }
        }
    }

    /// Fetch blob bytes from Walrus by blob ID.
    pub async fn fetch(&self, blob_id: &str) -> Result<Vec<u8>> {
        let url = format!("{}/v1/blobs/{}", WALRUS_AGGREGATOR, blob_id);
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| anyhow!("Walrus fetch failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!("Walrus fetch HTTP {status}: {body}"));
        }

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| anyhow!("Failed to read Walrus response body: {e}"))?;
        Ok(bytes.to_vec())
    }
}
