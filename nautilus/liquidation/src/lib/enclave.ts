/**
 * Helpers for calling the Nautilus TEE enclave HTTP API.
 * The enclave exposes a simple JSON-RPC surface for submitting data
 * and retrieving health/attestation info.
 */

const ENCLAVE_URL = process.env.ENCLAVE_URL ?? "http://localhost:8080";

export async function processData<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${ENCLAVE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Enclave ${path} failed: HTTP ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function healthCheck(): Promise<{ status: string; version: string }> {
  const res = await fetch(`${ENCLAVE_URL}/health`);
  if (!res.ok) throw new Error(`Enclave health check failed: HTTP ${res.status}`);
  return (await res.json()) as { status: string; version: string };
}
