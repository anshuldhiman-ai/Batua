import React, { useState, useCallback } from 'react';
import { Upload, X, Loader2, Camera } from 'lucide-react';
import { toast } from 'sonner';
import Tesseract from 'tesseract.js';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface ReceiptScannerProps {
  onTextExtracted: (text: string) => void;
  onClose: () => void;
}

export default function ReceiptScanner({ onTextExtracted, onClose }: ReceiptScannerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [extractedText, setExtractedText] = useState<string>('');

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

  const processImage = useCallback(async () => {
    if (!file || !preview) return;

    setProcessing(true);
    setProgress(0);

    try {
      const result = await Tesseract.recognize(preview, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      const text = result.data.text;
      setExtractedText(text);
      toast.success('Receipt scanned successfully');
    } catch (error) {
      console.error('OCR Error:', error);
      toast.error('Failed to scan receipt');
    } finally {
      setProcessing(false);
    }
  }, [file, preview]);

  const handleUseText = () => {
    if (extractedText) {
      onTextExtracted(extractedText);
      onClose();
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setExtractedText('');
    setProgress(0);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Scan Receipt</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!file ? (
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <input
              type="file"
              id="receipt-upload"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <label
              htmlFor="receipt-upload"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <Camera className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click to upload receipt image
              </p>
              <p className="text-xs text-muted-foreground">
                Supports JPG, PNG, WebP
              </p>
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            {preview && (
              <div className="relative">
                <img
                  src={preview}
                  alt="Receipt preview"
                  className="w-full h-auto rounded-lg border"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 bg-background/80"
                  onClick={handleReset}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {processing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Scanning receipt...</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            )}

            {!processing && !extractedText && (
              <Button onClick={processImage} className="w-full">
                <Upload className="h-4 w-4 mr-2" />
                Scan Receipt
              </Button>
            )}

            {extractedText && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Extracted Text
                  </label>
                  <textarea
                    value={extractedText}
                    onChange={(e) => setExtractedText(e.target.value)}
                    className="w-full h-32 p-3 border rounded-lg text-sm resize-none"
                    placeholder="Extracted text will appear here..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleUseText} className="flex-1">
                    Use This Text
                  </Button>
                  <Button variant="outline" onClick={handleReset}>
                    Rescan
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
