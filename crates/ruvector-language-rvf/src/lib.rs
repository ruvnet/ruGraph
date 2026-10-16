//! Data-only RuGraph RVF profile. Hashes detect corruption, not malicious authors.
//! Unpacked context grants are recorded data, never host execution authority.
use ruvector_language::{parser, runtime, Error, Receipt, Result, RunRequest};
use rvf_types::{SegmentFlags, SegmentType};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub const MAX_CAPSULE_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_ENTRY_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_ATTACHMENTS: usize = 16;
const PROFILE: &str = "rugraph.data-capsule";
const MANIFEST_LIMIT: usize = 16 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Entry {
    pub name: String,
    pub bytes: usize,
    pub sha256: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub profile: String,
    pub version: u32,
    pub entries: Vec<Entry>,
}
#[derive(Debug)]
pub struct Capsule {
    pub manifest: Manifest,
    /// Recorded request only. A caller must supply independent host authority to replay.
    pub request: RunRequest,
    pub receipt: Receipt,
    pub attachments: BTreeMap<String, Value>,
}
fn invalid(message: impl Into<String>) -> Error {
    Error::new("CAPSULE_INVALID", message)
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn json(bytes: &[u8]) -> Result<Value> {
    if bytes.len() > MAX_ENTRY_BYTES {
        return Err(invalid("entry exceeds 16 MiB"));
    }
    parser::strict_json(std::str::from_utf8(bytes).map_err(|_| invalid("JSON must be UTF-8"))?)
}
fn encode(value: &impl Serialize) -> Result<Vec<u8>> {
    // A bounded writer stops serialization before an unbounded temporary grows.
    struct Bounded(Vec<u8>);
    impl std::io::Write for Bounded {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            if bytes.len() > MAX_ENTRY_BYTES.saturating_sub(self.0.len()) {
                return Err(std::io::Error::other("entry exceeds 16 MiB"));
            }
            self.0.extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut output = Bounded(Vec::new());
    serde_json::to_writer(&mut output, value).map_err(|e| invalid(e.to_string()))?;
    Ok(output.0)
}
/// Whether a name belongs to the bounded attachment basename profile.
pub fn valid_attachment_name(name: &str) -> bool {
    name.len() <= 96
        && name.ends_with(".json")
        && name.len() > 5
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
        && !name.starts_with('.')
        && !name.contains("..")
        && name != "request.json"
        && name != "receipt.json"
}
fn segment(payload: &[u8], id: u64) -> Vec<u8> {
    rvf_wire::writer::write_segment_with_algo(
        SegmentType::Meta as u8,
        payload,
        SegmentFlags::empty(),
        id,
        2,
    )
}
/// Package strict JSON, a verified receipt and optional named JSON data. Does not execute.
/// A valid receipt checksum does not prove that the receipt belongs to this request.
pub fn pack(
    request_json: &[u8],
    receipt_json: &[u8],
    attachments: BTreeMap<String, Value>,
) -> Result<Vec<u8>> {
    if attachments.len() > MAX_ATTACHMENTS || attachments.keys().any(|n| !valid_attachment_name(n))
    {
        return Err(invalid("invalid attachment names or too many attachments"));
    }
    let request: RunRequest =
        serde_json::from_value(json(request_json)?).map_err(|e| invalid(e.to_string()))?;
    let receipt: Receipt =
        serde_json::from_value(json(receipt_json)?).map_err(|e| invalid(e.to_string()))?;
    runtime::verify_receipt(&receipt)?;
    let mut items = vec![
        ("request.json".to_owned(), encode(&request)?),
        ("receipt.json".to_owned(), encode(&receipt)?),
    ];
    let mut total = items
        .iter()
        .map(|(_, b)| rvf_wire::calculate_padded_size(64, b.len()))
        .sum::<usize>();
    for (name, value) in attachments {
        let bytes = encode(&value)?;
        total += rvf_wire::calculate_padded_size(64, bytes.len());
        if total + MANIFEST_LIMIT + 128 > MAX_CAPSULE_BYTES {
            return Err(invalid("capsule exceeds 64 MiB"));
        }
        items.push((name, bytes));
    }
    let manifest = Manifest {
        profile: PROFILE.into(),
        version: 1,
        entries: items
            .iter()
            .map(|(name, b)| Entry {
                name: name.clone(),
                bytes: b.len(),
                sha256: digest(b),
            })
            .collect(),
    };
    let manifest_bytes = encode(&manifest)?;
    if manifest_bytes.len() > MANIFEST_LIMIT {
        return Err(invalid("manifest too large"));
    }
    let mut output = segment(&manifest_bytes, 0);
    for (index, (_, bytes)) in items.iter().enumerate() {
        output.extend(segment(bytes, index as u64 + 1));
    }
    Ok(output)
}
/// Validate all headers, bounds, hashes, padding, names, JSON and receipt before returning data.
/// No filesystem writes, code execution, host grants or source authentication are performed.
pub fn unpack(bytes: &[u8]) -> Result<Capsule> {
    if bytes.len() > MAX_CAPSULE_BYTES {
        return Err(invalid("capsule exceeds 64 MiB"));
    }
    let mut payloads = Vec::new();
    let mut offset = 0usize;
    while offset < bytes.len() {
        if payloads.len() >= MAX_ATTACHMENTS + 3 {
            return Err(invalid("too many segments"));
        }
        let input = &bytes[offset..];
        let h = rvf_wire::read_segment_header(input).map_err(|e| invalid(e.to_string()))?;
        let limit = if payloads.is_empty() {
            MANIFEST_LIMIT
        } else {
            MAX_ENTRY_BYTES
        };
        // Check u64 before usize conversion and before upstream reader arithmetic.
        if h.payload_length > limit as u64 {
            return Err(invalid("segment length exceeds bound"));
        }
        if h.seg_type != SegmentType::Meta as u8
            || h.segment_id != payloads.len() as u64
            || h.flags != 0
            || h.compression != 0
            || h.checksum_algo != 2
            || h.timestamp_ns != 0
            || h.reserved_0 != 0
            || h.reserved_1 != 0
            || h.uncompressed_len != 0
        {
            return Err(invalid("segment outside data-only profile"));
        }
        let length = h.payload_length as usize;
        let padded = rvf_wire::calculate_padded_size(64, length);
        if padded > input.len() || h.alignment_pad as usize != padded - 64 - length {
            return Err(invalid("truncated segment or invalid padding"));
        }
        if input[64 + length..padded].iter().any(|b| *b != 0) {
            return Err(invalid("nonzero padding"));
        }
        let (header, payload) =
            rvf_wire::read_segment(&input[..padded]).map_err(|e| invalid(e.to_string()))?;
        rvf_wire::validate_segment(&header, payload).map_err(|e| invalid(e.to_string()))?;
        payloads.push(payload);
        offset += padded;
    }
    if payloads.len() < 3 {
        return Err(invalid("missing manifest/request/receipt"));
    }
    let manifest: Manifest =
        serde_json::from_value(json(payloads[0])?).map_err(|e| invalid(e.to_string()))?;
    if manifest.profile != PROFILE
        || manifest.version != 1
        || manifest.entries.len() != payloads.len() - 1
    {
        return Err(invalid("invalid profile or segment count"));
    }
    let mut previous = "";
    for (index, entry) in manifest.entries.iter().enumerate() {
        let valid = match index {
            0 => entry.name == "request.json",
            1 => entry.name == "receipt.json",
            _ => valid_attachment_name(&entry.name) && entry.name.as_str() > previous,
        };
        if !valid
            || entry.bytes != payloads[index + 1].len()
            || entry.sha256 != digest(payloads[index + 1])
        {
            return Err(invalid("manifest name, size or digest mismatch"));
        }
        if index >= 2 {
            previous = &entry.name;
        }
    }
    let request = serde_json::from_value(json(payloads[1])?).map_err(|e| invalid(e.to_string()))?;
    let receipt: Receipt =
        serde_json::from_value(json(payloads[2])?).map_err(|e| invalid(e.to_string()))?;
    runtime::verify_receipt(&receipt)?;
    let mut attachments = BTreeMap::new();
    for (entry, payload) in manifest.entries.iter().skip(2).zip(payloads.iter().skip(3)) {
        attachments.insert(entry.name.clone(), json(payload)?);
    }
    Ok(Capsule {
        manifest,
        request,
        receipt,
        attachments,
    })
}
