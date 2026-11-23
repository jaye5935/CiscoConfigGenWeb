import React, { useState } from 'react';
import { Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { DEFAULT_HARDENING, HARDENING_STRICT_BASELINE } from '../data/switchModels';
import {
  Language,
  PortConfig,
  PortMode,
  StaticRoute,
  StpMode,
  SwitchConfigState,
  SwitchHardeningConfig,
  SwitchModelSpec,
  VlanConfig,
} from '../types/switch';
import { resolveHardening } from '../utils/iosGenerator';
import { SwitchFaceplate } from './SwitchFaceplate';

export type ConfigSection = 'system' | 'auth' | 'vlans' | 'ports' | 'security';

interface ConfigFormsProps {
  section: ConfigSection;
  config: SwitchConfigState;
  model: SwitchModelSpec;
  onChange: (updater: (prev: SwitchConfigState) => SwitchConfigState) => void;
  selectedPortIds: string[];
  onSelectPorts: (ids: string[]) => void;
  lang: Language;
}

const inputCls =
  'w-full px-2.5 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 text-slate-900 transition-colors';
const monoInputCls = `${inputCls} font-mono text-left`;
const labelCls = 'block text-xs font-medium text-slate-700 mb-1';

export const ConfigForms: React.FC<ConfigFormsProps> = ({
  section,
  config,
  model,
  onChange,
  selectedPortIds,
  onSelectPorts,
  lang,
}) => {
  const [newVlanId, setNewVlanId] = useState('40');
  const [newVlanName, setNewVlanName] = useState('GUEST_WIFI');

  const [newRouteNet, setNewRouteNet] = useState('10.20.0.0');
  const [newRouteMask, setNewRouteMask] = useState('255.255.0.0');
  const [newRouteHop, setNewRouteHop] = useState('192.168.99.1');
  const [hardeningActionNotice, setHardeningActionNotice] = useState<string | null>(null);

  const updateField = <K extends keyof SwitchConfigState>(key: K, value: SwitchConfigState[K]) => {
    onChange((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddVlan = () => {
    const id = parseInt(newVlanId, 10);
    if (isNaN(id) || id < 2 || id > 4094) return;
    if (config.vlans.some((v) => v.id === id)) return;
    const item: VlanConfig = {
      id,
      name: newVlanName.trim() || `VLAN_${id}`,
      sviEnabled: false,
      sviIp: `10.10.${id > 254 ? 250 : id}.1`,
      sviMask: '255.255.255.0',
    };
    onChange((prev) => ({
      ...prev,
      vlans: [...prev.vlans, item].sort((a, b) => a.id - b.id),
    }));
    setNewVlanId(String(Math.min(4094, id + 10)));
    setNewVlanName('');
  };

  const handleDeleteVlan = (id: number) => {
    onChange((prev) => ({
      ...prev,
      vlans: prev.vlans.filter((v) => v.id !== id),
    }));
  };

  const handleUpdateVlan = (id: number, patch: Partial<VlanConfig>) => {
    onChange((prev) => ({
      ...prev,
      vlans: prev.vlans.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }));
  };

  const handleAddRoute = () => {
    if (!newRouteNet.trim() || !newRouteMask.trim() || !newRouteHop.trim()) return;
    const item: StaticRoute = {
      id: `${Date.now()}`,
      network: newRouteNet.trim(),
      mask: newRouteMask.trim(),
      nextHop: newRouteHop.trim(),
    };
    onChange((prev) => ({
      ...prev,
      staticRoutes: [...prev.staticRoutes, item],
    }));
  };

  // Selected ports inspection
  const selectedPorts = config.ports.filter((p) => selectedPortIds.includes(p.id));
  const primaryPort = selectedPorts[0] || config.ports[0];

  const updateSelectedPorts = (patch: Partial<PortConfig>) => {
    onChange((prev) => ({
      ...prev,
      ports: prev.ports.map((p) => (selectedPortIds.includes(p.id) ? { ...p, ...patch } : p)),
    }));
  };

  if (section === 'system') {
    return (
      <div className="space-y-5">
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 pb-2 border-b border-slate-100">
            {lang === 'fa' ? 'هویت دستگاه و شبکه مدیریت' : 'Device Identity & Management SVI'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{lang === 'fa' ? 'نام میزبان (Hostname)' : 'Hostname'}</label>
              <input
                type="text"
                dir="ltr"
                value={config.hostname}
                onChange={(e) => updateField('hostname', e.target.value)}
                className={monoInputCls}
                placeholder="SW-ACCESS-01"
              />
            </div>
            <div>
              <label className={labelCls}>{lang === 'fa' ? 'نام دامنه (IP Domain Name)' : 'IP Domain Name'}</label>
              <input
                type="text"
                dir="ltr"
                value={config.domainName}
                onChange={(e) => updateField('domainName', e.target.value)}
                className={monoInputCls}
                placeholder="corp.local"
              />
            </div>
            <div>
              <label className={labelCls}>{lang === 'fa' ? 'VLAN مدیریت (Management VLAN)' : 'Management VLAN ID'}</label>
              <select
                dir="ltr"
                value={config.mgmtVlanId}
                onChange={(e) => updateField('mgmtVlanId', Number(e.target.value))}
                className={monoInputCls}
              >
                <option value={1}>VLAN 1 (default)</option>
                {config.vlans.map((v) => (
                  <option key={v.id} value={v.id}>
                    VLAN {v.id} — {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{lang === 'fa' ? 'آدرس IP مدیریت' : 'Management IP Address'}</label>
              <input
                type="text"
                dir="ltr"
                value={config.mgmtIp}
                onChange={(e) => updateField('mgmtIp', e.target.value)}
                className={monoInputCls}
                placeholder="192.168.99.10"
              />
            </div>
            <div>
              <label className={labelCls}>{lang === 'fa' ? 'ماسک شبکه (Subnet Mask)' : 'Subnet Mask'}</label>
              <input
                type="text"
                dir="ltr"
                value={config.mgmtMask}
                onChange={(e) => updateField('mgmtMask', e.target.value)}
                className={monoInputCls}
                placeholder="255.255.255.0"
              />
            </div>
            <div>
              <label className={labelCls}>{lang === 'fa' ? 'دروازه پیش‌فرض (Default Gateway)' : 'Default Gateway'}</label>
              <input
                type="text"
                dir="ltr"
                value={config.defaultGateway}
                onChange={(e) => updateField('defaultGateway', e.target.value)}
                className={monoInputCls}
                placeholder="192.168.99.1"
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 pb-2 border-b border-slate-100">
            {lang === 'fa' ? 'زمان، DNS و بنر ورود' : 'Clock, DNS, NTP & Login Banner'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{lang === 'fa' ? 'سرور DNS' : 'DNS Name Server'}</label>
              <input
                type="text"
                dir="ltr"
                value={config.dnsServer}
                onChange={(e) => updateField('dnsServer', e.target.value)}
                className={monoInputCls}
                placeholder="192.168.99.5"
              />
            </div>
            <div>
              <label className={labelCls}>{lang === 'fa' ? 'سرور زمان (NTP Server)' : 'NTP Server'}</label>
              <input
                type="text"
                dir="ltr"
                value={config.ntpServer}
                onChange={(e) => updateField('ntpServer', e.target.value)}
                className={monoInputCls}
                placeholder="192.168.99.5"
              />
            </div>
            <div>
              <label className={labelCls}>{lang === 'fa' ? 'منطقه زمانی (Timezone)' : 'Clock Timezone'}</label>
              <div className="grid grid-cols-3 gap-2" dir="ltr">
                <input
                  type="text"
                  value={config.timezoneName}
                  onChange={(e) => updateField('timezoneName', e.target.value)}
                  className={monoInputCls}
                  placeholder="IRST"
                />
                <input
                  type="number"
                  value={config.timezoneOffsetHours}
                  onChange={(e) => updateField('timezoneOffsetHours', Number(e.target.value))}
                  className={monoInputCls}
                  title="Hours"
                />
                <input
                  type="number"
                  value={config.timezoneOffsetMinutes}
                  onChange={(e) => updateField('timezoneOffsetMinutes', Number(e.target.value))}
                  className={monoInputCls}
                  title="Minutes"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>{lang === 'fa' ? 'متن بنر هشدار (Banner MOTD)' : 'Banner MOTD'}</label>
              <textarea
                rows={2}
                dir="ltr"
                value={config.bannerMotd}
                onChange={(e) => updateField('bannerMotd', e.target.value)}
                className={monoInputCls}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'auth') {
    return (
      <div className="space-y-5">
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 pb-2 border-b border-slate-100">
            {lang === 'fa' ? 'حساب‌های کاربری و رمزهای دسترسی' : 'Credentials & Privilege Secret'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{lang === 'fa' ? 'رمز Enable Secret' : 'Enable Secret Password'}</label>
              <input
                type="text"
                dir="ltr"
                value={config.enableSecret}
                onChange={(e) => updateField('enableSecret', e.target.value)}
                className={monoInputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{lang === 'fa' ? 'سطح دسترسی ادمین (Privilege)' : 'Admin Privilege Level'}</label>
              <select
                dir="ltr"
                value={config.adminPrivilege}
                onChange={(e) => updateField('adminPrivilege', Number(e.target.value))}
                className={monoInputCls}
              >
                <option value={15}>15 (Full Admin)</option>
                <option value={10}>10</option>
                <option value={1}>1 (User)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{lang === 'fa' ? 'نام کاربری ادمین (Local Username)' : 'Admin Username'}</label>
              <input
                type="text"
                dir="ltr"
                value={config.adminUsername}
                onChange={(e) => updateField('adminUsername', e.target.value)}
                className={monoInputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{lang === 'fa' ? 'رمز عبور ادمین' : 'Admin Password'}</label>
              <input
                type="text"
                dir="ltr"
                value={config.adminPassword}
                onChange={(e) => updateField('adminPassword', e.target.value)}
                className={monoInputCls}
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 pb-2 border-b border-slate-100">
            {lang === 'fa' ? 'پیکربندی SSHv2، کنسول و VTY' : 'SSHv2, Console & VTY Line Security'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enableSsh}
                onChange={(e) => updateField('enableSsh', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              <span>{lang === 'fa' ? 'فعال‌سازی SSH و تولید کلید RSA' : 'Enable SSH & Generate RSA Keys'}</span>
            </label>

            <div>
              <label className={labelCls}>{lang === 'fa' ? 'طول کلید رمزنگاری RSA' : 'RSA Key Modulus'}</label>
              <select
                dir="ltr"
                value={config.rsaModulus}
                disabled={!config.enableSsh}
                onChange={(e) => updateField('rsaModulus', Number(e.target.value) as 1024 | 2048 | 4096)}
                className={monoInputCls}
              >
                <option value={1024}>1024 bit</option>
                <option value={2048}>2048 bit (Recommended)</option>
                <option value={4096}>4096 bit</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>{lang === 'fa' ? 'پروتکل ورودی VTY' : 'VTY Transport Input'}</label>
              <select
                dir="ltr"
                value={config.vtyTransportInput}
                onChange={(e) => updateField('vtyTransportInput', e.target.value as 'ssh' | 'ssh telnet' | 'telnet')}
                className={monoInputCls}
              >
                <option value="ssh">ssh (Secure)</option>
                <option value="ssh telnet">ssh telnet</option>
                <option value="telnet">telnet</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>
                {lang === 'fa' ? 'رمز اختصاصی کنسول (خالی = Login Local)' : 'Console Password (empty = login local)'}
              </label>
              <input
                type="text"
                dir="ltr"
                value={config.consolePassword}
                onChange={(e) => updateField('consolePassword', e.target.value)}
                className={monoInputCls}
                placeholder="Optional line con 0 password"
              />
            </div>

            <div>
              <label className={labelCls}>{lang === 'fa' ? 'تایم‌اوت کنسول (دقیقه)' : 'Console Exec-Timeout (min)'}</label>
              <input
                type="number"
                dir="ltr"
                min={0}
                max={120}
                value={config.consoleExecTimeoutMin}
                onChange={(e) => updateField('consoleExecTimeoutMin', Number(e.target.value))}
                className={monoInputCls}
              />
            </div>

            <div>
              <label className={labelCls}>{lang === 'fa' ? 'تایم‌اوت VTY (دقیقه)' : 'VTY Exec-Timeout (min)'}</label>
              <input
                type="number"
                dir="ltr"
                min={0}
                max={120}
                value={config.vtyExecTimeoutMin}
                onChange={(e) => updateField('vtyExecTimeoutMin', Number(e.target.value))}
                className={monoInputCls}
              />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={config.servicePasswordEncryption}
                onChange={(e) => updateField('servicePasswordEncryption', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              <span>service password-encryption</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={config.disableHttpServer}
                onChange={(e) => updateField('disableHttpServer', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              <span>no ip http server</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enableHttpsServer}
                onChange={(e) => updateField('enableHttpsServer', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              <span>ip http secure-server</span>
            </label>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'vlans') {
    return (
      <div className="space-y-5">
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-2 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {lang === 'fa' ? 'جدول VLAN ها و اینترفیس‌های لایه ۳ (SVI)' : 'VLAN Database & Layer 3 SVIs'}
              </h3>
              <p className="text-xs text-slate-500">
                {model.layer3Capable
                  ? lang === 'fa'
                    ? 'این مدل از مسیریابی لایه ۳ و تعریف IP روی هر VLAN پشتیبانی می‌کند.'
                    : 'This model supports Layer 3 SVI routing.'
                  : lang === 'fa'
                    ? 'این مدل لایه ۲ است و فقط یک IP برای VLAN مدیریت فعال می‌شود.'
                    : 'This model is Layer 2 only; only the management SVI carries an IP.'}
              </p>
            </div>

            {model.layer3Capable && (
              <label className="flex items-center gap-2 text-xs font-medium text-slate-800 bg-slate-100 px-3 py-1.5 rounded border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.ipRoutingEnabled}
                  onChange={(e) => updateField('ipRoutingEnabled', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600"
                />
                <span className="font-mono">ip routing</span>
              </label>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                  <th className="py-2 px-2.5 text-start font-medium">VLAN ID</th>
                  <th className="py-2 px-2.5 text-start font-medium">{lang === 'fa' ? 'نام VLAN' : 'Name'}</th>
                  {model.layer3Capable && config.ipRoutingEnabled && (
                    <>
                      <th className="py-2 px-2.5 text-start font-medium">SVI</th>
                      <th className="py-2 px-2.5 text-start font-medium">SVI IP / Mask</th>
                      <th className="py-2 px-2.5 text-start font-medium">DHCP Helper</th>
                    </>
                  )}
                  <th className="py-2 px-2.5 text-end font-medium">{lang === 'fa' ? 'حذف' : 'Del'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {config.vlans.map((vlan) => (
                  <tr key={vlan.id} className="hover:bg-slate-50/70">
                    <td className="py-2 px-2.5 font-mono font-semibold text-slate-800 tabular-nums">{vlan.id}</td>
                    <td className="py-2 px-2.5">
                      <input
                        type="text"
                        dir="ltr"
                        value={vlan.name}
                        onChange={(e) => handleUpdateVlan(vlan.id, { name: e.target.value })}
                        className="w-full px-2 py-1 text-xs font-mono border border-slate-200 rounded focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    {model.layer3Capable && config.ipRoutingEnabled && (
                      <>
                        <td className="py-2 px-2.5">
                          <input
                            type="checkbox"
                            checked={!!vlan.sviEnabled}
                            onChange={(e) => handleUpdateVlan(vlan.id, { sviEnabled: e.target.checked })}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600"
                          />
                        </td>
                        <td className="py-2 px-2.5">
                          <div className="flex gap-1.5" dir="ltr">
                            <input
                              type="text"
                              disabled={!vlan.sviEnabled}
                              value={vlan.sviIp || ''}
                              onChange={(e) => handleUpdateVlan(vlan.id, { sviIp: e.target.value })}
                              className="w-28 px-2 py-1 text-xs font-mono border border-slate-200 rounded disabled:bg-slate-100"
                              placeholder="10.10.10.1"
                            />
                            <input
                              type="text"
                              disabled={!vlan.sviEnabled}
                              value={vlan.sviMask || ''}
                              onChange={(e) => handleUpdateVlan(vlan.id, { sviMask: e.target.value })}
                              className="w-28 px-2 py-1 text-xs font-mono border border-slate-200 rounded disabled:bg-slate-100"
                              placeholder="255.255.255.0"
                            />
                          </div>
                        </td>
                        <td className="py-2 px-2.5">
                          <input
                            type="text"
                            dir="ltr"
                            disabled={!vlan.sviEnabled}
                            value={vlan.helperAddress || ''}
                            onChange={(e) => handleUpdateVlan(vlan.id, { helperAddress: e.target.value })}
                            className="w-28 px-2 py-1 text-xs font-mono border border-slate-200 rounded disabled:bg-slate-100"
                            placeholder="10.10.1.50"
                          />
                        </td>
                      </>
                    )}
                    <td className="py-2 px-2.5 text-end">
                      <button
                        type="button"
                        onClick={() => handleDeleteVlan(vlan.id)}
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                        title={lang === 'fa' ? 'حذف VLAN' : 'Remove VLAN'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-end gap-2">
            <div className="w-24">
              <label className={labelCls}>VLAN ID</label>
              <input
                type="number"
                dir="ltr"
                min={2}
                max={4094}
                value={newVlanId}
                onChange={(e) => setNewVlanId(e.target.value)}
                className={monoInputCls}
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className={labelCls}>{lang === 'fa' ? 'نام VLAN جدید' : 'New VLAN Name'}</label>
              <input
                type="text"
                dir="ltr"
                value={newVlanName}
                onChange={(e) => setNewVlanName(e.target.value)}
                className={monoInputCls}
                placeholder="GUEST_WIFI"
              />
            </div>
            <button
              type="button"
              onClick={handleAddVlan}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === 'fa' ? 'افزودن VLAN' : 'Add VLAN'}</span>
            </button>
          </div>
        </div>

        {model.layer3Capable && config.ipRoutingEnabled && (
          <div className="bg-white border border-slate-200 rounded-md p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 pb-2 border-b border-slate-100">
              {lang === 'fa' ? 'مسیرهای ایستا (Static Routes)' : 'Static IP Routes'}
            </h3>
            {config.staticRoutes.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {config.staticRoutes.map((r) => (
                  <div
                    key={r.id}
                    dir="ltr"
                    className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono"
                  >
                    <span>
                      ip route {r.network} {r.mask} {r.nextHop}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onChange((prev) => ({
                          ...prev,
                          staticRoutes: prev.staticRoutes.filter((item) => item.id !== r.id),
                        }))
                      }
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end" dir="ltr">
              <div>
                <label className={labelCls}>Network</label>
                <input
                  type="text"
                  value={newRouteNet}
                  onChange={(e) => setNewRouteNet(e.target.value)}
                  className={monoInputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Mask</label>
                <input
                  type="text"
                  value={newRouteMask}
                  onChange={(e) => setNewRouteMask(e.target.value)}
                  className={monoInputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Next-Hop</label>
                <input
                  type="text"
                  value={newRouteHop}
                  onChange={(e) => setNewRouteHop(e.target.value)}
                  className={monoInputCls}
                />
              </div>
              <button
                type="button"
                onClick={handleAddRoute}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 rounded transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Route</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (section === 'ports') {
    return (
      <div className="space-y-4">
        <SwitchFaceplate
          model={model}
          ports={config.ports}
          selectedPortIds={selectedPortIds}
          onSelectPorts={onSelectPorts}
          lang={lang}
          hostname={config.hostname}
        />

        {primaryPort && (
          <div className="bg-white border border-slate-200 rounded-md p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {selectedPorts.length > 1
                    ? lang === 'fa'
                      ? `ویرایش گروهی ${selectedPorts.length} پورت انتخاب شده`
                      : `Bulk Edit ${selectedPorts.length} Selected Ports`
                    : lang === 'fa'
                      ? `پیکربندی پورت ${primaryPort.interfaceName}`
                      : `Port Settings: ${primaryPort.interfaceName}`}
                </h3>
                <p className="text-xs font-mono text-slate-500 mt-0.5" dir="ltr">
                  {selectedPorts.map((p) => p.shortName).join(', ')}
                </p>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded">
                {(['access', 'trunk', ...(model.layer3Capable ? ['routed'] : []), 'shutdown'] as PortMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updateSelectedPorts({ mode: m })}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      primaryPort.mode === m
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {m === 'access'
                      ? 'Access'
                      : m === 'trunk'
                        ? 'Trunk'
                        : m === 'routed'
                          ? 'Routed L3'
                          : 'Shutdown'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className={labelCls}>{lang === 'fa' ? 'توضیحات پورت (Description)' : 'Interface Description'}</label>
                <input
                  type="text"
                  dir="ltr"
                  value={primaryPort.description}
                  onChange={(e) => updateSelectedPorts({ description: e.target.value })}
                  className={monoInputCls}
                  placeholder="Workstation / IP Phone / Uplink"
                />
              </div>

              {primaryPort.mode === 'access' && (
                <>
                  <div>
                    <label className={labelCls}>{lang === 'fa' ? 'Access VLAN' : 'Access VLAN'}</label>
                    <select
                      dir="ltr"
                      value={primaryPort.accessVlan}
                      onChange={(e) => updateSelectedPorts({ accessVlan: Number(e.target.value) })}
                      className={monoInputCls}
                    >
                      <option value={1}>1 (default)</option>
                      {config.vlans.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.id} — {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{lang === 'fa' ? 'Voice VLAN (تلفن ویپ)' : 'Voice VLAN (Optional)'}</label>
                    <select
                      dir="ltr"
                      value={primaryPort.voiceVlan ?? ''}
                      onChange={(e) =>
                        updateSelectedPorts({ voiceVlan: e.target.value ? Number(e.target.value) : undefined })
                      }
                      className={monoInputCls}
                    >
                      <option value="">None</option>
                      {config.vlans.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.id} — {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{lang === 'fa' ? 'محدودیت Storm Control (%)' : 'Broadcast Storm Control (%)'}</label>
                    <input
                      type="number"
                      dir="ltr"
                      min={0}
                      max={100}
                      value={primaryPort.stormControlBroadcast ?? 0}
                      onChange={(e) => updateSelectedPorts({ stormControlBroadcast: Number(e.target.value) })}
                      className={monoInputCls}
                    />
                  </div>
                </>
              )}

              {primaryPort.mode === 'trunk' && (
                <>
                  <div>
                    <label className={labelCls}>{lang === 'fa' ? 'Native VLAN' : 'Native VLAN'}</label>
                    <input
                      type="number"
                      dir="ltr"
                      min={1}
                      max={4094}
                      value={primaryPort.nativeVlan}
                      onChange={(e) => updateSelectedPorts({ nativeVlan: Number(e.target.value) })}
                      className={monoInputCls}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>
                      {lang === 'fa' ? 'VLAN های مجاز (Allowed VLANs یا all)' : 'Allowed VLANs (e.g. 10,20,99 or all)'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={primaryPort.allowedVlans}
                      onChange={(e) => updateSelectedPorts({ allowedVlans: e.target.value })}
                      className={monoInputCls}
                      placeholder="10,20,30,99"
                    />
                  </div>
                </>
              )}

              {primaryPort.mode === 'routed' && (
                <>
                  <div>
                    <label className={labelCls}>IP Address</label>
                    <input
                      type="text"
                      dir="ltr"
                      value={primaryPort.routedIp || ''}
                      onChange={(e) => updateSelectedPorts({ routedIp: e.target.value })}
                      className={monoInputCls}
                      placeholder="172.16.1.1"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Subnet Mask</label>
                    <input
                      type="text"
                      dir="ltr"
                      value={primaryPort.routedMask || ''}
                      onChange={(e) => updateSelectedPorts({ routedMask: e.target.value })}
                      className={monoInputCls}
                      placeholder="255.255.255.252"
                    />
                  </div>
                </>
              )}

              <div>
                <label className={labelCls}>{lang === 'fa' ? 'سرعت (Speed)' : 'Speed'}</label>
                <select
                  dir="ltr"
                  value={primaryPort.speed}
                  onChange={(e) => updateSelectedPorts({ speed: e.target.value as PortConfig['speed'] })}
                  className={monoInputCls}
                >
                  <option value="auto">auto</option>
                  <option value="10">10</option>
                  <option value="100">100</option>
                  <option value="1000">1000</option>
                  <option value="10000">10000</option>
                </select>
              </div>
            </div>

            {primaryPort.mode !== 'shutdown' && (
              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-5 items-center">
                {primaryPort.mode === 'access' && (
                  <>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={primaryPort.portfast}
                        onChange={(e) => updateSelectedPorts({ portfast: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600"
                      />
                      <span>Spanning-Tree PortFast</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={primaryPort.bpduGuard}
                        onChange={(e) => updateSelectedPorts({ bpduGuard: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600"
                      />
                      <span>BPDU Guard</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={primaryPort.portSecurity}
                        onChange={(e) => updateSelectedPorts({ portSecurity: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600"
                      />
                      <span>Port Security</span>
                    </label>
                    {primaryPort.portSecurity && (
                      <div className="flex items-center gap-2 text-xs" dir="ltr">
                        <span className="text-slate-500">Max MAC:</span>
                        <input
                          type="number"
                          min={1}
                          max={64}
                          value={primaryPort.maxMac}
                          onChange={(e) => updateSelectedPorts({ maxMac: Number(e.target.value) })}
                          className="w-14 px-2 py-0.5 border border-slate-300 rounded font-mono"
                        />
                        <select
                          value={primaryPort.violationMode}
                          onChange={(e) =>
                            updateSelectedPorts({ violationMode: e.target.value as PortConfig['violationMode'] })
                          }
                          className="px-2 py-0.5 border border-slate-300 rounded font-mono"
                        >
                          <option value="restrict">restrict</option>
                          <option value="shutdown">shutdown</option>
                          <option value="protect">protect</option>
                        </select>
                      </div>
                    )}
                  </>
                )}

                {primaryPort.mode === 'trunk' && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!primaryPort.dhcpSnoopingTrust}
                      onChange={(e) => updateSelectedPorts({ dhcpSnoopingTrust: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600"
                    />
                    <span>DHCP Snooping Trust</span>
                  </label>
                )}

                {model.poeCapable && primaryPort.kind === 'copper' && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={primaryPort.poeEnabled}
                      onChange={(e) => updateSelectedPorts({ poeEnabled: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600"
                    />
                    <span>{lang === 'fa' ? 'تغذیه PoE فعال' : 'PoE Inline Power'}</span>
                  </label>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // section === 'security'
  const hardening = resolveHardening(config.hardening);

  const updateHardening = <K extends keyof SwitchHardeningConfig>(
    key: K,
    value: SwitchHardeningConfig[K]
  ) => {
    onChange((prev) => ({
      ...prev,
      hardening: {
        ...resolveHardening(prev.hardening),
        [key]: value,
      },
    }));
  };

  const hardeningChecks = [
    hardening.disableUnusedServices,
    hardening.disableBootpAndSourceRoute,
    hardening.enableTcpKeepalives,
    hardening.enableTimestampsLogging,
    hardening.limitConsoleLogging,
    hardening.enableAaaNewModel,
    hardening.minPasswordLength >= 8,
    hardening.enableLoginBruteForceBlock,
    hardening.sshSourceVlanEnabled,
    hardening.vtyAclEnabled && !!hardening.vtyAllowedSubnet.trim(),
    hardening.globalBpduGuardDefault,
    hardening.disableDtpNegotiation,
    hardening.hardenSviInterfaces,
    hardening.shutdownVlan1Interface,
    config.vtyTransportInput === 'ssh' && config.enableSsh && config.disableHttpServer,
  ];
  const activeHardeningCount = hardeningChecks.filter(Boolean).length;

  const applyStrictHardeningBaseline = () => {
    onChange((prev) => ({
      ...prev,
      servicePasswordEncryption: true,
      disableHttpServer: true,
      enableHttpsServer: false,
      enableSsh: true,
      sshVersion: 2,
      rsaModulus: Math.max(2048, prev.rsaModulus) as 2048 | 4096,
      vtyTransportInput: 'ssh',
      cdpEnabled: false,
      errdisableRecovery: true,
      dhcpSnoopingEnabled: true,
      hardening: { ...HARDENING_STRICT_BASELINE },
    }));
    setHardeningActionNotice(
      lang === 'fa'
        ? 'پروفایل هاردینگ کامل (CIS Baseline) اعمال شد.'
        : 'Full CIS Hardening Baseline applied.'
    );
    setTimeout(() => setHardeningActionNotice(null), 3000);
  };

  const applyAccessPortsHardening = () => {
    const count = config.ports.filter((p) => p.kind === 'copper' && p.mode === 'access').length;
    onChange((prev) => ({
      ...prev,
      ports: prev.ports.map((p) => {
        if (p.kind === 'copper' && p.mode === 'access') {
          return {
            ...p,
            portfast: true,
            bpduGuard: true,
            portSecurity: true,
            maxMac: Math.min(p.maxMac || 2, 3),
            violationMode: 'restrict',
            stormControlBroadcast: p.stormControlBroadcast || 40,
          };
        }
        return p;
      }),
    }));
    setHardeningActionNotice(
      lang === 'fa'
        ? `هاردینگ لایه ۲ روی ${count} پورت Access اعمال شد.`
        : `Hardened ${count} access ports (PortFast, BPDU Guard, Port-Security).`
    );
    setTimeout(() => setHardeningActionNotice(null), 3000);
  };

  const lockdownDefaultVlan1Ports = () => {
    const lockedCount = config.ports.filter(
      (p) => p.kind === 'copper' && p.mode === 'access' && p.accessVlan === 1
    ).length;
    onChange((prev) => {
      const hasBlackhole = prev.vlans.some((v) => v.id === 999);
      const nextVlans = hasBlackhole
        ? prev.vlans
        : [...prev.vlans, { id: 999, name: 'BLACKHOLE_UNUSED' }];
      return {
        ...prev,
        vlans: nextVlans,
        ports: prev.ports.map((p) => {
          if (p.kind === 'copper' && p.mode === 'access' && p.accessVlan === 1) {
            return {
              ...p,
              mode: 'shutdown',
              accessVlan: 999,
              poeEnabled: false,
              description: p.description || 'UNUSED_SHUTDOWN',
            };
          }
          return p;
        }),
      };
    });
    setHardeningActionNotice(
      lockedCount > 0
        ? lang === 'fa'
          ? `${lockedCount} پورت بلااستفاده (VLAN 1) به VLAN 999 منتقل و Shutdown شد.`
          : `Moved ${lockedCount} unused VLAN 1 ports to VLAN 999 and shut down.`
        : lang === 'fa'
          ? 'پورت فعالی روی VLAN 1 پیدا نشد.'
          : 'No active ports found on VLAN 1.'
    );
    setTimeout(() => setHardeningActionNotice(null), 3000);
  };

  return (
    <div className="space-y-5">
      {/* Cisco Switch Hardening Panel */}
      <div className="bg-white border border-slate-200 rounded-md p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <h3 className="text-sm font-semibold text-slate-900">
                {lang === 'fa'
                  ? 'هاردینگ امنیتی سوییچ (Cisco IOS Hardening)'
                  : 'Cisco Switch Security Hardening'}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {lang === 'fa'
                ? `${activeHardeningCount} از ${hardeningChecks.length} کنترل امنیتی استاندارد فعال است.`
                : `${activeHardeningCount} of ${hardeningChecks.length} baseline hardening controls enabled.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applyStrictHardeningBaseline}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded transition-colors whitespace-nowrap shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                {lang === 'fa' ? 'اعمال هاردینگ کامل (CIS)' : 'Apply Full CIS Hardening'}
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                onChange((prev) => ({
                  ...prev,
                  hardening: { ...DEFAULT_HARDENING },
                }))
              }
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
            >
              {lang === 'fa' ? 'حالت استاندارد' : 'Default Preset'}
            </button>
          </div>
        </div>

        {hardeningActionNotice && (
          <div className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
            {hardeningActionNotice}
          </div>
        )}

        {/* Group A: Control Plane & Services */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold text-slate-800">
            {lang === 'fa'
              ? 'الف) سخت‌سازی سرویس‌ها و Control Plane'
              : 'A) Control Plane & Unused Services'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.disableUnusedServices}
                onChange={(e) => updateHardening('disableUnusedServices', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <span>
                {lang === 'fa'
                  ? 'بستن سرویس‌های غیرضروری (finger, pad, small-servers)'
                  : 'Disable small-servers, finger & PAD services'}
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.disableBootpAndSourceRoute}
                onChange={(e) => updateHardening('disableBootpAndSourceRoute', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <span>
                {lang === 'fa'
                  ? 'غیرفعال‌سازی BOOTP، Source-Route و Gratuitous ARP'
                  : 'Disable BOOTP server, IP source-route & gratuitous-arps'}
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.enableTcpKeepalives}
                onChange={(e) => updateHardening('enableTcpKeepalives', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <span>
                {lang === 'fa'
                  ? 'فعال‌سازی TCP Keepalives ورودی/خروجی (پاک‌سازی VTY معلق)'
                  : 'Enable TCP keepalives-in/out for stale sessions'}
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.enableTimestampsLogging}
                onChange={(e) => updateHardening('enableTimestampsLogging', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <span>
                {lang === 'fa'
                  ? 'ثبت زمان دقیق میلی‌ثانیه روی لاگ‌ها (timestamps msec)'
                  : 'Enable millisecond localtime timestamps on logs'}
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.limitConsoleLogging}
                onChange={(e) => updateHardening('limitConsoleLogging', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <span>
                {lang === 'fa'
                  ? 'محدودسازی لاگ کنسول به warnings (logging console warnings)'
                  : 'Restrict console logging to warnings level'}
              </span>
            </label>
          </div>
        </div>

        {/* Group B: Auth, Brute-Force & VTY ACL */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <h4 className="text-xs font-semibold text-slate-800">
            {lang === 'fa'
              ? 'ب) امنیت ورود، AAA و محدودسازی دسترسی SSH / VTY'
              : 'B) AAA, Brute-Force Protection & VTY ACL'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.enableAaaNewModel}
                onChange={(e) => updateHardening('enableAaaNewModel', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <span>
                {lang === 'fa'
                  ? 'فعال‌سازی aaa new-model (احراز هویت و Exec محلی)'
                  : 'Enable aaa new-model (local login & exec authz)'}
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.enableLoginBruteForceBlock}
                onChange={(e) => updateHardening('enableLoginBruteForceBlock', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <span>
                {lang === 'fa'
                  ? 'ضد Brute-Force (بلاک ۱۲۰s پس از ۳ خطا + لاگ ورود)'
                  : 'Brute-force block (120s on 3 fails + login logs)'}
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.sshSourceVlanEnabled}
                onChange={(e) => updateHardening('sshSourceVlanEnabled', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <span>
                {lang === 'fa'
                  ? `محدودسازی مبدأ SSH به Vlan${config.mgmtVlanId}`
                  : `Bind SSH source-interface to Vlan${config.mgmtVlanId}`}
              </span>
            </label>
            <div className="flex items-center gap-2 text-xs text-slate-700">
              <label className="whitespace-nowrap">
                {lang === 'fa' ? 'حداقل طول رمز عبور:' : 'Min Password Length:'}
              </label>
              <input
                type="number"
                dir="ltr"
                min={0}
                max={32}
                value={hardening.minPasswordLength}
                onChange={(e) =>
                  updateHardening('minPasswordLength', Math.max(0, Math.min(32, Number(e.target.value) || 0)))
                }
                className="w-16 px-2 py-1 text-xs font-mono border border-slate-300 rounded tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center pt-1">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.vtyAclEnabled}
                onChange={(e) => updateHardening('vtyAclEnabled', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              <span>
                {lang === 'fa'
                  ? 'محدودسازی دسترسی SSH/VTY با ACL مدیریت (MGMT_SSH_ONLY)'
                  : 'Restrict VTY SSH via Management ACL (MGMT_SSH_ONLY)'}
              </span>
            </label>
            <input
              type="text"
              dir="ltr"
              disabled={!hardening.vtyAclEnabled}
              value={hardening.vtyAllowedSubnet}
              onChange={(e) => updateHardening('vtyAllowedSubnet', e.target.value)}
              className={monoInputCls}
              placeholder="192.168.99.0 0.0.0.255"
            />
          </div>
        </div>

        {/* Group C: Layer 2, SVI & Bulk Port Hardening */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <h4 className="text-xs font-semibold text-slate-800">
            {lang === 'fa'
              ? 'ج) هاردینگ لایه ۲، SVI و پورت‌های بلااستفاده'
              : 'C) Layer 2, SVI & Port Lockdown Hardening'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.globalBpduGuardDefault}
                onChange={(e) => updateHardening('globalBpduGuardDefault', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <span>
                {lang === 'fa'
                  ? 'فعال‌سازی سراسری BPDU Guard Default'
                  : 'Global spanning-tree portfast bpduguard default'}
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.disableDtpNegotiation}
                onChange={(e) => updateHardening('disableDtpNegotiation', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <span>
                {lang === 'fa'
                  ? 'غیرفعال‌سازی DTP روی پورت‌ها (switchport nonegotiate)'
                  : 'Disable DTP negotiation (switchport nonegotiate)'}
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.hardenSviInterfaces}
                onChange={(e) => updateHardening('hardenSviInterfaces', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <span>
                {lang === 'fa'
                  ? 'بستن Redirect / Proxy-ARP / Unreachables روی SVIها'
                  : 'Disable ip redirects, proxy-arp & unreachables on SVIs'}
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hardening.shutdownVlan1Interface}
                onChange={(e) => updateHardening('shutdownVlan1Interface', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <span>
                {lang === 'fa'
                  ? 'خاموش کردن و بدون IP کردن interface Vlan1 (مناسب کابل کنسول)'
                  : 'Shutdown & strip IP from interface Vlan1 (Console Cable safe)'}
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={applyAccessPortsHardening}
              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
            >
              {lang === 'fa'
                ? 'ایمن‌سازی همه پورت‌های Access (PortFast + BPDU Guard + Port-Security)'
                : 'Harden All Access Ports (PortFast + BPDU Guard + Port-Security)'}
            </button>
            <button
              type="button"
              onClick={lockdownDefaultVlan1Ports}
              className="px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors"
            >
              {lang === 'fa'
                ? 'انتقال پورت‌های VLAN 1 به VLAN 999 و Shutdown'
                : 'Lock Down Unused VLAN 1 Ports (VLAN 999 + Shutdown)'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-md p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 pb-2 border-b border-slate-100">
          {lang === 'fa' ? 'پروتکل Spanning-Tree و امنیت لایه ۲' : 'Spanning-Tree & Layer 2 Protection'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Spanning-Tree Mode</label>
            <select
              dir="ltr"
              value={config.stpMode}
              onChange={(e) => updateField('stpMode', e.target.value as StpMode)}
              className={monoInputCls}
            >
              <option value="rapid-pvst">rapid-pvst (Recommended)</option>
              <option value="pvst">pvst</option>
              <option value="mst">mst</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{lang === 'fa' ? 'اولویت Bridge (Root Priority)' : 'Bridge Priority'}</label>
            <select
              dir="ltr"
              disabled={!config.stpRootPrimary}
              value={config.stpPriority}
              onChange={(e) => updateField('stpPriority', Number(e.target.value))}
              className={monoInputCls}
            >
              <option value={4096}>4096 (Primary Root)</option>
              <option value={8192}>8192 (Secondary Root)</option>
              <option value={24576}>24576</option>
              <option value={32768}>32768 (Default)</option>
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.stpRootPrimary}
              onChange={(e) => updateField('stpRootPrimary', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600"
            />
            <span>{lang === 'fa' ? 'تنظیم دستی اولویت STP Priority' : 'Set explicit STP Priority'}</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.errdisableRecovery}
              onChange={(e) => updateField('errdisableRecovery', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600"
            />
            <span>{lang === 'fa' ? 'بازیابی خودکار پورت Errdisable (300s)' : 'Auto Errdisable Recovery (300s)'}</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.cdpEnabled}
              onChange={(e) => updateField('cdpEnabled', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600"
            />
            <span>Cisco Discovery Protocol (CDP)</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.lldpEnabled}
              onChange={(e) => updateField('lldpEnabled', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600"
            />
            <span>LLDP (Link Layer Discovery Protocol)</span>
          </label>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-800 mb-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.dhcpSnoopingEnabled}
                onChange={(e) => updateField('dhcpSnoopingEnabled', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              <span>IP DHCP Snooping</span>
            </label>
            <input
              type="text"
              dir="ltr"
              disabled={!config.dhcpSnoopingEnabled}
              value={config.dhcpSnoopingVlans}
              onChange={(e) => updateField('dhcpSnoopingVlans', e.target.value)}
              className={monoInputCls}
              placeholder="10,20,30"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-800 mb-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config.arpInspectionEnabled}
                onChange={(e) => updateField('arpInspectionEnabled', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              <span>Dynamic ARP Inspection (DAI)</span>
            </label>
            <input
              type="text"
              dir="ltr"
              disabled={!config.arpInspectionEnabled}
              value={config.arpInspectionVlans}
              onChange={(e) => updateField('arpInspectionVlans', e.target.value)}
              className={monoInputCls}
              placeholder="10"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-md p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 pb-2 border-b border-slate-100">
          {lang === 'fa' ? 'مانیتورینگ Syslog و SNMP' : 'Syslog & SNMP Monitoring'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{lang === 'fa' ? 'آدرس سرور Syslog' : 'Syslog Host IP'}</label>
            <input
              type="text"
              dir="ltr"
              value={config.syslogServer}
              onChange={(e) => updateField('syslogServer', e.target.value)}
              className={monoInputCls}
              placeholder="192.168.99.20"
            />
          </div>
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={config.snmpEnabled}
                onChange={(e) => updateField('snmpEnabled', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              <span>{lang === 'fa' ? 'فعال‌سازی SNMPv2c Read-Only' : 'Enable SNMPv2c Read-Only'}</span>
            </label>
          </div>
          {config.snmpEnabled && (
            <>
              <div>
                <label className={labelCls}>Community String (RO)</label>
                <input
                  type="text"
                  dir="ltr"
                  value={config.snmpCommunityRo}
                  onChange={(e) => updateField('snmpCommunityRo', e.target.value)}
                  className={monoInputCls}
                />
              </div>
              <div>
                <label className={labelCls}>SNMP Location</label>
                <input
                  type="text"
                  dir="ltr"
                  value={config.snmpLocation}
                  onChange={(e) => updateField('snmpLocation', e.target.value)}
                  className={monoInputCls}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
