/**
 * Camera barcode/QR scanner via the browser's BarcodeDetector API
 * (Chromium has it natively; Safari/Firefox return null from
 * `barcodeSupported()` so the consumer should hide its trigger). The
 * scanner opens as a modal, streams the rear camera into a `<video>`,
 * and fires onDetected once. Detected value flows into ArticleForm
 * which optionally enriches name + image via `lookupProduct()`.
 */
import { useEffect, useRef, useState } from "react";
import Modal from "../common/Modal";
import { useI18n } from "../../i18n/i18n";

// Minimal typing for the experimental BarcodeDetector API (not in lib.dom yet).
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (opts?: {
  formats?: string[];
}) => BarcodeDetectorLike;

function getCtor(): BarcodeDetectorCtor | null {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return typeof w.BarcodeDetector === "function" ? w.BarcodeDetector : null;
}

/** True when the browser can scan barcodes (and the feature isn't flagged off). */
export function barcodeSupported(): boolean {
  if (import.meta.env.VITE_FEATURE_BARCODE === "0") return false;
  return getCtor() !== null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (value: string) => void;
}

export default function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const Ctor = getCtor();
    if (!Ctor) {
      setError(t("scan.unsupported"));
      return;
    }

    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new Ctor();

    const tick = async () => {
      const video = videoRef.current;
      if (stopped || !video || video.readyState < 2) {
        raf = requestAnimationFrame(tick);
        return;
      }
      try {
        const codes = await detector.detect(video);
        if (codes.length > 0 && codes[0].rawValue) {
          onDetected(codes[0].rawValue);
          return; // stop the loop; parent closes the modal
        }
      } catch {
        // transient decode errors are expected between frames
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        raf = requestAnimationFrame(tick);
      } catch {
        setError(t("scan.cameraError"));
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [open, onDetected, t]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId="barcode-scan-title"
      panelClassName="ui-card rounded-lg shadow-2xl max-w-md w-full p-6 space-y-4"
    >
      <h2 id="barcode-scan-title" className="text-lg font-semibold ui-title">
        {t("scan.title")}
      </h2>
      {error ? (
        <p className="text-sm ui-text-error" role="alert">
          {error}
        </p>
      ) : (
        <>
          <p id="barcode-scan-hint" className="text-sm ui-text-muted">
            {t("scan.hint")}
          </p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            aria-label={t("scan.title")}
            aria-describedby="barcode-scan-hint"
            className="w-full rounded bg-black"
            muted
            playsInline
          />
        </>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="ui-btn-ghost px-4 py-2 rounded-md text-sm border ui-divider"
        >
          {t("common.cancel")}
        </button>
      </div>
    </Modal>
  );
}
