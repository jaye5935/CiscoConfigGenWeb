import { jsPDF } from 'jspdf';
import { Language, SwitchConfigState, VlanConfig } from '../types/switch';
import { generateCiscoCli } from './iosGenerator';

const RESERVED_CISCO_VLANS = new Set([1, 1002, 1003, 1004, 1005]);
const IPV4_PATTERN = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function sanitizeVlanName(raw: string, id: number): string {
  const cleaned = raw.trim().replace(/\s+/g, '_').replace(/[^\w.-]/g, '_');
  return cleaned || `VLAN_${id}`;
}

function expandVlanIdToken(token: string): number[] {
  const results: number[] = [];
  for (const part of token.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const rangeMatch = trimmed.match(/^(\d{1,4})\s*-\s*(\d{1,4})$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (start >= 2 && end <= 4094 && start <= end && end - start <= 256) {
        for (let i = start; i <= end; i++) {
          if (!RESERVED_CISCO_VLANS.has(i)) results.push(i);
        }
      }
      continue;
    }
    const single = parseInt(trimmed, 10);
    if (!isNaN(single) && single >= 2 && single <= 4094 && !RESERVED_CISCO_VLANS.has(single)) {
      results.push(single);
    }
  }
  return results;
}

/**
 * Parses VLAN entries provided by the user in multiple practical formats:
 * 1) "10, USERS_LAN" / "10: USERS" / "10 - USERS" / "10 USERS"
 * 2) Cisco IOS CLI: "vlan 10" followed by "name USERS_LAN" (or "vlan 10,20,30")
 * 3) Cisco "show vlan brief" table rows: "10   USERS_LAN   active   Gi1/0/1, ..."
 * 4) Optional SVI IP/Mask tokens: "10 USERS 10.10.10.1 255.255.255.0"
 */
export function parseVlanInputFromUser(rawText: string): VlanConfig[] {
  const vlanMap = new Map<number, VlanConfig>();
  const lines = rawText.split(/\r?\n/);

  let activeCliVlanIds: number[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('!') || line.startsWith('#')) {
      if (line.startsWith('!')) activeCliVlanIds = [];
      continue;
    }

    // Ignore header lines from "show vlan brief"
    if (/^VLAN\s+Name\s+Status/i.test(line) || /^[-=]{4,}/.test(line)) {
      activeCliVlanIds = [];
      continue;
    }

    // Format A: Cisco CLI "vlan 10" or "vlan 10,20-25"
    const cliVlanMatch = line.match(/^vlan\s+([\d,\s-]+)$/i);
    if (cliVlanMatch) {
      const ids = expandVlanIdToken(cliVlanMatch[1]);
      activeCliVlanIds = ids;
      for (const id of ids) {
        if (!vlanMap.has(id)) {
          vlanMap.set(id, {
            id,
            name: `VLAN_${id}`,
            sviEnabled: false,
            sviIp: `10.10.${id > 254 ? 250 : id}.1`,
            sviMask: '255.255.255.0',
          });
        }
      }
      continue;
    }

    // Format B: Cisco CLI "name USERS_LAN" inside vlan submode
    const cliNameMatch = line.match(/^name\s+(.+)$/i);
    if (cliNameMatch && activeCliVlanIds.length > 0) {
      const nameVal = sanitizeVlanName(cliNameMatch[1], activeCliVlanIds[0]);
      for (const id of activeCliVlanIds) {
        const existing = vlanMap.get(id);
        if (existing) {
          existing.name = nameVal;
        }
      }
      continue;
    }

    if (/^exit$/i.test(line) || /^end$/i.test(line)) {
      activeCliVlanIds = [];
      continue;
    }

    // Format C: "show vlan brief" row -> "10   USERS   active ..." or "10 USERS act/unsup ..."
    const showVlanMatch = line.match(
      /^(\d{1,4})\s+([^\s]+)\s+(?:active|act\/unsup|act\/lshut|suspended)\b/i
    );
    if (showVlanMatch) {
      activeCliVlanIds = [];
      const id = parseInt(showVlanMatch[1], 10);
      if (id >= 2 && id <= 4094 && !RESERVED_CISCO_VLANS.has(id)) {
        const name = sanitizeVlanName(showVlanMatch[2], id);
        vlanMap.set(id, {
          id,
          name,
          sviEnabled: false,
          sviIp: `10.10.${id > 254 ? 250 : id}.1`,
          sviMask: '255.255.255.0',
        });
      }
      continue;
    }

    // Format D: Flexible user entry -> "10, USERS", "10: USERS", "10 - USERS", "10 USERS [10.10.10.1 255.255.255.0]"
    const userRowMatch = line.match(/^(\d{1,4})(?:\s*[,;:\-|/\t ]\s*(.*))?$/);
    if (userRowMatch) {
      activeCliVlanIds = [];
      const id = parseInt(userRowMatch[1], 10);
      if (isNaN(id) || id < 2 || id > 4094 || RESERVED_CISCO_VLANS.has(id)) continue;

      const rest = (userRowMatch[2] || '').trim();
      const tokens = rest ? rest.split(/[\s,;]+/).filter(Boolean) : [];
      let name = `VLAN_${id}`;
      let sviIp: string | undefined;
      let sviMask: string | undefined;

      const nonIpTokens: string[] = [];
      for (const tok of tokens) {
        if (IPV4_PATTERN.test(tok)) {
          if (!sviIp) sviIp = tok;
          else if (!sviMask) sviMask = tok;
        } else {
          nonIpTokens.push(tok);
        }
      }
      if (nonIpTokens.length > 0) {
        name = sanitizeVlanName(nonIpTokens.join('_'), id);
      }

      vlanMap.set(id, {
        id,
        name,
        sviEnabled: Boolean(sviIp),
        sviIp: sviIp || `10.10.${id > 254 ? 250 : id}.1`,
        sviMask: sviMask || '255.255.255.0',
      });
    }
  }

  return Array.from(vlanMap.values()).sort((a, b) => a.id - b.id);
}

/**
 * Generates a Cisco Catalyst flash:config.text file (clean startup-config syntax
 * without interactive EXEC wrappers like "enable", "configure terminal", or "write memory").
 */
export function generateConfigTextFile(config: SwitchConfigState): string {
  const body = generateCiscoCli({
    ...config,
    includeSessionWrapper: false,
  });

  const header = [
    '!',
    `! Cisco IOS flash:config.text`,
    `! Hostname: ${config.hostname || 'Switch'}`,
    `! Generated: ${new Date().toISOString()}`,
    '!',
    'service timestamps debug datetime msec',
    'service timestamps log datetime msec',
    '!',
  ].join('\n');

  return `${header}\n${body}\n!\nend\n`;
}

/**
 * Generates a standalone Cisco IOS VLAN database export file (vlan.txt)
 * containing VLAN CLI definitions, management/SVI mapping notes, and port assignments.
 */
export function generateVlanFileContent(config: SwitchConfigState): string {
  const lines: string[] = [];
  const vlans = [...config.vlans].sort((a, b) => a.id - b.id);

  lines.push('! ========================================================');
  lines.push(`! CiscoSwitch Studio - VLAN Database Export (vlan)`);
  lines.push(`! Hostname        : ${config.hostname || 'Switch'}`);
  lines.push(`! Management VLAN : ${config.mgmtVlanId}`);
  lines.push(`! Total VLANs     : ${vlans.length}`);
  lines.push(`! Generated       : ${new Date().toISOString()}`);
  lines.push('! ========================================================');
  lines.push('!');
  lines.push('! --- VLAN Summary Table ---');
  for (const v of vlans) {
    const portCount = config.ports.filter(
      (p) => (p.mode === 'access' && p.accessVlan === v.id) || p.voiceVlan === v.id
    ).length;
    const sviNote = v.sviEnabled && v.sviIp ? `SVI ${v.sviIp}/${v.sviMask || '255.255.255.0'}` : 'Layer 2 only';
    lines.push(`! VLAN ${String(v.id).padEnd(4, ' ')} | ${v.name.padEnd(20, ' ')} | Ports: ${String(portCount).padEnd(2, ' ')} | ${sviNote}`);
  }
  lines.push('!');
  lines.push('enable');
  lines.push('configure terminal');

  for (const v of vlans) {
    if (v.id === 1) continue;
    lines.push(`vlan ${v.id}`);
    if (v.name.trim()) {
      lines.push(` name ${v.name.trim().replace(/\s+/g, '_')}`);
    }
    lines.push(' exit');
  }

  lines.push('end');
  lines.push('write memory');
  lines.push('');

  return lines.join('\n');
}

/**
 * Extracts VLAN commands from an arbitrary Cisco running-config / backup text.
 */
export function extractVlanBlockFromCli(rawConfig: string, hostname = 'Switch'): string {
  const parsedVlans = parseVlanInputFromUser(rawConfig);
  const lines: string[] = [
    '! ========================================================',
    `! Extracted VLAN Database Export`,
    `! Hostname : ${hostname}`,
    `! VLANs    : ${parsedVlans.length}`,
    '! ========================================================',
    'enable',
    'configure terminal',
  ];

  for (const v of parsedVlans) {
    lines.push(`vlan ${v.id}`);
    if (v.name) lines.push(` name ${v.name}`);
    lines.push(' exit');
  }

  lines.push('end');
  lines.push('write memory');
  lines.push('');
  return lines.join('\n');
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Renders an RTL/LTR-safe header banner to an offscreen HiDPI Canvas so Persian typography
 * shapes natively in the browser without requiring external TTF font bundles inside jsPDF.
 */
async function renderHeaderCardImage(params: {
  title: string;
  subtitle: string;
  metaPairs: { label: string; value: string }[];
  lang: Language;
}): Promise<{ dataUrl: string; widthMm: number; heightMm: number } | null> {
  if (typeof document === 'undefined') return null;

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const scale = 3;
    const widthPx = 760;
    const heightPx = 148;
    const canvas = document.createElement('canvas');
    canvas.width = widthPx * scale;
    canvas.height = heightPx * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.scale(scale, scale);

    // Background card
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, widthPx, heightPx);

    // Accent strip
    ctx.fillStyle = '#2563EB';
    ctx.fillRect(0, 0, widthPx, 5);

    const isRtl = params.lang === 'fa';
    ctx.direction = isRtl ? 'rtl' : 'ltr';
    ctx.textAlign = isRtl ? 'right' : 'left';
    const xAnchor = isRtl ? widthPx - 24 : 24;

    // Title
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 20px Vazirmatn, Manrope, Tahoma, sans-serif';
    ctx.fillText(params.title, xAnchor, 38);

    // Subtitle
    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 12px Vazirmatn, Manrope, Tahoma, sans-serif';
    ctx.fillText(params.subtitle, xAnchor, 62);

    // Divider line
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 78);
    ctx.lineTo(widthPx - 24, 78);
    ctx.stroke();

    // Metadata grid (up to 4 items)
    const cols = Math.min(4, Math.max(1, params.metaPairs.length));
    const colW = (widthPx - 48) / cols;
    params.metaPairs.slice(0, 4).forEach((item, idx) => {
      const colX = isRtl ? widthPx - 24 - idx * colW : 24 + idx * colW;
      ctx.direction = isRtl ? 'rtl' : 'ltr';
      ctx.textAlign = isRtl ? 'right' : 'left';
      ctx.fillStyle = '#64748B';
      ctx.font = '500 10px Vazirmatn, Manrope, Tahoma, sans-serif';
      ctx.fillText(item.label, colX, 100);

      ctx.direction = 'ltr';
      ctx.textAlign = isRtl ? 'right' : 'left';
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '600 12px "JetBrains Mono", Consolas, monospace';
      ctx.fillText(item.value.slice(0, 26), colX, 122);
    });

    const widthMm = 186;
    const heightMm = (heightPx / widthPx) * widthMm;
    return { dataUrl: canvas.toDataURL('image/png'), widthMm, heightMm };
  } catch {
    return null;
  }
}

export async function exportRawCommandsPdf(params: {
  title: string;
  subtitle: string;
  metaPairs: { label: string; value: string }[];
  filename: string;
  cliText: string;
  lang: Language;
  vlanSummary?: VlanConfig[];
}): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const topMargin = 12;
  const bottomMargin = 14;
  const usableWidth = pageWidth - marginX * 2;
  let y = topMargin;

  // 1) Crisp RTL/LTR Header Banner
  const headerImg = await renderHeaderCardImage({
    title: params.title,
    subtitle: params.subtitle,
    metaPairs: params.metaPairs,
    lang: params.lang,
  });

  if (headerImg) {
    doc.addImage(headerImg.dataUrl, 'PNG', marginX, y, headerImg.widthMm, headerImg.heightMm);
    y += headerImg.heightMm + 6;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(params.title, marginX, y + 6);
    y += 14;
  }

  // 2) Optional VLAN Summary Table
  if (params.vlanSummary && params.vlanSummary.length > 0) {
    doc.setFillColor(241, 245, 249);
    doc.rect(marginX, y, usableWidth, 6.5, 'F');
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text('VLAN DATABASE SUMMARY', marginX + 2.5, y + 4.4);
    y += 8;

    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    for (const v of params.vlanSummary) {
      if (y > pageHeight - bottomMargin - 6) {
        doc.addPage();
        y = topMargin;
      }
      const sviInfo = v.sviEnabled && v.sviIp ? `SVI: ${v.sviIp} ${v.sviMask || ''}` : 'L2 VLAN';
      const rowText = `VLAN ${String(v.id).padEnd(5, ' ')} | ${v.name.slice(0, 24).padEnd(25, ' ')} | ${sviInfo}`;
      doc.setTextColor(51, 65, 85);
      doc.text(rowText, marginX + 2.5, y + 3.2);
      y += 4.3;
    }
    y += 4;
  }

  // 3) CLI Commands Section Header
  doc.setFillColor(17, 24, 39);
  doc.rect(marginX, y, usableWidth, 6.5, 'F');
  doc.setFont('courier', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(248, 250, 252);
  doc.text('CISCO IOS CLI OUTPUT COMMANDS', marginX + 2.5, y + 4.4);
  y += 9;

  // 4) Render Monospace Lines with line numbers & semantic highlighting
  const rawLines = params.cliText.split(/\r?\n/);
  const lineHeight = 4.05;
  const codeLeft = marginX + 11;
  const maxTextWidth = usableWidth - 13;

  doc.setFont('courier', 'normal');
  doc.setFontSize(8.2);

  for (let idx = 0; idx < rawLines.length; idx++) {
    const rawLine = rawLines[idx];
    const displayLine = rawLine.length > 0 ? rawLine : ' ';
    const wrapped = doc.splitTextToSize(displayLine, maxTextWidth) as string[];

    for (let wIdx = 0; wIdx < wrapped.length; wIdx++) {
      if (y + lineHeight > pageHeight - bottomMargin) {
        doc.addPage();
        y = topMargin;
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, y, usableWidth, 5.5, 'F');
        doc.setFont('courier', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`${params.filename} (continued)`, marginX + 2, y + 3.8);
        y += 8;
        doc.setFontSize(8.2);
      }

      if (wIdx === 0) {
        doc.setFont('courier', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(String(idx + 1).padStart(3, '0'), marginX + 1.5, y);
      }

      const trimmed = rawLine.trim();
      if (trimmed.startsWith('!')) {
        doc.setFont('courier', 'italic');
        doc.setTextColor(100, 116, 139);
      } else if (
        trimmed.startsWith('interface ') ||
        trimmed.startsWith('vlan ') ||
        trimmed.startsWith('line ') ||
        trimmed === 'configure terminal' ||
        trimmed === 'enable' ||
        trimmed === 'write memory'
      ) {
        doc.setFont('courier', 'bold');
        doc.setTextColor(3, 105, 161);
      } else if (trimmed.startsWith('no ') || trimmed === 'shutdown') {
        doc.setFont('courier', 'normal');
        doc.setTextColor(180, 83, 9);
      } else {
        doc.setFont('courier', 'normal');
        doc.setTextColor(15, 23, 42);
      }

      doc.text(wrapped[wIdx], codeLeft, y);
      y += lineHeight;
    }
  }

  // 5) Page Footer across all pages
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, pageHeight - 10, pageWidth - marginX, pageHeight - 10);
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('CiscoSwitch Studio · Offline Configuration Export', marginX, pageHeight - 6);
    doc.text(`Page ${p} / ${pageCount}`, pageWidth - marginX, pageHeight - 6, { align: 'right' });
  }

  doc.save(params.filename);
}

export async function exportCliCommandsPdf(params: {
  cliText: string;
  config: SwitchConfigState;
  modelName: string;
  lang: Language;
}): Promise<void> {
  const { cliText, config, modelName, lang } = params;
  const host = config.hostname.trim() || 'switch';
  const lineCount = cliText.split('\n').length;

  await exportRawCommandsPdf({
    title:
      lang === 'fa'
        ? `مستند دستورات پیکربندی سوییچ — ${host}`
        : `Cisco Switch CLI Configuration — ${host}`,
    subtitle:
      lang === 'fa'
        ? `مدل: ${modelName} | تولیدشده توسط CiscoSwitch Studio (آفلاین)`
        : `Target Model: ${modelName} | Generated by CiscoSwitch Studio`,
    metaPairs: [
      { label: lang === 'fa' ? 'نام دستگاه' : 'Hostname', value: host },
      {
        label: lang === 'fa' ? 'IP مدیریت' : 'Mgmt IP',
        value: config.mgmtIp ? `${config.mgmtIp} (VLAN ${config.mgmtVlanId})` : `VLAN ${config.mgmtVlanId}`,
      },
      { label: lang === 'fa' ? 'تعداد VLAN' : 'VLANs', value: `${config.vlans.length} VLANs` },
      { label: lang === 'fa' ? 'تعداد خطوط دستور' : 'CLI Lines', value: `${lineCount} lines` },
    ],
    filename: `${host}-commands.pdf`,
    cliText,
    lang,
    vlanSummary: config.vlans,
  });
}
