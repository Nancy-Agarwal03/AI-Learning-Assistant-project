import React from 'react';
import { FileText, Presentation, FileCode, Trash2, CheckCircle2 } from 'lucide-react';

export interface FileItem {
  id: string;
  name: string;
  type: 'pdf' | 'slides' | 'code' | 'other';
  size: number;
  progress?: number; // 0 to 100
  isParsed?: boolean;
  pagesOrLines?: string;
  includeInAnswers?: boolean;
}

export interface FileRowProps {
  file: FileItem;
  onDelete?: (id: string) => void;
  onToggleInclude?: (id: string, include: boolean) => void;
  className?: string;
}

export const FileRow: React.FC<FileRowProps> = ({
  file,
  onDelete,
  onToggleInclude,
  className = '',
}) => {
  const Icon =
    file.type === 'pdf'
      ? FileText
      : file.type === 'slides'
      ? Presentation
      : FileCode;

  const isUploading = typeof file.progress === 'number' && file.progress < 100;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className={`p-3 bg-[#16181D] border border-[#2A2D35] rounded-[8px] flex flex-col gap-2 transition-colors ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-[6px] bg-[#1F2229] border border-[#2A2D35] text-[#FF7A2F] shrink-0">
            <Icon className="w-4 h-4" />
          </div>

          <div className="min-w-0">
            <div className="text-xs font-medium text-[#ECEDEF] truncate">
              {file.name}
            </div>
            <div className="text-[11px] text-[#A0A4AE] flex items-center gap-2">
              <span className="uppercase">{file.type}</span>
              <span>&bull;</span>
              <span>{formatSize(file.size)}</span>
              {file.pagesOrLines && (
                <>
                  <span>&bull;</span>
                  <span>{file.pagesOrLines}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onToggleInclude && (
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-[#A0A4AE] hover:text-[#ECEDEF]">
              <input
                type="checkbox"
                checked={file.includeInAnswers ?? true}
                onChange={(e) => onToggleInclude(file.id, e.target.checked)}
                className="accent-[#FF7A2F] rounded"
              />
              <span className="hidden sm:inline">Use in answers</span>
            </label>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(file.id)}
              className="p-1.5 text-[#A0A4AE] hover:text-[#E5534B] hover:bg-[#1F2229] rounded-[6px] transition-colors"
              title="Delete file"
              aria-label={`Delete ${file.name}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {isUploading ? (
        <div className="w-full bg-[#0E0F12] rounded-full h-1.5 overflow-hidden border border-[#2A2D35]">
          <div
            className="bg-[#FF7A2F] h-full transition-all duration-300"
            style={{ width: `${file.progress}%` }}
          />
        </div>
      ) : file.isParsed ? (
        <div className="flex items-center gap-1 text-[11px] text-[#3FB67A]">
          <CheckCircle2 className="w-3 h-3" />
          <span>Parsed and indexed for answers</span>
        </div>
      ) : null}
    </div>
  );
};
