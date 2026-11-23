import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Power,
  RefreshCw,
  RotateCw,
  Slash,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  FleetSwitch,
  Language,
  LivePortInfo,
  LivePortStatus,
  SwitchSecretCredentials,
} from '../types/switch';
import { simFetchSwitchPorts, simPushSwitch } from '../utils/fleetSimulator';

interface LivePortMonitorProps {
  switches: FleetSwitch[];
  selectedSwitchId: string;
  onSelectSwitchId: (id: string) => void;
  credentials: Record<string, SwitchSecretCredentials>;
  lang: Language;
}

type PortFilter = 'all' | 'connected' | 'notconnect' | 'alert';

export const LivePortMonitor: React.FC<LivePortMonitorProps> = ({
  switches,
  selectedSwitchId,
  onSelectSwitchId,
  credentials,
  lang,
}) => {
  const activeSwitch = useMemo(
    () => switches.find((s) => s.id === selectedSwitchId) || switches[0],
    [switches, selectedSwitchId]
  );

  const [ports, setPorts] = useState<LivePortInfo[]>([]);
  const [selectedPortName, setSelectedPortName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [portActionBusy, setPortActionBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [pollIntervalSec, setPollIntervalSec] = useState<number>(0); // 0 = manual
  const [filter, setFilter] = useState<PortFilter>('all');
  const [showTable, setShowTable] = useState<boolean>(false);

  const fetchPorts = useCallback(async () => {
    if (!activeSwitch) return;
    const creds = credentials[activeSwitch.id] || { password: '', enableSecret: '' };
    if (activeSwitch.mode === 'ssh' && !creds.password) {
      setErrorMsg(
        lang === 'fa'
          ? 'برای مانیتورینگ زنده پورت‌های این سوییچ، ابتدا رمز SSH را از دکمه «تنظیم رمز SSH» وارد کنید.'
          : 'Set SSH credentials for this switch first to poll live port status.'
      );
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const data =
        activeSwitch.mode === 'simulator'
          ? await simFetchSwitchPorts(activeSwitch)
          : await fetch('/api/ssh/ports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                host: activeSwitch.host,
                port: activeSwitch.port,
                username: activeSwitch.username,
                password: creds.password,
                enableSecret: creds.enableSecret,
              }),
            }).then((r) => r.json());

      if (!data.ok) {
        setErrorMsg(data.error || 'Failed to read switch interfaces');
        return;
      }

      const list = (data.ports || []) as LivePortInfo[];
      setPorts(list);
      setLatencyMs(data.latencyMs ?? null);
      setLastUpdated(new Date().toLocaleTimeString('en-GB', { hour12: false }));
      setSelectedPortName((prev) => (list.some((p) => p.port === prev) ? prev : list[0]?.port || ''));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error polling switch ports');
    } finally {
      setLoading(false);
    }
  }, [activeSwitch, credentials, lang]);

  // Initial fetch when switching target switch
  useEffect(() => {
    if (activeSwitch) {
      fetchPorts();
    }
  }, [activeSwitch?.id, fetchPorts]);

  // Auto-refresh polling timer
  useEffect(() => {
    if (!pollIntervalSec || !activeSwitch) return;
    const timer = setInterval(() => {
      fetchPorts();
    }, pollIntervalSec * 1000);
    return () => clearInterval(timer);
  }, [pollIntervalSec, activeSwitch, fetchPorts]);

  // Split physical copper ports vs uplinks (SFP / TenGig / high port numbers)
  const { copperPorts, uplinkPorts } = useMemo(() => {
    const isUplink = (p: LivePortInfo) =>
      p.port.startsWith('Te') ||
      p.port.startsWith('Tw') ||
      p.port.startsWith('Fo') ||
      p.type.toLowerCase().includes('sfp') ||
      p.type.toLowerCase().includes('not present');

    const uplinks = ports.filter(isUplink);
    const copper = ports.filter((p) => !isUplink(p) && !p.port.startsWith('Po'));
    return { copperPorts: copper, uplinkPorts: uplinks };
  }, [ports]);

  const oddCopper = copperPorts.filter((_, idx) => idx % 2 === 0);
  const evenCopper = copperPorts.filter((_, idx) => idx % 2 === 1);

  const summary = useMemo(() => {
    let connected = 0;
    let notconnect = 0;
    let disabled = 0;
    let errDisabled = 0;
    let totalWatts = 0;
    for (const p of ports) {
      if (p.status === 'connected') connected += 1;
      else if (p.status === 'notconnect' || p.status === 'sfpAbsent') notconnect += 1;
      else if (p.status === 'disabled') disabled += 1;
      else if (p.status === 'err-disabled') errDisabled += 1;
      if (p.poeWatts) totalWatts += p.poeWatts;
    }
    return {
      connected,
      notconnect,
      disabled,
      errDisabled,
      totalWatts: Number(totalWatts.toFixed(1)),
    };
  }, [ports]);

  const selectedPort = ports.find((p) => p.port === selectedPortName) || ports[0];

  const handleRemotePortCommand = async (action: 'shutdown' | 'no shutdown' | 'bounce') => {
    if (!activeSwitch || !selectedPort) return;
    const creds = credentials[activeSwitch.id] || { password: '', enableSecret: '' };
    if (activeSwitch.mode === 'ssh' && !creds.password) return;

    const commands =
      action === 'bounce'
        ? [`interface ${selectedPort.port}`, 'shutdown', 'no shutdown', 'exit']
        : [`interface ${selectedPort.port}`, action, 'exit'];

    setPortActionBusy(true);
    try {
      if (activeSwitch.mode === 'simulator') {
        await simPushSwitch(activeSwitch, commands);
      } else {
        await fetch('/api/ssh/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host: activeSwitch.host,
            port: activeSwitch.port,
            username: activeSwitch.username,
            password: creds.password,
            enableSecret: creds.enableSecret,
            commands,
            saveMemory: false,
          }),
        });
      }
      await fetchPorts();
    } finally {
      setPortActionBusy(false);
    }
  };

  const matchesFilter = (status: LivePortStatus): boolean => {
    if (filter === 'all') return true;
    if (filter === 'connected') return status === 'connected';
    if (filter === 'notconnect') return status === 'notconnect' || status === 'sfpAbsent';
    return status === 'disabled' || status === 'err-disabled';
  };

  const extractPortNumber = (portName: string): string => {
    const m = portName.match(/(\d+)$/);
    return m ? m[1] : portName;
  };

  const renderPortGraphic = (p: LivePortInfo, isSfp = false) => {
    const isSelected = p.port === selectedPortName;
    const dimmedByFilter = !matchesFilter(p.status);

    let ledBg = 'bg-slate-600';
    let shellCls = 'bg-[#1A2029] border-slate-700 text-slate-400';

    if (p.status === 'connected') {
      ledBg = p.vlan === 'trunk' ? 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.85)]' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.85)]';
      shellCls =
        p.vlan === 'trunk'
          ? 'bg-sky-950/70 border-sky-500/70 text-sky-100'
          : 'bg-emerald-950/60 border-emerald-500/70 text-emerald-100';
    } else if (p.status === 'err-disabled') {
      ledBg = 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]';
      shellCls = 'bg-red-950/70 border-red-500 text-red-200';
    } else if (p.status === 'disabled') {
      ledBg = 'bg-slate-800';
      shellCls = 'bg-[#12161D] border-slate-800 text-slate-600';
    } else if (p.status === 'sfpAbsent') {
      ledBg = 'bg-slate-800';
      shellCls = 'bg-[#10141A] border-slate-800 text-slate-600 border-dashed';
    }

    return (
      <button
        key={p.port}
        type="button"
        onClick={() => setSelectedPortName(p.port)}
        title={`${p.port} (${p.status}) · VLAN ${p.vlan} · ${p.speed} · ${p.name || 'No description'}`}
        className={`relative flex flex-col items-center justify-between rounded-[3px] border transition-all focus-visible:outline-none ${
          isSfp ? 'w-11 h-9 px-1 py-1' : 'w-8 h-9 px-0.5 py-1'
        } ${shellCls} ${
          isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-[#151A22] scale-105 z-10' : 'hover:border-slate-400'
        } ${dimmedByFilter ? 'opacity-25' : 'opacity-100'}`}
      >
        {/* Top Physical Link LED */}
        <div className="w-full flex items-center justify-between px-0.5">
          <span className={`w-2 h-1.5 rounded-[1px] ${ledBg}`} />
          {p.poeWatts !== undefined && p.poeWatts > 0 && (
            <Zap className="w-2.5 h-2.5 text-amber-400 shrink-0" />
          )}
          {p.status === 'disabled' && <Slash className="w-2.5 h-2.5 text-slate-500 shrink-0" />}
          {p.status === 'err-disabled' && <AlertTriangle className="w-2.5 h-2.5 text-red-400 shrink-0" />}
        </div>

        {/* RJ45 / SFP Socket Silhouette */}
        <div
          className={`w-full flex items-center justify-center rounded-[2px] ${
            isSfp ? 'h-3.5 bg-black/40 border border-white/10' : 'h-3.5 bg-black/40 border border-white/10'
          }`}
        >
          <span className="text-[9px] font-mono font-semibold leading-none tabular-nums">
            {isSfp ? p.port.replace(/^[A-Za-z]+/, '') : extractPortNumber(p.port)}
          </span>
        </div>
      </button>
    );
  };

  const filteredTablePorts = useMemo(
    () => ports.filter((p) => matchesFilter(p.status)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ports, filter]
  );

  if (!activeSwitch) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-md p-4 space-y-3.5">
      {/* Header & Live Polling Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-900">
              {lang === 'fa' ? 'مانیتورینگ آنلاین و گرافیکی پورت‌های سوییچ' : 'Live Graphical Port Monitor'}
            </h3>
          </div>

          <select
            dir="ltr"
            value={activeSwitch.id}
            onChange={(e) => onSelectSwitchId(e.target.value)}
            className="px-2.5 py-1 text-xs font-mono font-medium bg-slate-50 border border-slate-300 rounded text-slate-900 focus:outline-none focus:border-blue-600"
          >
            {switches.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.host})
              </option>
            ))}
          </select>

          {lastUpdated && (
            <span className="text-[11px] font-mono text-slate-500 tabular-nums" dir="ltr">
              Updated {lastUpdated}
              {latencyMs !== null ? ` · ${latencyMs}ms` : ''}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pollIntervalSec}
            onChange={(e) => setPollIntervalSec(Number(e.target.value))}
            className="px-2.5 py-1 text-xs font-medium bg-white border border-slate-300 rounded text-slate-700 focus:outline-none focus:border-blue-600"
          >
            <option value={0}>{lang === 'fa' ? 'بروزرسانی دستی' : 'Manual Refresh'}</option>
            <option value={5}>{lang === 'fa' ? 'خودکار: هر ۵ ثانیه' : 'Auto: Every 5s'}</option>
            <option value={10}>{lang === 'fa' ? 'خودکار: هر ۱۰ ثانیه' : 'Auto: Every 10s'}</option>
            <option value={30}>{lang === 'fa' ? 'خودکار: هر ۳۰ ثانیه' : 'Auto: Every 30s'}</option>
          </select>

          <button
            type="button"
            disabled={loading}
            onClick={fetchPorts}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? (lang === 'fa' ? 'در حال خواندن...' : 'Polling...') : lang === 'fa' ? 'بروزرسانی پورت‌ها' : 'Refresh Ports'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded transition-colors whitespace-nowrap shrink-0"
          >
            {showTable
              ? lang === 'fa'
                ? 'مخفی کردن جدول'
                : 'Hide Table'
              : lang === 'fa'
                ? 'جدول جزئیات پورت‌ها'
                : 'Port Table'}
          </button>
        </div>
      </div>

      {/* Summary Telemetry & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 tabular-nums">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {summary.connected} {lang === 'fa' ? 'متصل (Up)' : 'Connected'}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-600 tabular-nums">
            <WifiOff className="w-3.5 h-3.5" />
            <span>
              {summary.notconnect} {lang === 'fa' ? 'بدون اتصال (Down)' : 'Not Connect'}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-500 tabular-nums">
            <Slash className="w-3.5 h-3.5" />
            <span>
              {summary.disabled} {lang === 'fa' ? 'خاموش (Shut)' : 'Disabled'}
            </span>
          </span>
          {summary.errDisabled > 0 && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-red-600 tabular-nums">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>
                {summary.errDisabled} {lang === 'fa' ? 'خطای Err-Disabled' : 'Err-Disabled'}
              </span>
            </span>
          )}
          {summary.totalWatts > 0 && (
            <span className="inline-flex items-center gap-1 font-mono font-medium text-amber-700 tabular-nums" dir="ltr">
              <Zap className="w-3.5 h-3.5" />
              <span>{summary.totalWatts} W PoE</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded">
          {(
            [
              { id: 'all', fa: 'همه', en: 'All' },
              { id: 'connected', fa: 'متصل', en: 'Up' },
              { id: 'notconnect', fa: 'قطع', en: 'Down' },
              { id: 'alert', fa: 'خاموش/خطا', en: 'Shut/Err' },
            ] as { id: PortFilter; fa: string; en: string }[]
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                filter === f.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {lang === 'fa' ? f.fa : f.en}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-800">{errorMsg}</div>
      )}

      {/* Graphical Hardware Switch Chassis (Always LTR) */}
      <div
        dir="ltr"
        className="w-full overflow-x-auto rounded bg-gradient-to-b from-[#1E242E] to-[#131820] border border-slate-800 px-4 py-3.5 text-slate-200 shadow-inner"
      >
        {ports.length === 0 ? (
          <div className="py-6 text-center text-xs font-mono text-slate-400">
            {loading ? 'Querying switch interfaces over SSH...' : 'No port telemetry loaded yet.'}
          </div>
        ) : (
          <div className="min-w-[720px] flex items-center justify-between gap-5">
            {/* Switch Left Plate */}
            <div className="flex flex-col justify-between gap-2 pr-4 border-r border-slate-700/70 shrink-0">
              <div>
                <div className="text-[10px] font-mono tracking-wider text-sky-400 font-semibold">CISCO LIVE</div>
                <div className="text-xs font-mono font-semibold text-white truncate max-w-[140px]">
                  {activeSwitch.detectedHostname || activeSwitch.label}
                </div>
                <div className="text-[10px] font-mono text-slate-400">{activeSwitch.host}</div>
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {activeSwitch.mode === 'simulator' ? 'LAB SIM' : 'SSH TELEMETRY'}
              </div>
            </div>

            {/* Copper Ports 2-Row Odd/Even Hardware Matrix */}
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="flex items-center gap-1">
                {oddCopper.map((p, idx) => (
                  <React.Fragment key={p.port}>
                    {idx > 0 && idx % 6 === 0 && <div className="w-2 shrink-0" />}
                    {renderPortGraphic(p, false)}
                  </React.Fragment>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {evenCopper.map((p, idx) => (
                  <React.Fragment key={p.port}>
                    {idx > 0 && idx % 6 === 0 && <div className="w-2 shrink-0" />}
                    {renderPortGraphic(p, false)}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Right SFP / SFP+ Uplink Cages */}
            {uplinkPorts.length > 0 && (
              <div className="flex flex-col gap-1.5 pl-4 border-l border-slate-700/70 shrink-0">
                <div className="text-[9px] font-mono text-slate-400 text-center">SFP / UPLINK</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {uplinkPorts.map((p) => renderPortGraphic(p, true))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Graphical Legend */}
      <div className="flex flex-wrap items-center gap-5 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2 rounded-[1px] bg-emerald-400 inline-block" />
          <span>{lang === 'fa' ? 'متصل Access' : 'Connected (Access)'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2 rounded-[1px] bg-sky-400 inline-block" />
          <span>{lang === 'fa' ? 'متصل Trunk' : 'Connected (Trunk)'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2 rounded-[1px] bg-slate-600 inline-block" />
          <span>{lang === 'fa' ? 'کابل متصل نیست' : 'Not Connected'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2 rounded-[1px] bg-slate-800 border border-slate-500 inline-block" />
          <span>{lang === 'fa' ? 'خاموش (Shutdown)' : 'Admin Disabled'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2 rounded-[1px] bg-red-500 inline-block" />
          <span>{lang === 'fa' ? 'خطا (Err-Disabled)' : 'Err-Disabled'}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-500" />
          <span>{lang === 'fa' ? 'مصرف PoE فعال' : 'Active PoE'}</span>
        </span>
      </div>

      {/* Selected Port Inspector & Remote SSH Actions */}
      {selectedPort && (
        <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-5 text-xs" dir="ltr">
            <div>
              <div className="text-[10px] text-slate-500">Interface</div>
              <div className="font-mono font-bold text-slate-900">{selectedPort.port}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Status</div>
              <div
                className={`font-mono font-semibold ${
                  selectedPort.status === 'connected'
                    ? 'text-emerald-700'
                    : selectedPort.status === 'err-disabled'
                      ? 'text-red-600'
                      : 'text-slate-600'
                }`}
              >
                {selectedPort.status}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Description</div>
              <div className="font-mono text-slate-800">{selectedPort.name || '—'}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">VLAN</div>
              <div className="font-mono text-slate-800">{selectedPort.vlan}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Speed / Duplex</div>
              <div className="font-mono text-slate-800">
                {selectedPort.speed} / {selectedPort.duplex}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">Media</div>
              <div className="font-mono text-slate-700">{selectedPort.type}</div>
            </div>
            {selectedPort.poeWatts !== undefined && (
              <div>
                <div className="text-[10px] text-slate-500">PoE Draw</div>
                <div className="font-mono font-semibold text-amber-700 tabular-nums">
                  {selectedPort.poeWatts} W
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedPort.status === 'disabled' ? (
              <button
                type="button"
                disabled={portActionBusy}
                onClick={() => handleRemotePortCommand('no shutdown')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded transition-colors"
              >
                <Power className="w-3 h-3" />
                <span>{lang === 'fa' ? 'روشن کردن پورت' : 'Enable Port'}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={portActionBusy}
                onClick={() => handleRemotePortCommand('shutdown')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50 rounded transition-colors"
              >
                <Power className="w-3 h-3" />
                <span>{lang === 'fa' ? 'خاموش کردن پورت' : 'Shutdown Port'}</span>
              </button>
            )}
            <button
              type="button"
              disabled={portActionBusy}
              onClick={() => handleRemotePortCommand('bounce')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 disabled:opacity-50 rounded transition-colors"
              title={lang === 'fa' ? 'خاموش و روشن مجدد (Bounce PoE/Link)' : 'Bounce Interface'}
            >
              <RotateCw className={`w-3 h-3 ${portActionBusy ? 'animate-spin' : ''}`} />
              <span>{lang === 'fa' ? 'ریست پورت (Bounce)' : 'Bounce Port'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Optional Compact Port Details Table */}
      {showTable && ports.length > 0 && (
        <div className="border border-slate-200 rounded overflow-x-auto max-h-64">
          <table className="w-full text-xs border-collapse font-mono" dir="ltr">
            <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-1.5 px-2.5 text-left">Port</th>
                <th className="py-1.5 px-2.5 text-left">Description</th>
                <th className="py-1.5 px-2.5 text-left">Status</th>
                <th className="py-1.5 px-2.5 text-left">VLAN</th>
                <th className="py-1.5 px-2.5 text-left">Speed</th>
                <th className="py-1.5 px-2.5 text-left">Duplex</th>
                <th className="py-1.5 px-2.5 text-right">PoE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTablePorts.map((p) => (
                <tr
                  key={p.port}
                  onClick={() => setSelectedPortName(p.port)}
                  className={`cursor-pointer hover:bg-slate-50 ${
                    p.port === selectedPortName ? 'bg-blue-50/70' : ''
                  }`}
                >
                  <td className="py-1.5 px-2.5 font-semibold text-slate-900">{p.port}</td>
                  <td className="py-1.5 px-2.5 text-slate-600">{p.name || '—'}</td>
                  <td
                    className={`py-1.5 px-2.5 font-semibold ${
                      p.status === 'connected'
                        ? 'text-emerald-700'
                        : p.status === 'err-disabled'
                          ? 'text-red-600'
                          : 'text-slate-500'
                    }`}
                  >
                    {p.status}
                  </td>
                  <td className="py-1.5 px-2.5 text-slate-800">{p.vlan}</td>
                  <td className="py-1.5 px-2.5 text-slate-700">{p.speed}</td>
                  <td className="py-1.5 px-2.5 text-slate-700">{p.duplex}</td>
                  <td className="py-1.5 px-2.5 text-right tabular-nums text-amber-700">
                    {p.poeWatts !== undefined ? `${p.poeWatts}W` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
