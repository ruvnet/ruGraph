use ruvector_language_rvf::{pack, unpack, MAX_CAPSULE_BYTES, MAX_ENTRY_BYTES};
use std::{collections::BTreeMap, io::Read};
fn read(path: &str, limit: usize) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err("input exceeds bound".into());
    }
    Ok(bytes)
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("pack") if args.len() >= 4 && (args.len() - 4).is_multiple_of(2) => {
            if (args.len() - 4) / 2 > ruvector_language_rvf::MAX_ATTACHMENTS {
                return Err("too many attachments".into());
            }
            let request = read(&args[1], MAX_ENTRY_BYTES)?;
            let receipt = read(&args[2], MAX_ENTRY_BYTES)?;
            let mut cumulative = request.len() + receipt.len();
            let mut attachments = BTreeMap::new();
            for pair in args[4..].chunks_exact(2) {
                if pair[0] != "--attachment" { return Err("expected --attachment NAME=PATH".into()); }
                let (name,path) = pair[1].split_once('=').ok_or("expected NAME=PATH")?;
                if !ruvector_language_rvf::valid_attachment_name(name) || attachments.contains_key(name) {
                    return Err("invalid or duplicate attachment name".into());
                }
                let bytes = read(path, MAX_ENTRY_BYTES.min(MAX_CAPSULE_BYTES.saturating_sub(cumulative)))?;
                cumulative += bytes.len();
                let value = ruvector_language::parser::strict_json(std::str::from_utf8(&bytes)?)?;
                if attachments.insert(name.to_owned(),value).is_some() { return Err("duplicate attachment".into()); }
                if attachments.len() > ruvector_language_rvf::MAX_ATTACHMENTS { return Err("too many attachments".into()); }
            }
            let bytes = pack(&request,&receipt,attachments)?;
            // Never overwrite an existing artifact, and never interpret attachment names as paths.
            use std::io::Write;
            let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&args[3])?;
            file.write_all(&bytes)?;
            println!("{}",serde_json::json!({"bytes":bytes.len(),"source_authenticated":false,"executed":false}));
        }
        Some("inspect" | "verify") if args.len() == 2 => {
            let capsule = unpack(&read(&args[1],MAX_CAPSULE_BYTES)?)?;
            println!("{}",serde_json::json!({"valid":true,"source_authenticated":false,"executed":false,"request_receipt_replayed":false,"manifest":capsule.manifest,"receipt_hash":capsule.receipt.receipt_hash}));
        }
        _ => return Err("Usage: rvg-capsule pack REQUEST.json RECEIPT.json OUTPUT.rvf [--attachment NAME=PATH] | inspect FILE.rvf | verify FILE.rvf".into()),
    }
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("{}", serde_json::json!({"error":error.to_string()}));
        std::process::exit(2);
    }
}
