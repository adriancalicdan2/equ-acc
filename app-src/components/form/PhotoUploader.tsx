'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhotoUploaderProps {
  label: string;
  maxFiles?: number;
  onChange: (files: File[]) => void;
}

export function PhotoUploader({ label, maxFiles = 3, onChange }: PhotoUploaderProps) {
  const [previews, setPreviews] = useState<{ url: string; file: File }[]>([]);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const remaining = maxFiles - previews.length;
      const toAdd = accepted.slice(0, remaining);
      const newPreviews = toAdd.map((file) => ({
        url: URL.createObjectURL(file),
        file,
      }));
      const updated = [...previews, ...newPreviews];
      setPreviews(updated);
      onChange(updated.map((p) => p.file));
    },
    [previews, maxFiles, onChange]
  );

  const remove = (idx: number) => {
    URL.revokeObjectURL(previews[idx].url);
    const updated = previews.filter((_, i) => i !== idx);
    setPreviews(updated);
    onChange(updated.map((p) => p.file));
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: maxFiles - previews.length,
    disabled: previews.length >= maxFiles,
  });

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-primary" />
        {label}
        <span className="text-xs text-muted-foreground/60">
          ({previews.length}/{maxFiles} photos)
        </span>
      </p>

      {/* Previews */}
      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previews.map((p, i) => (
            <div key={i} className="relative group rounded-lg overflow-hidden border border-border aspect-video bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={`Photo ${i + 1}`}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-1 right-1 bg-background/80 backdrop-blur rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/90"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="absolute bottom-1 left-1 bg-background/70 backdrop-blur text-xs px-1.5 py-0.5 rounded">
                {i + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {previews.length < maxFiles && (
        <div
          {...getRootProps()}
          className={cn(
            'drop-zone border-2 border-dashed rounded-xl p-6 text-center cursor-pointer',
            'border-border hover:border-primary/50 hover:bg-primary/5',
            isDragActive && 'dragging'
          )}
        >
          <input {...getInputProps()} />
          <Upload className={cn('w-6 h-6 mx-auto mb-2 text-muted-foreground transition-colors', isDragActive && 'text-primary')} />
          <p className="text-sm text-muted-foreground">
            {isDragActive ? (
              <span className="text-primary font-medium">Drop photos here…</span>
            ) : (
              <>
                Drag & drop photos, or{' '}
                <span className="text-primary font-medium">click to browse</span>
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            JPG, PNG, WEBP · Max {maxFiles - previews.length} more
          </p>
        </div>
      )}
    </div>
  );
}
