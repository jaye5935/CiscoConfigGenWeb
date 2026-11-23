import React from 'react';
import { Language, PortConfig, SwitchModelSpec } from '../types/switch';

interface SwitchFaceplateProps {
  model: SwitchModelSpec;
  ports: PortConfig[];
  selectedPortIds: string[];
  onSelectPorts: (ids: string[]) => void;
  lang: Language;
  hostname: string;
}

export const SwitchFaceplate: React.FC<SwitchFaceplateProps> = ({
  model,
  ports,
  selectedPortIds,
  onSelectPorts,
  lang,
  hostname,
}) => {
  const copperPorts = ports.filter((p) => p.kind === 'copper' && p.index <= model.copperCount);
  const uplinkPorts = ports.filter((p) => !copperPorts.includes(p));

  // Cisco Catalyst switches arrange copper ports in 2-row blocks (odd top, even bottom)
  const oddCopper = copperPorts.filter((_, idx) => idx % 2 === 0);
  const evenCopper = copperPorts.filter((_, idx) => idx % 2 === 1);

  const handlePortClick = (e: React.MouseEvent, portId: string) => {
    if (e.shiftKey && selectedPortIds.length > 0) {
      const lastId = selectedPortIds[selectedPortIds.length - 1];
      const allIds = ports.map((p) => p.id);
      const start = allIds.indexOf(lastId);
      const end = allIds.indexOf(portId);
      if (start !== -1 && end !== -1) {
        const [min, max] = start < end ? [start, end] : [end, start];
        const range = allIds.slice(min, max + 1);
        const merged = Array.from(new Set([...selectedPortIds, ...range]));
        onSelectPorts(merged);
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      if (selectedPortIds.includes(portId)) {
        const next = selectedPortIds.filter((id) => id !== portId);
        onSelectPorts(next.length > 0 ? next : [portId]);
      } else {
        onSelectPorts([...selectedPortIds, portId]);
      }
      return;
    }

    onSelectPorts([portId]);
  };

  const getPortColorClass = (port: PortConfig, isSelected: boolean) => {
    const ring = isSelected ? 'ring-2 ring-sky-400 ring-offset-1 ring-offset-[#1A2029]' : '';
    if (port.mode === 'shutdown') {
      return `bg-[#232933] border-slate-700 text-slate-500 ${ring}`;
    }
    if (port.mode === 'trunk') {
      return `bg-amber-500/20 border-amber-400/70 text-amber-200 ${ring}`;
    }
    if (port.mode === 'routed') {
      return `bg-violet-500/20 border-violet-400/70 text-violet-200 ${ring}`;
    }
    // Access mode
    return `bg-emerald-500/20 border-emerald-400/70 text-emerald-100 ${ring}`;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {lang === 'fa' ? 'نمای پنل فیزیکی سوییچ (انتخاب پورت)' : 'Physical Switch Faceplate'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {lang === 'fa'
              ? 'کلیک: انتخاب تک‌پورت · Shift+کلیک: انتخاب بازه · Ctrl+کلیک: انتخاب چندگانه'
              : 'Click: single port · Shift+Click: range · Ctrl+Click: multi-select'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectPorts(copperPorts.map((p) => p.id))}
            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            {lang === 'fa' ? `همه پورت‌های مس (${copperPorts.length})` : `All Copper (${copperPorts.length})`}
          </button>
          <button
            type="button"
            onClick={() => onSelectPorts(uplinkPorts.map((p) => p.id))}
            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            {lang === 'fa' ? `آپلینک‌ها (${uplinkPorts.length})` : `Uplinks (${uplinkPorts.length})`}
          </button>
        </div>
      </div>

      {/* Rackmount Hardware Chassis (Always LTR to match physical switch hardware) */}
      <div
        dir="ltr"
        className="w-full overflow-x-auto rounded bg-gradient-to-b from-[#232934] to-[#171C23] border border-slate-800 px-4 py-3.5 text-slate-200 shadow-inner"
      >
        <div className="min-w-[680px] flex items-center justify-between gap-5">
          {/* Left Chassis Section: Branding & Console Ports */}
          <div className="flex flex-col justify-between gap-3 pr-4 border-r border-slate-700/70 shrink-0">
            <div>
              <div className="text-[10px] font-mono tracking-wider text-sky-400 font-semibold">CISCO</div>
              <div className="text-xs font-mono font-semibold text-white truncate max-w-[140px]">
                {model.series}
              </div>
              <div className="text-[10px] font-mono text-slate-400 truncate max-w-[140px]">
                {hostname || 'Switch'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {model.consolePorts.includes('RJ45') && (
                <div
                  title="Console Port (RJ45 RS232 9600bps)"
                  className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded bg-[#11151B] border border-sky-500/40"
                >
                  <div className="w-4 h-3 border border-sky-400/70 rounded-[2px] bg-slate-950" />
                  <span className="text-[8px] font-mono text-sky-300">CON</span>
                </div>
              )}
              {(model.consolePorts.includes('Mini-USB') || model.consolePorts.includes('USB-C')) && (
                <div
                  title="USB Console Port"
                  className="flex flex-col items-center gap-0.5 px-1.5 py-1 rounded bg-[#11151B] border border-slate-600"
                >
                  <div className="w-3.5 h-2.5 border border-slate-400 rounded-[2px] bg-slate-950" />
                  <span className="text-[8px] font-mono text-slate-300">
                    {model.consolePorts.includes('USB-C') ? 'USB-C' : 'USB'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Center Section: 2-Row Copper RJ45 Ports */}
          <div className="flex flex-col gap-1.5 flex-1">
            {/* Top Row (Odd Ports: 1, 3, 5...) */}
            <div className="flex items-center gap-1">
              {oddCopper.map((port, idx) => {
                const isSelected = selectedPortIds.includes(port.id);
                const groupGap = idx > 0 && idx % 6 === 0 ? 'ml-2' : '';
                return (
                  <button
                    key={port.id}
                    type="button"
                    onClick={(e) => handlePortClick(e, port.id)}
                    title={`${port.interfaceName} — ${port.mode.toUpperCase()} ${port.mode === 'access' ? `VLAN ${port.accessVlan}` : ''}`}
                    className={`w-7 h-7 rounded-[3px] border flex flex-col items-center justify-center transition-transform hover:scale-105 focus-visible:outline-none ${groupGap} ${getPortColorClass(port, isSelected)}`}
                  >
                    <span className="text-[9px] font-mono font-semibold leading-none">{port.index}</span>
                    <span className="text-[7px] font-mono opacity-80 leading-none mt-0.5">
                      {port.mode === 'shutdown'
                        ? 'OFF'
                        : port.mode === 'trunk'
                          ? 'TRK'
                          : port.mode === 'routed'
                            ? 'L3'
                            : `V${port.accessVlan}`}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Bottom Row (Even Ports: 2, 4, 6...) */}
            <div className="flex items-center gap-1">
              {evenCopper.map((port, idx) => {
                const isSelected = selectedPortIds.includes(port.id);
                const groupGap = idx > 0 && idx % 6 === 0 ? 'ml-2' : '';
                return (
                  <button
                    key={port.id}
                    type="button"
                    onClick={(e) => handlePortClick(e, port.id)}
                    title={`${port.interfaceName} — ${port.mode.toUpperCase()} ${port.mode === 'access' ? `VLAN ${port.accessVlan}` : ''}`}
                    className={`w-7 h-7 rounded-[3px] border flex flex-col items-center justify-center transition-transform hover:scale-105 focus-visible:outline-none ${groupGap} ${getPortColorClass(port, isSelected)}`}
                  >
                    <span className="text-[9px] font-mono font-semibold leading-none">{port.index}</span>
                    <span className="text-[7px] font-mono opacity-80 leading-none mt-0.5">
                      {port.mode === 'shutdown'
                        ? 'OFF'
                        : port.mode === 'trunk'
                          ? 'TRK'
                          : port.mode === 'routed'
                            ? 'L3'
                            : `V${port.accessVlan}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Section: SFP / SFP+ Uplink Cages */}
          <div className="flex flex-col gap-1 pl-4 border-l border-slate-700/70 shrink-0">
            <div className="text-[9px] font-mono text-slate-400 text-center">
              {model.uplinkKind === 'sfp-plus' ? '10G SFP+' : model.uplinkKind === 'sfp' ? '1G SFP' : 'UPLINK'}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {uplinkPorts.map((port) => {
                const isSelected = selectedPortIds.includes(port.id);
                return (
                  <button
                    key={port.id}
                    type="button"
                    onClick={(e) => handlePortClick(e, port.id)}
                    title={`${port.interfaceName} — ${port.mode.toUpperCase()}`}
                    className={`w-11 h-7 rounded-[3px] border flex flex-col items-center justify-center transition-transform hover:scale-105 focus-visible:outline-none ${getPortColorClass(port, isSelected)}`}
                  >
                    <span className="text-[9px] font-mono font-semibold leading-none">{port.shortName}</span>
                    <span className="text-[7px] font-mono opacity-80 leading-none mt-0.5">
                      {port.mode === 'shutdown' ? 'OFF' : port.mode.toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legend (Paired color + explicit text labels, zero pills) */}
      <div className="flex flex-wrap items-center justify-between gap-4 mt-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500/30 border border-emerald-500 inline-block" />
            <span>{lang === 'fa' ? 'Access (دسترسی)' : 'Access'}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-500/30 border border-amber-500 inline-block" />
            <span>{lang === 'fa' ? 'Trunk (ترانک)' : 'Trunk'}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-violet-500/30 border border-violet-500 inline-block" />
            <span>{lang === 'fa' ? 'Routed (لایه ۳)' : 'Routed L3'}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-slate-700 border border-slate-500 inline-block" />
            <span>{lang === 'fa' ? 'خاموش (Shutdown)' : 'Shutdown'}</span>
          </span>
        </div>
        <div className="font-mono text-slate-500 tabular-nums">
          {lang === 'fa'
            ? `${selectedPortIds.length} پورت انتخاب شده`
            : `${selectedPortIds.length} port(s) selected`}
        </div>
      </div>
    </div>
  );
};
