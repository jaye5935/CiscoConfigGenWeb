import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'ssh2';
import type { ClientChannel, ConnectConfig } from 'ssh2';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DATA_DIR = path.resolve(__dirname, 'data');
const BACKUPS_DIR = path.resolve(DATA_DIR, 'backups');
const PROFILES_FILE = path.resolve(DATA_DIR, 'profiles.json');
const FLEET_FILE = path.resolve(DATA_DIR, 'fleet-switches.json');
const BACKUPS_FILE = path.resolve(DATA_DIR, 'backups.json');

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

async function ensureDataDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
}

async function readJsonArray<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await ensureDataDirs();
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

function sanitizeSafeId(raw: unknown, prefix: string): string {
  if (typeof raw === 'string' && SAFE_ID_REGEX.test(raw.trim())) {
    return raw.trim();
  }
  const cleaned = typeof raw === 'string' ? raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) : '';
  return cleaned && SAFE_ID_REGEX.test(cleaned)
    ? cleaned
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

interface SshTargetPayload {
  id?: string;
  host: string;
  port?: number;
  username: string;
  password: string;
  enableSecret?: string;
}

const HOST_REGEX = /^[a-zA-Z0-9.-]{1,253}$/;

function isBlockedHost(rawHost: string): boolean {
  const host = rawHost.trim().toLowerCase();
  if (!host || !HOST_REGEX.test(host)) return true;
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === 'metadata.google.internal' ||
    host.startsWith('127.') ||
    host.startsWith('169.254.')
  ) {
    return true;
  }
  return false;
}

function validateTarget(body: unknown): { ok: true; target: Required<SshTargetPayload> } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request payload' };
  }
  const b = body as Record<string, unknown>;
  const host = typeof b.host === 'string' ? b.host.trim() : '';
  const port = typeof b.port === 'number' && Number.isInteger(b.port) ? b.port : Number(b.port || 22);
  const username = typeof b.username === 'string' ? b.username.trim() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const enableSecret = typeof b.enableSecret === 'string' ? b.enableSecret : '';
  const id = typeof b.id === 'string' ? b.id : '';

  if (isBlockedHost(host)) {
    return { ok: false, error: 'Invalid or restricted host address' };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'SSH port must be between 1 and 65535' };
  }
  if (!username || username.length > 128) {
    return { ok: false, error: 'SSH username is required' };
  }
  if (!password || password.length > 256) {
    return { ok: false, error: 'SSH password is required' };
  }

  return {
    ok: true,
    target: { id, host, port, username, password, enableSecret },
  };
}

function createSshConnectConfig(target: Required<SshTargetPayload>): ConnectConfig {
  return {
    host: target.host,
    port: target.port,
    username: target.username,
    password: target.password,
    readyTimeout: 10000,
    keepaliveInterval: 5000,
    // Support both modern IOS-XE and legacy Cisco Catalyst 2960/3560/3750 SSH algorithms
    algorithms: {
      kex: [
        'curve25519-sha256',
        'curve25519-sha256@libssh.org',
        'ecdh-sha2-nistp256',
        'ecdh-sha2-nistp384',
        'ecdh-sha2-nistp521',
        'diffie-hellman-group-exchange-sha256',
        'diffie-hellman-group14-sha256',
        'diffie-hellman-group14-sha1',
        'diffie-hellman-group1-sha1',
      ],
      cipher: [
        'aes128-gcm@openssh.com',
        'aes256-gcm@openssh.com',
        'aes128-ctr',
        'aes192-ctr',
        'aes256-ctr',
        'aes128-cbc',
        'aes256-cbc',
        '3des-cbc',
      ],
      hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
      serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'],
    },
  };
}

async function withCiscoShell<T>(
  target: Required<SshTargetPayload>,
  runner: (ctx: {
    sendAndWait: (cmd: string, timeoutMs?: number) => Promise<string>;
    getLastHostname: () => string;
  }) => Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    let streamRef: ClientChannel | null = null;
    let buffer = '';
    let lastHostname = target.host;

    const finishError = (err: Error) => {
      if (settled) return;
      settled = true;
      try {
        streamRef?.end();
        conn.end();
      } catch {
        // ignore
      }
      reject(err);
    };

    const promptRegex = /([A-Za-z0-9_.-]+(?:\([a-z-]+\))?[>#])\s*$/;

    const waitForPrompt = (timeoutMs = 8000): Promise<string> => {
      return new Promise((res, rej) => {
        const started = Date.now();
        const timer = setInterval(() => {
          const clean = buffer.replace(/\r/g, '');
          // Handle --More-- pagination automatically if terminal length 0 didn't apply yet
          if (clean.includes('--More--')) {
            buffer = clean.replace(/--More--\s*/g, '');
            streamRef?.write(' ');
            return;
          }
          const match = clean.match(promptRegex);
          if (match) {
            clearInterval(timer);
            const rawHost = match[1].replace(/\([a-z-]+\)/, '').replace(/[>#]$/, '');
            if (rawHost) lastHostname = rawHost;
            const out = clean;
            buffer = '';
            res(out);
            return;
          }
          if (/password:\s*$/i.test(clean)) {
            clearInterval(timer);
            const out = clean;
            buffer = '';
            res(out);
            return;
          }
          if (/\[confirm\]\s*$/i.test(clean) || /continue\?\s*\[yes\/no\]:\s*$/i.test(clean)) {
            clearInterval(timer);
            const out = clean;
            buffer = '';
            res(out);
            return;
          }
          if (Date.now() - started > timeoutMs) {
            clearInterval(timer);
            rej(new Error(`Timeout waiting for switch prompt (${target.host})`));
          }
        }, 40);
      });
    };

    const sendAndWait = async (cmd: string, timeoutMs = 8000): Promise<string> => {
      if (!streamRef) throw new Error('SSH shell stream not active');
      buffer = '';
      streamRef.write(`${cmd}\n`);
      return waitForPrompt(timeoutMs);
    };

    conn.on('ready', () => {
      conn.shell({ term: 'vt100', cols: 200, rows: 50 }, async (err, stream) => {
        if (err) {
          finishError(err);
          return;
        }
        streamRef = stream;
        stream.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
        });
        stream.on('close', () => {
          if (!settled) {
            finishError(new Error('SSH shell closed unexpectedly'));
          }
        });

        try {
          const initialBanner = await waitForPrompt(8000);
          // Enter privileged EXEC mode if at user prompt '>'
          if (initialBanner.trimEnd().endsWith('>')) {
            const enOut = await sendAndWait('enable', 6000);
            if (/password:\s*$/i.test(enOut)) {
              const sec = target.enableSecret || target.password;
              const passOut = await sendAndWait(sec, 6000);
              if (/password:\s*$/i.test(passOut) || passOut.includes('% Bad secrets')) {
                throw new Error('Enable secret rejected by switch');
              }
            }
          }

          await sendAndWait('terminal length 0', 5000);

          const result = await runner({
            sendAndWait,
            getLastHostname: () => lastHostname,
          });

          if (!settled) {
            settled = true;
            try {
              stream.write('exit\n');
              stream.end();
              conn.end();
            } catch {
              // ignore
            }
            resolve(result);
          }
        } catch (runErr) {
          finishError(runErr instanceof Error ? runErr : new Error(String(runErr)));
        }
      });
    });

    conn.on('error', (err) => {
      finishError(err);
    });

    conn.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
      finish(prompts.map(() => target.password));
    });

    try {
      conn.connect(createSshConnectConfig(target));
    } catch (err) {
      finishError(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function stripCommandAndPrompt(raw: string, command: string): string {
  const lines = raw.replace(/\r/g, '').split('\n');
  if (lines.length > 0 && lines[0].trim().startsWith(command.trim())) {
    lines.shift();
  }
  if (lines.length > 0 && /^[A-Za-z0-9_.-]+(?:\([a-z-]+\))?[>#]\s*$/.test(lines[lines.length - 1].trim())) {
    lines.pop();
  }
  return lines.join('\n').trim();
}

function parseShowVersion(verText: string): { iosVersion: string; model: string; uptime: string } {
  const iosMatch =
    verText.match(/Version\s+([0-9A-Za-z().\-]+)/i) ||
    verText.match(/Cisco IOS Software.*,\s*([^\n,]+)/i);
  const modelMatch =
    verText.match(/Model\s+[Nn]umber\s*:\s*([A-Za-z0-9\-/]+)/i) ||
    verText.match(/cisco\s+(WS-C[A-Za-z0-9\-]+|C[0-9]{4}[A-Za-z0-9\-]+|IE-[A-Za-z0-9\-]+)/i);
  const uptimeMatch = verText.match(/uptime is\s+([^\n]+)/i);

  return {
    iosVersion: iosMatch ? iosMatch[1].replace(/,$/, '') : 'Unknown IOS',
    model: modelMatch ? modelMatch[1] : 'Cisco Catalyst',
    uptime: uptimeMatch ? uptimeMatch[1].trim() : 'Unknown',
  };
}

function parseInterfaceCounts(ipIntBrief: string): { upPorts: number; downPorts: number } {
  const lines = ipIntBrief.split('\n');
  let upPorts = 0;
  let downPorts = 0;
  for (const line of lines) {
    if (/^(Fast|Gigabit|TenGigabit|TwentyFiveGig|Vlan|Port-channel)/i.test(line.trim())) {
      if (/\bup\s+up\b/i.test(line)) {
        upPorts += 1;
      } else {
        downPorts += 1;
      }
    }
  }
  return { upPorts, downPorts };
}

function parseShowPowerInline(poeText: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of poeText.split('\n')) {
    const m = line.trim().match(/^([A-Za-z]+\d+(?:\/\d+)*)\s+\S+\s+\S+\s+(\d+(?:\.\d+)?)\s+/);
    if (m) {
      map.set(m[1], parseFloat(m[2]));
    }
  }
  return map;
}

function parseShowInterfacesStatus(raw: string, poeMap: Map<string, number>) {
  const ports: {
    port: string;
    name: string;
    status: string;
    vlan: string;
    duplex: string;
    speed: string;
    type: string;
    poeWatts?: number;
  }[] = [];

  const statusRe = /\b(connected|notconnect|disabled|err-disabled|sfpAbsent|monitoring|inactive)\b/;

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.startsWith('Port') || line.startsWith('---')) continue;

    const match = line.match(statusRe);
    if (!match || match.index === undefined) continue;

    const status = match[1];
    const leftPart = line.slice(0, match.index).trim();
    const rightPart = line.slice(match.index + status.length).trim();

    const firstSpace = leftPart.search(/\s/);
    const port = firstSpace === -1 ? leftPart : leftPart.slice(0, firstSpace);
    const name = firstSpace === -1 ? '' : leftPart.slice(firstSpace).trim();

    if (!/^(Fa|Gi|Te|Tw|Fo|Eth|Po)/i.test(port)) continue;

    const tokens = rightPart.split(/\s+/);
    const vlan = tokens[0] || '1';
    const duplex = tokens[1] || 'auto';
    const speed = tokens[2] || 'auto';
    const type = tokens.slice(3).join(' ') || 'RJ45';

    const poeWatts = poeMap.get(port);
    ports.push({
      port,
      name,
      status,
      vlan,
      duplex,
      speed,
      type,
      ...(poeWatts !== undefined ? { poeWatts } : {}),
    });
  }

  return ports;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Live Switch Port Status Monitoring via SSH
  app.post('/api/ssh/ports', async (req: Request, res: Response) => {
    const parsed = validateTarget(req.body);
    if (!parsed.ok) {
      res.status(400).json({ ok: false, error: parsed.error });
      return;
    }

    const startedAt = Date.now();
    try {
      const data = await withCiscoShell(parsed.target, async ({ sendAndWait, getLastHostname }) => {
        const statusRaw = await sendAndWait('show interfaces status', 10000);
        let poeMap = new Map<string, number>();
        try {
          const poeRaw = await sendAndWait('show power inline', 6000);
          if (!poeRaw.includes('% Invalid input')) {
            poeMap = parseShowPowerInline(poeRaw);
          }
        } catch {
          // Non-PoE switches won't support show power inline
        }
        const ports = parseShowInterfacesStatus(statusRaw, poeMap);
        return {
          hostname: getLastHostname(),
          ports,
          latencyMs: Date.now() - startedAt,
          capturedAt: new Date().toISOString(),
        };
      });
      res.json({ ok: true, ...data });
    } catch (err) {
      res.status(200).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to fetch switch ports via SSH',
      });
    }
  });

  // Single Switch SSH Status Check
  app.post('/api/ssh/status', async (req: Request, res: Response) => {
    const parsed = validateTarget(req.body);
    if (!parsed.ok) {
      res.status(400).json({ ok: false, error: parsed.error });
      return;
    }

    const startedAt = Date.now();
    try {
      const data = await withCiscoShell(parsed.target, async ({ sendAndWait, getLastHostname }) => {
        const verRaw = await sendAndWait('show version', 10000);
        const intRaw = await sendAndWait('show ip interface brief', 8000);
        const verInfo = parseShowVersion(verRaw);
        const counts = parseInterfaceCounts(intRaw);
        return {
          hostname: getLastHostname(),
          ...verInfo,
          ...counts,
          latencyMs: Date.now() - startedAt,
        };
      });
      res.json({ ok: true, ...data });
    } catch (err) {
      res.status(200).json({
        ok: false,
        error: err instanceof Error ? err.message : 'SSH connection failed',
        latencyMs: Date.now() - startedAt,
      });
    }
  });

  // Multi-Switch Fleet Check (concurrent with bounded concurrency)
  app.post('/api/ssh/fleet-check', async (req: Request, res: Response) => {
    const rawList = (req.body as { switches?: unknown[] })?.switches;
    if (!Array.isArray(rawList) || rawList.length === 0 || rawList.length > 50) {
      res.status(400).json({ ok: false, error: 'Provide between 1 and 50 switches' });
      return;
    }

    const results = await Promise.all(
      rawList.map(async (item) => {
        const parsed = validateTarget(item);
        const id = (item && typeof item === 'object' && typeof (item as { id?: string }).id === 'string')
          ? (item as { id: string }).id
          : '';
        if (!parsed.ok) {
          return { id, ok: false, error: parsed.error };
        }
        const startedAt = Date.now();
        try {
          const data = await withCiscoShell(parsed.target, async ({ sendAndWait, getLastHostname }) => {
            const verRaw = await sendAndWait('show version', 10000);
            const intRaw = await sendAndWait('show ip interface brief', 8000);
            return {
              hostname: getLastHostname(),
              ...parseShowVersion(verRaw),
              ...parseInterfaceCounts(intRaw),
              latencyMs: Date.now() - startedAt,
            };
          });
          return { id, ok: true, ...data };
        } catch (err) {
          return {
            id,
            ok: false,
            error: err instanceof Error ? err.message : 'SSH check failed',
            latencyMs: Date.now() - startedAt,
          };
        }
      })
    );

    res.json({ ok: true, results });
  });

  // Backup running-config via SSH
  app.post('/api/ssh/backup', async (req: Request, res: Response) => {
    const parsed = validateTarget(req.body);
    if (!parsed.ok) {
      res.status(400).json({ ok: false, error: parsed.error });
      return;
    }

    try {
      const result = await withCiscoShell(parsed.target, async ({ sendAndWait, getLastHostname }) => {
        const runRaw = await sendAndWait('show running-config', 18000);
        const cleaned = stripCommandAndPrompt(runRaw, 'show running-config');
        return {
          hostname: getLastHostname(),
          config: cleaned,
          capturedAt: new Date().toISOString(),
        };
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(200).json({
        ok: false,
        error: err instanceof Error ? err.message : 'SSH backup failed',
      });
    }
  });

  // Push / Update config commands via SSH
  app.post('/api/ssh/push', async (req: Request, res: Response) => {
    const parsed = validateTarget(req.body);
    if (!parsed.ok) {
      res.status(400).json({ ok: false, error: parsed.error });
      return;
    }

    const body = req.body as { commands?: unknown; saveMemory?: boolean };
    if (!Array.isArray(body.commands) || body.commands.length === 0 || body.commands.length > 2000) {
      res.status(400).json({ ok: false, error: 'Provide 1 to 2000 CLI commands' });
      return;
    }

    const commands = body.commands
      .filter((c): c is string => typeof c === 'string')
      .map((c) => c.trim())
      .filter((c) => c.length > 0 && !c.startsWith('!'));

    const saveMemory = body.saveMemory !== false;

    try {
      const result = await withCiscoShell(parsed.target, async ({ sendAndWait, getLastHostname }) => {
        const transcript: string[] = [];
        const errors: string[] = [];

        const firstCmd = commands[0]?.toLowerCase() || '';
        if (firstCmd !== 'configure terminal' && firstCmd !== 'conf t' && firstCmd !== 'enable') {
          const ctOut = await sendAndWait('configure terminal', 6000);
          transcript.push(ctOut);
        }

        for (const cmd of commands) {
          const lower = cmd.toLowerCase();
          if (lower === 'enable') continue; // Already in privileged mode
          const timeout = lower.startsWith('crypto key generate') ? 25000 : 8000;
          const out = await sendAndWait(cmd, timeout);
          transcript.push(out);

          if (/continue\?\s*\[yes\/no\]|\[confirm\]/i.test(out)) {
            const confirmOut = await sendAndWait('', 8000);
            transcript.push(confirmOut);
          }

          if (
            out.includes('% Invalid input') ||
            out.includes('% Incomplete command') ||
            out.includes('% Ambiguous command')
          ) {
            errors.push(`${cmd}: ${out.trim()}`);
          }
        }

        if (saveMemory && !commands.some((c) => c.toLowerCase().startsWith('write'))) {
          await sendAndWait('end', 5000);
          const wrOut = await sendAndWait('write memory', 15000);
          transcript.push(wrOut);
          if (/\[confirm\]/i.test(wrOut)) {
            const confOut = await sendAndWait('', 10000);
            transcript.push(confOut);
          }
        }

        return {
          hostname: getLastHostname(),
          appliedCount: commands.length,
          errors,
          transcript: transcript.join('\n'),
        };
      });

      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(200).json({
        ok: false,
        error: err instanceof Error ? err.message : 'SSH push failed',
      });
    }
  });

  // Execute single show/diagnostic command via SSH
  app.post('/api/ssh/exec', async (req: Request, res: Response) => {
    const parsed = validateTarget(req.body);
    if (!parsed.ok) {
      res.status(400).json({ ok: false, error: parsed.error });
      return;
    }

    const command = typeof (req.body as { command?: unknown }).command === 'string'
      ? (req.body as { command: string }).command.trim()
      : '';
    if (!command || command.length > 500) {
      res.status(400).json({ ok: false, error: 'Command is required (max 500 chars)' });
      return;
    }

    try {
      const result = await withCiscoShell(parsed.target, async ({ sendAndWait, getLastHostname }) => {
        const out = await sendAndWait(command, 12000);
        return {
          hostname: getLastHostname(),
          output: stripCommandAndPrompt(out, command),
        };
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(200).json({
        ok: false,
        error: err instanceof Error ? err.message : 'SSH command execution failed',
      });
    }
  });

  // ==================== Local Hard-Drive Database Routes (No Login / Offline) ====================

  app.get('/api/local-db/state', async (_req: Request, res: Response) => {
    try {
      await ensureDataDirs();
      const [profiles, fleetSwitches, backups] = await Promise.all([
        readJsonArray<Record<string, unknown>>(PROFILES_FILE),
        readJsonArray<Record<string, unknown>>(FLEET_FILE),
        readJsonArray<Record<string, unknown>>(BACKUPS_FILE),
      ]);
      res.json({
        ok: true,
        dataDir: DATA_DIR,
        profiles,
        fleetSwitches,
        backups,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to read local database',
      });
    }
  });

  const sanitizeProfileRecord = (body: Record<string, unknown>, existingCreatedAt?: unknown) => {
    const id = sanitizeSafeId(body.id, 'prof');
    const now = new Date().toISOString();
    return {
      id,
      profileName:
        typeof body.profileName === 'string' && body.profileName.trim()
          ? body.profileName.trim().slice(0, 100)
          : 'Switch Config',
      modelId: typeof body.modelId === 'string' ? body.modelId.slice(0, 64) : 'c9200l-24',
      hostname: typeof body.hostname === 'string' ? body.hostname.slice(0, 64) : 'Switch',
      mgmtIp: typeof body.mgmtIp === 'string' ? body.mgmtIp.slice(0, 45) : '',
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 300) : '',
      configData: body.configData,
      generatedCli: typeof body.generatedCli === 'string' ? body.generatedCli.slice(0, 150000) : '',
      createdAt: typeof existingCreatedAt === 'string' ? existingCreatedAt : (typeof body.createdAt === 'string' ? body.createdAt : now),
      updatedAt: now,
    };
  };

  const sanitizeFleetList = (list: unknown[]) =>
    list
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .slice(0, 500)
      .map((sw) => ({
        id: sanitizeSafeId(sw.id, 'sw'),
        label: typeof sw.label === 'string' ? sw.label.slice(0, 64) : 'Switch',
        host: typeof sw.host === 'string' ? sw.host.slice(0, 253) : '',
        port: typeof sw.port === 'number' && sw.port >= 1 && sw.port <= 65535 ? Math.round(sw.port) : 22,
        username: typeof sw.username === 'string' ? sw.username.slice(0, 128) : 'netadmin',
        location: typeof sw.location === 'string' ? sw.location.slice(0, 128) : '',
        modelSeries: typeof sw.modelSeries === 'string' ? sw.modelSeries.slice(0, 80) : 'Catalyst 9200L',
        mode: sw.mode === 'simulator' ? 'simulator' : 'ssh',
        lastBackupAt: typeof sw.lastBackupAt === 'string' ? sw.lastBackupAt.slice(0, 40) : undefined,
      }));

  const sanitizeBackupRecord = (body: Record<string, unknown>) => {
    const id = sanitizeSafeId(body.id, 'bak');
    const switchId = sanitizeSafeId(body.switchId, 'sw');
    const hostname =
      typeof body.hostname === 'string'
        ? body.hostname.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64) || 'Switch'
        : 'Switch';
    const capturedAt = typeof body.capturedAt === 'string' ? body.capturedAt.slice(0, 40) : new Date().toISOString();
    const configText = typeof body.configText === 'string' ? body.configText.slice(0, 250000) : '';
    const lineCount = configText ? configText.split('\n').length : 0;
    return {
      id,
      switchId,
      hostname,
      capturedAt,
      configText,
      lineCount,
    };
  };

  app.post('/api/local-db/profiles', async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object' || !body.configData || typeof body.configData !== 'object') {
      res.status(400).json({ ok: false, error: 'Invalid switch profile payload' });
      return;
    }

    try {
      const profiles = await readJsonArray<Record<string, unknown>>(PROFILES_FILE);
      const id = sanitizeSafeId(body.id, 'prof');
      const existing = profiles.find((p) => p.id === id);
      const record = sanitizeProfileRecord({ ...body, id }, existing?.createdAt);

      const next = [record, ...profiles.filter((p) => p.id !== id)];
      await writeJsonAtomic(PROFILES_FILE, next);
      res.json({ ok: true, profile: record, dataDir: DATA_DIR });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to save switch profile to disk',
      });
    }
  });

  app.delete('/api/local-db/profiles/:id', async (req: Request, res: Response) => {
    const rawId = req.params.id;
    if (!SAFE_ID_REGEX.test(rawId)) {
      res.status(400).json({ ok: false, error: 'Invalid profile ID' });
      return;
    }
    try {
      const profiles = await readJsonArray<Record<string, unknown>>(PROFILES_FILE);
      const next = profiles.filter((p) => p.id !== rawId);
      await writeJsonAtomic(PROFILES_FILE, next);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to delete profile from disk',
      });
    }
  });

  app.put('/api/local-db/fleet', async (req: Request, res: Response) => {
    const list = (req.body as { switches?: unknown[] })?.switches;
    if (!Array.isArray(list) || list.length > 500) {
      res.status(400).json({ ok: false, error: 'Invalid fleet switches array' });
      return;
    }
    try {
      // Strip any transient runtime fields and never store secrets
      const sanitized = sanitizeFleetList(list);
      await writeJsonAtomic(FLEET_FILE, sanitized);
      res.json({ ok: true, count: sanitized.length });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to save fleet switches to disk',
      });
    }
  });

  app.post('/api/local-db/backups', async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object' || typeof body.configText !== 'string') {
      res.status(400).json({ ok: false, error: 'Invalid backup payload' });
      return;
    }
    try {
      await ensureDataDirs();
      const record = sanitizeBackupRecord(body);

      // Also save a real .cfg file on the hard drive inside data/backups/
      const safeStamp = record.capturedAt.replace(/[:.]/g, '-').slice(0, 19);
      const cfgFileName = `${record.hostname}-${safeStamp}-${record.id.slice(-4)}.cfg`;
      const resolvedCfgPath = path.resolve(BACKUPS_DIR, cfgFileName);
      if (resolvedCfgPath.startsWith(BACKUPS_DIR + path.sep)) {
        await fs.writeFile(resolvedCfgPath, record.configText, 'utf8');
      }

      const backups = await readJsonArray<Record<string, unknown>>(BACKUPS_FILE);
      const next = [record, ...backups.filter((b) => b.id !== record.id)].slice(0, 200);
      await writeJsonAtomic(BACKUPS_FILE, next);
      res.json({ ok: true, backup: record, filePath: resolvedCfgPath });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to save backup to disk',
      });
    }
  });

  app.post('/api/local-db/import', async (req: Request, res: Response) => {
    const body = req.body as { profiles?: unknown[]; fleetSwitches?: unknown[]; backups?: unknown[] } | undefined;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ ok: false, error: 'Invalid import bundle' });
      return;
    }
    try {
      await ensureDataDirs();
      if (Array.isArray(body.profiles)) {
        const sanitizedProfiles = body.profiles
          .filter(
            (p): p is Record<string, unknown> =>
              !!p &&
              typeof p === 'object' &&
              'configData' in p &&
              !!(p as Record<string, unknown>).configData &&
              typeof (p as Record<string, unknown>).configData === 'object'
          )
          .slice(0, 500)
          .map((p) => sanitizeProfileRecord(p));
        await writeJsonAtomic(PROFILES_FILE, sanitizedProfiles);
      }
      if (Array.isArray(body.fleetSwitches)) {
        const sanitizedFleet = sanitizeFleetList(body.fleetSwitches);
        await writeJsonAtomic(FLEET_FILE, sanitizedFleet);
      }
      if (Array.isArray(body.backups)) {
        const sanitizedBackups = body.backups
          .filter(
            (b): b is Record<string, unknown> =>
              !!b &&
              typeof b === 'object' &&
              'configText' in b &&
              typeof (b as Record<string, unknown>).configText === 'string'
          )
          .slice(0, 200)
          .map((b) => sanitizeBackupRecord(b));
        await writeJsonAtomic(BACKUPS_FILE, sanitizedBackups);
        for (const rec of sanitizedBackups) {
          const safeStamp = rec.capturedAt.replace(/[:.]/g, '-').slice(0, 19);
          const cfgFileName = `${rec.hostname}-${safeStamp}-${rec.id.slice(-4)}.cfg`;
          const resolvedCfgPath = path.resolve(BACKUPS_DIR, cfgFileName);
          if (resolvedCfgPath.startsWith(BACKUPS_DIR + path.sep)) {
            await fs.writeFile(resolvedCfgPath, rec.configText, 'utf8');
          }
        }
      }
      const [profiles, fleetSwitches, backups] = await Promise.all([
        readJsonArray<Record<string, unknown>>(PROFILES_FILE),
        readJsonArray<Record<string, unknown>>(FLEET_FILE),
        readJsonArray<Record<string, unknown>>(BACKUPS_FILE),
      ]);
      res.json({ ok: true, dataDir: DATA_DIR, profiles, fleetSwitches, backups });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to import database bundle',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CiscoSwitch Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
