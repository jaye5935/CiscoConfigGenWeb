import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Archive,
  CheckCircle2,
  Download,
  Eye,
  FileDown,
  FileText,
  KeyRound,
  Plus,
  RefreshCw,
  Send,
  Server,
  Terminal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  FleetSwitch,
  Language,
  SwitchBackupSnapshot,
  SwitchSecretCredentials,
} from '../types/switch';
import {
  downloadTextFile,
  exportRawCommandsPdf,
  extractVlanBlockFromCli,
  parseVlanInputFromUser,
} from '../utils/exportArtifacts';
import { simBackupSwitch, simCheckSwitch, simExecSwitch, simPushSwitch } from '../utils/fleetSimulator';
import { extractPushableCommands } from '../utils/iosGenerator';
import { LivePortMonitor } from './LivePortMonitor';

interface FleetDashboardProps {
  switches: FleetSwitch[];
  onSwitchesChange: React.Dispatch<React.SetStateAction<FleetSwitch[]>>;
  credentials: Record<string, SwitchSecretCredentials>;
  onCredentialsChange: React.Dispatch<React.SetStateAction<Record<string, SwitchSecretCredentials>>>;
  backups: SwitchBackupSnapshot[];
  onAddBackup: (snapshot: SwitchBackupSnapshot) => void;
  generatedCliText: string;
  lang: Language;
}

export const FleetDashboard: React.FC<FleetDashboardProps> = ({
  switches,
  onSwitchesChange,
  credentials,
  onCredentialsChange,
  backups,
  onAddBackup,
  generatedCliText,
  lang,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => switches.map((s) => s.id));
  const [searchQuery, setSearchQuery] = useState('');
  const [isCheckingFleet, setIsCheckingFleet] = useState(false);
  const [isBackingUpFleet, setIsBackingUpFleet] = useState(false);

  // Panels
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCredModal, setShowCredModal] = useState(false);
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);
  const [viewingBackup, setViewingBackup] = useState<SwitchBackupSnapshot | null>(null);
  const [consoleSwitchId, setConsoleSwitchId] = useState<string | null>(null);
  const [monitoredSwitchId, setMonitoredSwitchId] = useState<string>(() => switches[0]?.id || '');

  // Add Switch Form State
  const [newSw, setNewSw] = useState({
    label: 'SW-FLOOR3-01',
    host: '192.168.99.21',
    port: 22,
    username: 'netadmin',
    password: '',
    enableSecret: '',
    location: 'Floor 3 - Rack B1',
    modelSeries: 'Catalyst 9200L',
    mode: 'ssh' as 'ssh' | 'simulator',
  });

  // Bulk Credentials (Session memory only)
  const [bulkCreds, setBulkCreds] = useState({
    username: 'netadmin',
    password: '',
    enableSecret: '',
  });

  // Bulk Update State
  const [updateMode, setUpdateMode] = useState<'patch' | 'generator' | 'ios-upgrade'>('patch');
  const [patchCommandsText, setPatchCommandsText] = useState(
    'ntp server 192.168.99.5\nlogging host 192.168.99.20\nsnmp-server community CORP_SNMP_RO RO'
  );
  const [iosImageUrl, setIosImageUrl] = useState('tftp://192.168.99.50/cat9k_lite_iosxe.17.09.04a.SPA.bin');
  const [saveAfterUpdate, setSaveAfterUpdate] = useState(true);
  const [isPushingFleet, setIsPushingFleet] = useState(false);
  const [pushLogs, setPushLogs] = useState<{ switchLabel: string; ok: boolean; detail: string }[]>([]);

  // Single Switch SSH Console State
  const [diagCmd, setDiagCmd] = useState('show ip interface brief');
  const [diagOutput, setDiagOutput] = useState('');
  const [diagBusy, setDiagBusy] = useState(false);

  const filteredSwitches = useMemo(() => {
    if (!searchQuery.trim()) return switches;
    const q = searchQuery.toLowerCase();
    return switches.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.host.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q) ||
        s.modelSeries.toLowerCase().includes(q)
    );
  }, [switches, searchQuery]);

  const stats = useMemo(() => {
    const total = switches.length;
    const online = switches.filter((s) => s.status === 'online').length;
    const offline = switches.filter((s) => s.status === 'offline' || s.status === 'auth-error').length;
    return { total, online, offline, backupsCount: backups.length };
  }, [switches, backups]);

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredSwitches.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredSwitches.map((s) => s.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const getCreds = (sw: FleetSwitch): SwitchSecretCredentials => {
    return credentials[sw.id] || { password: '', enableSecret: '' };
  };

  const handleAddSwitch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSw.label.trim() || !newSw.host.trim()) return;
    const id = `sw-${Date.now()}`;
    const item: FleetSwitch = {
      id,
      label: newSw.label.trim(),
      host: newSw.host.trim(),
      port: Number(newSw.port) || 22,
      username: newSw.username.trim() || 'netadmin',
      location: newSw.location.trim(),
      modelSeries: newSw.modelSeries,
      mode: newSw.mode,
      status: 'unknown',
    };
    onSwitchesChange((prev) => [...prev, item]);
    if (newSw.password) {
      onCredentialsChange((prev) => ({
        ...prev,
        [id]: { password: newSw.password, enableSecret: newSw.enableSecret },
      }));
    }
    setSelectedIds((prev) => [...prev, id]);
    setShowAddForm(false);
    setNewSw((s) => ({ ...s, label: '', host: '', password: '', enableSecret: '' }));
  };

  const handleDeleteSwitch = (id: string) => {
    onSwitchesChange((prev) => prev.filter((s) => s.id !== id));
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const handleApplyBulkCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    const targetIds = selectedIds.length > 0 ? selectedIds : switches.map((s) => s.id);
    if (bulkCreds.username.trim()) {
      onSwitchesChange((prev) =>
        prev.map((s) => (targetIds.includes(s.id) ? { ...s, username: bulkCreds.username.trim() } : s))
      );
    }
    onCredentialsChange((prev) => {
      const next = { ...prev };
      for (const id of targetIds) {
        next[id] = { password: bulkCreds.password, enableSecret: bulkCreds.enableSecret };
      }
      return next;
    });
    setShowCredModal(false);
  };

  const handleCheckFleet = async (targetSwitches?: FleetSwitch[]) => {
    const list = targetSwitches || (selectedIds.length > 0 ? switches.filter((s) => selectedIds.includes(s.id)) : switches);
    if (list.length === 0) return;

    setIsCheckingFleet(true);
    const listIds = new Set(list.map((s) => s.id));
    onSwitchesChange((prev) =>
      prev.map((s) => (listIds.has(s.id) ? { ...s, status: 'checking', lastError: undefined } : s))
    );

    const simList = list.filter((s) => s.mode === 'simulator');
    const sshList = list.filter((s) => s.mode === 'ssh');

    // Run simulated checks
    const simPromises = simList.map(async (sw) => {
      const data = await simCheckSwitch(sw);
      onSwitchesChange((prev) =>
        prev.map((item) =>
          item.id === sw.id
            ? {
                ...item,
                status: 'online',
                detectedHostname: data.hostname,
                iosVersion: data.iosVersion,
                detectedModel: data.model,
                uptime: data.uptime,
                upPorts: data.upPorts,
                downPorts: data.downPorts,
                latencyMs: data.latencyMs,
                lastCheckedAt: new Date().toLocaleTimeString('en-GB', { hour12: false }),
              }
            : item
        )
      );
    });

    // Run real SSH checks via backend
    const sshPromise = (async () => {
      if (sshList.length === 0) return;
      const missingPass = sshList.filter((s) => !getCreds(s).password);
      const validSsh = sshList.filter((s) => !!getCreds(s).password);

      if (missingPass.length > 0) {
        const missingIds = new Set(missingPass.map((s) => s.id));
        onSwitchesChange((prev) =>
          prev.map((item) =>
            missingIds.has(item.id)
              ? {
                  ...item,
                  status: 'auth-error',
                  lastError: lang === 'fa' ? 'رمز SSH وارد نشده است' : 'Missing SSH password',
                }
              : item
          )
        );
      }

      if (validSsh.length === 0) return;

      try {
        const res = await fetch('/api/ssh/fleet-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            switches: validSsh.map((s) => ({
              id: s.id,
              host: s.host,
              port: s.port,
              username: s.username,
              password: getCreds(s).password,
              enableSecret: getCreds(s).enableSecret,
            })),
          }),
        });
        const payload = await res.json();
        if (payload.ok && Array.isArray(payload.results)) {
          const map = new Map<string, Record<string, unknown>>();
          for (const r of payload.results) {
            map.set(r.id, r);
          }
          onSwitchesChange((prev) =>
            prev.map((item) => {
              const r = map.get(item.id);
              if (!r) return item;
              if (r.ok) {
                return {
                  ...item,
                  status: 'online',
                  detectedHostname: String(r.hostname || item.label),
                  iosVersion: String(r.iosVersion || ''),
                  detectedModel: String(r.model || item.modelSeries),
                  uptime: String(r.uptime || ''),
                  upPorts: Number(r.upPorts ?? 0),
                  downPorts: Number(r.downPorts ?? 0),
                  latencyMs: Number(r.latencyMs ?? 0),
                  lastCheckedAt: new Date().toLocaleTimeString('en-GB', { hour12: false }),
                  lastError: undefined,
                };
              }
              return {
                ...item,
                status: 'offline',
                latencyMs: Number(r.latencyMs ?? 0),
                lastCheckedAt: new Date().toLocaleTimeString('en-GB', { hour12: false }),
                lastError: String(r.error || 'Connection failed'),
              };
            })
          );
        }
      } catch (err) {
        const validIds = new Set(validSsh.map((s) => s.id));
        onSwitchesChange((prev) =>
          prev.map((item) =>
            validIds.has(item.id)
              ? {
                  ...item,
                  status: 'offline',
                  lastError: err instanceof Error ? err.message : 'Backend error',
                }
              : item
          )
        );
      }
    })();

    await Promise.all([...simPromises, sshPromise]);
    setIsCheckingFleet(false);
  };

  const handleBackupSingle = async (sw: FleetSwitch): Promise<boolean> => {
    const creds = getCreds(sw);
    if (sw.mode === 'ssh' && !creds.password) {
      onSwitchesChange((prev) =>
        prev.map((item) =>
          item.id === sw.id
            ? { ...item, status: 'auth-error', lastError: lang === 'fa' ? 'رمز SSH وارد نشده است' : 'Missing SSH password' }
            : item
        )
      );
      return false;
    }

    try {
      const data =
        sw.mode === 'simulator'
          ? await simBackupSwitch(sw)
          : await fetch('/api/ssh/backup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                host: sw.host,
                port: sw.port,
                username: sw.username,
                password: creds.password,
                enableSecret: creds.enableSecret,
              }),
            }).then((r) => r.json());

      if (!data.ok) {
        onSwitchesChange((prev) =>
          prev.map((item) =>
            item.id === sw.id ? { ...item, lastError: data.error || 'Backup failed' } : item
          )
        );
        return false;
      }

      const snap: SwitchBackupSnapshot = {
        id: `bak-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        switchId: sw.id,
        hostname: data.hostname || sw.label,
        capturedAt: data.capturedAt || new Date().toISOString(),
        configText: data.config,
        lineCount: String(data.config).split('\n').length,
      };
      onAddBackup(snap);

      const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false });
      onSwitchesChange((prev) =>
        prev.map((item) =>
          item.id === sw.id
            ? { ...item, status: 'online', lastBackupAt: timeStr, lastError: undefined }
            : item
        )
      );
      return true;
    } catch (err) {
      onSwitchesChange((prev) =>
        prev.map((item) =>
          item.id === sw.id
            ? { ...item, lastError: err instanceof Error ? err.message : 'Backup failed' }
            : item
        )
      );
      return false;
    }
  };

  const handleBulkBackup = async () => {
    const targets = selectedIds.length > 0 ? switches.filter((s) => selectedIds.includes(s.id)) : switches;
    if (targets.length === 0) return;
    setIsBackingUpFleet(true);
    await Promise.all(targets.map((sw) => handleBackupSingle(sw)));
    setIsBackingUpFleet(false);
  };

  const handleDownloadBackupFile = (snap: SwitchBackupSnapshot) => {
    downloadTextFile(`${snap.hostname}-${snap.capturedAt.slice(0, 10)}.cfg`, snap.configText);
  };

  const handleDownloadBackupConfigText = (snap: SwitchBackupSnapshot) => {
    downloadTextFile('config.text', snap.configText);
  };

  const handleDownloadBackupVlan = (snap: SwitchBackupSnapshot) => {
    const content = extractVlanBlockFromCli(snap.configText, snap.hostname);
    downloadTextFile('vlan.txt', content);
  };

  const handleExportBackupPdf = async (snap: SwitchBackupSnapshot) => {
    const vlans = parseVlanInputFromUser(snap.configText);
    await exportRawCommandsPdf({
      title:
        lang === 'fa'
          ? `بکاپ دستورات سوییچ — ${snap.hostname}`
          : `Cisco Switch Backup CLI — ${snap.hostname}`,
      subtitle:
        lang === 'fa'
          ? `زمان بکاپ: ${snap.capturedAt.replace('T', ' ').slice(0, 19)}`
          : `Captured at ${snap.capturedAt.replace('T', ' ').slice(0, 19)}`,
      metaPairs: [
        { label: lang === 'fa' ? 'نام دستگاه' : 'Hostname', value: snap.hostname },
        { label: lang === 'fa' ? 'تاریخ' : 'Captured', value: snap.capturedAt.slice(0, 10) },
        { label: lang === 'fa' ? 'تعداد VLAN' : 'VLANs', value: `${vlans.length} VLANs` },
        { label: lang === 'fa' ? 'تعداد خطوط' : 'Lines', value: `${snap.lineCount} lines` },
      ],
      filename: `${snap.hostname}-backup.pdf`,
      cliText: snap.configText,
      lang,
      vlanSummary: vlans,
    });
  };

  const handleDownloadAllBackups = () => {
    if (backups.length === 0) return;
    // Latest backup per switch combined into an archive text bundle
    const latestBySwitch = new Map<string, SwitchBackupSnapshot>();
    for (const b of backups) {
      if (!latestBySwitch.has(b.switchId)) {
        latestBySwitch.set(b.switchId, b);
      }
    }
    const combined = Array.from(latestBySwitch.values())
      .map(
        (b) =>
          `! ======================================================================\n` +
          `! SWITCH: ${b.hostname} | CAPTURED: ${b.capturedAt} | LINES: ${b.lineCount}\n` +
          `! ======================================================================\n` +
          b.configText
      )
      .join('\n\n');

    const blob = new Blob([combined], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cisco-fleet-backups-${new Date().toISOString().slice(0, 10)}.cfg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkUpdate = async () => {
    const targets = switches.filter((s) => selectedIds.includes(s.id));
    if (targets.length === 0) return;

    let commands: string[] = [];
    if (updateMode === 'generator') {
      commands = extractPushableCommands(generatedCliText);
    } else if (updateMode === 'ios-upgrade') {
      commands = [
        `! IOS Firmware Staging Command`,
        `copy ${iosImageUrl.trim()} flash:`,
      ].filter((c) => !c.startsWith('!'));
    } else {
      commands = patchCommandsText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('!'));
    }

    if (commands.length === 0) return;

    setIsPushingFleet(true);
    setPushLogs([]);

    await Promise.all(
      targets.map(async (sw) => {
        const creds = getCreds(sw);
        if (sw.mode === 'ssh' && !creds.password) {
          setPushLogs((prev) => [
            ...prev,
            {
              switchLabel: `${sw.label} (${sw.host})`,
              ok: false,
              detail: lang === 'fa' ? 'رمز SSH وارد نشده است' : 'Missing SSH password',
            },
          ]);
          return;
        }

        try {
          const data =
            sw.mode === 'simulator'
              ? await simPushSwitch(sw, commands)
              : await fetch('/api/ssh/push', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    host: sw.host,
                    port: sw.port,
                    username: sw.username,
                    password: creds.password,
                    enableSecret: creds.enableSecret,
                    commands,
                    saveMemory: updateMode !== 'ios-upgrade' && saveAfterUpdate,
                  }),
                }).then((r) => r.json());

          if (data.ok && (!data.errors || data.errors.length === 0)) {
            onSwitchesChange((prev) =>
              prev.map((item) =>
                item.id === sw.id
                  ? {
                      ...item,
                      status: 'online',
                      lastUpdateStatus: lang === 'fa' ? `آپدیت موفق (${data.appliedCount} دستور)` : `Updated (${data.appliedCount} cmds)`,
                    }
                  : item
              )
            );
            setPushLogs((prev) => [
              ...prev,
              {
                switchLabel: `${sw.label} (${sw.host})`,
                ok: true,
                detail: `${data.appliedCount} commands applied`,
              },
            ]);
          } else {
            const errText = data.errors?.[0] || data.error || 'Update failed';
            setPushLogs((prev) => [
              ...prev,
              { switchLabel: `${sw.label} (${sw.host})`, ok: false, detail: errText },
            ]);
          }
        } catch (err) {
          setPushLogs((prev) => [
            ...prev,
            {
              switchLabel: `${sw.label} (${sw.host})`,
              ok: false,
              detail: err instanceof Error ? err.message : 'Request error',
            },
          ]);
        }
      })
    );

    setIsPushingFleet(false);
  };

  const handleRunDiagCmd = async (e?: React.FormEvent, overrideCmd?: string) => {
    if (e) e.preventDefault();
    const sw = switches.find((s) => s.id === consoleSwitchId);
    if (!sw) return;
    const cmdToRun = (overrideCmd ?? diagCmd).trim();
    if (!cmdToRun) return;

    const creds = getCreds(sw);
    if (sw.mode === 'ssh' && !creds.password) {
      setDiagOutput(lang === 'fa' ? 'خطا: رمز SSH برای این سوییچ تنظیم نشده است.' : 'Error: SSH password not set.');
      return;
    }

    setDiagBusy(true);
    try {
      const data =
        sw.mode === 'simulator'
          ? await simExecSwitch(sw, cmdToRun)
          : await fetch('/api/ssh/exec', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                host: sw.host,
                port: sw.port,
                username: sw.username,
                password: creds.password,
                enableSecret: creds.enableSecret,
                command: cmdToRun,
              }),
            }).then((r) => r.json());

      setDiagOutput(data.ok ? data.output : `Error: ${data.error}`);
    } catch (err) {
      setDiagOutput(err instanceof Error ? err.message : 'SSH exec error');
    } finally {
      setDiagBusy(false);
    }
  };

  const activeConsoleSwitch = switches.find((s) => s.id === consoleSwitchId);

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 bg-[#F1F3F6] space-y-4">
      {/* Top KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-md px-4 py-3">
          <div className="text-xs text-slate-500">{lang === 'fa' ? 'کل سوییچ‌های شبکه' : 'Total Switches'}</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">{stats.total}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md px-4 py-3">
          <div className="text-xs text-slate-500">{lang === 'fa' ? 'آنلاین (SSH فعال)' : 'Online via SSH'}</div>
          <div className="text-2xl font-bold font-mono text-emerald-600 mt-1 tabular-nums">{stats.online}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md px-4 py-3">
          <div className="text-xs text-slate-500">{lang === 'fa' ? 'آفلاین / نیاز به بررسی' : 'Offline / Alert'}</div>
          <div className="text-2xl font-bold font-mono text-red-600 mt-1 tabular-nums">{stats.offline}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md px-4 py-3">
          <div className="text-xs text-slate-500">{lang === 'fa' ? 'نسخه‌های بکاپ ذخیره‌شده' : 'Saved Config Backups'}</div>
          <div className="text-2xl font-bold font-mono text-blue-600 mt-1 tabular-nums">{stats.backupsCount}</div>
        </div>
      </div>

      {/* Main Fleet Action Bar */}
      <div className="bg-white border border-slate-200 rounded-md p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isCheckingFleet}
            onClick={() => handleCheckFleet()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingFleet ? 'animate-spin' : ''}`} />
            <span>
              {isCheckingFleet
                ? lang === 'fa'
                  ? 'در حال بررسی...'
                  : 'Checking...'
                : lang === 'fa'
                  ? 'بررسی وضعیت کل دستگاه‌ها (SSH)'
                  : 'Check Fleet Status (SSH)'}
            </span>
          </button>

          <button
            type="button"
            disabled={isBackingUpFleet}
            onClick={handleBulkBackup}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <Archive className="w-3.5 h-3.5 text-blue-600" />
            <span>
              {isBackingUpFleet
                ? lang === 'fa'
                  ? 'در حال بکاپ‌گیری...'
                  : 'Backing up...'
                : lang === 'fa'
                  ? 'بکاپ دسته‌جمعی کانفیگ‌ها'
                  : 'Backup Selected Configs'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowUpdatePanel((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
              showUpdatePanel
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{lang === 'fa' ? 'آپدیت و ارسال دستور گروهی' : 'Bulk Update / Push'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCredModal((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{lang === 'fa' ? 'تنظیم رمز SSH' : 'Set SSH Credentials'}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === 'fa' ? 'فیلتر نام، IP یا محل...' : 'Search host, IP, location...'}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-slate-50 focus:bg-white focus:border-blue-500 focus:outline-none w-48"
          />

          {backups.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadAllBackups}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{lang === 'fa' ? 'خروجی همه بکاپ‌ها' : 'Export All Backups'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{lang === 'fa' ? 'افزودن سوییچ' : 'Add Switch'}</span>
          </button>
        </div>
      </div>

      {/* Inline Bulk Credentials Setter (Session Memory Only) */}
      {showCredModal && (
        <form
          onSubmit={handleApplyBulkCredentials}
          className="bg-white border border-slate-300 rounded-md p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                {lang === 'fa'
                  ? `تنظیم نام کاربری و رمز SSH برای ${selectedIds.length || switches.length} سوییچ`
                  : `Set Session SSH Credentials (${selectedIds.length || switches.length} switches)`}
              </h4>
              <p className="text-xs text-slate-500">
                {lang === 'fa'
                  ? 'رمزها فقط در حافظه موقت نشست نگهداری می‌شوند و در مرورگر ذخیره نمی‌شوند.'
                  : 'Credentials stay in session memory only and are never written to localStorage.'}
              </p>
            </div>
            <button type="button" onClick={() => setShowCredModal(false)} className="text-slate-400 hover:text-slate-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end" dir="ltr">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
              <input
                type="text"
                value={bulkCreds.username}
                onChange={(e) => setBulkCreds((c) => ({ ...c, username: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">SSH Password</label>
              <input
                type="password"
                value={bulkCreds.password}
                onChange={(e) => setBulkCreds((c) => ({ ...c, password: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Enable Secret (Optional)</label>
              <input
                type="password"
                value={bulkCreds.enableSecret}
                onChange={(e) => setBulkCreds((c) => ({ ...c, enableSecret: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
            >
              {lang === 'fa' ? 'اعمال روی سوییچ‌ها' : 'Apply to Selected'}
            </button>
          </div>
        </form>
      )}

      {/* Inline Add Switch Form */}
      {showAddForm && (
        <form onSubmit={handleAddSwitch} className="bg-white border border-slate-300 rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900">
              {lang === 'fa' ? 'افزودن سوییچ جدید به لیست مدیریت SSH' : 'Add Cisco Switch to SSH Fleet'}
            </h4>
            <button type="button" onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3" dir="ltr">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Hostname / Label</label>
              <input
                type="text"
                required
                value={newSw.label}
                onChange={(e) => setNewSw((s) => ({ ...s, label: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                placeholder="SW-FLOOR3-01"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">IP / Host</label>
              <input
                type="text"
                required
                value={newSw.host}
                onChange={(e) => setNewSw((s) => ({ ...s, host: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                placeholder="192.168.99.21"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">SSH Port</label>
              <input
                type="number"
                value={newSw.port}
                onChange={(e) => setNewSw((s) => ({ ...s, port: Number(e.target.value) || 22 }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Connection Type</label>
              <select
                value={newSw.mode}
                onChange={(e) => setNewSw((s) => ({ ...s, mode: e.target.value as 'ssh' | 'simulator' }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
              >
                <option value="ssh">Real SSH (Network)</option>
                <option value="simulator">Simulated Lab Switch</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
              <input
                type="text"
                value={newSw.username}
                onChange={(e) => setNewSw((s) => ({ ...s, username: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={newSw.password}
                onChange={(e) => setNewSw((s) => ({ ...s, password: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Model Series</label>
              <input
                type="text"
                list="fleet-model-series-options"
                value={newSw.modelSeries}
                onChange={(e) => setNewSw((s) => ({ ...s, modelSeries: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
              <datalist id="fleet-model-series-options">
                <option value="Catalyst 2960" />
                <option value="Catalyst 2960-S" />
                <option value="Catalyst 2960-X" />
                <option value="Catalyst 3560-CX" />
                <option value="Catalyst 3750-X" />
                <option value="Catalyst 3850" />
                <option value="Catalyst 9200L" />
                <option value="Catalyst 9300" />
                <option value="Industrial IE-3300" />
                <option value="Custom Switch" />
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
              <input
                type="text"
                value={newSw.location}
                onChange={(e) => setNewSw((s) => ({ ...s, location: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
            >
              {lang === 'fa' ? 'ذخیره سوییچ' : 'Add to Fleet'}
            </button>
          </div>
        </form>
      )}

      {/* Bulk Update & Config Push Panel */}
      {showUpdatePanel && (
        <div className="bg-white border border-slate-300 rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                {lang === 'fa'
                  ? `آپدیت دسته‌جمعی روی ${selectedIds.length} سوییچ انتخاب‌شده`
                  : `Bulk SSH Update (${selectedIds.length} selected switches)`}
              </h4>
              <p className="text-xs text-slate-500">
                {lang === 'fa'
                  ? 'ارسال پچ دستورات، کانفیگ تولیدشده در تب ژنراتور، یا دستور ارتقای IOS'
                  : 'Push CLI patches, full generated config, or IOS upgrade staging commands via SSH'}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded">
              <button
                type="button"
                onClick={() => setUpdateMode('patch')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  updateMode === 'patch' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {lang === 'fa' ? 'پچ دستورات سفارشی' : 'CLI Patch'}
              </button>
              <button
                type="button"
                onClick={() => setUpdateMode('generator')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  updateMode === 'generator' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {lang === 'fa' ? 'کانفیگ کامل ژنراتور' : 'Use Generator Config'}
              </button>
              <button
                type="button"
                onClick={() => setUpdateMode('ios-upgrade')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  updateMode === 'ios-upgrade' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {lang === 'fa' ? 'آپدیت فایل IOS' : 'IOS Image Copy'}
              </button>
            </div>
          </div>

          {updateMode === 'patch' && (
            <textarea
              rows={4}
              dir="ltr"
              value={patchCommandsText}
              onChange={(e) => setPatchCommandsText(e.target.value)}
              className="w-full p-2.5 font-mono text-xs bg-[#11161E] text-emerald-300 border border-slate-800 rounded focus:outline-none"
              placeholder="Enter Cisco IOS global/interface commands..."
            />
          )}

          {updateMode === 'generator' && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 flex items-center justify-between">
              <span>
                {lang === 'fa'
                  ? `آماده ارسال ${extractPushableCommands(generatedCliText).length} خط دستور از Config Generator روی سوییچ‌های انتخاب‌شده.`
                  : `Ready to push ${extractPushableCommands(generatedCliText).length} CLI lines from Config Generator.`}
              </span>
            </div>
          )}

          {updateMode === 'ios-upgrade' && (
            <div dir="ltr" className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">TFTP / HTTP IOS Image URL</label>
              <input
                type="text"
                value={iosImageUrl}
                onChange={(e) => setIosImageUrl(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAfterUpdate}
                onChange={(e) => setSaveAfterUpdate(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600"
              />
              <span>{lang === 'fa' ? 'ذخیره خودکار در NVRAM (write memory)' : 'Save config (write memory)'}</span>
            </label>

            <button
              type="button"
              disabled={isPushingFleet || selectedIds.length === 0}
              onClick={handleBulkUpdate}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 rounded transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isPushingFleet
                  ? lang === 'fa'
                    ? 'در حال ارسال روی SSH...'
                    : 'Pushing via SSH...'
                  : lang === 'fa'
                    ? 'اجرا و آپدیت انتخاب‌شده‌ها'
                    : 'Execute Update'}
              </span>
            </button>
          </div>

          {pushLogs.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-1" dir="ltr">
              {pushLogs.map((log, i) => (
                <div key={i} className="flex items-center justify-between text-xs font-mono px-2.5 py-1 bg-slate-50 rounded border border-slate-200">
                  <span className="font-semibold text-slate-800">{log.switchLabel}</span>
                  <span className={log.ok ? 'text-emerald-700' : 'text-red-600'}>{log.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* High-Density Switch Fleet Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-3 text-center w-9">
                  <input
                    type="checkbox"
                    checked={filteredSwitches.length > 0 && selectedIds.length === filteredSwitches.length}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600"
                  />
                </th>
                <th className="py-2.5 px-3 text-start font-semibold">{lang === 'fa' ? 'دستگاه / موقعیت' : 'Device & Location'}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{lang === 'fa' ? 'آدرس IP / نوع' : 'Host / Mode'}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{lang === 'fa' ? 'مدل و نسخه IOS' : 'Model & IOS'}</th>
                <th className="py-2.5 px-3 text-end font-semibold">{lang === 'fa' ? 'پورت‌ها' : 'Ports (Up/Dn)'}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{lang === 'fa' ? 'وضعیت SSH' : 'Status'}</th>
                <th className="py-2.5 px-3 text-start font-semibold">{lang === 'fa' ? 'آخرین بکاپ' : 'Last Backup'}</th>
                <th className="py-2.5 px-3 text-end font-semibold">{lang === 'fa' ? 'عملیات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSwitches.map((sw) => {
                const latestBackup = backups.find((b) => b.switchId === sw.id);
                return (
                  <tr key={sw.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(sw.id)}
                        onChange={() => toggleSelectOne(sw.id)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <Server className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div>
                          <div className="font-mono font-semibold text-slate-900" dir="ltr">
                            {sw.detectedHostname || sw.label}
                          </div>
                          <div className="text-[11px] text-slate-500">{sw.location || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono" dir="ltr">
                      <div className="text-slate-800 tabular-nums">
                        {sw.host}:{sw.port}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {sw.mode === 'simulator' ? 'Lab Simulator' : `SSH (${sw.username})`}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono" dir="ltr">
                      <div className="text-slate-800">{sw.detectedModel || sw.modelSeries}</div>
                      <div className="text-[11px] text-slate-500">{sw.iosVersion || '—'}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-end tabular-nums" dir="ltr">
                      {sw.upPorts !== undefined ? (
                        <span>
                          <span className="text-emerald-700 font-semibold">{sw.upPorts} Up</span>
                          <span className="text-slate-400"> / </span>
                          <span className="text-slate-500">{sw.downPorts} Dn</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {sw.status === 'online' ? (
                        <div className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {lang === 'fa' ? 'آنلاین' : 'Online'}
                            {sw.latencyMs !== undefined ? ` · ${sw.latencyMs}ms` : ''}
                          </span>
                        </div>
                      ) : sw.status === 'checking' ? (
                        <div className="inline-flex items-center gap-1.5 text-blue-600 font-medium">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                          <span>{lang === 'fa' ? 'در حال بررسی' : 'Checking'}</span>
                        </div>
                      ) : sw.status === 'offline' || sw.status === 'auth-error' ? (
                        <div className="text-red-700">
                          <div className="inline-flex items-center gap-1 font-medium">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{sw.status === 'auth-error' ? (lang === 'fa' ? 'نیاز به رمز' : 'Auth') : lang === 'fa' ? 'آفلاین' : 'Offline'}</span>
                          </div>
                          {sw.lastError && <div className="text-[10px] text-red-500 truncate max-w-[160px]">{sw.lastError}</div>}
                        </div>
                      ) : (
                        <span className="text-slate-400">{lang === 'fa' ? 'بررسی‌نشده' : 'Not checked'}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 tabular-nums" dir="ltr">
                      {latestBackup ? (
                        <div>
                          <div>{sw.lastBackupAt || latestBackup.capturedAt.slice(11, 19)}</div>
                          <div className="text-slate-400">{latestBackup.lineCount} lines</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-end">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setMonitoredSwitchId(sw.id)}
                          title={lang === 'fa' ? 'نمایش گرافیکی پورت‌ها' : 'Monitor Live Ports'}
                          className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                            monitoredSwitchId === sw.id
                              ? 'bg-emerald-600 text-white'
                              : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
                          }`}
                        >
                          <Activity className="w-3 h-3" />
                          <span>{lang === 'fa' ? 'پورت‌ها' : 'Ports'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBackupSingle(sw)}
                          title={lang === 'fa' ? 'بکاپ کانفیگ با SSH' : 'Backup Running-Config'}
                          className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                        >
                          {lang === 'fa' ? 'بکاپ' : 'Backup'}
                        </button>
                        {latestBackup && (
                          <button
                            type="button"
                            onClick={() => setViewingBackup(latestBackup)}
                            title={lang === 'fa' ? 'مشاهده آخرین بکاپ' : 'View Latest Backup'}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setConsoleSwitchId(sw.id);
                            setDiagOutput('');
                          }}
                          title={lang === 'fa' ? 'ترمینال SSH' : 'SSH Terminal'}
                          className="p-1 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSwitch(sw.id)}
                          title={lang === 'fa' ? 'حذف سوییچ' : 'Remove Switch'}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Graphical Switch Port Status Monitor */}
      {switches.length > 0 && (
        <LivePortMonitor
          switches={switches}
          selectedSwitchId={monitoredSwitchId}
          onSelectSwitchId={setMonitoredSwitchId}
          credentials={credentials}
          lang={lang}
        />
      )}

      {/* Saved Backups Archive List + Viewer Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Backup History List */}
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-semibold text-slate-900">
                {lang === 'fa' ? 'آرشیو بکاپ‌های گرفته‌شده' : 'Config Backup History'}
              </h4>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">{backups.length}</span>
          </div>

          {backups.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              {lang === 'fa'
                ? 'هنوز بکاپی گرفته نشده است. روی «بکاپ دسته‌جمعی» یا دکمه «بکاپ» در جدول کلیک کنید.'
                : 'No backups captured yet. Click Backup on any switch or use Bulk Backup.'}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {backups.map((b) => (
                <div key={b.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div dir="ltr">
                    <span className="font-mono font-semibold text-slate-900">{b.hostname}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {b.capturedAt.replace('T', ' ').slice(0, 19)}
                    </span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="font-mono text-slate-500 tabular-nums">{b.lineCount} lines</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewingBackup(b)}
                      className="px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded"
                    >
                      {lang === 'fa' ? 'مشاهده' : 'Inspect'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadBackupConfigText(b)}
                      className="px-2 py-1 text-[11px] font-mono font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      config.text
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadBackupVlan(b)}
                      className="px-2 py-1 text-[11px] font-mono font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded"
                    >
                      vlan
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportBackupPdf(b)}
                      className="px-2 py-1 text-[11px] font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadBackupFile(b)}
                      className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                    >
                      .cfg
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Interactive Backup Inspector OR Quick SSH Console */}
        <div className="bg-white border border-slate-200 rounded-md p-4 flex flex-col min-h-[280px]">
          {activeConsoleSwitch ? (
            <>
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-600" />
                  <h4 className="text-sm font-semibold text-slate-900" dir="ltr">
                    SSH CLI: {activeConsoleSwitch.label} ({activeConsoleSwitch.host})
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setConsoleSwitchId(null)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2" dir="ltr">
                {['show version', 'show ip interface brief', 'show vlan brief', 'show running-config'].map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    disabled={diagBusy}
                    onClick={() => {
                      setDiagCmd(cmd);
                      handleRunDiagCmd(undefined, cmd);
                    }}
                    className="px-2 py-1 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-800 rounded"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
              <form onSubmit={(e) => handleRunDiagCmd(e)} dir="ltr" className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={diagCmd}
                  onChange={(e) => setDiagCmd(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded"
                  placeholder="show cdp neighbors"
                />
                <button
                  type="submit"
                  disabled={diagBusy}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
                >
                  {diagBusy ? '...' : 'Run'}
                </button>
              </form>
              <pre
                dir="ltr"
                className="flex-1 max-h-56 overflow-auto bg-[#0E131A] text-emerald-300 p-3 rounded font-mono text-[11px] leading-5 whitespace-pre-wrap"
              >
                {diagOutput || 'Click a quick command or enter a Cisco IOS show command above.'}
              </pre>
            </>
          ) : viewingBackup ? (
            <>
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
                <div className="text-xs font-mono font-semibold text-slate-900" dir="ltr">
                  {viewingBackup.hostname} · {viewingBackup.capturedAt.replace('T', ' ').slice(0, 19)}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDownloadBackupConfigText(viewingBackup)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded"
                  >
                    <span>config.text</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadBackupVlan(viewingBackup)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded"
                  >
                    <span>vlan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportBackupPdf(viewingBackup)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                  >
                    <FileDown className="w-3 h-3" />
                    <span>PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadBackupFile(viewingBackup)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
                  >
                    <Download className="w-3 h-3" />
                    <span>.cfg</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingBackup(null)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <pre
                dir="ltr"
                className="flex-1 max-h-60 overflow-auto bg-[#11161E] text-slate-200 p-3 rounded font-mono text-[11px] leading-5 whitespace-pre-wrap"
              >
                {viewingBackup.configText}
              </pre>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-xs text-slate-500 p-6">
              <Eye className="w-5 h-5 text-slate-400 mb-2" />
              <p>
                {lang === 'fa'
                  ? 'برای مشاهده متن کانفیگ، روی «مشاهده» کنار هر بکاپ کلیک کنید یا آیکون ترمینال SSH یک سوییچ را بزنید.'
                  : 'Select Inspect on any backup to preview running-config, or click the SSH Terminal icon on a switch.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
