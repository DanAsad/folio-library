"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

const looksLikeIsbn = (v: string) => /^(97[89]\d{10}|\d{9}[\dX])$/.test(v.replace(/[-\s]/g, ""));

/**
 * Scans EAN-13 / ISBN barcodes with the device camera. Uses the native BarcodeDetector
 * API where available (Chrome, Android) and falls back to ZXing everywhere else.
 */
export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDetected: (isbn: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("scanner.title")}</DialogTitle>
          <DialogDescription>{t("scanner.description")}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the camera starts and stops with the dialog. */}
        {open && <Scanner onDetected={onDetected} />}
      </DialogContent>
    </Dialog>
  );
}

function Scanner({ onDetected }: { onDetected: (isbn: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { t } = useI18n();
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [manual, setManual] = useState("");
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let zxingControls: { stop: () => void } | null = null;

    const done = (code: string) => {
      if (stopped) return;
      const clean = code.replace(/[-\s]/g, "");
      if (!looksLikeIsbn(clean)) return;
      stopped = true;
      onDetectedRef.current(clean);
    };

    (async () => {
      try {
        const video = videoRef.current!;
        const NativeDetector = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        if (NativeDetector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          if (stopped) return;
          video.srcObject = stream;
          await video.play();
          setStatus("scanning");
          const detector = new NativeDetector({ formats: ["ean_13", "ean_8", "upc_a"] });
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              if (codes[0]) done(codes[0].rawValue);
            } catch {}
            if (!stopped) requestAnimationFrame(tick);
          };
          tick();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          zxingControls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
            if (result) done(result.getText());
          });
          if (stopped) zxingControls.stop();
          else setStatus("scanning");
        }
      } catch {
        if (!stopped) setStatus("error");
      }
    })();

    return () => {
      stopped = true;
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} className="size-full object-cover" muted playsInline />
        {status === "scanning" && (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.9)]" />
        )}
        {status !== "scanning" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/80">
            {status === "starting" ? (
              <>
                <Loader2 className="size-6 animate-spin" /> {t("scanner.starting")}
              </>
            ) : (
              <>
                <CameraOff className="size-6" /> {t("scanner.unavailable")}
              </>
            )}
          </div>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onDetected(manual.replace(/[-\s]/g, ""));
        }}
      >
        <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t("scanner.typeIsbn")} inputMode="numeric" />
        <Button type="submit" variant="secondary">
          {t("scanner.use")}
        </Button>
      </form>
    </>
  );
}
