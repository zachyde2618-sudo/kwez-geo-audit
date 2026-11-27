"use client";

import { useRef, useState } from "react";
import { shareMessage, type ShareDetails } from "@/lib/share";
import { EyeLoader } from "./Brand";

export interface ReportShareProps extends ShareDetails {
  id: string;
}

const PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-ink-soft hover:border-accent hover:text-accent disabled:opacity-60";

function fileNameFrom(res: Response, fallback: string): string {
  return /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallback;
}

function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * "Download PDF" and "Send to client" on a finished report.
 * Sending uses the device's own share sheet (Mail, Outlook, WhatsApp…) with the PDF attached where
 * the browser supports it; otherwise it downloads the PDF and opens a ready-written email to attach it to.
 */
export function ReportShare(props: ReportShareProps) {
  const { id, name } = props;
  const pdfUrl = `/api/audits/${id}/pdf`;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  // Fetched as soon as the pointer or focus reaches the button, so the share sheet can open
  // straight from the click (Safari refuses one that opens long after it).
  const pending = useRef<Promise<File> | null>(null);

  function loadPdf(): Promise<File> {
    pending.current ??= fetch(pdfUrl).then(async (res) => {
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't make the PDF.");
      return new File([await res.blob()], fileNameFrom(res, "kwez-geo-audit.pdf"), { type: "application/pdf" });
    });
    pending.current.catch(() => (pending.current = null));
    return pending.current;
  }

  async function send() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const file = await loadPdf();
      const { subject, body } = shareMessage(props);
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: subject, text: body });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return; // closed the share sheet
          // Not allowed here (e.g. the click was too long ago): fall through to email.
        }
      }
      saveFile(file);
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      setNote(`The PDF (${file.name}) has downloaded. Attach it to the email that just opened.`);
    } catch (e) {
      setError((e as Error).message || "Couldn't make the PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <a href={pdfUrl} download className={PILL} title={`Download a PDF of the report for ${name}`}>
        <span aria-hidden>↓</span>
        Download PDF
      </a>
      <button type="button" onClick={send} onPointerEnter={() => void loadPdf().catch(() => {})} onFocus={() => void loadPdf().catch(() => {})} disabled={busy} className={PILL} title="Email the PDF to someone">
        {busy ? <EyeLoader size={16} label={null} /> : <span aria-hidden>✉</span>}
        {busy ? "Preparing PDF…" : "Send to client"}
      </button>
      {note && (
        <span role="status" className="basis-full text-sm text-ink-soft">
          {note}
        </span>
      )}
      {error && (
        <span role="alert" className="basis-full text-sm text-fail">
          {error}
        </span>
      )}
    </>
  );
}
