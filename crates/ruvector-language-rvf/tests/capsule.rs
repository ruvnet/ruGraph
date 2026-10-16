use ruvector_language::{runtime, RunRequest};
use ruvector_language_rvf::*;
use rvf_types::{SegmentFlags, SegmentType};
use std::collections::BTreeMap;
#[path = "../../ruvector-language/examples/support/memory.rs"]
mod memory;
fn inputs() -> (RunRequest, Vec<u8>, Vec<u8>) {
    let request = memory::request(16, 0);
    let receipt =
        runtime::execute(&request.program, &request.snapshot, &request.context, None).unwrap();
    let request_json = serde_json::to_vec(&request).unwrap();
    (request, request_json, serde_json::to_vec(&receipt).unwrap())
}
fn capsule() -> Vec<u8> {
    let (_, r, c) = inputs();
    pack(&r, &c, BTreeMap::new()).unwrap()
}
fn segments(bytes: &[u8]) -> Vec<Vec<u8>> {
    let mut out = vec![];
    let mut offset = 0;
    while offset < bytes.len() {
        let (h, p) = rvf_wire::read_segment(&bytes[offset..]).unwrap();
        out.push(p.to_vec());
        offset += rvf_wire::calculate_padded_size(64, h.payload_length as usize);
    }
    out
}
fn assemble(items: Vec<Vec<u8>>) -> Vec<u8> {
    items
        .into_iter()
        .enumerate()
        .flat_map(|(i, p)| {
            rvf_wire::writer::write_segment_with_algo(
                SegmentType::Meta as u8,
                &p,
                SegmentFlags::empty(),
                i as u64,
                2,
            )
        })
        .collect()
}
#[test]
fn real_runtime_receipt_roundtrip_and_upstream_parser() {
    let (original, r, c) = inputs();
    let attachments = BTreeMap::from([(
        "learning-report.json".into(),
        serde_json::json!({"candidate":"a","promoted":false,"benefits":
            (1..1000).map(|n| n as f64 / 997.0).collect::<Vec<_>>()}),
    )]);
    let bytes = pack(&r, &c, attachments.clone()).unwrap();
    assert_eq!(bytes, pack(&r, &c, attachments.clone()).unwrap());
    for p in segments(&bytes) {
        assert!(serde_json::from_slice::<serde_json::Value>(&p).is_ok());
    }
    let decoded = unpack(&bytes).unwrap();
    assert_eq!(decoded.request, original);
    assert_eq!(decoded.attachments, attachments);
    let replay = runtime::execute(
        &decoded.request.program,
        &decoded.request.snapshot,
        &decoded.request.context,
        None,
    )
    .unwrap();
    assert_eq!(replay, decoded.receipt);
}
#[test]
fn corruption_and_every_truncation_fail() {
    let bytes = capsule();
    for n in 0..bytes.len() {
        assert!(unpack(&bytes[..n]).is_err(), "accepted truncation {n}");
    }
    let mut b = bytes.clone();
    b[70] ^= 1;
    assert!(unpack(&b).is_err());
    let mut b = bytes;
    b.push(0);
    assert!(unpack(&b).is_err());
}
#[test]
fn executable_segments_flags_and_overflow_rejected() {
    for typ in [
        SegmentType::Kernel,
        SegmentType::Wasm,
        SegmentType::Ebpf,
        SegmentType::Dashboard,
        SegmentType::Crypto,
    ] {
        let mut b = capsule();
        b[5] = typ as u8;
        assert!(unpack(&b).is_err());
    }
    let mut b = capsule();
    b[16..24].copy_from_slice(&u64::MAX.to_le_bytes());
    assert!(unpack(&b).is_err());
    for pos in [6, 8, 24, 32, 33, 34, 36, 56, 60] {
        let mut b = capsule();
        b[pos] ^= 1;
        assert!(unpack(&b).is_err(), "offset {pos}");
    }
}
#[test]
fn manifest_tampering_duplicates_and_duplicate_json_rejected() {
    let bytes = capsule();
    let mut p = segments(&bytes);
    let mut m: serde_json::Value = serde_json::from_slice(&p[0]).unwrap();
    m["entries"][1]["name"] = serde_json::json!("request.json");
    p[0] = serde_json::to_vec(&m).unwrap();
    assert!(unpack(&assemble(p)).is_err());
    let mut p = segments(&bytes);
    p[0] = b"{\"profile\":\"a\",\"profile\":\"b\"}".to_vec();
    assert!(unpack(&assemble(p)).is_err());
    let (_, r, c) = inputs();
    let mut request = String::from_utf8(r).unwrap();
    request.insert_str(1, "\"program\":{},");
    assert!(pack(request.as_bytes(), &c, BTreeMap::new()).is_err());
    let mut p = segments(&bytes);
    let mut m: serde_json::Value = serde_json::from_slice(&p[0]).unwrap();
    m["entries"][0]["sha256"] = serde_json::json!("0".repeat(64));
    p[0] = serde_json::to_vec(&m).unwrap();
    assert!(unpack(&assemble(p)).is_err());
}
#[test]
fn oversized_inputs_and_invalid_attachments_rejected() {
    assert!(unpack(&vec![0; MAX_CAPSULE_BYTES + 1]).is_err());
    let (_, r, c) = inputs();
    for name in [
        "../escape.json",
        "request.json",
        "receipt.json",
        "x.js",
        ".hidden.json",
    ] {
        assert!(pack(
            &r,
            &c,
            BTreeMap::from([(name.into(), serde_json::Value::Null)])
        )
        .is_err());
    }
    let attachments = (0..MAX_ATTACHMENTS + 1)
        .map(|i| (format!("a{i}.json"), serde_json::Value::Null))
        .collect();
    assert!(pack(&r, &c, attachments).is_err());
    assert!(pack(&vec![b' '; MAX_ENTRY_BYTES + 1], &c, BTreeMap::new()).is_err());
}
#[test]
fn valid_container_cannot_hide_invalid_receipt_checksum() {
    let (_, r, c) = inputs();
    let mut receipt: serde_json::Value = serde_json::from_slice(&c).unwrap();
    receipt["work"] = serde_json::json!(1);
    assert!(pack(&r, &serde_json::to_vec(&receipt).unwrap(), BTreeMap::new()).is_err());
}

#[test]
fn cli_pack_inspect_verify_and_refuse_overwrite() {
    use std::process::Command;
    let dir = std::env::temp_dir().join(format!(
        "rugraph-rvf-cli-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir(&dir).unwrap();
    let (_, r, c) = inputs();
    std::fs::write(dir.join("request.json"), r).unwrap();
    std::fs::write(dir.join("receipt.json"), c).unwrap();
    std::fs::write(dir.join("report.json"), b"{\"promoted\":false}").unwrap();
    let args = [
        "pack",
        "request.json",
        "receipt.json",
        "out.rvf",
        "--attachment",
        "learning-report.json=report.json",
    ];
    let binary = env!("CARGO_BIN_EXE_rvg-capsule");
    let output = Command::new(binary)
        .current_dir(&dir)
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    for operation in ["inspect", "verify"] {
        let output = Command::new(binary)
            .current_dir(&dir)
            .args([operation, "out.rvf"])
            .output()
            .unwrap();
        assert!(output.status.success());
        let v: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(v["source_authenticated"], false);
        assert_eq!(v["executed"], false);
        assert_eq!(v["request_receipt_replayed"], false);
    }
    let output = Command::new(binary)
        .current_dir(&dir)
        .args(args)
        .output()
        .unwrap();
    assert!(!output.status.success());
    let output = Command::new(binary)
        .current_dir(&dir)
        .args([
            "pack",
            "request.json",
            "receipt.json",
            "duplicate.rvf",
            "--attachment",
            "a.json=report.json",
            "--attachment",
            "a.json=report.json",
        ])
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(!dir.join("duplicate.rvf").exists());
    std::fs::remove_dir_all(dir).unwrap();
}
