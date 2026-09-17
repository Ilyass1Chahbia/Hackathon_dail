"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { extractCandidates, knownIdentifiers, normalizeReference } from "@/lib/cases";
import { IconAlert, IconCheck, IconPackage, IconClipboard } from "./icons";
import { Btn } from "./ui";

type CameraStatus = "starting" | "scanning" | "permission-denied" | "no-camera" | "unsupported" | "error";
type Mode = "barcode" | "ocr";
type OcrState = "idle" | "working" | "done" | "empty" | "failed";

const STATUS_COPY: Record<CameraStatus, string> = {
  starting: "Requesting camera access…",
  scanning: "Scanning — point the camera at the barcode on the delivery note or pallet label.",
  "permission-denied": "Camera permission was denied. Allow access in the browser, or use entry below.",
  "no-camera": "No camera was found on this device. Use entry below.",
  unsupported: "Camera scanning needs a secure context — localhost or HTTPS. Use entry below.",
  error: "The camera could not be started. Use entry below.",
};

const NO_MATCH = "No matching expected delivery found. Check the reference or enter it manually.";

/**
 * Real camera capture for the receipt entry screen.
 *
 * Barcode/QR decoding uses @zxing/browser; printed-reference OCR uses tesseract.js.
 * Both are imported dynamically, so neither lands in the server bundle. Frames are
 * decoded in memory and the stream is torn down on every exit path — first result,
 * close, unmount, navigation, mode change and any camera error. Nothing is captured,
 * uploaded or persisted.
 */
export default function CameraScanner({
  knownCases,
  onDetected,
  onClose,
}: {
  /** Every identifier a scan or OCR pass may legitimately resolve to. */
  knownCases: string[];
  onDetected: (raw: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const stoppedRef = useRef(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [detail, setDetail] = useState("");
  const [mode, setMode] = useState<Mode>("barcode");
  const [ocrState, setOcrState] = useState<OcrState>("idle");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrText, setOcrText] = useState("");
  const [confirmed, setConfirmed] = useState("");

  /** Stops ZXing decoding and every live MediaStream track. Idempotent by design. */
  const stopEverything = useCallback(() => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    try {
      controlsRef.current?.stop();
    } catch {
      /* decoder already stopped */
    }
    controlsRef.current = null;
    const video = videoRef.current;
    const stream = (video?.srcObject as MediaStream | null) ?? null;
    stream?.getTracks().forEach((track) => track.stop());
    if (video) video.srcObject = null;
  }, []);

  // Keyed on `mode`: switching mode tears the camera down and re-acquires it, so no
  // track can outlive the mode that opened it.
  useEffect(() => {
    let cancelled = false;
    stoppedRef.current = false;
    closeRef.current?.focus();

    const stopOnExit = () => stopEverything();
    window.addEventListener("pagehide", stopOnExit);
    window.addEventListener("beforeunload", stopOnExit);

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        setStatus("unsupported");
        return;
      }
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled || stoppedRef.current) return;
        // The default reader covers 1D (CODE_128, EAN, UPC…) and 2D (QR, DataMatrix, PDF417…) symbologies.
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } },
          videoRef.current as HTMLVideoElement,
          (result) => {
            // Continuous misses are normal while no code is in frame — only a hit matters.
            if (!result) return;
            const text = result.getText();
            stopEverything();
            onDetected(text);
          },
        );
        if (cancelled || stoppedRef.current) {
          controls.stop();
          stopEverything();
          return;
        }
        controlsRef.current = controls;
        setStatus("scanning");
      } catch (error) {
        if (cancelled) return;
        const name = (error as { name?: string })?.name ?? "";
        setDetail(error instanceof Error ? error.message : String(error));
        setStatus(
          name === "NotAllowedError" || name === "SecurityError"
            ? "permission-denied"
            : name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError"
              ? "no-camera"
              : "error",
        );
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", stopOnExit);
      window.removeEventListener("beforeunload", stopOnExit);
      stopEverything();
    };
  }, [onDetected, stopEverything, mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** The simulated read enters the same lookup handler a decoded barcode would. */
  const simulate = (raw: string) => {
    stopEverything();
    onDetected(raw);
  };

  /**
   * Captures exactly one frame into an in-memory canvas and reads it with Tesseract.
   * The frame is never encoded, uploaded or stored — the canvas is discarded with it.
   */
  const readPrintedReference = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setOcrState("failed");
      setDetail("No video frame available yet.");
      return;
    }
    setOcrState("working");
    setOcrProgress(0);
    setDetail("");
    try {
      const frame = document.createElement("canvas");
      frame.width = video.videoWidth;
      frame.height = video.videoHeight;
      frame.getContext("2d")?.drawImage(video, 0, 0);

      const { default: Tesseract } = await import("tesseract.js");
      const { data } = await Tesseract.recognize(frame, "eng", {
        logger: (message: { status: string; progress?: number }) => {
          if (message.status === "recognizing text" && typeof message.progress === "number") {
            setOcrProgress(Math.round(message.progress * 100));
          }
        },
      });
      frame.width = 0;
      frame.height = 0;

      const text = String(data?.text ?? "");
      setOcrText(text);
      const candidates = extractCandidates(text, knownCases);
      if (candidates.length === 0) {
        setConfirmed("");
        setOcrState("empty");
        return;
      }
      // Never navigate here: the candidate is proposed and the reviewer confirms it.
      setConfirmed(candidates[0]);
      setOcrState("done");
    } catch (error) {
      // Controlled failure — barcode, manual entry and the shortcut all still work.
      setOcrState("failed");
      setDetail(error instanceof Error ? error.message : String(error));
    }
  };

  const ok = status === "scanning";
  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`min-h-[44px] flex-1 rounded-[4px] border px-3 py-2 text-[13px] font-semibold tracking-[0.06em] transition-colors ${
        mode === value
          ? "border-trast-ultra bg-trast-ultra text-white"
          : "border-trast-blue/45 bg-white text-trast-ink hover:border-trast-blue hover:bg-trast-blue/5"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#12093A]/65 p-3 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanner-title"
        aria-describedby="scanner-status"
        className="max-h-[95dvh] w-full max-w-xl overflow-y-auto rounded-[6px] border border-trast-violet/30 bg-trast-white shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-trast-violet/15 px-4 py-3.5 sm:px-5">
          <div>
            <h2 id="scanner-title" className="text-base font-bold tracking-[0.02em] text-trast-ink">
              Scan pallet or package
            </h2>
            <p className="text-xs text-trast-ink/70">Real camera capture. Delivery lookup against records is mocked.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-[4px] border border-trast-blue/45 bg-white px-3 py-2 text-sm font-semibold tracking-[0.06em] text-trast-ink transition-colors hover:border-trast-blue hover:bg-trast-blue/5"
          >
            Close
          </button>
        </div>

        <div className="flex gap-2 px-4 pt-3 sm:px-5">
          {tab("barcode", "Barcode / QR")}
          {tab("ocr", "Printed reference · OCR beta")}
        </div>

        <div className="px-4 py-4 sm:px-5">
          <div className="relative overflow-hidden rounded-[4px] border border-black/25 bg-[#12093A]">
            <video ref={videoRef} playsInline muted autoPlay className="h-48 w-full object-cover sm:h-64" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-4/5 rounded-[4px] border-2 border-white/90 shadow-[0_0_0_9999px_rgba(18,9,58,0.4)] sm:h-32" />
            </div>
            {!ok ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[#12093A]/85 px-5 text-center">
                <p className="text-sm font-semibold text-white">{STATUS_COPY[status]}</p>
              </div>
            ) : null}
          </div>

          <p id="scanner-status" role="status" className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-trast-ink">
            {ok ? (
              <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#007A69]" />
            ) : (
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
            )}
            <span>{ok && mode === "ocr" ? "Camera live — hold the label steady and read the printed reference." : STATUS_COPY[status]}</span>
          </p>
          {!ok && detail ? <p className="mt-1 pl-6 text-xs text-trast-ink/70">Reported: {detail}</p> : null}

          {mode === "ocr" ? (
            <div className="mt-4 rounded-[4px] border border-trast-violet/25 bg-white px-3.5 py-3.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Btn variant="action" onClick={() => void readPrintedReference()} disabled={!ok || ocrState === "working"}>
                  <IconClipboard className="h-4 w-4" />
                  Read printed reference
                </Btn>
                <span className="text-xs font-semibold tracking-[0.06em] text-trast-ink/70">OCR beta</span>
              </div>

              {ocrState === "working" ? (
                <p role="status" className="mt-2 text-sm text-trast-ink">
                  Reading reference… {ocrProgress}%
                </p>
              ) : null}

              {ocrState === "done" ? (
                <div className="mt-3">
                  <label htmlFor="ocr-reference" className="block text-sm font-medium text-trast-ink/80">
                    Detected reference — confirm before opening
                  </label>
                  <input
                    id="ocr-reference"
                    value={confirmed}
                    onChange={(event) => setConfirmed(event.target.value)}
                    autoComplete="off"
                    className="mt-1.5 w-full rounded-[4px] border border-ink/20 bg-white px-3 py-2 text-sm text-trast-ink focus:border-trast-blue focus:outline-none"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Btn variant="action" onClick={() => simulate(normalizeReference(confirmed))}>
                      Open delivery
                    </Btn>
                    <span className="text-xs text-trast-ink/70">Edit it if the read is wrong.</span>
                  </div>
                  {ocrText ? (
                    <p className="mt-2 text-xs leading-relaxed text-trast-ink/60">
                      Read from the label: {normalizeReference(ocrText).slice(0, 120)}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {ocrState === "empty" ? (
                <p role="alert" className="mt-2 text-sm font-semibold text-danger">
                  {NO_MATCH}
                </p>
              ) : null}

              {ocrState === "failed" ? (
                <p role="alert" className="mt-2 text-sm font-semibold text-danger">
                  OCR could not run — use Barcode / QR, manual entry or the simulation below.
                  {detail ? <span className="block font-normal text-trast-ink/70">Reported: {detail}</span> : null}
                </p>
              ) : null}

              <p className="mt-3 text-xs leading-relaxed text-trast-ink/70">
                OCR runs on this device. Images are not uploaded or saved.
              </p>
            </div>
          ) : null}

          <p className="mt-3 text-xs leading-relaxed text-trast-ink/70">
            Frames are decoded on this device and the camera is released the moment a code is read, the mode changes or
            the scanner closes. No image or video is captured, uploaded or stored.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-trast-violet/15 px-4 py-3.5 sm:px-5">
          <Btn variant="simulation" onClick={() => simulate("DN-1")}>
            <IconPackage className="h-4 w-4" />
            Simulation — scan DN-1
          </Btn>
          <span className="text-xs text-trast-ink/70">
            Mocked result — passes through the same lookup as a decoded barcode or an OCR read. Manual entry stays
            available behind this dialog.
          </span>
        </div>
      </div>
    </div>
  );
}
