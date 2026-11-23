import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, Search, Upload } from 'lucide-react';
import { Language, SwitchConfigState } from '../types/switch';
import { ValidationWarning } from '../utils/iosGenerator';

interface CliPreviewPaneProps {
  cliText: string;
  config: SwitchConfigState;
  warnings: ValidationWarning[];
  onToggleOption: (key: 'useInterfaceRange' | 'includeSessionWrapper' | 'includeComments', val: boolean) => void;
  onPushToSwitch: () => void;
  lang: Language;
}

export const CliPreviewPane: React.FC<CliPreviewPaneProps> = ({
  cliText,
  config,
  warnings,
  onToggleOption,
  onPushToSwitch,
  lang,
}) => {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const lines = useMemo(() => cliText.split('\n'), [cliText]);
  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return lines;
    const q = searchQuery.toLowerCase();
    return lines.filter((l) => l.toLowerCase().includes(q));
  }, [lines, searchQuery]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cliText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback
    }
  };

  const handleDownload = (ext: 'cfg' | 'txt') => {
    const blob = new Blob([cliText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.hostname || 'switch'}-config.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const colorizeLine = (line: string) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('!')) {
      return 'text-slate-500 italic';
    }
    if (
      trimmed.startsWith('interface ') ||
      trimmed.startsWith('vlan ') ||
      trimmed.startsWith('line ') ||
      trimmed === 'configure terminal' ||
      trimmed === 'enable' ||
      trimmed === 'end' ||
      trimmed === 'write memory'
    ) {
      return 'text-sky-300 font-medium';
    }
    if (trimmed.startsWith('no ') || trimmed === 'shutdown') {
      return 'text-amber-300';
    }
    if (trimmed.includes('secret') || trimmed.includes('password') || trimmed.startsWith('crypto ')) {
      return 'text-emerald-300';
    }
    return 'text-slate-200';
  };

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-md overflow-hidden">
      {/* Header Toolbar */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold text-slate-900">
            {lang === 'fa' ? 'خروجی دستورات Cisco IOS CLI' : 'Generated Cisco IOS CLI'}
          </h3>
          <span className="text-[11px] font-mono text-slate-500 tabular-nums">
            {lines.length} {lang === 'fa' ? 'خط' : 'lines'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? (lang === 'fa' ? 'کپی شد' : 'Copied') : lang === 'fa' ? 'کپی' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleDownload('cfg')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>.cfg</span>
          </button>

          <button
            type="button"
            onClick={onPushToSwitch}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{lang === 'fa' ? 'بارگذاری مستقیم روی سوییچ' : 'Load to Switch'}</span>
          </button>
        </div>
      </div>

      {/* Options & Search Bar */}
      <div className="px-3.5 py-2 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.useInterfaceRange}
              onChange={(e) => onToggleOption('useInterfaceRange', e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600"
            />
            <span>interface range</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.includeSessionWrapper}
              onChange={(e) => onToggleOption('includeSessionWrapper', e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600"
            />
            <span>{lang === 'fa' ? 'شامل conf t و wr mem' : 'conf t & wr mem'}</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.includeComments}
              onChange={(e) => onToggleOption('includeComments', e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600"
            />
            <span>{lang === 'fa' ? 'توضیحات (!)' : 'Comments (!)'}</span>
          </label>
        </div>

        <div className="relative w-44">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 left-2.5 pointer-events-none" />
          <input
            type="text"
            dir="ltr"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === 'fa' ? 'جستجو در CLI...' : 'Filter CLI...'}
            className="w-full pl-8 pr-2.5 py-1 text-xs font-mono border border-slate-200 rounded bg-slate-50 focus:bg-white focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Validation Warnings (if any) */}
      {warnings.length > 0 && (
        <div className="px-3.5 py-2 bg-amber-50 border-b border-amber-200 space-y-1">
          {warnings.map((w) => (
            <div key={w.id} className="flex items-start gap-2 text-xs text-amber-900">
              <AlertTriangle
                className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${w.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}
              />
              <span>{lang === 'fa' ? w.messageFa : w.messageEn}</span>
            </div>
          ))}
        </div>
      )}

      {/* Dark Code Viewport (Always LTR) */}
      <div dir="ltr" className="flex-1 overflow-auto bg-[#11161E] p-3 font-mono text-xs leading-5">
        {filteredLines.map((line, i) => (
          <div key={i} className="flex hover:bg-white/5 px-1 rounded-xs">
            <span className="w-9 shrink-0 select-none text-slate-600 text-right pr-3 tabular-nums">
              {i + 1}
            </span>
            <pre className={`whitespace-pre-wrap break-all ${colorizeLine(line)}`}>{line || ' '}</pre>
          </div>
        ))}
      </div>
    </div>
  );
};
