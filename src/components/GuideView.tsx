import React, { useState } from 'react';
import {
  Activity,
  BookOpen,
  Cable,
  Check,
  Copy,
  Database,
  HardDrive,
  Laptop,
  Network,
  Server,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import { Language } from '../types/switch';

type GuideSectionId = 'all' | 'prereq' | 'configurator' | 'serial' | 'ssh' | 'storage' | 'troubleshoot';

interface GuideViewProps {
  lang: Language;
  dataDir: string;
  onNavigate: (view: 'configurator' | 'fleet', opts?: { section?: 'system' | 'ports'; pane?: 'cli' | 'console' }) => void;
}

export const GuideView: React.FC<GuideViewProps> = ({ lang, dataDir, onNavigate }) => {
  const [activeChapter, setActiveChapter] = useState<GuideSectionId>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const chapters: { id: GuideSectionId; labelFa: string; labelEn: string; icon: React.ReactNode }[] = [
    {
      id: 'all',
      labelFa: 'همه بخش‌های راهنما',
      labelEn: 'All Guide Chapters',
      icon: <BookOpen className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'prereq',
      labelFa: '۱. نرم‌افزارهای پیش‌نیاز',
      labelEn: '1. Software Prerequisites',
      icon: <Laptop className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'configurator',
      labelFa: '۲. مولد کانفیگ سوییچ',
      labelEn: '2. Config Generator',
      icon: <Network className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'serial',
      labelFa: '۳. کابل کنسول USB / RS232',
      labelEn: '3. USB / RS232 Console',
      icon: <Cable className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'ssh',
      labelFa: '۴. داشبورد SSH و پورت‌ها',
      labelEn: '4. SSH Fleet & Port Monitor',
      icon: <Activity className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'storage',
      labelFa: '۵. دیتابیس هارد و بکاپ',
      labelEn: '5. Local Disk DB & Backups',
      icon: <Database className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'troubleshoot',
      labelFa: '۶. عیب‌یابی سریع',
      labelEn: '6. Troubleshooting',
      icon: <ShieldAlert className="w-4 h-4 shrink-0" />,
    },
  ];

  const showSection = (id: Exclude<GuideSectionId, 'all'>) =>
    activeChapter === 'all' || activeChapter === id;

  const localRunCommands = `npm install\nnpm run dev`;
  const productionRunCommands = `npm install\nnpm run build\nnpm start`;
  const ciscoSshPrepCommands = `configure terminal
hostname SW-ACCESS-01
ip domain-name lab.local
crypto key generate rsa modulus 2048
username netadmin privilege 15 secret StrongPass!23
ip ssh version 2
line vty 0 15
 login local
 transport input ssh
end
write memory`;

  const prerequisites = [
    {
      nameFa: 'مرورگر Google Chrome یا Microsoft Edge (نسخه ۸۹ به بالا)',
      nameEn: 'Google Chrome or Microsoft Edge (v89+)',
      categoryFa: 'اجباری برای کابل کنسول USB / RS232',
      categoryEn: 'Required for USB / RS232 Web Serial',
      detailsFa:
        'ارتباط مستقیم با پورت COM بدون نیاز به PuTTY از طریق فناوری Web Serial API انجام می‌شود که فقط در مرورگرهای مبتنی بر Chromium (Chrome، Edge، Brave، Opera) فعال است. مرورگرهای Firefox و Safari از پورت سریال پشتیبانی نمی‌کنند.',
      detailsEn:
        'Direct browser-to-COM communication uses the Web Serial API, supported only in Chromium-based browsers (Chrome, Edge, Brave). Firefox and Safari do not support Web Serial.',
    },
    {
      nameFa: 'درایور کابل USB به Serial (FTDI / PL2303 / CH340 / CP2102)',
      nameEn: 'USB-to-Serial Console Cable Drivers',
      categoryFa: 'اجباری در ویندوز برای شناسایی کابل کنسول',
      categoryEn: 'Required on Windows for Console Cable',
      detailsFa:
        'در ویندوز ۱۰/۱۱ پس از اتصال کابل کنسول آبی‌رنگ سیسکو یا کابل Mini-USB/Type-C، پورت باید در Device Manager زیر بخش Ports (COM & LPT) بدون علامت زرد ظاهر شود. چیپست‌های FTDI FT232R، Silicon Labs CP2102 (در Catalyst 9200/9300)، WCH CH340 و Prolific PL2303GC پایدارترین عملکرد را دارند.',
      detailsEn:
        'After plugging in your Cisco RJ45 console or Mini-USB/USB-C cable, verify a COM port appears under Device Manager -> Ports (COM & LPT). FTDI FT232R, Silicon Labs CP2102 (built into Catalyst 9200/9300), WCH CH340, and Prolific PL2303GC are recommended.',
    },
    {
      nameFa: 'Node.js (نسخه ۲۰ یا ۲۲ LTS)',
      nameEn: 'Node.js (v20 or v22 LTS)',
      categoryFa: 'اجباری برای اجرای آفلاین، SSH و ذخیره روی هارد',
      categoryEn: 'Required for Offline Server, SSH & Local Disk DB',
      detailsFa:
        'به دلیل محدودیت امنیتی مرورگرها در باز کردن سوکت خام TCP، ارتباط واقعی SSHv2 با سوییچ‌ها و ذخیره‌سازی مستقیم پروفایل‌ها و فایل‌های .cfg روی هارد دیسک از طریق سرویس محلی Node.js انجام می‌شود.',
      detailsEn:
        'Browsers cannot open raw TCP sockets directly. The local Node.js backend handles real SSHv2 connections to Cisco switches and atomic read/write persistence to your local hard drive.',
    },
    {
      nameFa: 'دسترسی شبکه و فعال بودن SSHv2 روی سوییچ سیسکو',
      nameEn: 'Network Reachability & Cisco IOS SSHv2',
      categoryFa: 'پیش‌نیاز بخش داشبورد SSH و مانیتورینگ پورت',
      categoryEn: 'Required for SSH Fleet & Port Monitoring',
      detailsFa:
        'روی سوییچ مقصد باید IP مدیریتی (SVI)، نام دامنه، کلید RSA (حداقل ۱۰۲۴ یا ۲۰۴۸ بیت)، اکانت Privilege 15 و transport input ssh روی line vty فعال باشد. موتور SSH برنامه هم سوییچ‌های مدرن IOS-XE و هم Catalyst های قدیمی (2960/3560/3750) را پشتیبانی می‌کند.',
      detailsEn:
        'Target switches must have a reachable management IP, ip domain-name, RSA keypair, privilege 15 credentials, and transport input ssh on VTY lines. Both modern IOS-XE and legacy Catalyst 2960/3560/3750 SSH ciphers are supported.',
    },
  ];

  const troubleshootingRows = [
    {
      issueFa: 'گزینه «اتصال به پورت COM» خطای عدم پشتیبانی می‌دهد یا پنجره انتخاب پورت باز نمی‌شود',
      issueEn: 'Web Serial shows unsupported or COM picker does not open',
      causeFa: 'استفاده از مرورگر Firefox/Safari یا باز کردن برنامه با آدرس HTTP غیراز localhost',
      causeEn: 'Using Firefox/Safari or accessing over plain HTTP from a remote IP',
      fixFa: 'برنامه را در Google Chrome یا Microsoft Edge با آدرس http://localhost:3000 (یا HTTPS) باز کنید.',
      fixEn: 'Open the app in Chrome or Edge via http://localhost:3000 or HTTPS.',
    },
    {
      issueFa: 'پس از اتصال کابل کنسول، در پنجره مرورگر هیچ پورت COM نمایش داده نمی‌شود',
      issueEn: 'No COM port appears in browser picker after plugging cable',
      causeFa: 'نصب نبودن درایور USB-to-Serial یا اشغال بودن پورت توسط برنامه دیگر مثل PuTTY',
      causeEn: 'Missing USB-to-Serial driver or COM port locked by PuTTY / TeraTerm',
      fixFa: 'PuTTY و SecureCRT را ببندید، Device Manager ویندوز را چک کنید و درایور FTDI/CP2102/CH340 را نصب نمایید.',
      fixEn: 'Close PuTTY/TeraTerm, verify Ports (COM & LPT) in Device Manager, and install FTDI/CP2102/CH340 drivers.',
    },
    {
      issueFa: 'کاراکترهای خروجی کنسول ناخوانا (درهم‌ریخته) هستند',
      issueEn: 'Garbled characters in serial terminal output',
      causeFa: 'ناهماهنگی نرخ Baud Rate با تنظیمات سوییچ',
      causeEn: 'Baud rate mismatch between console settings and switch',
      fixFa: 'سرعت را روی مقدار استاندارد سیسکو یعنی 9600 با تنظیمات 8N1 قرار دهید (در مدل‌های ROMMON ممکن است 115200 باشد).',
      fixEn: 'Set baud rate to Cisco standard 9600 (8N1), or 115200 if changed in ROMMON/line con 0.',
    },
    {
      issueFa: 'اتصال SSH با سوییچ‌های قدیمی Catalyst 2960 / 3560 با خطا مواجه می‌شود',
      issueEn: 'SSH fails on older Catalyst 2960 / 3560 switches',
      causeFa: 'پیشنهاد ناهماهنگ کلید یا تایم‌اوت ورود به Enable Mode',
      causeEn: 'Old IOS RSA/KEX setup or missing enable secret',
      fixFa: 'مطمئن شوید کلید RSA حداقل 1024 بیت روی سوییچ ساخته شده و در صورت نبود privilege 15، فیلد Enable Secret را نیز وارد کنید.',
      fixEn: 'Ensure RSA modulus >= 1024 on IOS and provide the Enable Secret if the user lands at ">" prompt.',
    },
    {
      issueFa: 'بکاپ‌ها یا پروفایل‌های ذخیره شده روی سیستم دیگر در دسترس نیستند',
      issueEn: 'Saved profiles or backups are needed on another PC',
      causeFa: 'ذخیره‌سازی به‌صورت آفلاین در پوشه محلی data انجام می‌شود',
      causeEn: 'Data is persisted locally inside the host data folder',
      fixFa: 'در پنجره «دیتابیس هارد» روی «خروجی فایل (.json)» کلیک کنید یا پوشه data و data/backups را مستقیماً کپی نمایید.',
      fixEn: 'Use "Export DB (.json)" in Local DB modal or copy the local data/ and data/backups/ folders.',
    },
  ];

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
      {/* Left Navigation Sidebar */}
      <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-e border-slate-200 p-3 flex lg:flex-col gap-1 overflow-x-auto shrink-0">
        <div className="hidden lg:block px-2.5 py-1.5 text-[11px] font-semibold text-slate-400">
          {lang === 'fa' ? 'فهرست راهنما' : 'Guide Contents'}
        </div>

        {chapters.map((ch) => {
          const active = activeChapter === ch.id;
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => setActiveChapter(ch.id)}
              className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 text-start ${
                active
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-slate-700 hover:bg-slate-100 border border-transparent'
              }`}
            >
              {ch.icon}
              <span>{lang === 'fa' ? ch.labelFa : ch.labelEn}</span>
            </button>
          );
        })}

        <div className="hidden lg:block mt-auto pt-3 border-t border-slate-100 space-y-2">
          <div className="text-[11px] font-semibold text-slate-500 px-1">
            {lang === 'fa' ? 'دسترسی سریع' : 'Quick Jump'}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('configurator', { section: 'ports', pane: 'cli' })}
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded transition-colors"
          >
            <span>{lang === 'fa' ? 'بازگشت به مولد کانفیگ' : 'Open Configurator'}</span>
            <Network className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('configurator', { pane: 'console' })}
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded transition-colors"
          >
            <span>{lang === 'fa' ? 'باز کردن کنسول سریال/SSH' : 'Open Serial/SSH Console'}</span>
            <Terminal className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('fleet')}
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded transition-colors"
          >
            <span>{lang === 'fa' ? 'داشبورد مانیتورینگ SSH' : 'Open SSH Fleet Dashboard'}</span>
            <Server className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
      </aside>

      {/* Main Guide Content */}
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-5xl mx-auto space-y-5">
          {/* Overview Intro */}
          <section className="bg-white border border-slate-200 rounded-md p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1 max-w-3xl">
                <h1 className="text-base font-bold text-slate-900">
                  {lang === 'fa'
                    ? 'راهنمای جامع CiscoSwitch Studio و پیش‌نیازهای اجرا'
                    : 'CiscoSwitch Studio User Guide & System Prerequisites'}
                </h1>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {lang === 'fa'
                    ? 'این ابزار یک محیط دسکتاپ‌مانند تحت وب برای تولید پیکربندی استاندارد سوییچ‌های سیسکو، بارگذاری مستقیم روی دستگاه با کابل کنسول USB/RS232 یا SSH، مانیتورینگ گرافیکی پورت‌ها و نگهداری آفلاین تنظیمات و بکاپ‌ها روی هارد دیسک است.'
                    : 'A Windows-style web workspace for generating Cisco switch CLI configurations, pushing configs directly via USB/RS232 console cable or SSH, monitoring live switch ports graphically, and storing profiles and .cfg backups offline on your local hard drive.'}
                </p>
              </div>
              <div className="text-[11px] font-mono text-slate-500 tabular-nums whitespace-nowrap" dir="ltr">
                Port 3000 · 9600 8N1 · SSHv2 · Offline Disk DB
              </div>
            </div>
          </section>

          {/* 1. Prerequisites & Software */}
          {showSection('prereq') && (
            <section className="bg-white border border-slate-200 rounded-md overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-blue-600 shrink-0" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    {lang === 'fa'
                      ? '۱. نرم‌افزارها، درایورها و پیش‌نیازهای اجرای برنامه'
                      : '1. Required Software, Drivers & Prerequisites'}
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {lang === 'fa' ? '۴ مورد کلیدی' : '4 Core Requirements'}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {prerequisites.map((item, idx) => (
                  <div key={idx} className="p-4 lg:px-5 space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-xs font-semibold text-slate-900 tabular-nums">
                        {idx + 1}. {lang === 'fa' ? item.nameFa : item.nameEn}
                      </h3>
                      <span className="text-[11px] font-medium text-blue-700">
                        {lang === 'fa' ? item.categoryFa : item.categoryEn}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {lang === 'fa' ? item.detailsFa : item.detailsEn}
                    </p>
                  </div>
                ))}
              </div>

              {/* Offline Local Installation & Execution Commands */}
              <div className="p-4 lg:px-5 bg-slate-50 border-t border-slate-200 space-y-3">
                <h3 className="text-xs font-semibold text-slate-900">
                  {lang === 'fa'
                    ? 'دستورات نصب و اجرای آفلاین روی سیستم شخصی (Windows / Linux / macOS)'
                    : 'Offline Installation & Startup Commands (Windows / Linux / macOS)'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-700">
                        {lang === 'fa' ? 'اجرای سریع (حالت توسعه / مستقیم):' : 'Quick Local Run:'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy('local-run', localRunCommands)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors"
                      >
                        {copiedId === 'local-run' ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedId === 'local-run' ? (lang === 'fa' ? 'کپی شد' : 'Copied') : lang === 'fa' ? 'کپی' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre
                      dir="ltr"
                      className="p-2.5 bg-slate-900 text-slate-100 rounded text-[11px] font-mono overflow-x-auto leading-relaxed"
                    >
                      {localRunCommands}
                    </pre>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-700">
                        {lang === 'fa' ? 'بیلد و اجرای دائمی (Production روی پورت 3000):' : 'Production Build & Start (Port 3000):'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy('prod-run', productionRunCommands)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors"
                      >
                        {copiedId === 'prod-run' ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedId === 'prod-run' ? (lang === 'fa' ? 'کپی شد' : 'Copied') : lang === 'fa' ? 'کپی' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre
                      dir="ltr"
                      className="p-2.5 bg-slate-900 text-slate-100 rounded text-[11px] font-mono overflow-x-auto leading-relaxed"
                    >
                      {productionRunCommands}
                    </pre>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600">
                  {lang === 'fa'
                    ? 'پس از اجرای دستور بالا، آدرس http://localhost:3000 را در مرورگر Chrome یا Edge باز کنید.'
                    : 'Once started, open http://localhost:3000 in Google Chrome or Microsoft Edge.'}
                </p>
              </div>
            </section>
          )}

          {/* 2. Config Generator Guide */}
          {showSection('configurator') && (
            <section className="bg-white border border-slate-200 rounded-md overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-blue-600 shrink-0" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    {lang === 'fa'
                      ? '۲. راهنمای بخش مولد کانفیگ (Configurator)'
                      : '2. Using the Switch Configuration Generator'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('configurator', { section: 'ports', pane: 'cli' })}
                  className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0"
                >
                  {lang === 'fa' ? 'رفتن به مولد کانفیگ' : 'Go to Configurator'}
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs text-slate-700 leading-relaxed">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-slate-900">
                      {lang === 'fa' ? 'مراحل تنظیم سوییچ جدید' : 'Step-by-Step Switch Setup'}
                    </h3>
                    <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
                      <li>
                        {lang === 'fa'
                          ? 'از نوار بالای صفحه، مدل دقیق سوییچ سیسکو (مانند Catalyst 2960-X، 9200L، 9300 یا IE-3300) را انتخاب کنید.'
                          : 'Select your Cisco model from the top ribbon (2960-X, 3560-CX, 9200L, 9300, IE-3300, etc.).'}
                      </li>
                      <li>
                        {lang === 'fa'
                          ? 'در صورت نیاز از منوی «اعمال الگوی آماده (Preset)» یک پیکربندی پایه (مثلاً Access + VoIP یا دوربین PoE) را بارگذاری کنید.'
                          : 'Optionally pick a ready-made Preset (Standard Access + VoIP, PoE CCTV, or L3 Distribution).'}
                      </li>
                      <li>
                        {lang === 'fa'
                          ? 'بخش‌های ۱ تا ۵ درخت سمت راست را تکمیل کنید: Hostname و IP مدیریت، رمزها و SSHv2، لیست VLANها و اینترفیس‌های لایه ۳، و تنظیمات امنیتی STP/SNMP.'
                          : 'Complete sections 1–5: System & Management IP, Passwords & SSHv2, VLANs & L3 SVIs, Ports, and Security/SNMP.'}
                      </li>
                      <li>
                        {lang === 'fa'
                          ? 'خروجی CLI به‌صورت زنده در سمت چپ تولید شده و خطاها یا هشدارهای احتمالی (مانند رمز پیش‌فرض یا فعال نبودن SSH) بررسی می‌شوند.'
                          : 'Watch the live IOS/IOS-XE CLI script update in real time along with automatic configuration validation checks.'}
                      </li>
                    </ol>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-slate-900">
                      {lang === 'fa' ? 'نکات کلیدی پنل گرافیکی پورت‌ها' : 'Graphical Port Faceplate Tips'}
                    </h3>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-600">
                      <li>
                        {lang === 'fa'
                          ? 'با کلیک روی هر پورت روی شاسی سوییچ، تنظیمات همان پورت (Access/Trunk، VLAN دیتا، Voice VLAN، PortFast، BPDU Guard و PoE) ویرایش می‌شود.'
                          : 'Click any RJ45 or SFP+ port on the chassis graphic to configure Access/Trunk mode, VLANs, PortFast, and PoE.'}
                      </li>
                      <li>
                        {lang === 'fa'
                          ? 'برای تنظیم همزمان چند پورت، کلید Shift (انتخاب بازه‌ای) یا Ctrl (انتخاب تکی چند پورت) را نگه دارید یا از دکمه‌های انتخاب گروهی استفاده کنید.'
                          : 'Hold Shift (range select) or Ctrl/Cmd (multi-select) across ports to configure them together in bulk.'}
                      </li>
                      <li>
                        {lang === 'fa'
                          ? 'موتور تولید کد پورت‌های دارای تنظیمات یکسان را به‌صورت خودکار با دستور interface range ادغام می‌کند تا کد خروجی تمیز و کوتاه باشد.'
                          : 'Ports with identical settings are automatically grouped into Cisco "interface range" blocks.'}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 3. USB / RS232 Serial Console Guide */}
          {showSection('serial') && (
            <section className="bg-white border border-slate-200 rounded-md overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Cable className="w-4 h-4 text-blue-600 shrink-0" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    {lang === 'fa'
                      ? '۳. راهنمای اتصال مستقیم با کابل کنسول USB یا RS232'
                      : '3. Direct Loading via USB / RS232 Console Cable'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('configurator', { pane: 'console' })}
                  className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0"
                >
                  {lang === 'fa' ? 'باز کردن کنسول' : 'Open Console'}
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs text-slate-700 leading-relaxed">
                <ol className="list-decimal list-inside space-y-2 text-slate-600">
                  <li>
                    {lang === 'fa'
                      ? 'کابل کنسول USB-to-RJ45 یا USB-to-RS232 (یا کابل Mini-USB/USB-C) را به کامپیوتر و پورت Console پشت یا جلوی سوییچ متصل کنید.'
                      : 'Connect your USB-to-RJ45, USB-to-RS232, or Mini-USB console cable between your PC and the switch Console port.'}
                  </li>
                  <li>
                    {lang === 'fa'
                      ? 'در پنل سمت چپ وارد تب «کنسول USB/RS232 و SSH» شوید و زیرتب Serial را انتخاب کنید. نرخ استاندارد 9600 و 8N1 به‌صورت پیش‌فرض تنظیم است.'
                      : 'Switch to the "Serial & SSH Loader" tab and select the Serial transport. Standard Cisco 9600 8N1 settings are pre-selected.'}
                  </li>
                  <li>
                    {lang === 'fa'
                      ? 'روی دکمه «اتصال به پورت COM» کلیک کنید و در پنجره باز شده مرورگر، پورت USB Serial مربوط به کابل خود را انتخاب و Connect بزنید.'
                      : 'Click "Connect COM Port" and choose your USB Serial device from the browser permission prompt.'}
                  </li>
                  <li>
                    {lang === 'fa'
                      ? 'در ترمینال پایین پنل یک بار Enter بزنید یا روی دکمه ارسال دستور خالی بزنید تا Prompt سوییچ (مانند Switch> یا Switch#) دیده شود. اگر سوییچ خام است و پیام "initial configuration dialog? [yes/no]" پرسید، عبارت no را ارسال کنید.'
                      : 'Press Enter in the terminal to verify the switch prompt (Switch> or Switch#). On factory-reset switches, reply "no" to the initial configuration dialog first.'}
                  </li>
                  <li>
                    {lang === 'fa'
                      ? 'در صورت نیاز رمز Enable سوییچ فعلی را وارد کنید، تاخیر بین دستورات را روی 65ms (یا برای سوییچ‌های خیلی قدیمی 100ms) بگذارید و دکمه «ارسال کل کانفیگ به سوییچ» را بزنید. برنامه خط‌به‌خط دستورات را تزریق کرده و در پایان با دستور write memory ذخیره می‌کند.'
                      : 'Set line delay (65ms recommended), enter the current enable password if required, and click "Push Full Config to Switch". Commands stream line-by-line with pause/abort control and automatic "write memory".'}
                  </li>
                </ol>

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-600">
                  <strong className="text-slate-800">
                    {lang === 'fa' ? 'تست بدون سوییچ واقعی: ' : 'Testing without Hardware: '}
                  </strong>
                  {lang === 'fa'
                    ? 'اگر در حال حاضر به سوییچ فیزیکی دسترسی ندارید، می‌توانید با دکمه «اتصال به شبیه‌ساز سوییچ» کل فرآیند تزریق دستورات، ترمینال تعاملی IOS و دستورات show را به‌صورت آزمایشی بررسی کنید.'
                    : 'Use "Connect Virtual Switch" to test interactive IOS prompts, push timing, and error handling without physical hardware.'}
                </div>
              </div>
            </section>
          )}

          {/* 4. SSH Fleet Dashboard & Live Port Monitor */}
          {showSection('ssh') && (
            <section className="bg-white border border-slate-200 rounded-md overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-600 shrink-0" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    {lang === 'fa'
                      ? '۴. راهنمای داشبورد SSH، مانیتورینگ آنلاین پورت‌ها و بکاپ گروهی'
                      : '4. SSH Fleet Dashboard, Live Port Monitor & Bulk Backups'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('fleet')}
                  className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0"
                >
                  {lang === 'fa' ? 'باز کردن داشبورد SSH' : 'Go to SSH Fleet'}
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs text-slate-700 leading-relaxed">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-slate-900">
                      {lang === 'fa' ? 'مدیریت یکپارچه سوییچ‌ها با SSH' : 'Multi-Switch SSH Management'}
                    </h3>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-600">
                      <li>
                        {lang === 'fa'
                          ? 'در بخش «داشبورد سوییچ‌ها (SSH)»، سوییچ‌های شبکه را با برچسب، IP، پورت 22 و نام کاربری ثبت کنید.'
                          : 'Add your network switches in the SSH Fleet Dashboard with label, IP, port 22, and username.'}
                      </li>
                      <li>
                        {lang === 'fa'
                          ? 'رمز عبور و Enable Secret هر سوییچ فقط در حافظه موقت همین نشست مرورگر نگهداری می‌شود و روی هارد ذخیره نمی‌گردد.'
                          : 'SSH passwords and enable secrets remain strictly in session memory and are never written to disk.'}
                      </li>
                      <li>
                        {lang === 'fa'
                          ? 'با «بررسی وضعیت کل سوییچ‌ها»، مدل سخت‌افزاری، نسخه IOS، Uptime، تعداد پورت‌های Up/Down و تاخیر شبکه همه دستگاه‌ها یک‌جا نمایش داده می‌شود.'
                          : 'Run "Check All Switches" to inspect IOS version, hardware model, uptime, Up/Down port counts, and SSH latency.'}
                      </li>
                      <li>
                        {lang === 'fa'
                          ? 'از تب «بکاپ‌ها» می‌توانید از یک یا چند سوییچ همزمان دستور show running-config را گرفته، روی هارد ذخیره کنید یا با فایل .cfg دانلود نمایید.'
                          : 'Use Backups & Archive to pull running-config snapshots from one or multiple switches simultaneously.'}
                      </li>
                      <li>
                        {lang === 'fa'
                          ? 'در تب «آپدیت و دستورات گروهی» می‌توانید دستورات مشترک (مثل تغییر رمز SNMP، NTP یا VLAN جدید) یا کانفیگ تولید شده را همزمان روی سوییچ‌های انتخاب‌شده اعمال کنید.'
                          : 'Use Bulk Update to deploy shared CLI snippets or the generated config across selected switches.'}
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold text-slate-900">
                      {lang === 'fa' ? 'مانیتورینگ آنلاین گرافیکی پورت‌ها' : 'Live Graphical Port Monitor'}
                    </h3>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-600">
                      <li>
                        {lang === 'fa'
                          ? 'روی دکمه مانیتورینگ کنار هر سوییچ کلیک کنید تا شاسی گرافیکی پورت‌های آن باز شود.'
                          : 'Click the Port Monitor action on any switch to open its live interactive chassis faceplate.'}
                      </li>
                      <li>
                        {lang === 'fa'
                          ? 'رنگ و وضعیت هر پورت بر اساس خروجی زنده show interfaces status نمایش داده می‌شود: سبز (Connected)، خاکستری (NotConnect)، قرمز/نارنجی (Disabled / Err-Disabled).'
                          : 'Each RJ45/SFP port renders live state from "show interfaces status": Connected, NotConnect, Disabled, or Err-Disabled.'}
                      </li>
                      <li>
                        {lang === 'fa'
                          ? 'توان مصرفی PoE هر پورت (بر حسب وات از دستور show power inline)، شماره VLAN، سرعت (1000/100/10G) و توضیحات پورت قابل مشاهده و فیلتر است.'
                          : 'Inspect per-port PoE wattage (from "show power inline"), VLAN assignment, link speed/duplex, and port descriptions.'}
                      </li>
                      <li>
                        {lang === 'fa'
                          ? 'با کلیک روی هر پورت می‌توانید آن را از راه دور خاموش (Shutdown)، روشن (No Shutdown) یا ریست (Bounce) کنید و یا بکاپ و رفرش خودکار دوره‌ای را فعال نمایید.'
                          : 'Click any port to remotely Shutdown, No Shutdown, or Bounce it via SSH, or enable automatic periodic polling.'}
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Cisco Switch SSH Prep Snippet */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-800">
                      {lang === 'fa'
                        ? 'دستورات نمونه برای فعال‌سازی SSHv2 روی سوییچ سیسکو (در صورت نیاز):'
                        : 'Sample Cisco IOS commands to enable SSHv2 on a switch:'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy('cisco-ssh-prep', ciscoSshPrepCommands)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded transition-colors"
                    >
                      {copiedId === 'cisco-ssh-prep' ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>
                        {copiedId === 'cisco-ssh-prep'
                          ? lang === 'fa'
                            ? 'کپی شد'
                            : 'Copied'
                          : lang === 'fa'
                            ? 'کپی دستورات'
                            : 'Copy Snippet'}
                      </span>
                    </button>
                  </div>
                  <pre
                    dir="ltr"
                    className="p-3 bg-slate-900 text-slate-100 rounded text-[11px] font-mono overflow-x-auto leading-relaxed"
                  >
                    {ciscoSshPrepCommands}
                  </pre>
                </div>
              </div>
            </section>
          )}

          {/* 5. Local Disk DB & Backups */}
          {showSection('storage') && (
            <section className="bg-white border border-slate-200 rounded-md overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-emerald-700 shrink-0" />
                <h2 className="text-sm font-semibold text-slate-900">
                  {lang === 'fa'
                    ? '۵. دیتابیس آفلاین روی هارد دیسک و مدیریت فایل‌ها'
                    : '5. Offline Hard-Drive Database & File Layout'}
                </h2>
              </div>

              <div className="p-5 space-y-3 text-xs text-slate-600 leading-relaxed">
                <p>
                  {lang === 'fa'
                    ? 'تمام تنظیمات سوییچ‌ها، فهرست دستگاه‌های SSH و بکاپ‌های کانفیگ بدون نیاز به اینترنت، سرور خارجی یا ورود به حساب کاربری مستقیماً روی هارد سیستم ذخیره می‌شوند.'
                    : 'All saved switch profiles, SSH fleet inventories, and configuration backups are persisted directly to your local hard drive with zero internet or login requirements.'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-3 border-t border-slate-100 text-[11px]">
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-900">
                      {lang === 'fa' ? 'مسیر اصلی دیتابیس' : 'Database Directory'}
                    </div>
                    <code dir="ltr" className="block font-mono text-slate-800 break-all">
                      {dataDir || './data'}
                    </code>
                    <p className="text-slate-500">
                      {lang === 'fa'
                        ? 'شامل فایل‌های profiles.json، fleet-switches.json و backups.json'
                        : 'Contains profiles.json, fleet-switches.json, and backups.json'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="font-semibold text-slate-900">
                      {lang === 'fa' ? 'بکاپ‌های متنی (.cfg)' : 'Raw .cfg Backup Folder'}
                    </div>
                    <code dir="ltr" className="block font-mono text-slate-800 break-all">
                      {(dataDir || './data').replace(/\/$/, '')}/backups/
                    </code>
                    <p className="text-slate-500">
                      {lang === 'fa'
                        ? 'هر بکاپ علاوه‌بر تاریخچه برنامه، به‌صورت یک فایل مجزای .cfg با نام سوییچ و تاریخ ذخیره می‌شود.'
                        : 'Each snapshot is also saved as a standalone .cfg text file named by hostname and timestamp.'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="font-semibold text-slate-900">
                      {lang === 'fa' ? 'انتقال بین کامپیوترها' : 'Portable Export / Import'}
                    </div>
                    <p className="text-slate-600">
                      {lang === 'fa'
                        ? 'در پنجره «دیتابیس هارد» می‌توانید کل اطلاعات را با فرمت .json خروجی بگیرید و روی سیستم دیگر ایمپورت کنید.'
                        : 'Use Export DB (.json) and Import DB inside the Local DB modal to migrate profiles and backups between PCs.'}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 6. Troubleshooting Table */}
          {showSection('troubleshoot') && (
            <section className="bg-white border border-slate-200 rounded-md overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                <h2 className="text-sm font-semibold text-slate-900">
                  {lang === 'fa'
                    ? '۶. راهنمای عیب‌یابی سریع (Troubleshooting)'
                    : '6. Quick Troubleshooting Reference'}
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2.5 px-4 text-start w-1/3">
                        {lang === 'fa' ? 'مشکل مشاهده‌شده' : 'Symptom'}
                      </th>
                      <th className="py-2.5 px-4 text-start w-1/4">
                        {lang === 'fa' ? 'علت احتمالی' : 'Likely Cause'}
                      </th>
                      <th className="py-2.5 px-4 text-start">
                        {lang === 'fa' ? 'راه‌حل پیشنهادی' : 'Recommended Fix'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {troubleshootingRows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/70 align-top">
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {lang === 'fa' ? row.issueFa : row.issueEn}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {lang === 'fa' ? row.causeFa : row.causeEn}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {lang === 'fa' ? row.fixFa : row.fixEn}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};
