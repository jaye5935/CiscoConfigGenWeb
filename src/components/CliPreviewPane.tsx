import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileDown,
  FileText,
  Layers,
  Search,
  Server,
  Upload,
} from 'lucide-react';
import switchPhotoUrl from '../assets/images/cisco_switch_photo_1795462742292.jpg';
import { getSwitchModel } from '../data/switchModels';
import { Language, PortConfig, SwitchConfigState } from '../types/switch';
import {
  downloadTextFile,
  exportCliCommandsPdf,
  generateConfigTextFile,
  generateVlanFileContent,
} from '../utils/exportArtifacts';
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
  const [exportingPdf, setExportingPdf] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSwitchPhotoStrip, setShowSwitchPhotoStrip] = useState(true);

  const model = useMemo(() => getSwitchModel(config.modelId, config.customModel), [config.modelId, config.customModel]);

  const portSummary = useMemo(() => {
    let access = 0;
    let trunk = 0;
    let shutdown = 0;
    let routed = 0;
    for (const p of config.ports) {
      if (p.mode === 'access') access++;
      else if (p.mode === 'trunk') trunk++;
      else if (p.mode === 'shutdown') shutdown++;
      else if (p.mode === 'routed') routed++;
    }
    return { access, trunk, shutdown, routed };
  }, [config.ports]);

  const copperPorts = useMemo(
    () => config.ports.filter((p) => p.kind === 'copper' && p.index <= model.copperCount),
    [config.ports, model.copperCount]
  );
  const uplinkPorts = useMemo(
    () => config.ports.filter((p) => !copperPorts.includes(p)),
    [config.ports, copperPorts]
  );
  const oddCopper = useMemo(() => copperPorts.filter((_, idx) => idx % 2 === 0), [copperPorts]);
  const evenCopper = useMemo(() => copperPorts.filter((_, idx) => idx % 2 === 1), [copperPorts]);

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

  const handleDownloadCfg = () => {
    downloadTextFile(`${config.hostname || 'switch'}-config.cfg`, cliText);
  };

  const handleDownloadConfigText = () => {
    const content = generateConfigTextFile(config);
    downloadTextFile('config.text', content);
  };

  const handleDownloadVlanFile = () => {
    const content = generateVlanFileContent(config);
    downloadTextFile('vlan.txt', content);
  };

  const handleExportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      await exportCliCommandsPdf({
        cliText,
        config,
        modelName: model.name,
        lang,
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const resolvePortFilterToken = (port: PortConfig): string => {
    if (cliText.includes(port.interfaceName)) return port.interfaceName;
    if (port.mode === 'shutdown') return 'shutdown';
    if (port.mode === 'trunk') return 'switchport mode trunk';
    if (port.mode === 'routed') return 'no switchport';
    return `access vlan ${port.accessVlan}`;
  };

  const handleTogglePortFilter = (port: PortConfig) => {
    const token = resolvePortFilterToken(port);
    setSearchQuery((prev) => (prev === token ? '' : token));
  };

  const getPortBadgeStyle = (port: PortConfig) => {
    const token = resolvePortFilterToken(port);
    const isFocused = Boolean(searchQuery) && searchQuery === token;
    const focusRing = isFocused ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-[#121720]' : '';
    if (port.mode === 'shutdown') {
      return `bg-rose-950/80 border-rose-500/70 text-rose-200 ${focusRing}`;
    }
    if (port.mode === 'trunk') {
      return `bg-amber-500/20 border-amber-400/80 text-amber-200 ${focusRing}`;
    }
    if (port.mode === 'routed') {
      return `bg-violet-500/25 border-violet-400/80 text-violet-200 ${focusRing}`;
    }
    return `bg-emerald-500/20 border-emerald-400/80 text-emerald-200 ${focusRing}`;
  };

  const getPortModeShortLabel = (port: PortConfig) => {
    if (port.mode === 'shutdown') return 'SHUT';
    if (port.mode === 'trunk') return 'TRK';
    if (port.mode === 'routed') return 'L3';
    return 'ACC';
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

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? (lang === 'fa' ? 'کپی شد' : 'Copied') : lang === 'fa' ? 'کپی' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadConfigText}
            title={lang === 'fa' ? 'خروجی فایل استاندارد Cisco flash:config.text' : 'Export Cisco flash:config.text'}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span>config.text</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadVlanFile}
            title={lang === 'fa' ? 'خروجی فایل دستورات و جدول VLAN' : 'Export VLAN database CLI file'}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            <span>vlan</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportingPdf}
            title={lang === 'fa' ? 'خروجی PDF برای دستورات CLI' : 'Export CLI commands as PDF'}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>{exportingPdf ? (lang === 'fa' ? 'PDF...' : 'PDF...') : 'PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCfg}
            title={lang === 'fa' ? 'دانلود فایل .cfg' : 'Download .cfg file'}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>.cfg</span>
          </button>

          <button
            type="button"
            onClick={onPushToSwitch}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{lang === 'fa' ? 'بارگذاری روی سوییچ' : 'Load to Switch'}</span>
          </button>
        </div>
      </div>

      {/* Options & Search Bar */}
      <div className="px-3.5 py-2 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSwitchPhotoStrip((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded transition-colors whitespace-nowrap"
          >
            <Server className="w-3 h-3 text-blue-600" />
            <span>{lang === 'fa' ? 'تصویر سوییچ و پورت‌ها' : 'Switch View'}</span>
            {showSwitchPhotoStrip ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <div className="relative w-40">
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
      </div>

      {/* Real Switch Photograph + Access / Trunk / Shut Port Map */}
      {showSwitchPhotoStrip && (
        <div className="border-b border-slate-200 bg-[#0F141C] text-slate-100 shrink-0">
          {/* Real Cisco Switch Front Rack Photograph */}
          <div className="relative h-24 sm:h-28 w-full overflow-hidden border-b border-slate-800 bg-[#0A0D12]">
            <img
              src={switchPhotoUrl}
              alt={model.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center opacity-95"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0F141C] via-transparent to-[#0F141C]/55 pointer-events-none" />

            <div className="absolute top-2 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
              <div className="px-2 py-0.5 rounded bg-slate-950/80 border border-slate-700/80 text-[11px] font-mono text-slate-100" dir="ltr">
                {config.hostname || 'Switch'} · {model.series}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono tabular-nums" dir="ltr">
                <span className="px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/60 text-emerald-200">
                  ACCESS: {portSummary.access}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-950/90 border border-amber-500/60 text-amber-200">
                  TRUNK: {portSummary.trunk}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-rose-950/90 border border-rose-500/60 text-rose-200">
                  SHUT: {portSummary.shutdown}
                </span>
                {portSummary.routed > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-violet-950/90 border border-violet-500/60 text-violet-200">
                    L3: {portSummary.routed}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Port Mode Strip (Access / Trunk / Shut) */}
          <div className="px-3 py-2 space-y-1.5">
            <div dir="ltr" className="overflow-x-auto pb-0.5">
              <div className="min-w-[560px] flex items-center justify-between gap-3">
                {/* 2-Row Copper Ports */}
                <div className="flex flex-col gap-1 flex-1">
                  <div className="flex items-center gap-1">
                    {oddCopper.map((port, idx) => (
                      <button
                        key={port.id}
                        type="button"
                        onClick={() => handleTogglePortFilter(port)}
                        title={`${port.interfaceName} — ${port.mode.toUpperCase()}${
                          port.mode === 'access'
                            ? ` (VLAN ${port.accessVlan})`
                            : port.mode === 'trunk'
                              ? ` (Native ${port.nativeVlan}, Allowed: ${port.allowedVlans})`
                              : ''
                        }${port.description ? ` · ${port.description}` : ''}`}
                        className={`w-6 h-6 rounded-[2px] border flex flex-col items-center justify-center transition-transform hover:scale-105 ${
                          idx > 0 && idx % 6 === 0 ? 'ml-1.5' : ''
                        } ${getPortBadgeStyle(port)}`}
                      >
                        <span className="text-[8px] font-mono font-semibold leading-none">{port.index}</span>
                        <span className="text-[6.5px] font-mono leading-none mt-0.5">{getPortModeShortLabel(port)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    {evenCopper.map((port, idx) => (
                      <button
                        key={port.id}
                        type="button"
                        onClick={() => handleTogglePortFilter(port)}
                        title={`${port.interfaceName} — ${port.mode.toUpperCase()}${
                          port.mode === 'access'
                            ? ` (VLAN ${port.accessVlan})`
                            : port.mode === 'trunk'
                              ? ` (Native ${port.nativeVlan}, Allowed: ${port.allowedVlans})`
                              : ''
                        }${port.description ? ` · ${port.description}` : ''}`}
                        className={`w-6 h-6 rounded-[2px] border flex flex-col items-center justify-center transition-transform hover:scale-105 ${
                          idx > 0 && idx % 6 === 0 ? 'ml-1.5' : ''
                        } ${getPortBadgeStyle(port)}`}
                      >
                        <span className="text-[8px] font-mono font-semibold leading-none">{port.index}</span>
                        <span className="text-[6.5px] font-mono leading-none mt-0.5">{getPortModeShortLabel(port)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Uplink Ports */}
                {uplinkPorts.length > 0 && (
                  <div className="pl-2.5 border-l border-slate-700/80 grid grid-cols-2 gap-1 shrink-0">
                    {uplinkPorts.map((port) => (
                      <button
                        key={port.id}
                        type="button"
                        onClick={() => handleTogglePortFilter(port)}
                        title={`${port.interfaceName} — ${port.mode.toUpperCase()}`}
                        className={`w-10 h-6 rounded-[2px] border flex flex-col items-center justify-center transition-transform hover:scale-105 ${getPortBadgeStyle(port)}`}
                      >
                        <span className="text-[8px] font-mono font-semibold leading-none">{port.shortName}</span>
                        <span className="text-[6.5px] font-mono leading-none mt-0.5">{getPortModeShortLabel(port)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Compact Legend & Click-to-filter hint */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500/35 border border-emerald-400 inline-block" />
                  <span className="font-mono">ACC</span>
                  <span className="text-slate-400">({lang === 'fa' ? 'Access' : 'Access'})</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-500/35 border border-amber-400 inline-block" />
                  <span className="font-mono">TRK</span>
                  <span className="text-slate-400">({lang === 'fa' ? 'Trunk' : 'Trunk'})</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-xs bg-rose-900/80 border border-rose-500 inline-block" />
                  <span className="font-mono">SHUT</span>
                  <span className="text-slate-400">({lang === 'fa' ? 'خاموش / Shut' : 'Shutdown'})</span>
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                {lang === 'fa' ? 'کلیک روی پورت = فیلتر دستور در CLI' : 'Click port to filter CLI'}
              </span>
            </div>
          </div>
        </div>
      )}

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
