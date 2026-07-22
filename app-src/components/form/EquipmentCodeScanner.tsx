'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, CheckCircle2, Loader2, ScanLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { classifyEquipmentSerial, FloaterType } from '@/lib/equipmentScanner';

export function EquipmentCodeScanner({ disabled, onScan }: {
  disabled?: boolean;
  onScan: (serial: string, floaterType?: FloaterType) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [pendingFloater, setPendingFloater] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'active' | 'unsupported' | 'denied'>('idle');
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastCameraValueRef = useRef('');
  const pendingFloaterRef = useRef<string | null>(null);
  const onScanRef = useRef(onScan);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const acceptValue = (rawValue: string) => {
    const classified = classifyEquipmentSerial(rawValue);
    if (!classified) {
      setFeedback({ type: 'error', message: 'Unknown device code. Expected SP1, S2, NR, SD, or Z at the start.' });
      return;
    }
    if (classified.category === 'floater') {
      pendingFloaterRef.current = classified.serial;
      setPendingFloater(classified.serial);
      setFeedback(null);
      return;
    }
    if (onScanRef.current(classified.serial)) {
      setManualValue('');
      setFeedback({ type: 'success', message: `${classified.serial} added to ${classified.label}.` });
    } else {
      setFeedback({ type: 'error', message: `${classified.serial} could not be added. Check the notification for details.` });
    }
  };

  const chooseFloaterType = (type: FloaterType) => {
    if (!pendingFloater) return;
    if (onScanRef.current(pendingFloater, type)) {
      setFeedback({ type: 'success', message: `${pendingFloater} added as Floater ${type}.` });
      setManualValue('');
      pendingFloaterRef.current = null;
      setPendingFloater(null);
    } else {
      setFeedback({ type: 'error', message: `${pendingFloater} could not be added. Check the notification for details.` });
    }
  };

  useEffect(() => {
    if (!open) return;
    let controls: { stop: () => void } | null = null;
    let cancelled = false;
    const videoElement = videoRef.current;

    const startCamera = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraState('unsupported');
        return;
      }
      if (!videoElement) return;
      setCameraState('starting');
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const scannerControls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          videoElement,
          result => {
            if (!result || pendingFloaterRef.current) return;
            const value = result.getText().trim();
            if (!value || value === lastCameraValueRef.current) return;
            lastCameraValueRef.current = value;
            acceptValue(value);
          },
        );
        controls = scannerControls;
        if (cancelled) {
          scannerControls.stop();
          return;
        }
        setCameraState('active');
      } catch {
        if (cancelled) return;
        setCameraState('denied');
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      controls?.stop();
      if (videoElement) videoElement.srcObject = null;
      lastCameraValueRef.current = '';
      pendingFloaterRef.current = null;
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setManualValue('');
    setPendingFloater(null);
    setFeedback(null);
    setCameraState('idle');
  };

  const submitManual = () => {
    if (manualValue.trim() && !pendingFloater) acceptValue(manualValue);
  };

  return <>
    <Button type="button" disabled={disabled} onClick={() => setOpen(true)} className="h-10 bg-emerald-600 hover:bg-emerald-500 text-white">
      <ScanLine className="w-4 h-4 mr-2" /> Scan equipment QR / barcode
    </Button>

    {open && typeof document !== 'undefined' && createPortal(<div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="equipment-scanner-title">
      <div className="w-full max-w-lg max-h-[95vh] overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="equipment-scanner-title" className="font-bold text-lg">Scan equipment code</h2>
            <p className="text-xs text-muted-foreground">The serial prefix selects the correct equipment section.</p>
          </div>
          <button type="button" aria-label="Close scanner" onClick={close} className="p-2 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-black flex items-center justify-center">
          <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          {cameraState === 'starting' && <div className="relative text-white text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Starting camera…</div>}
          {cameraState === 'active' && <div className="relative w-3/4 h-1/2 border-2 border-emerald-400 rounded-xl pointer-events-none"><div className="absolute top-1/2 left-2 right-2 h-0.5 bg-emerald-400 shadow-[0_0_8px_#34d399]" /></div>}
          {cameraState === 'unsupported' && <div className="relative px-6 text-center text-white text-sm"><Camera className="w-7 h-7 mx-auto mb-2" />Camera access requires localhost or HTTPS. Use the scanner input below if camera access is unavailable.</div>}
          {cameraState === 'denied' && <div className="relative px-6 text-center text-white text-sm">Camera access was denied or the camera is in use. Allow permission, close other camera apps, or use the input below.</div>}
        </div>

        {pendingFloater && <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div><p className="text-sm font-semibold">Choose the floater type</p><p className="text-xs text-muted-foreground mt-1 font-mono">{pendingFloater}</p></div>
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" onClick={() => chooseFloaterType('AM')} className="bg-blue-600 hover:bg-blue-500 text-white">AM</Button>
            <Button type="button" onClick={() => chooseFloaterType('AR')} className="bg-blue-600 hover:bg-blue-500 text-white">AR</Button>
          </div>
          <button type="button" onClick={() => { pendingFloaterRef.current = null; setPendingFloater(null); setFeedback(null); }} className="text-xs text-muted-foreground hover:text-foreground">Cancel this scan</button>
        </div>}

        {feedback && <div aria-live="polite" className={`rounded-lg border px-3 py-2 text-sm flex items-start gap-2 ${feedback.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
          {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}{feedback.message}
        </div>}

        <div className="space-y-1.5">
          <Label htmlFor="scanner-input">USB/Bluetooth scanner or manual serial</Label>
          <div className="flex gap-2">
            <Input id="scanner-input" autoFocus disabled={!!pendingFloater} value={manualValue} onChange={event => setManualValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submitManual(); } }} placeholder="Scan here or type the serial number" />
            <Button type="button" disabled={!manualValue.trim() || !!pendingFloater} onClick={submitManual}>Add</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Accepted prefixes: SP1, S2, NR, SD, and Z. Press Enter after manual entry.</p>
        </div>

        <div className="flex justify-end"><Button type="button" variant="outline" onClick={close}>Done</Button></div>
      </div>
    </div>, document.body)}
  </>;
}
