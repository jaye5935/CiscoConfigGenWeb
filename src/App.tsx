import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Cable,
  Code2,
  Cpu,
  Database,
  HardDrive,
  Layers,
  Lock,
  Network,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { CliPreviewPane } from './components/CliPreviewPane';
import { ConfigForms, ConfigSection } from './components/ConfigForms';
import { CustomSwitchModal } from './components/CustomSwitchModal';
import { FleetDashboard } from './components/FleetDashboard';
import { GuideView } from './components/GuideView';
import { SavedProfilesPanel } from './components/SavedProfilesPanel';
import { SerialConsolePane } from './components/SerialConsolePane';
import {
  applyPreset,
  buildPortsForModel,
  createInitialConfig,
  DEFAULT_CUSTOM_MODEL,
  getSwitchModel,
  PresetId,
  SWITCH_MODELS,
} from './data/switchModels';
import {
  deleteLocalProfile,
  fetchLocalDbState,
  importLocalDbBundle,
  SavedSwitchProfile,
  saveLocalBackup,
  saveLocalFleet,
  saveLocalProfile,
} from './services/localDbService';
import {
  FleetSwitch,
  Language,
  SwitchBackupSnapshot,
  SwitchConfigState,
  SwitchSecretCredentials,
} from './types/switch';
import { generateCiscoCli, validateSwitchConfig } from './utils/iosGenerator';

const STORAGE_KEY = 'ciscoswitch_studio_config_v1';
const FLEET_STORAGE_KEY = 'ciscoswitch_studio_fleet_v1';
const BACKUPS_STORAGE_KEY = 'ciscoswitch_studio_backups_v1';

const DEFAULT_FLEET_SWITCHES: FleetSwitch[] = [
  {
    id: 'sw-demo-1',
    label: 'SW-CORE-01',
    host: '192.168.99.1',
    port: 22,
    username: 'netadmin',
    location: 'Server Room - Rack A1',
    modelSeries: 'Catalyst 9300',
    mode: 'simulator',
    status: 'unknown',
  },
  {
    id: 'sw-demo-2',
    label: 'SW-ACC-FL1',
    host: '192.168.99.10',
    port: 22,
    username: 'netadmin',
    location: 'Floor 1 - IDF',
    modelSeries: 'Catalyst 9200L',
    mode: 'simulator',
    status: 'unknown',
  },
  {
    id: 'sw-demo-3',
    label: 'SW-POE-CAM',
    host: '192.168.99.11',
    port: 22,
    username: 'netadmin',
    location: 'Floor 2 - Security',
    modelSeries: 'Catalyst 2960-X',
    mode: 'simulator',
    status: 'unknown',
  },
];

function stripFleetRuntimeFields(list: FleetSwitch[]): FleetSwitch[] {
  return list.map((sw) => ({
    id: sw.id,
    label: sw.label,
    host: sw.host,
    port: sw.port,
    username: sw.username,
    location: sw.location,
    modelSeries: sw.modelSeries,
    mode: sw.mode,
    status: 'unknown',
    lastBackupAt: sw.lastBackupAt,
  }));
}

export default function App() {
  const [lang, setLang] = useState<Language>('fa');
  const [workspaceView, setWorkspaceView] = useState<'configurator' | 'fleet' | 'guide'>('configurator');

  // Local Hard-Drive Database State (Offline, No Login Required)
  const [dataDir, setDataDir] = useState<string>('./data');
  const [savedProfiles, setSavedProfiles] = useState<SavedSwitchProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [showProfilesModal, setShowProfilesModal] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [quickSaveNotice, setQuickSaveNotice] = useState<string | null>(null);
  const diskLoadedRef = useRef(false);

  const [config, setConfig] = useState<SwitchConfigState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as SwitchConfigState;
      }
    } catch {
      // ignore invalid storage
    }
    return createInitialConfig('c9200l-24');
  });

  const [fleetSwitches, setFleetSwitches] = useState<FleetSwitch[]>(() => {
    try {
      const saved = localStorage.getItem(FLEET_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as FleetSwitch[];
      }
    } catch {
      // ignore
    }
    return DEFAULT_FLEET_SWITCHES;
  });

  const [fleetCredentials, setFleetCredentials] = useState<Record<string, SwitchSecretCredentials>>({});

  const [backups, setBackups] = useState<SwitchBackupSnapshot[]>(() => {
    try {
      const saved = localStorage.getItem(BACKUPS_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as SwitchBackupSnapshot[];
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [activeSection, setActiveSection] = useState<ConfigSection>('ports');
  const [rightPaneMode, setRightPaneMode] = useState<'cli' | 'console'>('cli');
  const [selectedPortIds, setSelectedPortIds] = useState<string[]>(() => [
    config.ports[0]?.id || 'copper-1',
  ]);

  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'usb-serial' | 'simulator' | 'ssh'>(
    'disconnected'
  );
  const [connectedPortLabel, setConnectedPortLabel] = useState('');
  const [autoTriggerPushCounter, setAutoTriggerPushCounter] = useState(0);

  const model = useMemo(
    () => getSwitchModel(config.modelId, config.customModel),
    [config.modelId, config.customModel]
  );
  const cliText = useMemo(() => generateCiscoCli(config), [config]);
  const warnings = useMemo(() => validateSwitchConfig(config), [config]);

  // Load saved profiles, fleet inventory, and backups from local hard drive on startup
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const state = await fetchLocalDbState();
        if (cancelled || !state.ok) return;
        if (state.dataDir) {
          setDataDir(state.dataDir);
        }
        if (Array.isArray(state.profiles)) {
          setSavedProfiles(state.profiles);
        }
        if (Array.isArray(state.fleetSwitches) && state.fleetSwitches.length > 0) {
          setFleetSwitches((prev) => {
            const prevMap = new Map(prev.map((s) => [s.id, s]));
            return state.fleetSwitches!.map((diskSw) => {
              const old = prevMap.get(diskSw.id);
              return old
                ? {
                    ...diskSw,
                    status: old.status,
                    detectedHostname: old.detectedHostname,
                    iosVersion: old.iosVersion,
                    detectedModel: old.detectedModel,
                    uptime: old.uptime,
                    upPorts: old.upPorts,
                    downPorts: old.downPorts,
                    latencyMs: old.latencyMs,
                    lastCheckedAt: old.lastCheckedAt,
                    lastError: old.lastError,
                    lastBackupAt: diskSw.lastBackupAt || old.lastBackupAt,
                    lastUpdateStatus: old.lastUpdateStatus,
                  }
                : { ...diskSw, status: diskSw.status || 'unknown' };
            });
          });
        }
        if (Array.isArray(state.backups) && state.backups.length > 0) {
          setBackups(state.backups);
        }
        diskLoadedRef.current = true;
      } catch {
        // Fallback silently to localStorage if backend is unavailable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // ignore
    }
  }, [config]);

  useEffect(() => {
    try {
      localStorage.setItem(FLEET_STORAGE_KEY, JSON.stringify(fleetSwitches));
    } catch {
      // ignore
    }
  }, [fleetSwitches]);

  useEffect(() => {
    try {
      localStorage.setItem(BACKUPS_STORAGE_KEY, JSON.stringify(backups.slice(0, 60)));
    } catch {
      // ignore
    }
  }, [backups]);

  const handleModelChange = (newModelId: string) => {
    const nextCustom =
      newModelId === 'custom' ? config.customModel || { ...DEFAULT_CUSTOM_MODEL } : undefined;
    const newModel = getSwitchModel(newModelId, nextCustom);
    setConfig((prev) => {
      const nextPorts = buildPortsForModel(newModel, prev.ports);
      return {
        ...prev,
        modelId: newModel.id,
        ...(nextCustom ? { customModel: nextCustom } : {}),
        ipRoutingEnabled: newModel.layer3Capable ? prev.ipRoutingEnabled : false,
        ports: nextPorts,
      };
    });
    setSelectedPortIds(['copper-1']);
    if (newModelId === 'custom') {
      setShowCustomModal(true);
    }
  };

  const handleApplyCustomModel = (customModel: NonNullable<SwitchConfigState['customModel']>) => {
    const resolved = getSwitchModel('custom', customModel);
    setConfig((prev) => ({
      ...prev,
      modelId: 'custom',
      customModel,
      ipRoutingEnabled: resolved.layer3Capable ? prev.ipRoutingEnabled : false,
      ports: buildPortsForModel(resolved, prev.ports),
    }));
    setSelectedPortIds(['copper-1']);
    setShowCustomModal(false);
  };

  const handlePresetChange = (presetId: PresetId) => {
    setConfig((prev) => applyPreset(prev, presetId));
  };

  const handleResetAll = () => {
    const fresh = createInitialConfig(config.modelId);
    setConfig(fresh);
    setActiveProfileId(null);
    setSelectedPortIds(['copper-1']);
  };

  const handlePushToSwitch = () => {
    setWorkspaceView('configurator');
    setRightPaneMode('console');
    if (connectionStatus !== 'disconnected') {
      setAutoTriggerPushCounter((c) => c + 1);
    }
  };

  // Persist fleet switch inventory changes directly to local hard drive
  const lastSavedFleetSigRef = useRef<string>('');
  const handleFleetSwitchesChange: React.Dispatch<React.SetStateAction<FleetSwitch[]>> = (updater) => {
    setFleetSwitches((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const persistedShape = stripFleetRuntimeFields(next);
      const sig = JSON.stringify(persistedShape);
      if (sig !== lastSavedFleetSigRef.current) {
        lastSavedFleetSigRef.current = sig;
        void saveLocalFleet(persistedShape).catch(() => {
          // ignore offline write failures
        });
      }
      return next;
    });
  };

  const handleAddBackup = (snapshot: SwitchBackupSnapshot) => {
    setBackups((prev) => [snapshot, ...prev.slice(0, 59)]);
    void saveLocalBackup(snapshot).catch(() => {
      // ignore
    });
  };

  const handleSaveProfile = async (params: { profileId?: string; profileName: string; notes: string }) => {
    const { profile, dataDir: dir } = await saveLocalProfile({
      id: params.profileId,
      profileName: params.profileName,
      notes: params.notes,
      config,
      generatedCli: cliText,
    });
    if (dir) setDataDir(dir);
    setSavedProfiles((prev) => [profile, ...prev.filter((p) => p.id !== profile.id)]);
    setActiveProfileId(profile.id);
  };

  const handleQuickSave = async () => {
    const existing = savedProfiles.find((p) => p.id === activeProfileId);
    if (!existing) {
      setShowProfilesModal(true);
      return;
    }
    await handleSaveProfile({
      profileId: existing.id,
      profileName: existing.profileName,
      notes: existing.notes || '',
    });
    setQuickSaveNotice(lang === 'fa' ? 'روی هارد ذخیره شد' : 'Saved to Disk');
    setTimeout(() => setQuickSaveNotice(null), 2200);
  };

  const handleLoadProfile = (profile: SavedSwitchProfile) => {
    const targetModel = getSwitchModel(profile.modelId, profile.configData.customModel);
    const mergedPorts = buildPortsForModel(targetModel, profile.configData.ports);
    setConfig({
      ...createInitialConfig(targetModel.id),
      ...profile.configData,
      ports: mergedPorts,
    });
    setActiveProfileId(profile.id);
    setSelectedPortIds(['copper-1']);
  };

  const handleDeleteProfile = async (profileId: string) => {
    await deleteLocalProfile(profileId);
    setSavedProfiles((prev) => prev.filter((p) => p.id !== profileId));
    if (activeProfileId === profileId) {
      setActiveProfileId(null);
    }
  };

  const handleExportDatabase = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      profiles: savedProfiles,
      fleetSwitches: stripFleetRuntimeFields(fleetSwitches),
      backups,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ciscoswitch-db-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportDatabase = async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text) as {
      profiles?: SavedSwitchProfile[];
      fleetSwitches?: FleetSwitch[];
      backups?: SwitchBackupSnapshot[];
    };
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (!Array.isArray(parsed.profiles) &&
        !Array.isArray(parsed.fleetSwitches) &&
        !Array.isArray(parsed.backups))
    ) {
      throw new Error(
        lang === 'fa'
          ? 'ساختار فایل دیتابیس معتبر نیست.'
          : 'Invalid database JSON bundle format.'
      );
    }
    const updated = await importLocalDbBundle({
      profiles: parsed.profiles,
      fleetSwitches: parsed.fleetSwitches,
      backups: parsed.backups,
    });
    if (updated.dataDir) setDataDir(updated.dataDir);
    if (Array.isArray(updated.profiles)) setSavedProfiles(updated.profiles);
    if (Array.isArray(updated.fleetSwitches) && updated.fleetSwitches.length > 0) {
      setFleetSwitches(updated.fleetSwitches);
    }
    if (Array.isArray(updated.backups)) setBackups(updated.backups);
  };

  const activeProfile = savedProfiles.find((p) => p.id === activeProfileId) || null;

  const navItems: { id: ConfigSection; labelFa: string; labelEn: string; icon: React.ReactNode }[] = [
    {
      id: 'system',
      labelFa: '۱. سیستم و مدیریت',
      labelEn: '1. System & Mgmt',
      icon: <Server className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'auth',
      labelFa: '۲. رمزها و SSHv2',
      labelEn: '2. Auth & SSHv2',
      icon: <Lock className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'vlans',
      labelFa: '۳. VLAN و مسیریابی',
      labelEn: '3. VLANs & L3',
      icon: <Layers className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'ports',
      labelFa: '۴. پورت‌ها و پنل سوییچ',
      labelEn: '4. Ports & Chassis',
      icon: <Network className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'security',
      labelFa: '۵. امنیت STP و SNMP',
      labelEn: '5. Security & SNMP',
      icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
    },
  ];

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-[#F1F3F6] text-slate-900 lg:overflow-hidden">
      {/* Strict 3-Zone Top Bar */}
      <header className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center justify-between gap-8 shrink-0">
        {/* Zone 1: Single-line Brand Wordmark */}
        <div className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0" dir="ltr">
          CiscoSwitch Studio
        </div>

        {/* Zone 2: 5 Clean Single-Line Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => {
              setWorkspaceView('configurator');
              setActiveSection('system');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              workspaceView === 'configurator' && activeSection === 'system'
                ? 'text-blue-700 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            {lang === 'fa' ? 'مولد کانفیگ' : 'Configurator'}
          </button>
          <button
            type="button"
            onClick={() => {
              setWorkspaceView('configurator');
              setActiveSection('ports');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              workspaceView === 'configurator' && activeSection === 'ports'
                ? 'text-blue-700 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            {lang === 'fa' ? 'پورت‌ها و پنل' : 'Switch Ports'}
          </button>
          <button
            type="button"
            onClick={() => {
              setWorkspaceView('configurator');
              setRightPaneMode('console');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              workspaceView === 'configurator' && rightPaneMode === 'console'
                ? 'text-blue-700 underline underline-offset-8 decoration-2'
                : ''
            }`}
          >
            {lang === 'fa' ? 'کنسول و SSH' : 'Console & SSH'}
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceView('fleet')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              workspaceView === 'fleet' ? 'text-blue-700 underline underline-offset-8 decoration-2' : ''
            }`}
          >
            {lang === 'fa' ? 'داشبورد سوییچ‌ها (SSH)' : 'SSH Fleet Dashboard'}
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceView('guide')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              workspaceView === 'guide' ? 'text-blue-700 underline underline-offset-8 decoration-2' : ''
            }`}
          >
            {lang === 'fa' ? 'راهنما' : 'Guide'}
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={handlePushToSwitch}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors whitespace-nowrap shrink-0"
          >
            <Cable className="w-3.5 h-3.5" />
            <span>
              {connectionStatus === 'disconnected'
                ? lang === 'fa'
                  ? 'اتصال کنسول / SSH'
                  : 'Connect Switch'
                : lang === 'fa'
                  ? 'ارسال به سوییچ'
                  : 'Load to Switch'}
            </span>
          </button>
        </div>
      </header>

      {/* Windows-Style Hardware & Offline Database Ribbon Toolbar */}
      <div className="bg-[#FAFBFD] border-b border-slate-200 px-5 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* Mobile Workspace Switcher */}
          <div className="flex md:hidden items-center gap-1 bg-slate-100 p-1 rounded">
            <button
              type="button"
              onClick={() => setWorkspaceView('configurator')}
              className={`px-2.5 py-1 text-xs font-medium rounded ${
                workspaceView === 'configurator' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {lang === 'fa' ? 'مولد کانفیگ' : 'Generator'}
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceView('fleet')}
              className={`px-2.5 py-1 text-xs font-medium rounded ${
                workspaceView === 'fleet' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {lang === 'fa' ? 'داشبورد SSH' : 'SSH Fleet'}
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceView('guide')}
              className={`px-2.5 py-1 text-xs font-medium rounded ${
                workspaceView === 'guide' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {lang === 'fa' ? 'راهنما' : 'Guide'}
            </button>
          </div>

          {workspaceView === 'configurator' ? (
            <>
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-500 shrink-0" />
                <label htmlFor="model-select" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                  {lang === 'fa' ? 'مدل سوییچ:' : 'Switch Model:'}
                </label>
                <select
                  id="model-select"
                  dir="ltr"
                  value={config.modelId}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="px-2.5 py-1 text-xs font-mono font-medium bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:border-blue-600"
                >
                  {SWITCH_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.series} — {m.id === 'custom' && config.customModel ? config.customModel.name : m.name}
                    </option>
                  ))}
                </select>
                {config.modelId === 'custom' && (
                  <button
                    type="button"
                    onClick={() => setShowCustomModal(true)}
                    className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors whitespace-nowrap shrink-0"
                  >
                    {lang === 'fa' ? 'تنظیمات کاستوم' : 'Customize'}
                  </button>
                )}
              </div>

              <div className="hidden xl:flex items-center gap-2 text-xs text-slate-500">
                <span>{model.osFamily.toUpperCase()}</span>
                <span aria-hidden="true">·</span>
                <span>{model.layer3Capable ? 'Layer 2/3' : 'Layer 2'}</span>
                {model.poeCapable && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{model.poeLabel}</span>
                  </>
                )}
              </div>
            </>
          ) : workspaceView === 'fleet' ? (
            <div className="flex items-center gap-2 text-xs text-slate-700">
              <Server className="w-4 h-4 text-blue-600" />
              <span className="font-semibold">
                {lang === 'fa'
                  ? 'داشبورد مدیریت متمرکز SSH، مانیتورینگ پورت‌ها و بکاپ‌گیری'
                  : 'Multi-Switch SSH Status, Live Port Monitor & Backup Dashboard'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-700">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <span className="font-semibold">
                {lang === 'fa'
                  ? 'راهنمای استفاده از برنامه، درایورها و نرم‌افزارهای پیش‌نیاز'
                  : 'Application User Guide & Prerequisite Software'}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Local Hard-Drive Database Profiles & Quick Save */}
          <button
            type="button"
            onClick={() => setShowProfilesModal(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors whitespace-nowrap shrink-0 tabular-nums"
          >
            <Database className="w-3.5 h-3.5" />
            <span>
              {lang === 'fa'
                ? `دیتابیس هارد (${savedProfiles.length})`
                : `Local DB (${savedProfiles.length})`}
            </span>
          </button>

          {workspaceView === 'configurator' && (
            <>
              <button
                type="button"
                onClick={handleQuickSave}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors whitespace-nowrap shrink-0"
                title={
                  activeProfile
                    ? `${lang === 'fa' ? 'ذخیره تغییرات روی' : 'Update'} ${activeProfile.profileName}`
                    : lang === 'fa'
                      ? 'ذخیره این سوییچ روی هارد'
                      : 'Save to local hard drive'
                }
              >
                <Save className="w-3.5 h-3.5" />
                <span>{quickSaveNotice || (lang === 'fa' ? 'ذخیره روی هارد' : 'Save')}</span>
              </button>

              <select
                aria-label={lang === 'fa' ? 'الگوی آماده' : 'Preset'}
                value=""
                onChange={(e) => {
                  if (e.target.value) handlePresetChange(e.target.value as PresetId);
                }}
                className="px-2.5 py-1 text-xs font-medium bg-white border border-slate-300 rounded text-slate-700 focus:outline-none focus:border-blue-600"
              >
                <option value="" disabled>
                  {lang === 'fa' ? 'اعمال الگوی آماده (Preset)...' : 'Apply Preset...'}
                </option>
                <option value="standard-access">
                  {lang === 'fa' ? 'سوییچ دسترسی استاندارد (Access + Voice)' : 'Standard Access + VoIP'}
                </option>
                <option value="poe-cctv-voip">
                  {lang === 'fa' ? 'سوییچ PoE دوربین مدار بسته و تلفن' : 'PoE CCTV + IP Phone'}
                </option>
                <option value="l3-distribution">
                  {lang === 'fa' ? 'سوییچ توزیع لایه ۳ (Core / Distribution)' : 'Layer 3 Distribution Switch'}
                </option>
                <option value="clean-baseline">{lang === 'fa' ? 'پیکربندی خام پایه' : 'Clean Baseline'}</option>
              </select>

              <button
                type="button"
                onClick={handleResetAll}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors whitespace-nowrap shrink-0"
                title={lang === 'fa' ? 'بازنشانی تنظیمات' : 'Reset Configuration'}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{lang === 'fa' ? 'ریست' : 'Reset'}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setLang((l) => (l === 'fa' ? 'en' : 'fa'))}
            className="px-2.5 py-1 text-xs font-mono font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors whitespace-nowrap shrink-0"
          >
            {lang === 'fa' ? 'EN' : 'FA'}
          </button>

          <div className="flex items-center gap-1.5 text-xs px-2 py-1 border border-slate-200 rounded bg-white">
            <Cpu
              className={`w-3.5 h-3.5 ${
                connectionStatus === 'usb-serial' || connectionStatus === 'ssh'
                  ? 'text-emerald-600'
                  : connectionStatus === 'simulator'
                    ? 'text-amber-600'
                    : 'text-slate-400'
              }`}
            />
            <span className="font-medium text-slate-700 whitespace-nowrap">
              {connectionStatus === 'usb-serial'
                ? lang === 'fa'
                  ? `کنسول: ${connectedPortLabel}`
                  : `Serial: ${connectedPortLabel}`
                : connectionStatus === 'ssh'
                  ? `SSH: ${connectedPortLabel}`
                  : connectionStatus === 'simulator'
                    ? lang === 'fa'
                      ? 'شبیه‌ساز فعال'
                      : 'Virtual Switch'
                    : lang === 'fa'
                      ? 'آفلاین'
                      : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Workspace View */}
      {workspaceView === 'fleet' ? (
        <FleetDashboard
          switches={fleetSwitches}
          onSwitchesChange={handleFleetSwitchesChange}
          credentials={fleetCredentials}
          onCredentialsChange={setFleetCredentials}
          backups={backups}
          onAddBackup={handleAddBackup}
          generatedCliText={cliText}
          lang={lang}
        />
      ) : workspaceView === 'guide' ? (
        <GuideView
          lang={lang}
          dataDir={dataDir}
          onNavigate={(view, opts) => {
            setWorkspaceView(view);
            if (opts?.section) setActiveSection(opts.section);
            if (opts?.pane) setRightPaneMode(opts.pane);
          }}
        />
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* Left Navigation Tree */}
          <aside className="w-full lg:w-56 bg-white border-b lg:border-b-0 lg:border-e border-slate-200 p-2.5 flex lg:flex-col gap-1 overflow-x-auto shrink-0">
            <div className="hidden lg:block px-2.5 py-1.5 text-[11px] font-semibold text-slate-400">
              {lang === 'fa' ? 'بخش‌های پیکربندی' : 'Configuration Tree'}
            </div>
            {navItems.map((item) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 text-start ${
                    active
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-100 border border-transparent'
                  }`}
                >
                  {item.icon}
                  <span>{lang === 'fa' ? item.labelFa : item.labelEn}</span>
                </button>
              );
            })}

            {activeProfile && (
              <div className="hidden lg:block mt-3 p-2.5 bg-emerald-50/70 border border-emerald-200 rounded text-[11px]">
                <div className="font-semibold text-emerald-900 truncate">{activeProfile.profileName}</div>
                <div className="text-emerald-700 mt-0.5">
                  {lang === 'fa' ? 'ذخیره‌شده روی هارد دیسک' : 'Stored on Local Hard Drive'}
                </div>
              </div>
            )}

            <div className="hidden lg:block mt-auto pt-3 border-t border-slate-100 px-2 text-[11px] text-slate-500 leading-relaxed">
              <div className="font-semibold text-slate-700 mb-0.5">{model.series}</div>
              <div>{lang === 'fa' ? model.descriptionFa : model.descriptionEn}</div>
            </div>
          </aside>

          {/* Center Configuration Forms Canvas */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-5 min-w-0">
            <ConfigForms
              section={activeSection}
              config={config}
              model={model}
              onChange={setConfig}
              selectedPortIds={selectedPortIds}
              onSelectPorts={setSelectedPortIds}
              lang={lang}
            />
          </main>

          {/* Right Split Output & Direct Serial/SSH Loader Pane */}
          <section className="w-full lg:w-[46%] xl:w-[48%] border-t lg:border-t-0 lg:border-s border-slate-200 bg-[#F8FAFC] flex flex-col min-h-[420px] lg:min-h-0 shrink-0">
            <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded">
                <button
                  type="button"
                  onClick={() => setRightPaneMode('cli')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    rightPaneMode === 'cli'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>{lang === 'fa' ? 'کد تولید شده (CLI)' : 'Generated CLI'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRightPaneMode('console')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    rightPaneMode === 'console'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>{lang === 'fa' ? 'کنسول USB/RS232 و SSH' : 'Serial & SSH Loader'}</span>
                </button>
              </div>

              <div className="text-[11px] font-mono text-slate-500 hidden sm:block" dir="ltr">
                {config.hostname} · {model.defaultBaud} 8N1
              </div>
            </div>

            <div className="flex-1 p-3.5 min-h-0 overflow-hidden">
              {rightPaneMode === 'cli' ? (
                <CliPreviewPane
                  cliText={cliText}
                  config={config}
                  warnings={warnings}
                  onToggleOption={(key, val) => setConfig((prev) => ({ ...prev, [key]: val }))}
                  onPushToSwitch={handlePushToSwitch}
                  lang={lang}
                />
              ) : (
                <SerialConsolePane
                  cliText={cliText}
                  model={model}
                  lang={lang}
                  connectionStatus={connectionStatus}
                  connectedPortLabel={connectedPortLabel}
                  onConnectionChange={(status, label) => {
                    setConnectionStatus(status);
                    setConnectedPortLabel(label);
                  }}
                  autoTriggerPushCounter={autoTriggerPushCounter}
                />
              )}
            </div>
          </section>
        </div>
      )}

      {/* Local Hard-Drive Saved Switch Profiles Modal */}
      {showProfilesModal && (
        <SavedProfilesPanel
          dataDir={dataDir}
          profiles={savedProfiles}
          activeProfileId={activeProfileId}
          currentConfig={config}
          onSaveProfile={handleSaveProfile}
          onLoadProfile={handleLoadProfile}
          onDeleteProfile={handleDeleteProfile}
          onExportDatabase={handleExportDatabase}
          onImportDatabase={handleImportDatabase}
          onClose={() => setShowProfilesModal(false)}
          lang={lang}
        />
      )}
      {/* Custom Switch Hardware Builder Modal */}
      {showCustomModal && (
        <CustomSwitchModal
          initialCustomModel={config.customModel}
          onApply={handleApplyCustomModel}
          onClose={() => setShowCustomModal(false)}
          lang={lang}
        />
      )}
    </div>
  );
}
