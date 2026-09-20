import React, { useState, useCallback } from 'react';
import { Upload, X, Camera, Store, Calendar, Wallet, Tag, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import Tesseract from 'tesseract.js';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { api, formatINR } from '@/lib/utils-finance';
import { parseReceiptText, receiptFromApi, type ParsedReceipt } from '@/lib/parse-receipt';
import { cn } from '@/lib/utils';

interface ReceiptScannerProps {
  onTextExtracted: (text: string, parsed?: ParsedReceipt) => void;
  onClose: () => void;
}

export default function ReceiptScanner({ onTextExtracted, onClose }: ReceiptScannerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [source, setSource] = useState<'gemini' | 'ocr' | null>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  }, []);

  const ocrFallback = async (image: string) => {
    const result = await Tesseract.recognize(image, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          setProgress(Math.round(m.progress * 100));
        }
      },
    });
    return parseReceiptText(result.data.text || '');
  };

  const processImage = useCallback(async () => {
    if (!file || !preview) return;

    setProcessing(true);
    setProgress(8);
    setParsed(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      try {
        const { data } = await api.post('/transactions/scan-receipt', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setProgress(100);
        setParsed(receiptFromApi(data || {}, ''));
        setSource('gemini');
        toast.success('Receipt fields filled — check them before saving');
        return;
      } catch {
        // Gemini unset / offline: local OCR still structures merchant, total, items.
      }

      const structured = await ocrFallback(preview);
      setParsed(structured);
      setSource('ocr');
      toast.success(
        structured.amount
          ? 'Pulled merchant, total, and line items from the photo'
          : 'Could only read the photo — edit the fields before saving'
      );
    } catch (error) {
      console.error('OCR Error:', error);
      toast.error('Failed to scan receipt');
    } finally {
      setProcessing(false);
    }
  }, [file, preview]);

  const handleUse = () => {
    if (!parsed) return;
    onTextExtracted(parsed.rawText || parsed.notes, parsed);
    onClose();
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setParsed(null);
    setProgress(0);
    setSource(null);
  };

  return (
    <Card className="w-full border-0 bg-transparent shadow-none">
      <CardContent className="space-y-4 p-0">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            From a photo
          </p>
          <h3 className="mt-0.5 font-display text-xl tracking-tight">Scan receipt</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            We’ll pull the shop, date, total, and line items — you just confirm.
          </p>
        </div>

        {!file ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-muted/30 p-8 text-center">
            <input
              type="file"
              id="receipt-upload"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
            <label
              htmlFor="receipt-upload"
              className="flex cursor-pointer flex-col items-center gap-2"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border">
                <Camera className="h-5 w-5 text-foreground" />
              </span>
              <p className="text-sm font-medium">Drop a photo or tap to choose</p>
              <p className="text-xs text-muted-foreground">JPG, PNG, or WebP — paper bills work best</p>
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            {preview && (
              <div className="relative overflow-hidden rounded-2xl border border-border bg-muted/20">
                <img
                  src={preview}
                  alt="Receipt preview"
                  className="mx-auto max-h-56 w-auto object-contain"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 bg-background/85"
                  onClick={handleReset}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {processing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{progress < 20 ? 'Reading the bill…' : 'Picking out totals and items…'}</span>
                  <span className="tabular-nums text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            )}

            {!processing && !parsed && (
              <Button onClick={processImage} className="w-full rounded-xl">
                <Upload className="mr-2 h-4 w-4" />
                Read receipt
              </Button>
            )}

            {parsed && (
              <div className="space-y-3" data-testid="receipt-structured">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    What we found
                  </p>
                  <Badge variant="outline" className="font-normal">
                    {source === 'gemini' ? 'Structured read' : 'From the photo'}
                  </Badge>
                </div>

                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Fact icon={Store} label="Merchant" value={parsed.description} wide />
                  <Fact icon={Wallet} label="Total" value={formatINR(parsed.amount)} emphasis />
                  <Fact icon={Calendar} label="Date" value={parsed.date} />
                  <Fact icon={Tag} label="Category" value={parsed.category} />
                  <Fact icon={ReceiptText} label="Paid with" value={parsed.payment_method || '—'} />
                </dl>

                {parsed.items.length > 0 && (
                  <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-background/70">
                    {parsed.items.map((item, i) => (
                      <li key={`${item.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">
                          {item.name}
                          {item.quantity && item.quantity > 1 && (
                            <span className="ml-1.5 text-xs text-muted-foreground">×{item.quantity}</span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-rose-600 dark:text-rose-400">
                          {formatINR(-Math.abs(item.amount))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {parsed.notes && (
                  <p className="text-xs leading-relaxed text-muted-foreground">{parsed.notes}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button onClick={handleUse} className="flex-1 rounded-xl" data-testid="receipt-use-btn">
                    Use these details
                  </Button>
                  <Button variant="outline" className="rounded-xl" onClick={handleReset}>
                    Try another
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  wide,
  emphasis,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  wide?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border border-border/70 bg-background/80 px-3 py-2', wide && 'col-span-2 sm:col-span-2')}>
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </dt>
      <dd className={cn('mt-0.5 truncate text-sm font-medium', emphasis && 'tabular-nums')}>
        {value || '—'}
      </dd>
    </div>
  );
}
