import { getSwitchModel } from '../data/switchModels';
import { PortConfig, SwitchConfigState } from '../types/switch';

export interface ValidationWarning {
  id: string;
  severity: 'error' | 'warning';
  messageFa: string;
  messageEn: string;
}

const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isValidIpv4(ip: string): boolean {
  return IPV4_REGEX.test(ip.trim());
}

export function validateSwitchConfig(config: SwitchConfigState): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const model = getSwitchModel(config.modelId, config.customModel);

  if (!config.hostname.trim() || /\s/.test(config.hostname)) {
    warnings.push({
      id: 'hostname',
      severity: 'error',
      messageFa: 'نام دستگاه (Hostname) نباید خالی باشد یا فاصله (Space) داشته باشد.',
      messageEn: 'Hostname cannot be empty or contain spaces.',
    });
  }

  if (config.enableSsh && !config.domainName.trim()) {
    warnings.push({
      id: 'ssh-domain',
      severity: 'error',
      messageFa: 'برای تولید کلید RSA و فعال‌سازی SSH، فیلد Domain Name الزامی است.',
      messageEn: 'Domain Name is required to generate RSA keys for SSH.',
    });
  }

  if (config.mgmtIp.trim() && !isValidIpv4(config.mgmtIp)) {
    warnings.push({
      id: 'mgmt-ip',
      severity: 'error',
      messageFa: 'فرمت IP مدیریت (Management IP) نامعتبر است.',
      messageEn: 'Management IP address format is invalid.',
    });
  }

  if (config.defaultGateway.trim() && !isValidIpv4(config.defaultGateway)) {
    warnings.push({
      id: 'gw-ip',
      severity: 'error',
      messageFa: 'فرمت Default Gateway نامعتبر است.',
      messageEn: 'Default Gateway IP format is invalid.',
    });
  }

  if (!config.enableSecret.trim()) {
    warnings.push({
      id: 'enable-secret',
      severity: 'warning',
      messageFa: 'رمز Enable Secret تعیین نشده است؛ امنیت دسترسی Console/VTY کاهش می‌یابد.',
      messageEn: 'Enable Secret is empty; privileged EXEC access will be unprotected.',
    });
  }

  if (config.ipRoutingEnabled && !model.layer3Capable) {
    warnings.push({
      id: 'l3-unsupported',
      severity: 'warning',
      messageFa: `مدل ${model.series} سوییچ لایه ۲ است و از فرمان ip routing پشتیبانی نمی‌کند.`,
      messageEn: `${model.series} is Layer 2 only and does not support full ip routing.`,
    });
  }

  const mgmtVlanExists = config.vlans.some((v) => v.id === config.mgmtVlanId);
  if (!mgmtVlanExists && config.mgmtVlanId !== 1) {
    warnings.push({
      id: 'mgmt-vlan-missing',
      severity: 'warning',
      messageFa: `VLAN مدیریت (${config.mgmtVlanId}) در لیست VLAN ها تعریف نشده است.`,
      messageEn: `Management VLAN (${config.mgmtVlanId}) is not in the VLAN database.`,
    });
  }

  return warnings;
}

function portSignature(p: PortConfig): string {
  return JSON.stringify({
    mode: p.mode,
    accessVlan: p.accessVlan,
    voiceVlan: p.voiceVlan ?? null,
    nativeVlan: p.nativeVlan,
    allowedVlans: p.allowedVlans,
    description: p.description,
    portfast: p.portfast,
    bpduGuard: p.bpduGuard,
    stormControlBroadcast: p.stormControlBroadcast ?? null,
    portSecurity: p.portSecurity,
    maxMac: p.maxMac,
    violationMode: p.violationMode,
    poeEnabled: p.poeEnabled,
    speed: p.speed,
    duplex: p.duplex,
    routedIp: p.routedIp ?? '',
    routedMask: p.routedMask ?? '',
    dhcpSnoopingTrust: !!p.dhcpSnoopingTrust,
  });
}

function buildInterfaceBody(p: PortConfig, config: SwitchConfigState): string[] {
  const model = getSwitchModel(config.modelId, config.customModel);
  const lines: string[] = [];

  if (p.description.trim()) {
    lines.push(` description ${p.description.trim()}`);
  }

  if (p.mode === 'shutdown') {
    lines.push(' switchport mode access');
    const blackhole = config.vlans.find((v) => v.id === 999);
    if (blackhole) {
      lines.push(' switchport access vlan 999');
    }
    lines.push(' shutdown');
    return lines;
  }

  if (p.mode === 'routed' && model.layer3Capable) {
    lines.push(' no switchport');
    if (p.routedIp && p.routedMask) {
      lines.push(` ip address ${p.routedIp} ${p.routedMask}`);
    }
    lines.push(' no shutdown');
    return lines;
  }

  if (p.mode === 'trunk') {
    if (model.requiresTrunkEncap) {
      lines.push(' switchport trunk encapsulation dot1q');
    }
    lines.push(' switchport mode trunk');
    if (p.nativeVlan && p.nativeVlan !== 1) {
      lines.push(` switchport trunk native vlan ${p.nativeVlan}`);
    }
    if (p.allowedVlans.trim() && p.allowedVlans.trim().toLowerCase() !== 'all') {
      lines.push(` switchport trunk allowed vlan ${p.allowedVlans.trim()}`);
    }
    if (config.dhcpSnoopingEnabled && p.dhcpSnoopingTrust) {
      lines.push(' ip dhcp snooping trust');
    }
  } else {
    // Access mode
    lines.push(' switchport mode access');
    lines.push(` switchport access vlan ${p.accessVlan}`);
    if (p.voiceVlan) {
      lines.push(` switchport voice vlan ${p.voiceVlan}`);
    }
    if (p.portfast) {
      lines.push(model.supportsPortfastEdge ? ' spanning-tree portfast edge' : ' spanning-tree portfast');
    }
    if (p.bpduGuard) {
      lines.push(model.supportsPortfastEdge ? ' spanning-tree bpduguard enable' : ' spanning-tree bpduguard enable');
    }
    if (p.portSecurity) {
      lines.push(' switchport port-security');
      lines.push(` switchport port-security maximum ${p.maxMac}`);
      lines.push(` switchport port-security violation ${p.violationMode}`);
    }
    if (p.stormControlBroadcast && p.stormControlBroadcast > 0 && p.stormControlBroadcast < 100) {
      lines.push(` storm-control broadcast level ${p.stormControlBroadcast}.00`);
    }
  }

  if (model.poeCapable && p.kind === 'copper' && !p.poeEnabled) {
    lines.push(' power inline never');
  }

  if (p.speed !== 'auto') {
    lines.push(` speed ${p.speed}`);
  }
  if (p.duplex !== 'auto' && p.kind === 'copper') {
    lines.push(` duplex ${p.duplex}`);
  }

  lines.push(' no shutdown');
  return lines;
}

export function generateCiscoCli(config: SwitchConfigState): string {
  const model = getSwitchModel(config.modelId, config.customModel);
  const lines: string[] = [];
  const comment = (text: string) => {
    if (config.includeComments) {
      lines.push(`! ${text}`);
    }
  };

  if (config.includeComments) {
    lines.push(`! ========================================================`);
    lines.push(`! CiscoSwitch Studio Configuration`);
    lines.push(`! Target Model : ${model.name}`);
    lines.push(`! OS Family    : ${model.osFamily.toUpperCase()}`);
    lines.push(`! ========================================================`);
  }

  if (config.includeSessionWrapper) {
    lines.push('enable');
    lines.push('configure terminal');
  }

  comment('--- Basic System & Security Services ---');
  lines.push(`hostname ${config.hostname.trim() || 'Switch'}`);
  if (config.servicePasswordEncryption) {
    lines.push('service password-encryption');
  }
  lines.push('no ip domain-lookup');
  if (config.domainName.trim()) {
    lines.push(`ip domain-name ${config.domainName.trim()}`);
  }

  if (config.enableSecret.trim()) {
    lines.push(`enable secret ${config.enableSecret.trim()}`);
  }

  if (config.adminUsername.trim() && config.adminPassword.trim()) {
    lines.push(
      `username ${config.adminUsername.trim()} privilege ${config.adminPrivilege} secret ${config.adminPassword.trim()}`
    );
  }

  if (config.timezoneName.trim()) {
    lines.push(
      `clock timezone ${config.timezoneName.trim()} ${config.timezoneOffsetHours} ${config.timezoneOffsetMinutes}`
    );
  }

  if (config.dnsServer.trim() && isValidIpv4(config.dnsServer)) {
    lines.push(`ip name-server ${config.dnsServer.trim()}`);
  }
  if (config.ntpServer.trim() && isValidIpv4(config.ntpServer)) {
    lines.push(`ntp server ${config.ntpServer.trim()}`);
  }

  if (config.disableHttpServer) {
    lines.push('no ip http server');
  }
  if (config.enableHttpsServer) {
    lines.push('ip http secure-server');
  } else {
    lines.push('no ip http secure-server');
  }

  if (config.errdisableRecovery) {
    lines.push('errdisable recovery cause bpduguard');
    lines.push('errdisable recovery cause psecure-violation');
    lines.push('errdisable recovery interval 300');
  }

  comment('--- Spanning-Tree & Layer 2 Global ---');
  lines.push(`spanning-tree mode ${config.stpMode}`);
  if (config.stpRootPrimary) {
    lines.push(`spanning-tree vlan 1-4094 priority ${config.stpPriority}`);
  }
  if (!config.cdpEnabled) {
    lines.push('no cdp run');
  }
  if (config.lldpEnabled) {
    lines.push('lldp run');
  }

  if (config.dhcpSnoopingEnabled) {
    lines.push('ip dhcp snooping');
    if (config.dhcpSnoopingVlans.trim()) {
      lines.push(`ip dhcp snooping vlan ${config.dhcpSnoopingVlans.trim()}`);
    }
    lines.push('no ip dhcp snooping information option');
  }

  if (config.arpInspectionEnabled && config.arpInspectionVlans.trim()) {
    lines.push(`ip arp inspection vlan ${config.arpInspectionVlans.trim()}`);
  }

  comment('--- VLAN Database ---');
  for (const vlan of config.vlans) {
    if (vlan.id === 1) continue;
    lines.push(`vlan ${vlan.id}`);
    if (vlan.name.trim()) {
      lines.push(` name ${vlan.name.trim().replace(/\s+/g, '_')}`);
    }
    lines.push(' exit');
  }

  comment('--- Management & Layer 3 SVI Interfaces ---');
  if (model.layer3Capable && config.ipRoutingEnabled) {
    lines.push('ip routing');
  }

  // Management SVI + Additional enabled SVIs
  const sviWritten = new Set<number>();
  if (config.mgmtIp.trim() && config.mgmtMask.trim()) {
    lines.push(`interface Vlan${config.mgmtVlanId}`);
    lines.push(' description Management_SVI');
    lines.push(` ip address ${config.mgmtIp.trim()} ${config.mgmtMask.trim()}`);
    lines.push(' no shutdown');
    lines.push(' exit');
    sviWritten.add(config.mgmtVlanId);
  }

  if (model.layer3Capable && config.ipRoutingEnabled) {
    for (const vlan of config.vlans) {
      if (vlan.sviEnabled && !sviWritten.has(vlan.id) && vlan.sviIp && vlan.sviMask) {
        lines.push(`interface Vlan${vlan.id}`);
        lines.push(` description ${vlan.name || `VLAN_${vlan.id}`}_GW`);
        lines.push(` ip address ${vlan.sviIp} ${vlan.sviMask}`);
        if (vlan.helperAddress?.trim()) {
          lines.push(` ip helper-address ${vlan.helperAddress.trim()}`);
        }
        lines.push(' no shutdown');
        lines.push(' exit');
        sviWritten.add(vlan.id);
      }
    }
  }

  if (config.defaultGateway.trim()) {
    if (model.layer3Capable && config.ipRoutingEnabled) {
      lines.push(`ip route 0.0.0.0 0.0.0.0 ${config.defaultGateway.trim()}`);
    } else {
      lines.push(`ip default-gateway ${config.defaultGateway.trim()}`);
    }
  }

  for (const route of config.staticRoutes) {
    if (route.network.trim() && route.mask.trim() && route.nextHop.trim()) {
      lines.push(`ip route ${route.network.trim()} ${route.mask.trim()} ${route.nextHop.trim()}`);
    }
  }

  comment('--- Switchport Interfaces ---');
  if (config.useInterfaceRange) {
    // Group contiguous ports with identical prefix and identical config signature
    let idx = 0;
    while (idx < config.ports.length) {
      const startPort = config.ports[idx];
      const sig = portSignature(startPort);
      // Extract prefix and trailing number from interfaceName
      const startMatch = startPort.interfaceName.match(/^(.*\/)(\d+)$/);
      let endIdx = idx;

      if (startMatch && startPort.mode !== 'routed') {
        const prefix = startMatch[1];
        let prevNum = parseInt(startMatch[2], 10);
        while (endIdx + 1 < config.ports.length) {
          const candidate = config.ports[endIdx + 1];
          const candMatch = candidate.interfaceName.match(/^(.*\/)(\d+)$/);
          if (
            candMatch &&
            candMatch[1] === prefix &&
            parseInt(candMatch[2], 10) === prevNum + 1 &&
            portSignature(candidate) === sig
          ) {
            prevNum += 1;
            endIdx += 1;
          } else {
            break;
          }
        }
      }

      if (endIdx > idx) {
        const endPort = config.ports[endIdx];
        const endNum = endPort.interfaceName.match(/(\d+)$/)?.[1] || '';
        lines.push(`interface range ${startPort.interfaceName} - ${endNum}`);
      } else {
        lines.push(`interface ${startPort.interfaceName}`);
      }
      lines.push(...buildInterfaceBody(startPort, config));
      lines.push(' exit');
      idx = endIdx + 1;
    }
  } else {
    for (const p of config.ports) {
      lines.push(`interface ${p.interfaceName}`);
      lines.push(...buildInterfaceBody(p, config));
      lines.push(' exit');
    }
  }

  if (config.enableSsh) {
    comment('--- SSHv2 & Crypto Keys ---');
    lines.push(`crypto key generate rsa modulus ${config.rsaModulus}`);
    lines.push(`ip ssh version ${config.sshVersion}`);
    lines.push('ip ssh time-out 60');
    lines.push('ip ssh authentication-retries 3');
  }

  comment('--- Console & VTY Access Lines ---');
  lines.push('line con 0');
  if (config.consolePassword.trim()) {
    lines.push(` password ${config.consolePassword.trim()}`);
    lines.push(' login');
  } else {
    lines.push(' login local');
  }
  lines.push(' logging synchronous');
  lines.push(` exec-timeout ${config.consoleExecTimeoutMin} 0`);
  lines.push(' exit');

  lines.push('line vty 0 15');
  lines.push(' login local');
  lines.push(` transport input ${config.vtyTransportInput}`);
  lines.push(' logging synchronous');
  lines.push(` exec-timeout ${config.vtyExecTimeoutMin} 0`);
  lines.push(' exit');

  if (config.syslogServer.trim() || config.snmpEnabled) {
    comment('--- Logging & SNMP Monitoring ---');
    if (config.syslogServer.trim()) {
      lines.push(`logging host ${config.syslogServer.trim()}`);
      lines.push('logging trap informational');
    }
    if (config.snmpEnabled && config.snmpCommunityRo.trim()) {
      lines.push(`snmp-server community ${config.snmpCommunityRo.trim()} RO`);
      if (config.snmpLocation.trim()) {
        lines.push(`snmp-server location ${config.snmpLocation.trim()}`);
      }
      if (config.snmpContact.trim()) {
        lines.push(`snmp-server contact ${config.snmpContact.trim()}`);
      }
    }
  }

  if (config.bannerMotd.trim()) {
    comment('--- Login Banner ---');
    lines.push(`banner motd ^C`);
    lines.push(config.bannerMotd.trim());
    lines.push(`^C`);
  }

  if (config.includeSessionWrapper) {
    lines.push('end');
    lines.push('write memory');
  }

  return lines.join('\n');
}

export function extractPushableCommands(cliText: string): string[] {
  return cliText
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('!');
    });
}
