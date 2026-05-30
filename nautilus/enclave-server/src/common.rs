use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};

/// Intent message wrapper struct containing the intent scope and timestamp.
/// BCS field order must match the corresponding Move struct:
///   struct IntentMessage { intent: u8, timestamp_ms: u64, data: T }
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct IntentMessage<T: Serialize> {
    pub intent: u8,
    pub timestamp_ms: u64,
    pub data: T,
}

impl<T: Serialize> IntentMessage<T> {
    pub fn new(data: T, timestamp_ms: u64, intent: u8) -> Self {
        Self {
            intent,
            timestamp_ms,
            data,
        }
    }
}

/// Wrapper for inbound request payloads.
#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessDataRequest<T> {
    pub payload: T,
}

/// Wrapper for outbound signed responses.
#[derive(Serialize, Deserialize, Debug)]
#[serde(bound(deserialize = "T: serde::de::DeserializeOwned"))]
pub struct ProcessedDataResponse<T: Serialize> {
    pub response: IntentMessage<T>,
    pub signature: String,
}

/// BCS-serialize an IntentMessage<T>, sign with the ephemeral key,
/// and return a ProcessedDataResponse with hex-encoded signature.
pub fn to_signed_response<T: Serialize + Clone>(
    kp: &SigningKey,
    payload: T,
    timestamp_ms: u64,
    intent: u8,
) -> ProcessedDataResponse<T> {
    let intent_msg = IntentMessage::new(payload, timestamp_ms, intent);
    let signing_payload = bcs::to_bytes(&intent_msg).expect("BCS serialization should not fail");
    let sig = kp.sign(&signing_payload);
    ProcessedDataResponse {
        response: intent_msg,
        signature: hex::encode(sig.to_bytes()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Serialize, Deserialize, Clone, Debug)]
    struct TestData {
        value: u64,
    }

    #[test]
    fn test_to_signed_response_produces_valid_hex_signature() {
        let kp = SigningKey::from_bytes(&[42u8; 32]);
        let resp = to_signed_response(&kp, TestData { value: 100 }, 1000, 0);
        // Signature is 64 bytes = 128 hex chars.
        assert_eq!(resp.signature.len(), 128);
        assert_eq!(resp.response.intent, 0);
        assert_eq!(resp.response.timestamp_ms, 1000);
        assert_eq!(resp.response.data.value, 100);
    }
}
