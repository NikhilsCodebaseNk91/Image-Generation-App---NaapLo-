import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, AlertCircle } from 'lucide-react';
import type { ImageFilePayload } from '../../shared/types.ts';

interface ImageUploaderProps {
  images: ImageFilePayload[];
  onAddImages: (newImages: ImageFilePayload[]) => void;
  onRemoveImage: (index: number) => void;
  maxImages?: number;
  disabled?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  images,
  onAddImages,
  onRemoveImage,
  maxImages = 10,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const processFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);

    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) {
      setUploadError(`Maximum limit of ${maxImages} reference images reached.`);
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setUploadError(`Only ${remainingSlots} more image(s) could be added (max ${maxImages}).`);
    }

    const readPromises: Promise<ImageFilePayload>[] = filesToProcess.map((file) => {
      return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
          reject(new Error(`"${file.name}" is not a valid image file.`));
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve({
            name: file.name,
            mimeType: file.type || 'image/jpeg',
            data: result,
          });
        };
        reader.onerror = () => reject(new Error(`Failed to read "${file.name}".`));
        reader.readAsDataURL(file);
      });
    });

    Promise.allSettled(readPromises).then((results) => {
      const successful: ImageFilePayload[] = [];
      const errors: string[] = [];

      for (const res of results) {
        if (res.status === 'fulfilled') {
          successful.push(res.value);
        } else {
          errors.push(res.reason?.message || 'File read failed');
        }
      }

      if (successful.length > 0) {
        onAddImages(successful);
      }
      if (errors.length > 0) {
        setUploadError(errors.join(', '));
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    processFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-stone-800">
          Garment Reference Photographs <span className="text-red-500">*</span>
        </label>
        <span className="text-xs text-stone-500">
          {images.length} of {maxImages} uploaded
        </span>
      </div>

      {/* Drag & Drop Box */}
      <div
        id="reference-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-stone-800 bg-stone-100/70'
            : 'border-stone-300 hover:border-stone-400 bg-stone-50/50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={disabled}
          onChange={(e) => processFiles(e.target.files)}
        />
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-600 shadow-xs">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-stone-700">
              Click to upload reference photographs or drag and drop
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              JPG, PNG, or WebP &bull; High resolution recommended &bull; Up to 10 images
            </p>
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-md">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Thumbnails grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-1">
          {images.map((img, index) => (
            <div
              key={`${img.name}-${index}`}
              className="group relative rounded-md border border-stone-200 bg-white overflow-hidden shadow-xs hover:border-stone-300 transition-all"
            >
              <div className="aspect-3/4 bg-stone-100 flex items-center justify-center overflow-hidden">
                <img
                  src={img.data}
                  alt={img.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Individual remove button */}
              <button
                type="button"
                id={`remove-ref-${index}`}
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveImage(index);
                }}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-stone-900/80 text-white hover:bg-red-600 flex items-center justify-center transition-colors shadow-sm"
                title={`Remove ${img.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>

              <div className="p-1.5 bg-white border-t border-stone-100">
                <p className="text-[11px] font-medium text-stone-700 truncate" title={img.name}>
                  {index + 1}. {img.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
