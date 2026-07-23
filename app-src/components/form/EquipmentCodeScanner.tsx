'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import type { IDetectedBarcode, IScannerError } from '@yudiel/react-qr-scanner';
import { Camera, CheckCircle2, ImagePlus, Loader2, ScanLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { classifyEquipmentSerial, FloaterType } from '@/lib/equipmentScanner';

const LiveEquipmentScanner = dynamic(
  () => import('@yudiel/react-qr-scanner').then(module => module.Scanner),
  { ssr: false },
);

async function createEquipmentCodeReader(tryHarder = false) {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map<import('@zxing/library').DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.DATA_MATRIX,
  ]);
  if (tryHarder) hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 120,
    delayBetweenScanSuccess: 800,
  });
}

export function EquipmentCodeScanner({ disabled, onScan }: {
  disabled?: boolean;
  onScan: (serial: string, floaterType?: FloaterType) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [pendingFloater, setPendingFloater] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [imageState, setImageState] = useState<'idle' | 'decoding'>('idle');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const lastCameraValueRef = useRef('');
  const pendingFloaterRef = useRef<string | null>(null);
  const processingImageRef = useRef(false);
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

  const handleCameraScan = (detectedCodes: IDetectedBarcode[]) => {
    if (pendingFloaterRef.current || processingImageRef.current) return;
    const value = detectedCodes[0]?.rawValue.trim();
    if (!value || value === lastCameraValueRef.current) return;
    setCameraError(null);
    lastCameraValueRef.current = value;
    acceptValue(value);
  };

  const handleCameraError = (error: IScannerError) => {
    const cameraErrorMessages: Partial<Record<IScannerError['kind'], string>> = {
      'permission-denied': 'Camera permission was denied. Allow camera access in your browser settings.',
      'insecure-context': 'Camera access requires localhost or HTTPS.',
      'no-camera': 'No camera was found on this device.',
      'in-use': 'The camera is being used by another application.',
      unsupported: 'Camera scanning is not supported by this browser.',
    };
    setCameraError(cameraErrorMessages[error.kind] ?? error.message ?? 'The camera could not be started.');
  };

  const close = () => {
    setOpen(false);
    setManualValue('');
    setPendingFloater(null);
    setFeedback(null);
    setCameraError(null);
    lastCameraValueRef.current = '';
    pendingFloaterRef.current = null;
    processingImageRef.current = false;
  };

  const submitManual = () => {
    if (manualValue.trim() && !pendingFloater) acceptValue(manualValue);
  };

  const uploadCodePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || pendingFloater) return;
    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', message: 'Please choose an image containing a QR code or barcode.' });
      input.value = '';
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'The photo is larger than 15 MB. Please choose a smaller image.' });
      input.value = '';
      return;
    }

    processingImageRef.current = true;
    setImageState('decoding');
    setFeedback(null);
    const imageUrl = URL.createObjectURL(file);
    try {
      const reader = await createEquipmentCodeReader(true);
      const result = await reader.decodeFromImageUrl(imageUrl);
      acceptValue(result.getText());
    } catch {
      setFeedback({
        type: 'error',
        message: 'No readable equipment code was found. Try a sharper, well-lit photo with the entire code visible.',
      });
    } finally {
      URL.revokeObjectURL(imageUrl);
      processingImageRef.current = false;
      setImageState('idle');
      input.value = '';
    }
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
          <LiveEquipmentScanner
            onScan={handleCameraScan}
            onError={handleCameraError}
            constraints={{
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }}
            formats={[
              'qr_code',
              'code_128',
              'code_39',
              'code_93',
              'data_matrix',
            ]}
            paused={!!pendingFloater || imageState === 'decoding'}
            retryDelay={80}
            sound
            components={{ finder: true, torch: true, zoom: true, onOff: true }}
            styles={{
              container: { width: '100%', height: '100%' },
              video: { width: '100%', height: '100%', objectFit: 'cover' },
            }}
          />
          {cameraError && <div className="absolute inset-0 bg-black/85 px-6 text-center text-white text-sm flex flex-col items-center justify-center">
            <Camera className="w-7 h-7 mb-2" />
            <span>{cameraError}</span>
          </div>}
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

        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
          <div>
            <p className="text-sm font-semibold">Scan from a photo</p>
            <p className="text-xs text-muted-foreground">Choose a clear image from this device. The photo is processed only in your browser.</p>
          </div>
          <input ref={imageInputRef} type="file" accept="image/*" onChange={uploadCodePhoto} disabled={imageState === 'decoding' || !!pendingFloater} className="sr-only" aria-label="Upload QR code or barcode photo" />
          <Button type="button" variant="outline" disabled={imageState === 'decoding' || !!pendingFloater} onClick={() => imageInputRef.current?.click()} className="w-full">
            {imageState === 'decoding' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-2" />}
            {imageState === 'decoding' ? 'Reading photo...' : 'Upload QR / barcode photo'}
          </Button>
        </div>

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
