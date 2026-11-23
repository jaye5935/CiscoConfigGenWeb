import { SerialSettings } from '../types/switch';

// Web Serial API TypeScript declarations (Chrome/Edge on Windows/macOS/Linux)
export interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface SerialPort {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: {
    baudRate: number;
    dataBits?: 7 | 8;
    stopBits?: 1 | 2;
    parity?: 'none' | 'even' | 'odd';
    bufferSize?: number;
    flowControl?: 'none' | 'hardware';
  }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
  setSignals?(signals: { dataTerminalReady?: boolean; requestToSend?: boolean; break?: boolean }): Promise<void>;
}

interface NavigatorWithSerial extends Navigator {
  serial?: {
    requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>;
    getPorts(): Promise<SerialPort[]>;
  };
}

export const KNOWN_USB_SERIAL_VENDORS: Record<number, string> = {
  0x0403: 'FTDI USB-to-Serial (FT232R/FT2232)',
  0x067b: 'Prolific PL2303 RS232 Adapter',
  0x10c4: 'Silicon Labs CP210x (Cisco USB Console)',
  0x1a86: 'WCH CH340 / CH341 USB-Serial',
  0x05a6: 'Cisco Systems USB Console',
  0x04b4: 'Cypress USB-UART Bridge',
};

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export function describeSerialPort(port: SerialPort): string {
  try {
    const info = port.getInfo();
    if (info.usbVendorId !== undefined) {
      const vendor = KNOWN_USB_SERIAL_VENDORS[info.usbVendorId] || `USB VID: 0x${info.usbVendorId.toString(16).toUpperCase()}`;
      const pid = info.usbProductId !== undefined ? ` (PID: 0x${info.usbProductId.toString(16).toUpperCase()})` : '';
      return `${vendor}${pid}`;
    }
    return 'RS232 Hardware COM Port';
  } catch {
    return 'Serial COM Port';
  }
}

export class WebSerialClient {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private keepReading = false;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();

  async connect(
    settings: SerialSettings,
    onData: (text: string) => void,
    onDisconnect: (reason?: string) => void
  ): Promise<string> {
    const nav = navigator as NavigatorWithSerial;
    if (!nav.serial) {
      throw new Error('Web Serial API is not supported in this browser. Use Microsoft Edge or Google Chrome on Windows.');
    }

    const port = await nav.serial.requestPort();
    await port.open({
      baudRate: settings.baudRate,
      dataBits: settings.dataBits,
      stopBits: settings.stopBits,
      parity: settings.parity,
      flowControl: settings.flowControl,
    });

    this.port = port;
    this.keepReading = true;

    if (port.writable) {
      this.writer = port.writable.getWriter();
    }

    this.readLoop(onData, onDisconnect);
    return describeSerialPort(port);
  }

  private async readLoop(onData: (text: string) => void, onDisconnect: (reason?: string) => void) {
    if (!this.port?.readable) return;
    this.reader = this.port.readable.getReader();
    try {
      while (this.keepReading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          const decoded = this.decoder.decode(value, { stream: true });
          if (decoded) onData(decoded);
        }
      }
    } catch (err) {
      if (this.keepReading) {
        onDisconnect(err instanceof Error ? err.message : 'Serial read error');
      }
    } finally {
      try {
        this.reader?.releaseLock();
      } catch {
        // ignore
      }
      this.reader = null;
    }
  }

  async writeRaw(data: string): Promise<void> {
    if (!this.writer) throw new Error('Serial port is not writable');
    await this.writer.write(this.encoder.encode(data));
  }

  async writeLine(line: string): Promise<void> {
    await this.writeRaw(`${line}\r`);
  }

  async sendBreakSignal(): Promise<void> {
    if (this.port?.setSignals) {
      await this.port.setSignals({ break: true });
      await new Promise((r) => setTimeout(r, 250));
      await this.port.setSignals({ break: false });
    }
  }

  async disconnect(): Promise<void> {
    this.keepReading = false;
    try {
      await this.reader?.cancel();
    } catch {
      // ignore
    }
    try {
      this.writer?.releaseLock();
    } catch {
      // ignore
    }
    this.writer = null;
    try {
      await this.port?.close();
    } catch {
      // ignore
    }
    this.port = null;
  }
}

/**
 * Built-in virtual Cisco IOS switch simulator for testing config pushes
 * without physical hardware or in sandboxed preview environments.
 */
export class VirtualSwitchSimulator {
  private hostname = 'Switch';
  private mode: 'user' | 'priv' | 'config' | 'config-if' | 'config-vlan' | 'config-line' | 'banner' = 'user';
  private currentIf = '';
  private vlans = new Map<number, string>([[1, 'default']]);
  private mgmtIp = 'unassigned';
  private appliedLines: string[] = [];
  private modelName: string;

  constructor(modelName = 'C9200L-24P-4X-E') {
    this.modelName = modelName;
  }

  setModelName(name: string) {
    this.modelName = name;
  }

  getPrompt(): string {
    switch (this.mode) {
      case 'user':
        return `${this.hostname}>`;
      case 'priv':
        return `${this.hostname}#`;
      case 'config':
        return `${this.hostname}(config)#`;
      case 'config-if':
        return `${this.hostname}(config-if)#`;
      case 'config-vlan':
        return `${this.hostname}(config-vlan)#`;
      case 'config-line':
        return `${this.hostname}(config-line)#`;
      case 'banner':
        return '';
    }
  }

  reset() {
    this.hostname = 'Switch';
    this.mode = 'user';
    this.appliedLines = [];
    this.vlans = new Map([[1, 'default']]);
    this.mgmtIp = 'unassigned';
  }

  processInput(raw: string): string {
    // Handle Ctrl+Z (\x1a) or Ctrl+C (\x03)
    if (raw === '\x1a' || raw === '\x03') {
      if (this.mode !== 'user' && this.mode !== 'priv') {
        this.mode = 'priv';
        return `\r\n%SYS-5-CONFIG_I: Configured from console by console\r\n${this.getPrompt()}`;
      }
      return `\r\n${this.getPrompt()}`;
    }

    const cmd = raw.replace(/\r?\n$/, '').trim();

    if (this.mode === 'banner') {
      if (cmd.includes('^C') || cmd === '\x03') {
        this.mode = 'config';
        return `\r\n${this.getPrompt()}`;
      }
      return '\r\n';
    }

    if (!cmd) {
      return `\r\n${this.getPrompt()}`;
    }

    const lower = cmd.toLowerCase();

    if (this.mode === 'user') {
      if (lower === 'en' || lower === 'enable') {
        this.mode = 'priv';
        return `\r\n${this.getPrompt()}`;
      }
      if (lower.startsWith('sh') && lower.includes('ver')) {
        return `\r\nCisco IOS Software, ${this.modelName} Software, Version 17.9.4a\r\n${this.getPrompt()}`;
      }
      return `\r\n% Unprivileged mode. Type "enable" first.\r\n${this.getPrompt()}`;
    }

    if (this.mode === 'priv') {
      if (lower === 'conf t' || lower === 'configure terminal' || lower === 'conf term') {
        this.mode = 'config';
        return `\r\nEnter configuration commands, one per line.  End with CNTL/Z.\r\n${this.getPrompt()}`;
      }
      if (lower === 'wr' || lower === 'wr mem' || lower === 'write memory' || lower === 'copy run start') {
        return `\r\nBuilding configuration...\r\n[OK]\r\n${this.getPrompt()}`;
      }
      if (lower.startsWith('sh') && lower.includes('vlan')) {
        const rows = Array.from(this.vlans.entries())
          .map(([id, name]) => `${String(id).padEnd(5)} ${name.padEnd(28)} active`)
          .join('\r\n');
        return `\r\nVLAN Name                             Status    Ports\r\n---- -------------------------------- --------- -------------------------------\r\n${rows}\r\n${this.getPrompt()}`;
      }
      if (lower.startsWith('sh') && lower.includes('ip int')) {
        return `\r\nInterface              IP-Address      OK? Method Status                Protocol\r\nVlan99                 ${this.mgmtIp.padEnd(15)} YES manual up                    up\r\n${this.getPrompt()}`;
      }
      if (lower.startsWith('sh') && lower.includes('ver')) {
        return `\r\nCisco IOS XE Software, Version 17.09.04a\r\nModel number: ${this.modelName}\r\nSystem uptime: 0 days, 0 hours, 14 minutes\r\n${this.getPrompt()}`;
      }
      if (lower.startsWith('sh') && lower.includes('run')) {
        return `\r\nBuilding configuration...\r\nhostname ${this.hostname}\r\n${this.appliedLines.slice(-18).join('\r\n')}\r\nend\r\n${this.getPrompt()}`;
      }
      if (lower === 'disable' || lower === 'exit') {
        this.mode = 'user';
        return `\r\n${this.getPrompt()}`;
      }
      return `\r\n${this.getPrompt()}`;
    }

    // Global & Sub-configuration modes
    if (lower === 'end') {
      this.mode = 'priv';
      return `\r\n%SYS-5-CONFIG_I: Configured from console by console\r\n${this.getPrompt()}`;
    }

    if (lower === 'exit') {
      if (this.mode === 'config') {
        this.mode = 'priv';
      } else {
        this.mode = 'config';
      }
      return `\r\n${this.getPrompt()}`;
    }

    if (lower === 'enable' || lower === 'configure terminal' || lower === 'conf t') {
      this.mode = 'config';
      return `\r\n${this.getPrompt()}`;
    }

    this.appliedLines.push(cmd);

    if (this.mode === 'config') {
      if (lower.startsWith('hostname ')) {
        this.hostname = cmd.split(/\s+/)[1] || this.hostname;
      } else if (lower.startsWith('vlan ')) {
        const id = parseInt(cmd.split(/\s+/)[1], 10);
        if (!isNaN(id)) {
          this.vlans.set(id, this.vlans.get(id) || `VLAN${String(id).padStart(4, '0')}`);
          this.currentIf = String(id);
          this.mode = 'config-vlan';
        }
      } else if (lower.startsWith('interface ') || lower.startsWith('int ')) {
        this.currentIf = cmd;
        this.mode = 'config-if';
      } else if (lower.startsWith('line ')) {
        this.mode = 'config-line';
      } else if (lower.startsWith('banner motd')) {
        this.mode = 'banner';
        return `\r\nEnter TEXT message.  End with the character '^C'.\r\n`;
      } else if (lower.startsWith('crypto key generate rsa')) {
        return `\r\nThe name for the keys will be: ${this.hostname}\r\n% Generating 2048 bit RSA keys, keys will be non-exportable...\r\n[OK]\r\n${this.getPrompt()}`;
      }
    } else if (this.mode === 'config-vlan') {
      if (lower.startsWith('name ')) {
        const id = parseInt(this.currentIf, 10);
        if (!isNaN(id)) {
          this.vlans.set(id, cmd.slice(5).trim());
        }
      } else if (lower.startsWith('vlan ') || lower.startsWith('interface ')) {
        this.mode = 'config';
        return this.processInput(cmd);
      }
    } else if (this.mode === 'config-if') {
      if (lower.startsWith('ip address ') && this.currentIf.toLowerCase().includes('vlan')) {
        this.mgmtIp = cmd.split(/\s+/)[2] || this.mgmtIp;
      } else if (lower.startsWith('interface ') || lower.startsWith('line ') || lower.startsWith('crypto ')) {
        this.mode = 'config';
        return this.processInput(cmd);
      }
    } else if (this.mode === 'config-line') {
      if (lower.startsWith('line ') || lower.startsWith('banner ') || lower.startsWith('logging ')) {
        this.mode = 'config';
        return this.processInput(cmd);
      }
    }

    return `\r\n${this.getPrompt()}`;
  }
}
