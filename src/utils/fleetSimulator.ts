import { FleetSwitch, LivePortInfo, LivePortStatus } from '../types/switch';

const simulatedConfigs = new Map<string, string>();
const simulatedPortOverrides = new Map<string, Map<string, LivePortStatus>>();

function buildDefaultRunningConfig(sw: FleetSwitch): string {
  return `!
! Last configuration change at 08:14:22 IRST
!
version 17.9
service timestamps debug datetime msec
service timestamps log datetime msec
service password-encryption
!
hostname ${sw.label}
!
enable secret 9 $9$x8K2mPqR$SimulatedHashDoNotCopy
!
username ${sw.username || 'netadmin'} privilege 15 secret 9 $9$A7zLk1$SimulatedUserHash
!
ip domain name corp.local
spanning-tree mode rapid-pvst
!
vlan 10
 name DATA_USERS
!
vlan 20
 name VOICE_VOIP
!
vlan 30
 name CCTV_CAMERAS
!
vlan 99
 name MANAGEMENT
!
interface GigabitEthernet1/0/1
 description Workstation_Port_01
 switchport access vlan 10
 switchport mode access
 switchport voice vlan 20
 spanning-tree portfast edge
!
interface GigabitEthernet1/0/24
 description Uplink_to_Core
 switchport trunk native vlan 99
 switchport trunk allowed vlan 10,20,30,99
 switchport mode trunk
!
interface Vlan99
 ip address ${sw.host} 255.255.255.0
!
ip default-gateway 192.168.99.1
ip ssh version 2
!
line con 0
 logging synchronous
 exec-timeout 15 0
line vty 0 15
 login local
 transport input ssh
!
end`;
}

export async function simCheckSwitch(sw: FleetSwitch): Promise<{
  ok: true;
  hostname: string;
  iosVersion: string;
  model: string;
  uptime: string;
  upPorts: number;
  downPorts: number;
  latencyMs: number;
}> {
  await new Promise((r) => setTimeout(r, 180 + Math.random() * 220));
  const is3850 = sw.modelSeries.includes('3850');
  const is2960 = sw.modelSeries.includes('2960');
  return {
    ok: true,
    hostname: sw.label,
    iosVersion: is2960 ? '15.2(7)E8' : is3850 ? '16.12.08' : '17.09.04a',
    model: is2960 ? 'WS-C2960X-24PS-L' : is3850 ? 'WS-C3850-24P-S' : 'C9200L-24P-4X-E',
    uptime: is2960 ? '42 days, 6 hours, 18 minutes' : '19 days, 11 hours, 4 minutes',
    upPorts: is2960 ? 18 : 22,
    downPorts: is2960 ? 10 : 6,
    latencyMs: Math.floor(8 + Math.random() * 14),
  };
}

export async function simBackupSwitch(sw: FleetSwitch): Promise<{
  ok: true;
  hostname: string;
  config: string;
  capturedAt: string;
}> {
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 200));
  if (!simulatedConfigs.has(sw.id)) {
    simulatedConfigs.set(sw.id, buildDefaultRunningConfig(sw));
  }
  return {
    ok: true,
    hostname: sw.label,
    config: simulatedConfigs.get(sw.id)!,
    capturedAt: new Date().toISOString(),
  };
}

export async function simPushSwitch(
  sw: FleetSwitch,
  commands: string[]
): Promise<{
  ok: true;
  hostname: string;
  appliedCount: number;
  errors: string[];
  transcript: string;
}> {
  await new Promise((r) => setTimeout(r, 280 + Math.random() * 200));
  const existing = simulatedConfigs.get(sw.id) || buildDefaultRunningConfig(sw);
  const cleanCmds = commands.filter((c) => c.trim() && !c.trim().startsWith('!'));
  const hostnameCmd = cleanCmds.find((c) => c.toLowerCase().startsWith('hostname '));
  const nextHost = hostnameCmd ? hostnameCmd.split(/\s+/)[1] : sw.label;

  // Track interface shutdown / no shutdown for live port monitor simulation
  let currentPort = '';
  const portMap = simulatedPortOverrides.get(sw.id) || new Map<string, LivePortStatus>();
  for (const cmd of cleanCmds) {
    const lower = cmd.toLowerCase().trim();
    if (lower.startsWith('interface ')) {
      currentPort = cmd.trim().slice(10).trim();
    } else if (currentPort && lower === 'shutdown') {
      portMap.set(currentPort, 'disabled');
    } else if (currentPort && lower === 'no shutdown') {
      portMap.set(currentPort, 'connected');
    }
  }
  simulatedPortOverrides.set(sw.id, portMap);

  const updated =
    existing.replace(/end\s*$/, '') +
    `\n! --- Applied via SSH Update (${new Date().toLocaleTimeString('en-GB', { hour12: false })}) ---\n` +
    cleanCmds
      .filter((c) => !['enable', 'configure terminal', 'conf t', 'end', 'write memory', 'wr'].includes(c.toLowerCase()))
      .slice(0, 40)
      .join('\n') +
    '\nend';

  simulatedConfigs.set(sw.id, updated);

  return {
    ok: true,
    hostname: nextHost,
    appliedCount: cleanCmds.length,
    errors: [],
    transcript: cleanCmds.map((c) => `${nextHost}(config)# ${c}`).join('\n') + `\n${nextHost}# write memory\nBuilding configuration...\n[OK]`,
  };
}

export async function simExecSwitch(sw: FleetSwitch, command: string): Promise<{
  ok: true;
  hostname: string;
  output: string;
}> {
  await new Promise((r) => setTimeout(r, 160));
  const lower = command.toLowerCase();
  if (lower.includes('ver')) {
    return {
      ok: true,
      hostname: sw.label,
      output: `Cisco IOS XE Software, Version 17.09.04a\nCisco Catalyst ${sw.modelSeries}\n${sw.label} uptime is 19 days, 11 hours, 4 minutes\nSystem image file is "flash:packages.conf"`,
    };
  }
  if (lower.includes('ip int')) {
    return {
      ok: true,
      hostname: sw.label,
      output: `Interface              IP-Address      OK? Method Status                Protocol\nGigabitEthernet1/0/1   unassigned      YES unset  up                    up\nGigabitEthernet1/0/2   unassigned      YES unset  down                  down\nVlan99                 ${sw.host.padEnd(15)} YES manual up                    up`,
    };
  }
  if (lower.includes('vlan')) {
    return {
      ok: true,
      hostname: sw.label,
      output: `VLAN Name                             Status    Ports\n---- -------------------------------- --------- -------------------------------\n1    default                          active    Gi1/0/2\n10   DATA_USERS                       active    Gi1/0/1, Gi1/0/3, Gi1/0/4\n20   VOICE_VOIP                       active    Gi1/0/1\n30   CCTV_CAMERAS                     active    Gi1/0/15, Gi1/0/16\n99   MANAGEMENT                       active    Gi1/0/24`,
    };
  }
  if (lower.includes('run')) {
    return {
      ok: true,
      hostname: sw.label,
      output: simulatedConfigs.get(sw.id) || buildDefaultRunningConfig(sw),
    };
  }
  return {
    ok: true,
    hostname: sw.label,
    output: `Executed "${command}" on ${sw.label} (${sw.host})`,
  };
}

export async function simFetchSwitchPorts(sw: FleetSwitch): Promise<{
  ok: true;
  hostname: string;
  ports: LivePortInfo[];
  latencyMs: number;
  capturedAt: string;
}> {
  await new Promise((r) => setTimeout(r, 180 + Math.random() * 140));
  const isCore = sw.label.toLowerCase().includes('core');
  const isCam = sw.label.toLowerCase().includes('cam') || sw.label.toLowerCase().includes('poe');
  const overrides = simulatedPortOverrides.get(sw.id);

  const ports: LivePortInfo[] = [];

  for (let i = 1; i <= 24; i++) {
    const portName = `Gi1/0/${i}`;
    let status: LivePortStatus = 'connected';
    let vlan = '10';
    let name = `Workstation #${i}`;
    let poeWatts: number | undefined = isCore ? undefined : 6.4;
    let speed = 'a-1000';

    if (isCore) {
      if (i <= 14) {
        status = 'connected';
        vlan = 'trunk';
        name = `Downlink Access-SW${i}`;
      } else if (i <= 20) {
        status = 'notconnect';
        vlan = '1';
        name = 'Spare Trunk';
        speed = 'auto';
      } else {
        status = 'disabled';
        vlan = '999';
        name = 'Unused_Shut';
        speed = 'auto';
      }
    } else if (isCam) {
      if (i <= 16) {
        status = i === 11 ? 'err-disabled' : 'connected';
        vlan = '30';
        name = `IP_Camera_PTZ_${i}`;
        poeWatts = status === 'connected' ? Number((11.2 + (i % 5) * 1.4).toFixed(1)) : 0;
      } else if (i <= 20) {
        status = 'notconnect';
        vlan = '30';
        name = 'Spare_CCTV';
        poeWatts = 0;
        speed = 'auto';
      } else {
        status = 'disabled';
        vlan = '999';
        name = 'Blackhole_Unused';
        poeWatts = 0;
        speed = 'auto';
      }
    } else {
      // Standard Floor Access switch
      if (i <= 14) {
        status = i === 9 ? 'notconnect' : 'connected';
        vlan = '10';
        name = i % 3 === 0 ? `Desk + IP Phone #${i}` : `Staff PC #${i}`;
        poeWatts = status === 'connected' ? (i % 3 === 0 ? 8.6 : 0) : 0;
      } else if (i <= 19) {
        status = i === 17 ? 'err-disabled' : 'connected';
        vlan = '20';
        name = `VoIP Handset #${i}`;
        poeWatts = status === 'connected' ? 5.8 : 0;
        speed = 'a-100';
      } else if (i <= 22) {
        status = 'notconnect';
        vlan = '10';
        name = 'Patch Panel Spare';
        poeWatts = 0;
        speed = 'auto';
      } else {
        status = 'disabled';
        vlan = '999';
        name = 'Admin_Shutdown';
        poeWatts = 0;
        speed = 'auto';
      }
    }

    if (overrides?.has(portName)) {
      status = overrides.get(portName)!;
      if (status === 'disabled') {
        poeWatts = 0;
        speed = 'auto';
      } else if (status === 'connected') {
        speed = 'a-1000';
      }
    }

    ports.push({
      port: portName,
      name,
      status,
      vlan,
      duplex: status === 'connected' ? 'a-full' : 'auto',
      speed,
      type: '10/100/1000BaseTX',
      ...(poeWatts !== undefined ? { poeWatts } : {}),
    });
  }

  // 4x SFP/SFP+ Uplinks
  const uplinkPrefix = sw.modelSeries.includes('2960') ? 'Gi1/0/' : 'Te1/1/';
  const uplinkStart = sw.modelSeries.includes('2960') ? 25 : 1;
  for (let u = 0; u < 4; u++) {
    const portName = `${uplinkPrefix}${uplinkStart + u}`;
    const isUp = u < 2;
    let status: LivePortStatus = isUp ? 'connected' : 'sfpAbsent';
    if (overrides?.has(portName)) {
      status = overrides.get(portName)!;
    }
    ports.push({
      port: portName,
      name: isUp ? `Core_Fiber_Uplink_${u + 1}` : 'Empty SFP+ Slot',
      status,
      vlan: 'trunk',
      duplex: isUp ? 'full' : 'auto',
      speed: isUp ? (uplinkPrefix.startsWith('Te') ? '10G' : '1000') : 'auto',
      type: isUp ? 'SFP-10GBase-SR' : 'Not Present',
    });
  }

  return {
    ok: true,
    hostname: sw.label,
    ports,
    latencyMs: Math.floor(8 + Math.random() * 14),
    capturedAt: new Date().toISOString(),
  };
}

