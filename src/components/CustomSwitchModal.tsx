import React, { useState } from 'react';
import { Check, Cpu, Sliders, X } from 'lucide-react';
import { DEFAULT_CUSTOM_MODEL } from '../data/switchModels';
import { CustomModelSpec, Language, OsFamily, PortKind } from '../types/switch';

interface CustomSwitchModalProps {
  initialCustomModel?: CustomModelSpec;
  onApply: (customModel: CustomModelSpec) => void;
  onClose: () => void;
  lang: Language;
}

const COPPER_PREFIX_PRESETS = [
  'FastEthernet0/',
  'GigabitEthernet0/',
  'GigabitEthernet1/0/',
  'GigabitEthernet1/',
  'TenGigabitEthernet1/0/',
];

const UPLINK_PREFIX_PRESETS = [
  'GigabitEthernet0/',
  'GigabitEthernet1/0/',
  'GigabitEthernet1/1/',
  'TenGigabitEthernet1/0/',
  'TenGigabitEthernet1/1/',
  'TwentyFiveGigE1/1/',
];

export const CustomSwitchModal: React.FC<CustomSwitchModalProps> = ({
  initialCustomModel,
  onApply,
  onClose,
  lang,
}) => {
  const [form, setForm] = useState<CustomModelSpec>(() => ({
    ...DEFAULT_CUSTOM_MODEL,
    ...(initialCustomModel || {}),
  }));

  const safeCopperCount = Math.max(1, Math.min(64, Math.round(form.copperCount || 1)));
  const safeUplinkCount = Math.max(0, Math.min(16, Math.round(form.uplinkCount ?? 0)));
  const safeStartIdx = Math.max(1, Math.round(form.uplinkStartIndex || 1));
  const cleanCopperPrefix = form.copperPrefix.trim() || 'GigabitEthernet0/';
  const cleanUplinkPrefix = form.uplinkPrefix.trim() || 'GigabitEthernet0/';

  const applyQuickTemplate = (tpl: '2960g-24' | 'compact-8' | 'access-48-10g') => {
    if (tpl === '2960g-24') {
      setForm({
        name: 'WS-C2960G-24TC-L (Custom)',
        osFamily: 'ios',
        layer3Capable: false,
        poeCapable: false,
        requiresTrunkEncap: false,
        supportsPortfastEdge: false,
        copperCount: 24,
        copperPrefix: 'GigabitEthernet0/',
        uplinkCount: 4,
        uplinkKind: 'sfp',
        uplinkPrefix: 'GigabitEthernet0/',
        uplinkStartIndex: 21,
        defaultBaud: 9600,
      });
    } else if (tpl === 'compact-8') {
      setForm({
        name: 'Compact 8P PoE+ Switch',
        osFamily: 'ios-xe',
        layer3Capable: true,
        poeCapable: true,
        requiresTrunkEncap: false,
        supportsPortfastEdge: true,
        copperCount: 8,
        copperPrefix: 'GigabitEthernet1/0/',
        uplinkCount: 2,
        uplinkKind: 'sfp',
        uplinkPrefix: 'GigabitEthernet1/0/',
        uplinkStartIndex: 9,
        defaultBaud: 9600,
      });
    } else {
      setForm({
        name: 'Custom 48P Access + 4x 10G',
        osFamily: 'ios-xe',
        layer3Capable: true,
        poeCapable: true,
        requiresTrunkEncap: false,
        supportsPortfastEdge: true,
        copperCount: 48,
        copperPrefix: 'GigabitEthernet1/0/',
        uplinkCount: 4,
        uplinkKind: 'sfp-plus',
        uplinkPrefix: 'TenGigabitEthernet1/1/',
        uplinkStartIndex: 1,
        defaultBaud: 9600,
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply({
      ...form,
      name: form.name.trim() || 'Custom Cisco Switch',
      copperCount: safeCopperCount,
      copperPrefix: cleanCopperPrefix,
      uplinkCount: safeUplinkCount,
      uplinkPrefix: cleanUplinkPrefix,
      uplinkStartIndex: safeStartIdx,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-md shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">
              {lang === 'fa'
                ? 'پیکربندی سخت‌افزاری سوییچ کاستوم (Custom Switch)'
                : 'Custom Switch Hardware Builder'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Quick Hardware Starters */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <span className="font-medium text-slate-600">
              {lang === 'fa' ? 'الگوهای آماده سخت‌افزار:' : 'Quick Hardware Presets:'}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => applyQuickTemplate('2960g-24')}
                className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
              >
                Catalyst 2960-G (24P)
              </button>
              <button
                type="button"
                onClick={() => applyQuickTemplate('compact-8')}
                className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
              >
                Compact 8P + 2x SFP
              </button>
              <button
                type="button"
                onClick={() => applyQuickTemplate('access-48-10g')}
                className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
              >
                48P + 4x 10G SFP+
              </button>
            </div>
          </div>

          {/* Identity & OS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                {lang === 'fa' ? 'نام / مدل سوییچ' : 'Custom Model Name'}
              </label>
              <input
                type="text"
                dir="ltr"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                placeholder="WS-C2960G-24TC-L"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                {lang === 'fa' ? 'سیستم‌عامل (OS Family)' : 'OS Family'}
              </label>
              <select
                dir="ltr"
                value={form.osFamily}
                onChange={(e) => {
                  const os = e.target.value as OsFamily;
                  setForm((f) => ({
                    ...f,
                    osFamily: os,
                    supportsPortfastEdge: os === 'ios-xe',
                  }));
                }}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
              >
                <option value="ios">Cisco IOS (Classic)</option>
                <option value="ios-xe">Cisco IOS-XE (Modern)</option>
                <option value="cbs">Cisco Business (CBS)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                {lang === 'fa' ? 'نرخ Baud کنسول' : 'Console Baud Rate'}
              </label>
              <select
                dir="ltr"
                value={form.defaultBaud}
                onChange={(e) => setForm((f) => ({ ...f, defaultBaud: Number(e.target.value) || 9600 }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600 tabular-nums"
              >
                <option value={9600}>9600 (Default)</option>
                <option value={19200}>19200</option>
                <option value={38400}>38400</option>
                <option value={57600}>57600</option>
                <option value={115200}>115200</option>
              </select>
            </div>
          </div>

          {/* Copper Access Ports */}
          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-900">
              {lang === 'fa' ? 'پورت‌های اصلی مس (Access / Copper)' : 'Main Copper Ports'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {lang === 'fa' ? 'تعداد پورت (۱ تا ۶۴)' : 'Copper Port Count (1–64)'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={64}
                    dir="ltr"
                    value={form.copperCount}
                    onChange={(e) => setForm((f) => ({ ...f, copperCount: Number(e.target.value) || 1 }))}
                    className="w-24 px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600 tabular-nums"
                  />
                  <div className="flex items-center gap-1">
                    {[8, 16, 24, 48].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, copperCount: n }))}
                        className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors tabular-nums ${
                          form.copperCount === n
                            ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {lang === 'fa' ? 'پیشوند نام اینترفیس' : 'Interface Name Prefix'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  list="custom-copper-prefixes"
                  value={form.copperPrefix}
                  onChange={(e) => setForm((f) => ({ ...f, copperPrefix: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                  placeholder="GigabitEthernet0/"
                />
                <datalist id="custom-copper-prefixes">
                  {COPPER_PREFIX_PRESETS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          {/* Uplink Ports */}
          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-900">
              {lang === 'fa' ? 'پورت‌های آپلینک / فیبر (Uplinks)' : 'Uplink / Fiber Ports'}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {lang === 'fa' ? 'تعداد آپلینک (۰ تا ۱۶)' : 'Uplink Count (0–16)'}
                </label>
                <input
                  type="number"
                  min={0}
                  max={16}
                  dir="ltr"
                  value={form.uplinkCount}
                  onChange={(e) => setForm((f) => ({ ...f, uplinkCount: Math.max(0, Number(e.target.value) || 0) }))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600 tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {lang === 'fa' ? 'نوع آپلینک' : 'Uplink Type'}
                </label>
                <select
                  dir="ltr"
                  value={form.uplinkKind}
                  onChange={(e) => setForm((f) => ({ ...f, uplinkKind: e.target.value as PortKind }))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                >
                  <option value="sfp">SFP (1G Fiber)</option>
                  <option value="sfp-plus">SFP+ (10G Fiber)</option>
                  <option value="copper">Copper RJ45</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {lang === 'fa' ? 'پیشوند آپلینک' : 'Uplink Prefix'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  list="custom-uplink-prefixes"
                  value={form.uplinkPrefix}
                  onChange={(e) => setForm((f) => ({ ...f, uplinkPrefix: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                  placeholder="GigabitEthernet0/"
                />
                <datalist id="custom-uplink-prefixes">
                  {UPLINK_PREFIX_PRESETS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  {lang === 'fa' ? 'شماره شروع پورت' : 'Start Index'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  dir="ltr"
                  value={form.uplinkStartIndex}
                  onChange={(e) => setForm((f) => ({ ...f, uplinkStartIndex: Math.max(1, Number(e.target.value) || 1) }))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600 tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Hardware Capabilities */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <h3 className="text-xs font-semibold text-slate-900">
              {lang === 'fa' ? 'قابلیت‌های سخت‌افزاری و دستورات IOS' : 'Capabilities & IOS Behavior'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.layer3Capable}
                  onChange={(e) => setForm((f) => ({ ...f, layer3Capable: e.target.checked }))}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{lang === 'fa' ? 'پشتیبانی لایه ۳ (ip routing و پورت Routed)' : 'Layer 3 Capable (ip routing & no switchport)'}</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.poeCapable}
                  onChange={(e) => setForm((f) => ({ ...f, poeCapable: e.target.checked }))}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{lang === 'fa' ? 'پشتیبانی از تغذیه PoE / PoE+' : 'PoE / PoE+ Capable'}</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requiresTrunkEncap}
                  onChange={(e) => setForm((f) => ({ ...f, requiresTrunkEncap: e.target.checked }))}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{lang === 'fa' ? 'الزام trunk encapsulation dot1q (مدل‌های 3560/3750)' : 'Require trunk encapsulation dot1q'}</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.supportsPortfastEdge}
                  onChange={(e) => setForm((f) => ({ ...f, supportsPortfastEdge: e.target.checked }))}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{lang === 'fa' ? 'استفاده از spanning-tree portfast edge (IOS-XE)' : 'Use spanning-tree portfast edge'}</span>
              </label>
            </div>
          </div>

          {/* Live Port Naming Preview */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
            <Cpu className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-medium text-slate-700">
              {lang === 'fa' ? 'پیش‌نمایش نام پورت‌ها:' : 'Port Naming Preview:'}
            </span>
            <code dir="ltr" className="font-mono text-slate-800 tabular-nums">
              {cleanCopperPrefix}1 .. {cleanCopperPrefix}
              {safeCopperCount}
              {safeUplinkCount > 0
                ? ` + ${cleanUplinkPrefix}${safeStartIdx} .. ${cleanUplinkPrefix}${safeStartIdx + safeUplinkCount - 1}`
                : ''}
            </code>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors"
          >
            {lang === 'fa' ? 'انصراف' : 'Cancel'}
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{lang === 'fa' ? 'اعمال و ساخت پنل پورت‌ها' : 'Apply & Build Switch Ports'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
