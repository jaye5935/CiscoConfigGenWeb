export type Language = 'fa' | 'en';

export type OsFamily = 'ios' | 'ios-xe' | 'cbs';

export type PortKind = 'copper' | 'sfp' | 'sfp-plus';

export type PortMode = 'access' | 'trunk' | 'routed' | 'shutdown';

export type StpMode = 'rapid-pvst' | 'pvst' | 'mst';

export interface SwitchModelSpec {
  id: string;
  series: string;
  name: string;
  osFamily: OsFamily;
  layer3Capable: boolean;
  poeCapable: boolean;
  poeLabel?: string;
  requiresTrunkEncap: boolean; // True on 3560/3750
  supportsPortfastEdge: boolean; // IOS-XE uses spanning-tree portfast edge
  copperCount: number;
  copperPrefix: string; // e.g., "GigabitEthernet1/0/" or "FastEthernet0/"
  copperShortPrefix: string; // e.g., "Gi1/0/" or "Fa0/"
  uplinkCount: number;
  uplinkKind: PortKind;
  uplinkPrefix: string; // e.g., "TenGigabitEthernet1/1/" or "GigabitEthernet0/"
  uplinkShortPrefix: string;
  uplinkStartIndex: number; // e.g., 1 for 1/1/1, or 25 for Gi0/25
  consolePorts: ('RJ45' | 'Mini-USB' | 'USB-C')[];
  defaultBaud: number;
  descriptionFa: string;
  descriptionEn: string;
}

export interface VlanConfig {
  id: number;
  name: string;
  isVoice?: boolean;
  isManagement?: boolean;
  sviEnabled?: boolean;
  sviIp?: string;
  sviMask?: string;
  helperAddress?: string;
}

export interface PortConfig {
  id: string; // e.g., "copper-1" or "uplink-1"
  index: number; // 1-based physical port number
  interfaceName: string; // Full IOS name e.g. GigabitEthernet1/0/1
  shortName: string; // e.g. Gi1/0/1
  kind: PortKind;
  mode: PortMode;
  accessVlan: number;
  voiceVlan?: number;
  nativeVlan: number;
  allowedVlans: string; // e.g. "all" or "10,20,30,99"
  description: string;
  portfast: boolean;
  bpduGuard: boolean;
  stormControlBroadcast?: number; // e.g. 50 (%)
  portSecurity: boolean;
  maxMac: number;
  violationMode: 'shutdown' | 'restrict' | 'protect';
  poeEnabled: boolean;
  speed: 'auto' | '10' | '100' | '1000' | '10000';
  duplex: 'auto' | 'full' | 'half';
  routedIp?: string;
  routedMask?: string;
  dhcpSnoopingTrust?: boolean;
}

export interface StaticRoute {
  id: string;
  network: string;
  mask: string;
  nextHop: string;
  description?: string;
}

export interface CustomModelSpec {
  name: string;
  osFamily: OsFamily;
  layer3Capable: boolean;
  poeCapable: boolean;
  requiresTrunkEncap: boolean;
  supportsPortfastEdge: boolean;
  copperCount: number;
  copperPrefix: string;
  uplinkCount: number;
  uplinkKind: PortKind;
  uplinkPrefix: string;
  uplinkStartIndex: number;
  defaultBaud: number;
}

export interface SwitchHardeningConfig {
  // Control Plane & Services
  disableUnusedServices: boolean; // no service finger, pad, tcp/udp-small-servers
  disableBootpAndSourceRoute: boolean; // no ip bootp server, no ip source-route, no ip gratuitous-arps
  enableTcpKeepalives: boolean; // service tcp-keepalives-in & out
  enableTimestampsLogging: boolean; // service timestamps log/debug datetime msec localtime
  limitConsoleLogging: boolean; // logging console warnings
  // Auth & Brute-Force Protection
  enableAaaNewModel: boolean; // aaa new-model + local auth/exec
  minPasswordLength: number; // security passwords min-length (0 = disabled)
  enableLoginBruteForceBlock: boolean; // login block-for 120 attempts 3 within 60 + on-failure/success log
  sshSourceVlanEnabled: boolean; // ip ssh source-interface Vlan<mgmtVlanId>
  vtyAclEnabled: boolean; // standard ACL MGMT_SSH_ONLY + access-class in
  vtyAllowedSubnet: string; // e.g. "192.168.99.0 0.0.0.255"
  // Layer 2 & SVI Hardening
  globalBpduGuardDefault: boolean; // spanning-tree portfast bpduguard default
  disableDtpNegotiation: boolean; // switchport nonegotiate on access/trunk ports
  hardenSviInterfaces: boolean; // no ip redirects / no ip unreachables / no ip proxy-arp on SVIs
  shutdownVlan1Interface: boolean; // interface Vlan1 -> no ip address + shutdown (console cable safe)
}

export interface SwitchConfigState {
  modelId: string;
  customModel?: CustomModelSpec;
  hardening?: SwitchHardeningConfig;
  // System & Management
  hostname: string;
  domainName: string;
  mgmtVlanId: number;
  mgmtIp: string;
  mgmtMask: string;
  defaultGateway: string;
  dnsServer: string;
  ntpServer: string;
  timezoneName: string;
  timezoneOffsetHours: number;
  timezoneOffsetMinutes: number;
  bannerMotd: string;
  // Auth & Access
  enableSecretEnabled?: boolean;
  enableMode?: 'secret' | 'password';
  enableSecret: string;
  adminUsername: string;
  adminPassword: string;
  adminPrivilege: number;
  enableSsh: boolean;
  sshVersion: 2 | 1;
  rsaModulus: 1024 | 2048 | 4096;
  vtyTransportInput: 'ssh' | 'ssh telnet' | 'telnet';
  consolePassword: string;
  consoleExecTimeoutMin: number;
  vtyExecTimeoutMin: number;
  servicePasswordEncryption: boolean;
  disableHttpServer: boolean;
  enableHttpsServer: boolean;
  // Layer 2 / Layer 3 Global
  ipRoutingEnabled: boolean;
  stpMode: StpMode;
  stpRootPrimary: boolean;
  stpPriority: number;
  cdpEnabled: boolean;
  lldpEnabled: boolean;
  dhcpSnoopingEnabled: boolean;
  dhcpSnoopingVlans: string;
  arpInspectionEnabled: boolean;
  arpInspectionVlans: string;
  errdisableRecovery: boolean;
  // Logging & SNMP
  syslogServer: string;
  snmpEnabled: boolean;
  snmpCommunityRo: string;
  snmpLocation: string;
  snmpContact: string;
  // Collections
  vlans: VlanConfig[];
  ports: PortConfig[];
  staticRoutes: StaticRoute[];
  // Generator Options
  useInterfaceRange: boolean;
  includeSessionWrapper: boolean; // enable / conf t / end / write memory
  includeComments: boolean;
}

export interface SerialSettings {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd';
  flowControl: 'none' | 'hardware';
}

export interface TerminalLine {
  id: string;
  timestamp: string;
  direction: 'rx' | 'tx' | 'sys' | 'err';
  text: string;
}

export interface PushOptions {
  lineDelayMs: number;
  autoEnterConfT: boolean;
  autoSaveWriteMem: boolean;
  stopOnError: boolean;
  enablePasswordForExec: string;
}

export interface PushProgress {
  status: 'idle' | 'pushing' | 'paused' | 'completed' | 'error' | 'aborted';
  currentLine: number;
  totalLines: number;
  lastCommand: string;
  errorMessage?: string;
}

export type SwitchReachability = 'unknown' | 'checking' | 'online' | 'offline' | 'auth-error';

export interface SwitchBackupSnapshot {
  id: string;
  switchId: string;
  hostname: string;
  capturedAt: string;
  configText: string;
  lineCount: number;
}

export interface FleetSwitch {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  location: string;
  modelSeries: string;
  mode: 'ssh' | 'simulator';
  // Live telemetry updated via SSH check
  status: SwitchReachability;
  detectedHostname?: string;
  iosVersion?: string;
  detectedModel?: string;
  uptime?: string;
  upPorts?: number;
  downPorts?: number;
  latencyMs?: number;
  lastCheckedAt?: string;
  lastError?: string;
  lastBackupAt?: string;
  lastUpdateStatus?: string;
}

export interface SwitchSecretCredentials {
  password: string;
  enableSecret: string;
}

export type LivePortStatus =
  | 'connected'
  | 'notconnect'
  | 'disabled'
  | 'err-disabled'
  | 'sfpAbsent'
  | 'unknown';

export interface LivePortInfo {
  port: string; // e.g., Gi1/0/1
  name: string; // Description
  status: LivePortStatus;
  vlan: string; // e.g., "10", "trunk", "routed"
  duplex: string;
  speed: string;
  type: string;
  poeWatts?: number;
}


