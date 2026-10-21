import React, { useState, useEffect } from 'react';
import { Download, X, Copy, Check, FileCode, CheckCircle2 } from 'lucide-react';

interface ExtensionDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExtensionDownloadModal: React.FC<ExtensionDownloadModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeFile, setActiveFile] = useState<string>('manifest.json');
  const [extensionFiles, setExtensionFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/extension-files')
        .then((res) => res.json())
        .then((data) => {
          if (data.files && data.files.length > 0) {
            setExtensionFiles(data.files);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentFile = extensionFiles.find((f) => f.path.endsWith(activeFile)) || extensionFiles[0];

  const handleDownloadZip = () => {
    setDownloading(true);
    const link = document.createElement('a');
    link.href = '/api/download-extension';
    link.download = 'ai-learning-assistant-extension.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setDownloading(false), 1500);
  };

  const handleCopyCode = () => {
    if (currentFile) {
      navigator.clipboard.writeText(currentFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0E0F12]/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card-frame w-full max-w-3xl max-h-[90vh] flex flex-col bg-[#16181D] shadow-2xl border border-[#2A2D35] overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#2A2D35] flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-[#ECEDEF]">Download Chrome Extension</h3>
            <p className="text-xs text-[#A0A4AE] mt-0.5">
              Manifest V3 side panel for Chrome.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-[8px] border border-[#2A2D35] text-[#A0A4AE] hover:text-[#ECEDEF] hover:border-[#4A4F5C]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {/* Quick Install Guide */}
          <div className="p-4 bg-[#0E0F12] border border-[#2A2D35] rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-[#ECEDEF] mb-1">
                Download ready-to-load extension archive
              </div>
              <p className="text-xs text-[#A0A4AE]">
                Includes manifest.json, background service worker, content scripts, and side panel UI.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadZip}
              disabled={downloading}
              className="btn-primary shrink-0 text-xs px-4 py-2.5"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Downloading...' : 'Download Extension (.zip)'}
            </button>
          </div>

          {/* Installation Steps */}
          <div>
            <h4 className="text-sm font-semibold text-[#ECEDEF] mb-3">Installation Instructions</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-[#1F2229] border border-[#2A2D35] rounded-lg">
                <div className="font-mono text-[#FF7A2F] mb-1">Step 1</div>
                <div className="text-[#ECEDEF] font-medium">Extract the ZIP file</div>
                <div className="text-[#A0A4AE] mt-1">Unzip the downloaded file into a folder on your computer.</div>
              </div>
              <div className="p-3 bg-[#1F2229] border border-[#2A2D35] rounded-lg">
                <div className="font-mono text-[#FF7A2F] mb-1">Step 2</div>
                <div className="text-[#ECEDEF] font-medium">Open Chrome Extensions</div>
                <div className="text-[#A0A4AE] mt-1">Navigate to <span className="font-mono text-[#ECEDEF]">chrome://extensions</span> in Chrome.</div>
              </div>
              <div className="p-3 bg-[#1F2229] border border-[#2A2D35] rounded-lg">
                <div className="font-mono text-[#FF7A2F] mb-1">Step 3</div>
                <div className="text-[#ECEDEF] font-medium">Enable Developer Mode</div>
                <div className="text-[#A0A4AE] mt-1">Turn on the toggle switch in the top-right corner.</div>
              </div>
              <div className="p-3 bg-[#1F2229] border border-[#2A2D35] rounded-lg">
                <div className="font-mono text-[#FF7A2F] mb-1">Step 4</div>
                <div className="text-[#ECEDEF] font-medium">Click Load Unpacked</div>
                <div className="text-[#A0A4AE] mt-1">Select the unzipped folder. Open any video and click the extension icon.</div>
              </div>
            </div>
          </div>

          {/* Source Code Inspector */}
          {extensionFiles.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-[#ECEDEF]">Extension Source Files</h4>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-1.5 text-xs text-[#A0A4AE] hover:text-[#ECEDEF]"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#3FB67A]" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy current file'}
                </button>
              </div>

              {/* File tabs */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {extensionFiles.map((f) => {
                  const fileName = f.path.replace(/^[/\\]/, '');
                  const isActive = currentFile?.path === f.path;
                  return (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => setActiveFile(fileName)}
                      className={`text-xs px-2.5 py-1 rounded font-mono border transition-colors ${
                        isActive
                          ? 'bg-[#2A2D35] border-[#FF7A2F] text-[#ECEDEF]'
                          : 'bg-[#1F2229] border-[#2A2D35] text-[#A0A4AE] hover:text-[#ECEDEF]'
                      }`}
                    >
                      {fileName}
                    </button>
                  );
                })}
              </div>

              {/* File content viewer */}
              <pre className="font-mono text-xs p-4 bg-[#0E0F12] border border-[#2A2D35] rounded-lg max-h-52 overflow-auto text-[#ECEDEF] leading-relaxed">
                {currentFile ? currentFile.content : 'Loading files...'}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#2A2D35] bg-[#16181D] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs px-4 py-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
