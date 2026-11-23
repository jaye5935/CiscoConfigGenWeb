import React, { useRef, useState } from 'react';
import {
  Database,
  Download,
  FolderOpen,
  HardDrive,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { getSwitchModel } from '../data/switchModels';
import { SavedSwitchProfile } from '../services/localDbService';
import { Language, SwitchConfigState } from '../types/switch';

interface SavedProfilesPanelProps {
  dataDir: string;
  profiles: SavedSwitchProfile[];
  activeProfileId: string | null;
  currentConfig: SwitchConfigState;
  onSaveProfile: (params: { profileId?: string; profileName: string; notes: string }) => Promise<void>;
  onLoadProfile: (profile: SavedSwitchProfile) => void;
  onDeleteProfile: (profileId: string) => Promise<void>;
  onExportDatabase: () => void;
  onImportDatabase: (file: File) => Promise<void>;
  onClose: () => void;
  lang: Language;
}

export const SavedProfilesPanel: React.FC<SavedProfilesPanelProps> = ({
  dataDir,
  profiles,
  activeProfileId,
  currentConfig,
  onSaveProfile,
  onLoadProfile,
  onDeleteProfile,
  onExportDatabase,
  onImportDatabase,
  onClose,
  lang,
}) => {
  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null;
  const [profileName, setProfileName] = useState(
    activeProfile?.profileName ||
      `${currentConfig.hostname || 'Switch'} (${getSwitchModel(currentConfig.modelId, currentConfig.customModel).series})`
  );
  const [notes, setNotes] = useState(activeProfile?.notes || '');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const filteredProfiles = profiles.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.profileName.toLowerCase().includes(q) ||
      p.hostname.toLowerCase().includes(q) ||
      p.mgmtIp.toLowerCase().includes(q) ||
      p.modelId.toLowerCase().includes(q)
    );
  });

  const handleSave = async (asNew: boolean) => {
    setErrorMsg(null);
    setFeedback(null);
    setSaving(true);
    try {
      await onSaveProfile({
        profileId: asNew ? undefined : activeProfileId || undefined,
        profileName: profileName.trim() || currentConfig.hostname || 'Switch Config',
        notes: notes.trim(),
      });
      setFeedback(
        lang === 'fa'
          ? asNew
            ? 'پروفایل جدید مستقیم روی هارد ذخیره شد.'
            : 'تغییرات پروفایل روی هارد بروزرسانی شد.'
          : asNew
            ? 'Saved as new profile on local hard drive.'
            : 'Updated profile on local hard drive.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save profile to hard drive');
    } finally {
      setSaving(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    setFeedback(null);
    setImporting(true);
    try {
      await onImportDatabase(file);
      setFeedback(
        lang === 'fa'
          ? 'فایل پشتیبان دیتابیس با موفقیت روی هارد بازیابی شد.'
          : 'Database bundle imported to local hard drive.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to import database file');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-md shadow-lg w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Database className="w-4 h-4 text-blue-600 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900 truncate">
              {lang === 'fa'
                ? 'دیتابیس آفلاین سوییچ‌ها (ذخیره مستقیم روی هارد)'
                : 'Offline Switch Database (Saved on Local Hard Drive)'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Local Disk Storage Path & Offline Export/Import Banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <HardDrive className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
              <div className="min-w-0 space-y-0.5">
                <div className="text-xs font-semibold text-slate-900">
                  {lang === 'fa'
                    ? 'ذخیره‌سازی ۱۰۰٪ آفلاین روی هارد دیسک (بدون نیاز به اینترنت یا لاگین)'
                    : '100% Offline Hard-Drive Storage (No Internet or Login Required)'}
                </div>
                <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-1.5">
                  <span>{lang === 'fa' ? 'مسیر پوشه دیتا:' : 'Data Folder:'}</span>
                  <code
                    dir="ltr"
                    className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[11px] text-slate-800 break-all"
                  >
                    {dataDir || './data'}
                  </code>
                </div>
                <div className="text-[11px] text-slate-500">
                  {lang === 'fa'
                    ? 'پروفایل‌ها، لیست سوییچ‌های SSH و فایل‌های بکاپ (.cfg) به‌صورت خودکار در این پوشه ذخیره می‌شوند.'
                    : 'Switch profiles, SSH fleet inventory, and .cfg backups are persisted directly to this folder.'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onExportDatabase}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{lang === 'fa' ? 'خروجی فایل (.json)' : 'Export DB (.json)'}</span>
              </button>

              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileImport}
                className="hidden"
              />
              <button
                type="button"
                disabled={importing}
                onClick={() => importInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 disabled:opacity-60 border border-slate-300 rounded transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{lang === 'fa' ? 'ورود از فایل' : 'Import DB'}</span>
              </button>
            </div>
          </div>

          {/* Save Current Config Form */}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-slate-900">
                {lang === 'fa'
                  ? 'ذخیره تنظیمات فعلی روی هارد'
                  : 'Save Current Configuration to Disk'}
              </h3>
              <span className="text-[11px] font-mono text-slate-500" dir="ltr">
                {currentConfig.hostname} · {getSwitchModel(currentConfig.modelId, currentConfig.customModel).series} ·{' '}
                {currentConfig.mgmtIp || 'No IP'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {lang === 'fa' ? 'نام پروفایل / سوییچ' : 'Profile Name'}
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  maxLength={100}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                  placeholder={lang === 'fa' ? 'مثلاً: سوییچ طبقه دوم - رک B' : 'e.g. Floor 2 Access Switch'}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {lang === 'fa' ? 'توضیحات / محل نصب (اختیاری)' : 'Notes / Rack Location (Optional)'}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={300}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                  placeholder={lang === 'fa' ? 'مثلاً: دارای ۲۴ پورت PoE برای دوربین‌ها' : 'e.g. Rack A2, 24P PoE+'}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {activeProfile && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSave(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>
                      {lang === 'fa'
                        ? `بروزرسانی «${activeProfile.profileName}»`
                        : `Update "${activeProfile.profileName}"`}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSave(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{lang === 'fa' ? 'ذخیره به عنوان پروفایل جدید' : 'Save as New Profile'}</span>
                </button>
              </div>

              {feedback && <span className="text-xs font-medium text-emerald-700">{feedback}</span>}
              {errorMsg && <span className="text-xs font-medium text-red-600">{errorMsg}</span>}
            </div>
          </div>

          {/* Saved Profiles Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold text-slate-900 tabular-nums">
                {lang === 'fa'
                  ? `پروفایل‌های ذخیره‌شده روی هارد (${profiles.length})`
                  : `Saved Switch Profiles on Disk (${profiles.length})`}
              </h3>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={lang === 'fa' ? 'جستجو در پروفایل‌ها...' : 'Search profiles...'}
                className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white w-52 focus:outline-none focus:border-blue-600"
              />
            </div>

            {filteredProfiles.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded">
                {lang === 'fa'
                  ? 'هنوز تنظیماتی روی هارد ذخیره نکرده‌اید. از فرم بالا اولین پروفایل سوییچ خود را ذخیره کنید.'
                  : 'No switch profiles saved on disk yet. Use the form above to save your first configuration.'}
              </div>
            ) : (
              <div className="border border-slate-200 rounded overflow-hidden divide-y divide-slate-100">
                {filteredProfiles.map((prof) => {
                  const isCurrent = prof.id === activeProfileId;
                  const m = getSwitchModel(prof.modelId, prof.configData?.customModel);
                  return (
                    <div
                      key={prof.id}
                      className={`p-3 flex flex-wrap items-center justify-between gap-3 ${
                        isCurrent ? 'bg-blue-50/70' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {prof.profileName}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-medium text-blue-700">
                              · {lang === 'fa' ? 'در حال ویرایش' : 'Active'}
                            </span>
                          )}
                        </div>
                        <div
                          className="text-[11px] font-mono text-slate-500 mt-0.5 flex flex-wrap items-center gap-2"
                          dir="ltr"
                        >
                          <span>{m.series}</span>
                          <span>·</span>
                          <span>{prof.hostname}</span>
                          {prof.mgmtIp && (
                            <>
                              <span>·</span>
                              <span>{prof.mgmtIp}</span>
                            </>
                          )}
                        </div>
                        {prof.notes && (
                          <div className="text-[11px] text-slate-600 mt-0.5 truncate">{prof.notes}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onLoadProfile(prof);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>{lang === 'fa' ? 'بارگذاری' : 'Load'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteProfile(prof.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                          title={lang === 'fa' ? 'حذف از هارد' : 'Delete from disk'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
