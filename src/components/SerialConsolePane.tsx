import React, { useEffect, useRef, useState } from 'react';
import {
  Cable,
  Cpu,
  Download,
  Globe,
  Pause,
  Play,
  PlugZap,
  RotateCcw,
  Send,
  Square,
  Terminal as TerminalIcon,
  Trash2,
  Unplug,
} from 'lucide-react';
import {
  Language,
  PushOptions,
  PushProgress,
  SerialSettings,
  SwitchModelSpec,
  TerminalLine,
} from '../types/switch';
import { extractPushableCommands } from '../utils/iosGenerator';
import { isWebSerialSupported, VirtualSwitchSimulator, WebSerialClient } from '../utils/serialEngine';

interface SerialConsolePaneProps {
  cliText: string;
  model: SwitchModelSpec;
  lang: Language;
  connectionStatus: 'disconnected' | 'usb-serial' | 'simulator' | 'ssh';
  connectedPortLabel: string;
  onConnectionChange: (status: 'disconnected' | 'usb-serial' | 'simulator' | 'ssh', label: string) => void;
  autoTriggerPushCounter: number;
}

export const SerialConsolePane: React.FC<SerialConsolePaneProps> = ({
  cliText,
  model,
  lang,
  connectionStatus,
  connectedPortLabel,
  onConnectionChange,
  autoTriggerPushCounter,
}) => {
  const [transportTab, setTransportTab] = useState<'serial' | 'ssh'>('serial');

  const [serialSettings, setSerialSettings] = useState<SerialSettings>({
    baudRate: model.defaultBaud || 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none',
  });

  const [sshTarget, setSshTarget] = useState({
    host: '192.168.99.10',
    port: 22,
    username: 'netadmin',
    password: '',
    enableSecret: '',
  });

  const [pushOptions, setPushOptions] = useState<PushOptions>({
    lineDelayMs: 65,
    autoEnterConfT: false,
    autoSaveWriteMem: true,
    stopOnError: true,
    enablePasswordForExec: '',
  });

  const [pushProgress, setPushProgress] = useState<PushProgress>({
    status: 'idle',
    currentLine: 0,
    totalLines: 0,
    lastCommand: '',
  });

  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      direction: 'sys',
      text: 'CiscoSwitch Studio Console ready. Connect via USB/RS232 Serial, SSH, or Virtual Switch.',
    },
  ]);

  const [cmdInput, setCmdInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sshBusy, setSshBusy] = useState(false);

  const serialClientRef = useRef<WebSerialClient | null>(null);
  const simulatorRef = useRef<VirtualSwitchSimulator>(new VirtualSwitchSimulator(model.name));
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const rxBufferRef = useRef<string>('');
  const pushAbortRef = useRef<boolean>(false);
  const pushPausedRef = useRef<boolean>(false);
  const recentErrorDetectedRef = useRef<string | null>(null);

  useEffect(() => {
    simulatorRef.current.setModelName(model.name);
  }, [model.name]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLines]);

  const appendLog = (direction: TerminalLine['direction'], text: string) => {
    const clean = text.replace(/\r/g, '');
    if (!clean) return;
    const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setTerminalLines((prev) => [
      ...prev.slice(-450),
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp,
        direction,
        text: clean,
      },
    ]);
  };

  const handleSerialRxChunk = (chunk: string) => {
    rxBufferRef.current += chunk;
    if (
      rxBufferRef.current.includes('% Invalid input') ||
      rxBufferRef.current.includes('% Incomplete command') ||
      rxBufferRef.current.includes('% Ambiguous command')
    ) {
      const match = rxBufferRef.current.match(/% [^\r\n]+/);
      recentErrorDetectedRef.current = match ? match[0] : '% Cisco IOS CLI Error';
    }

    const parts = rxBufferRef.current.split('\n');
    if (parts.length > 1) {
      for (let i = 0; i < parts.length - 1; i++) {
        appendLog('rx', parts[i]);
      }
      rxBufferRef.current = parts[parts.length - 1];
    } else if (
      rxBufferRef.current.endsWith('>') ||
      rxBufferRef.current.endsWith('#') ||
      rxBufferRef.current.endsWith(':')
    ) {
      appendLog('rx', rxBufferRef.current);
      rxBufferRef.current = '';
    }
  };

  const handleConnectUsbSerial = async () => {
    setConnectionError(null);
    if (!isWebSerialSupported()) {
      setConnectionError(
        lang === 'fa'
          ? 'مرورگر فعلی از Web Serial API پشتیبانی نمی‌کند. در ویندوز از Google Chrome یا Microsoft Edge استفاده کنید، یا از شبیه‌ساز داخلی استفاده نمایید.'
          : 'Web Serial API is not supported in this browser. Use Chrome or Edge on Windows, or launch the Virtual Switch.'
      );
      return;
    }

    try {
      const client = new WebSerialClient();
      const portLabel = await client.connect(
        serialSettings,
        handleSerialRxChunk,
        (reason) => {
          onConnectionChange('disconnected', '');
          appendLog('err', `Serial disconnected${reason ? `: ${reason}` : ''}`);
        }
      );
      serialClientRef.current = client;
      onConnectionChange('usb-serial', portLabel);
      appendLog(
        'sys',
        `Connected to ${portLabel} (${serialSettings.baudRate} baud, ${serialSettings.dataBits}${serialSettings.parity[0].toUpperCase()}${serialSettings.stopBits})`
      );
      await client.writeRaw('\r');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('no port selected')) {
        return;
      }
      const isPolicyError = msg.toLowerCase().includes('permissions policy') || msg.toLowerCase().includes('disallowed');
      setConnectionError(
        isPolicyError
          ? lang === 'fa'
            ? 'دسترسی Web Serial در محیط پیش‌نمایش iframe مسدود شده است. برای اتصال واقعی به کابل، اپلیکیشن را در تب مستقل باز کنید یا از شبیه‌ساز سوییچ استفاده کنید.'
            : 'Web Serial is blocked inside this iframe preview. Open the app in a dedicated browser tab for physical COM port access, or use the Virtual Switch.'
          : msg
      );
    }
  };

  const handleConnectSsh = async () => {
    setConnectionError(null);
    if (!sshTarget.host.trim() || !sshTarget.username.trim() || !sshTarget.password) {
      setConnectionError(
        lang === 'fa'
          ? 'لطفاً آدرس IP سوییچ، نام کاربری و رمز SSH را وارد کنید.'
          : 'Enter switch IP/Host, SSH username, and password.'
      );
      return;
    }

    setSshBusy(true);
    try {
      const res = await fetch('/api/ssh/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sshTarget),
      });
      const data = await res.json();
      if (!data.ok) {
        setConnectionError(data.error || 'SSH connection failed');
        appendLog('err', `SSH Error (${sshTarget.host}): ${data.error}`);
        return;
      }
      onConnectionChange('ssh', `${data.hostname} (${sshTarget.host})`);
      appendLog(
        'sys',
        `SSH Connected to ${data.hostname} [${sshTarget.host}:${sshTarget.port}] · ${data.model} · IOS ${data.iosVersion} · ${data.latencyMs}ms`
      );
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : 'Network error reaching SSH backend');
    } finally {
      setSshBusy(false);
    }
  };

  const handleConnectSimulator = () => {
    setConnectionError(null);
    simulatorRef.current.reset();
    onConnectionChange('simulator', `Virtual ${model.series}`);
    appendLog('sys', `Virtual Switch Console started (${model.name}) at ${serialSettings.baudRate} bps.`);
    appendLog('rx', simulatorRef.current.getPrompt());
  };

  const handleDisconnect = async () => {
    pushAbortRef.current = true;
    if (serialClientRef.current) {
      await serialClientRef.current.disconnect();
      serialClientRef.current = null;
    }
    onConnectionChange('disconnected', '');
    appendLog('sys', 'Console session closed.');
  };

  const sendLineToActiveTarget = async (line: string) => {
    appendLog('tx', line);
    if (connectionStatus === 'usb-serial' && serialClientRef.current) {
      await serialClientRef.current.writeLine(line);
    } else if (connectionStatus === 'simulator') {
      const reply = simulatorRef.current.processInput(line);
      if (reply) {
        for (const l of reply.split('\r\n')) {
          if (l.trim()) appendLog('rx', l);
        }
      }
    } else if (connectionStatus === 'ssh') {
      if (!line.trim()) return;
      try {
        const res = await fetch('/api/ssh/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...sshTarget, command: line }),
        });
        const data = await res.json();
        if (data.ok) {
          for (const l of String(data.output || '').split('\n')) {
            if (l.trim()) appendLog('rx', l);
          }
        } else {
          appendLog('err', data.error || 'SSH command failed');
        }
      } catch (err) {
        appendLog('err', err instanceof Error ? err.message : 'SSH request failed');
      }
    }
  };

  const sendControlSignal = async (signal: '\r' | '\x03' | '\x1a' | 'break') => {
    if (connectionStatus === 'disconnected') return;
    if (connectionStatus === 'usb-serial' && serialClientRef.current) {
      if (signal === 'break') {
        await serialClientRef.current.sendBreakSignal();
        appendLog('sys', 'Sent RS232 BREAK signal');
      } else {
        await serialClientRef.current.writeRaw(signal);
        appendLog('tx', signal === '\x03' ? '^C' : signal === '\x1a' ? '^Z' : '<ENTER>');
      }
    } else if (connectionStatus === 'simulator') {
      if (signal === 'break') {
        appendLog('sys', 'Virtual switch: BREAK ignored outside ROMMON');
        return;
      }
      const reply = simulatorRef.current.processInput(signal === '\r' ? '' : signal);
      for (const l of reply.split('\r\n')) {
        if (l.trim()) appendLog('rx', l);
      }
    }
  };

  const handleTerminalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (connectionStatus === 'disconnected') return;
    const cmd = cmdInput;
    setCmdInput('');
    if (cmd.trim()) {
      setCmdHistory((prev) => [cmd, ...prev.slice(0, 49)]);
      setHistoryIndex(-1);
    }
    await sendLineToActiveTarget(cmd);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextIdx = Math.min(historyIndex + 1, cmdHistory.length - 1);
      if (cmdHistory[nextIdx] !== undefined) {
        setHistoryIndex(nextIdx);
        setCmdInput(cmdHistory[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = historyIndex - 1;
      if (nextIdx < 0) {
        setHistoryIndex(-1);
        setCmdInput('');
      } else if (cmdHistory[nextIdx] !== undefined) {
        setHistoryIndex(nextIdx);
        setCmdInput(cmdHistory[nextIdx]);
      }
    }
  };

  const startConfigPush = async () => {
    if (connectionStatus === 'disconnected') {
      setConnectionError(
        lang === 'fa'
          ? 'ابتدا کابل کنسول USB/RS232، ارتباط SSH یا شبیه‌ساز سوییچ را متصل کنید.'
          : 'Connect USB/RS232 console, SSH target, or Virtual Switch first.'
      );
      return;
    }

    const baseCommands = extractPushableCommands(cliText);

    // SSH Batch Push via Backend
    if (connectionStatus === 'ssh') {
      setPushProgress({
        status: 'pushing',
        currentLine: 0,
        totalLines: baseCommands.length,
        lastCommand: 'Sending batch configuration over SSH...',
      });
      appendLog('sys', `Pushing ${baseCommands.length} commands to ${sshTarget.host} via SSH...`);

      try {
        const res = await fetch('/api/ssh/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...sshTarget,
            commands: baseCommands,
            saveMemory: pushOptions.autoSaveWriteMem,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          setPushProgress({
            status: 'error',
            currentLine: 0,
            totalLines: baseCommands.length,
            lastCommand: '',
            errorMessage: data.error,
          });
          appendLog('err', `SSH Push failed: ${data.error}`);
          return;
        }

        if (data.transcript) {
          for (const line of String(data.transcript).split('\n').slice(-24)) {
            if (line.trim()) appendLog('rx', line);
          }
        }

        if (Array.isArray(data.errors) && data.errors.length > 0) {
          setPushProgress({
            status: 'error',
            currentLine: baseCommands.length,
            totalLines: baseCommands.length,
            lastCommand: '',
            errorMessage: data.errors[0],
          });
          appendLog('err', `Applied with ${data.errors.length} CLI warning(s): ${data.errors[0]}`);
        } else {
          setPushProgress({
            status: 'completed',
            currentLine: baseCommands.length,
            totalLines: baseCommands.length,
            lastCommand: 'write memory',
          });
          appendLog('sys', `SSH configuration successfully applied to ${data.hostname}.`);
        }
      } catch (err) {
        setPushProgress({
          status: 'error',
          currentLine: 0,
          totalLines: baseCommands.length,
          lastCommand: '',
          errorMessage: err instanceof Error ? err.message : 'SSH request failed',
        });
      }
      return;
    }

    // Serial / Simulator Line-by-line Paced Push
    const commands: string[] = [];
    if (pushOptions.autoEnterConfT) {
      commands.push('enable');
      if (pushOptions.enablePasswordForExec.trim()) {
        commands.push(pushOptions.enablePasswordForExec.trim());
      }
      commands.push('configure terminal');
    }

    commands.push(...baseCommands);

    if (pushOptions.autoSaveWriteMem && !commands.includes('write memory')) {
      commands.push('end');
      commands.push('write memory');
    }

    pushAbortRef.current = false;
    pushPausedRef.current = false;
    recentErrorDetectedRef.current = null;

    setPushProgress({
      status: 'pushing',
      currentLine: 0,
      totalLines: commands.length,
      lastCommand: '',
    });

    appendLog('sys', `Starting direct config push (${commands.length} commands, ${pushOptions.lineDelayMs}ms/line)...`);

    for (let i = 0; i < commands.length; i++) {
      if (pushAbortRef.current) {
        setPushProgress((prev) => ({ ...prev, status: 'aborted' }));
        appendLog('err', `Config push aborted at line ${i + 1}/${commands.length}.`);
        return;
      }

      while (pushPausedRef.current) {
        if (pushAbortRef.current) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      const cmd = commands[i];
      setPushProgress({
        status: 'pushing',
        currentLine: i + 1,
        totalLines: commands.length,
        lastCommand: cmd,
      });

      await sendLineToActiveTarget(cmd);

      const extraDelay = cmd.startsWith('crypto key generate') ? 1200 : cmd === 'write memory' ? 600 : 0;
      await new Promise((r) => setTimeout(r, pushOptions.lineDelayMs + extraDelay));

      if (pushOptions.stopOnError && recentErrorDetectedRef.current) {
        const errMsg = recentErrorDetectedRef.current;
        recentErrorDetectedRef.current = null;
        setPushProgress({
          status: 'error',
          currentLine: i + 1,
          totalLines: commands.length,
          lastCommand: cmd,
          errorMessage: errMsg,
        });
        appendLog('err', `Stopped on CLI error after "${cmd}": ${errMsg}`);
        return;
      }
    }

    setPushProgress({
      status: 'completed',
      currentLine: commands.length,
      totalLines: commands.length,
      lastCommand: commands[commands.length - 1] || '',
    });
    appendLog('sys', 'Configuration successfully loaded onto switch.');
  };

  useEffect(() => {
    if (autoTriggerPushCounter > 0) {
      if (connectionStatus !== 'disconnected') {
        startConfigPush();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTriggerPushCounter]);

  const handleDownloadLog = () => {
    const text = terminalLines.map((l) => `[${l.timestamp}] [${l.direction.toUpperCase()}] ${l.text}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `console-session-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const progressPct =
    pushProgress.totalLines > 0 ? Math.round((pushProgress.currentLine / pushProgress.totalLines) * 100) : 0;

  return (
    <div className="flex flex-col h-full gap-3.5">
      {/* Transport Connection Card (USB/RS232 vs SSH) */}
      <div className="bg-white border border-slate-200 rounded-md p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded">
            <button
              type="button"
              disabled={connectionStatus !== 'disconnected'}
              onClick={() => setTransportTab('serial')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                transportTab === 'serial'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 disabled:opacity-60'
              }`}
            >
              <Cable className="w-3.5 h-3.5" />
              <span>{lang === 'fa' ? 'کابل کنسول USB / RS232' : 'USB / RS232 Serial'}</span>
            </button>
            <button
              type="button"
              disabled={connectionStatus !== 'disconnected'}
              onClick={() => setTransportTab('ssh')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                transportTab === 'ssh'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 disabled:opacity-60'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'fa' ? 'اتصال شبکه SSH' : 'SSH Network'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {connectionStatus === 'disconnected' ? (
              transportTab === 'serial' ? (
                <>
                  <button
                    type="button"
                    onClick={handleConnectUsbSerial}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors whitespace-nowrap shrink-0"
                  >
                    <PlugZap className="w-3.5 h-3.5" />
                    <span>{lang === 'fa' ? 'انتخاب پورت COM / USB' : 'Select COM / USB'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleConnectSimulator}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded transition-colors whitespace-nowrap shrink-0"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>{lang === 'fa' ? 'شبیه‌ساز' : 'Simulator'}</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={sshBusy}
                  onClick={handleConnectSsh}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded transition-colors whitespace-nowrap shrink-0"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{sshBusy ? (lang === 'fa' ? 'در حال اتصال...' : 'Connecting...') : lang === 'fa' ? 'اتصال SSH' : 'Connect SSH'}</span>
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={handleDisconnect}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors whitespace-nowrap shrink-0"
              >
                <Unplug className="w-3.5 h-3.5" />
                <span>{lang === 'fa' ? 'قطع اتصال' : 'Disconnect'}</span>
              </button>
            )}
          </div>
        </div>

        {transportTab === 'serial' ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2.5" dir="ltr">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Baud Rate</label>
              <select
                disabled={connectionStatus !== 'disconnected'}
                value={serialSettings.baudRate}
                onChange={(e) => setSerialSettings((s) => ({ ...s, baudRate: Number(e.target.value) }))}
                className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded bg-white disabled:bg-slate-100"
              >
                <option value={9600}>9600 (Default)</option>
                <option value={19200}>19200</option>
                <option value={38400}>38400</option>
                <option value={57600}>57600</option>
                <option value={115200}>115200</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Data Bits</label>
              <select
                disabled={connectionStatus !== 'disconnected'}
                value={serialSettings.dataBits}
                onChange={(e) => setSerialSettings((s) => ({ ...s, dataBits: Number(e.target.value) as 7 | 8 }))}
                className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded bg-white disabled:bg-slate-100"
              >
                <option value={8}>8</option>
                <option value={7}>7</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Parity</label>
              <select
                disabled={connectionStatus !== 'disconnected'}
                value={serialSettings.parity}
                onChange={(e) =>
                  setSerialSettings((s) => ({ ...s, parity: e.target.value as SerialSettings['parity'] }))
                }
                className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded bg-white disabled:bg-slate-100"
              >
                <option value="none">None</option>
                <option value="even">Even</option>
                <option value="odd">Odd</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Stop Bits</label>
              <select
                disabled={connectionStatus !== 'disconnected'}
                value={serialSettings.stopBits}
                onChange={(e) => setSerialSettings((s) => ({ ...s, stopBits: Number(e.target.value) as 1 | 2 }))}
                className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded bg-white disabled:bg-slate-100"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Flow</label>
              <select
                disabled={connectionStatus !== 'disconnected'}
                value={serialSettings.flowControl}
                onChange={(e) =>
                  setSerialSettings((s) => ({ ...s, flowControl: e.target.value as SerialSettings['flowControl'] }))
                }
                className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded bg-white disabled:bg-slate-100"
              >
                <option value="none">None</option>
                <option value="hardware">RTS/CTS</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2.5" dir="ltr">
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Switch IP / Hostname</label>
              <input
                type="text"
                disabled={connectionStatus !== 'disconnected'}
                value={sshTarget.host}
                onChange={(e) => setSshTarget((s) => ({ ...s, host: e.target.value }))}
                className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded bg-white disabled:bg-slate-100"
                placeholder="192.168.99.10"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Port</label>
              <input
                type="number"
                disabled={connectionStatus !== 'disconnected'}
                value={sshTarget.port}
                onChange={(e) => setSshTarget((s) => ({ ...s, port: Number(e.target.value) || 22 }))}
                className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded bg-white disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Username</label>
              <input
                type="text"
                disabled={connectionStatus !== 'disconnected'}
                value={sshTarget.username}
                onChange={(e) => setSshTarget((s) => ({ ...s, username: e.target.value }))}
                className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded bg-white disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Password</label>
              <input
                type="password"
                disabled={connectionStatus !== 'disconnected'}
                value={sshTarget.password}
                onChange={(e) => setSshTarget((s) => ({ ...s, password: e.target.value }))}
                className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded bg-white disabled:bg-slate-100"
                placeholder="••••••"
              />
            </div>
          </div>
        )}

        {connectionError && (
          <div className="mt-2.5 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex flex-wrap items-center justify-between gap-2">
            <span>{connectionError}</span>
            {transportTab === 'serial' && (
              <button
                type="button"
                onClick={handleConnectSimulator}
                className="px-2.5 py-1 bg-white border border-red-300 rounded text-xs font-medium text-red-900 hover:bg-red-100"
              >
                {lang === 'fa' ? 'اجرای شبیه‌ساز سوییچ' : 'Launch Virtual Switch'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Direct Config Push Control Panel */}
      <div className="bg-white border border-slate-200 rounded-md p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {lang === 'fa' ? 'بارگذاری مستقیم کانفیگ روی سوییچ' : 'Direct Config Loader'}
            </h3>
            <p className="text-xs text-slate-500">
              {connectionStatus === 'ssh'
                ? lang === 'fa'
                  ? 'ارسال یکجای دستورات از طریق SSH به سوییچ مقصد'
                  : 'Push generated CLI commands directly over SSH'
                : lang === 'fa'
                  ? 'ارسال خط‌به‌خط با تاخیر کنترل‌شده روی کابل کنسول'
                  : 'Line-by-line paced serial injection'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {pushProgress.status === 'pushing' || pushProgress.status === 'paused' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    pushPausedRef.current = !pushPausedRef.current;
                    setPushProgress((p) => ({ ...p, status: pushPausedRef.current ? 'paused' : 'pushing' }));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded transition-colors"
                >
                  {pushProgress.status === 'paused' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  <span>{pushProgress.status === 'paused' ? (lang === 'fa' ? 'ادامه' : 'Resume') : lang === 'fa' ? 'توقف' : 'Pause'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pushAbortRef.current = true;
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>{lang === 'fa' ? 'لغو' : 'Abort'}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startConfigPush}
                disabled={connectionStatus === 'disconnected'}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 rounded transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{lang === 'fa' ? 'شروع بارگذاری کانفیگ' : 'Push Config Now'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-xs text-slate-700">
          {connectionStatus !== 'ssh' && (
            <div className="flex items-center gap-2">
              <span>{lang === 'fa' ? 'تاخیر بین خطوط:' : 'Line Delay:'}</span>
              <input
                type="range"
                min={25}
                max={300}
                step={5}
                value={pushOptions.lineDelayMs}
                onChange={(e) => setPushOptions((o) => ({ ...o, lineDelayMs: Number(e.target.value) }))}
                className="w-24 accent-blue-600"
              />
              <span className="font-mono text-slate-900 tabular-nums w-12" dir="ltr">
                {pushOptions.lineDelayMs}ms
              </span>
            </div>
          )}

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={pushOptions.autoSaveWriteMem}
              onChange={(e) => setPushOptions((o) => ({ ...o, autoSaveWriteMem: e.target.checked }))}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600"
            />
            <span>{lang === 'fa' ? 'ذخیره خودکار (write memory)' : 'Auto write memory'}</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={pushOptions.stopOnError}
              onChange={(e) => setPushOptions((o) => ({ ...o, stopOnError: e.target.checked }))}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600"
            />
            <span>{lang === 'fa' ? 'توقف هنگام خطای CLI' : 'Stop on CLI error'}</span>
          </label>
        </div>

        {pushProgress.status !== 'idle' && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-slate-700">
                {pushProgress.status === 'completed'
                  ? lang === 'fa'
                    ? 'بارگذاری با موفقیت انجام شد'
                    : 'Upload completed'
                  : pushProgress.status === 'error'
                    ? pushProgress.errorMessage
                    : pushProgress.status === 'aborted'
                      ? lang === 'fa'
                        ? 'عملیات متوقف شد'
                        : 'Aborted'
                      : lang === 'fa'
                        ? 'در حال ارسال دستورات به سوییچ...'
                        : 'Sending commands...'}
              </span>
              <span className="font-mono text-slate-600 tabular-nums" dir="ltr">
                {pushProgress.currentLine}/{pushProgress.totalLines} ({progressPct}%)
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded overflow-hidden">
              <div
                className={`h-full transition-all duration-150 ${
                  pushProgress.status === 'error' || pushProgress.status === 'aborted'
                    ? 'bg-red-500'
                    : pushProgress.status === 'completed'
                      ? 'bg-emerald-600'
                      : 'bg-blue-600'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Interactive Terminal Emulator */}
      <div className="flex-1 min-h-[240px] flex flex-col bg-[#0E131A] border border-slate-800 rounded-md overflow-hidden">
        <div className="px-3 py-2 bg-[#161C26] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-200">
            <TerminalIcon className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-medium">{lang === 'fa' ? 'ترمینال زنده' : 'Live Terminal'}</span>
            <span className="text-slate-500 font-mono" dir="ltr">
              · {connectionStatus === 'disconnected' ? 'OFFLINE' : connectedPortLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1" dir="ltr">
            {connectionStatus !== 'ssh' && (
              <>
                <button
                  type="button"
                  onClick={() => sendControlSignal('\r')}
                  disabled={connectionStatus === 'disconnected'}
                  className="px-2 py-0.5 text-[11px] font-mono text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
                >
                  Enter
                </button>
                <button
                  type="button"
                  onClick={() => sendControlSignal('\x03')}
                  disabled={connectionStatus === 'disconnected'}
                  className="px-2 py-0.5 text-[11px] font-mono text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
                >
                  Ctrl+C
                </button>
                <button
                  type="button"
                  onClick={() => sendControlSignal('\x1a')}
                  disabled={connectionStatus === 'disconnected'}
                  className="px-2 py-0.5 text-[11px] font-mono text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
                >
                  Ctrl+Z
                </button>
                <button
                  type="button"
                  onClick={() => sendControlSignal('break')}
                  disabled={connectionStatus !== 'usb-serial'}
                  className="px-2 py-0.5 text-[11px] font-mono text-amber-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
                >
                  Break
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => sendLineToActiveTarget('show version')}
              disabled={connectionStatus === 'disconnected'}
              className="px-2 py-0.5 text-[11px] font-mono text-sky-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
            >
              sh ver
            </button>
            <button
              type="button"
              onClick={() => sendLineToActiveTarget('show vlan brief')}
              disabled={connectionStatus === 'disconnected'}
              className="px-2 py-0.5 text-[11px] font-mono text-sky-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
            >
              sh vlan
            </button>
            <button
              type="button"
              onClick={() => sendLineToActiveTarget('show ip interface brief')}
              disabled={connectionStatus === 'disconnected'}
              className="px-2 py-0.5 text-[11px] font-mono text-sky-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
            >
              sh ip int br
            </button>
            <button
              type="button"
              onClick={handleDownloadLog}
              className="p-1 text-slate-400 hover:text-white rounded"
              title="Save Session Log"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTerminalLines([])}
              className="p-1 text-slate-400 hover:text-red-400 rounded"
              title="Clear Terminal"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {connectionStatus === 'simulator' && (
              <button
                type="button"
                onClick={() => {
                  simulatorRef.current.reset();
                  appendLog('sys', 'Virtual Switch reset to factory prompt.');
                  appendLog('rx', simulatorRef.current.getPrompt());
                }}
                className="p-1 text-slate-400 hover:text-amber-300 rounded"
                title="Reset Virtual Switch"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div dir="ltr" className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-5 space-y-0.5">
          {terminalLines.map((item) => (
            <div key={item.id} className="flex gap-2">
              <span className="text-slate-600 select-none shrink-0 tabular-nums">{item.timestamp}</span>
              <span
                className={`whitespace-pre-wrap break-all ${
                  item.direction === 'tx'
                    ? 'text-sky-300'
                    : item.direction === 'err'
                      ? 'text-red-400'
                      : item.direction === 'sys'
                        ? 'text-amber-300'
                        : 'text-emerald-300'
                }`}
              >
                {item.direction === 'tx' ? `> ${item.text}` : item.text}
              </span>
            </div>
          ))}
          <div ref={terminalEndRef} />
        </div>

        <form onSubmit={handleTerminalSubmit} dir="ltr" className="border-t border-slate-800 bg-[#141A23] flex">
          <span className="px-3 py-2 text-xs font-mono text-sky-400 select-none">CLI&gt;</span>
          <input
            type="text"
            disabled={connectionStatus === 'disconnected'}
            value={cmdInput}
            onChange={(e) => setCmdInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={
              connectionStatus === 'disconnected'
                ? 'Connect serial port, SSH, or virtual switch...'
                : 'Type Cisco IOS command (e.g. show version, show running-config)...'
            }
            className="flex-1 bg-transparent text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none py-2 pr-2"
          />
          <button
            type="submit"
            disabled={connectionStatus === 'disconnected'}
            className="px-3.5 py-2 text-xs font-medium text-sky-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};
