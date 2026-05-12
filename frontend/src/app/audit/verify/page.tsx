"use client";

import React, { useState } from "react";
import backend from "@/lib/backend";
import { Download, Upload, FileJson } from "lucide-react";

export default function AuditVerifyPage() {
  const [payload, setPayload] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [uploadedProof, setUploadedProof] = useState("");

  async function verifyUploadedProof(raw = uploadedProof) {
    setResult("");
    setPayload(raw);
    try {
      const proof = JSON.parse(raw);
      const res = await backend.backendJson("POST", "/posts/proofs/verify", { proof });
      const data = await res.json();
      setResult(data.ok ? "Proof matches local acknowledgement." : `Proof did not verify: ${data.reason || "unknown reason"}`);
      setPayload(JSON.stringify(data, null, 2));
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Invalid proof JSON");
    }
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setUploadedProof(text);
    await verifyUploadedProof(text);
  }

  async function onDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const dropped = event.dataTransfer.files?.[0];
    if (!dropped) return;
    const text = await dropped.text();
    setUploadedProof(text);
    await verifyUploadedProof(text);
  }

  function downloadPayload() {
    if (!payload) return;
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "jagoo-proof-verification.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Verify Proof</h1>
      <div className="mt-4 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><FileJson size={18} /> Upload, drop, or paste proof JSON</h2>
        <label
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
          className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-8 text-center text-sm font-semibold hover:bg-[var(--muted)]"
        >
          <Upload size={20} />
          Drop a proof file here or choose one
          <input type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
        </label>
        <textarea
          value={uploadedProof}
          onChange={(event) => setUploadedProof(event.target.value)}
          rows={8}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          placeholder="Paste proof JSON here"
        />
        <button onClick={() => verifyUploadedProof()} disabled={!uploadedProof.trim()} className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Verify uploaded proof
        </button>
        <button onClick={downloadPayload} disabled={!payload} className="ml-2 inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold disabled:opacity-50">
          <Download size={16} />
          Download result
        </button>
        {result && <p className="text-sm">{result}</p>}
        {payload && <pre className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3 text-xs">{payload}</pre>}
      </div>
    </div>
  );
}
