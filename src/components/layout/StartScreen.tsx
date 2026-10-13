'use client';

import React, { useRef, useState } from 'react';
import { CloudUpload } from 'lucide-react';
import { importFiles } from '@/lib/importImages';

export function StartScreen() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      importFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      importFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <main
      className="flex-1 flex items-center justify-center bg-surface p-6 select-none overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      <button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label="Upload or paste an image"
        className={`w-[min(720px,90%)] h-[340px] rounded-[24px] flex flex-col items-center justify-center transition-all cursor-pointer focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-4 focus-visible:ring-offset-surface ${
          isDragOver
            ? 'border-2 border-solid border-blue bg-blue/10'
            : 'border-2 border-dashed border-ink hover:border-blue hover:bg-blue/[0.06] bg-transparent'
        }`}
      >
        <CloudUpload
          className={`w-[72px] h-[72px] transition-colors ${
            isDragOver ? 'text-blue' : 'text-ink'
          }`}
          strokeWidth={1.5}
        />

        <span
          className={`mt-4 font-medium text-[18px] uppercase tracking-[0.08em] transition-colors ${
            isDragOver ? 'text-blue' : 'text-ink'
          }`}
        >
          {isDragOver ? 'Drop to add' : 'Upload or paste an image'}
        </span>
      </button>
    </main>
  );
}
