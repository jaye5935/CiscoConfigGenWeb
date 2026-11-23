import { FleetSwitch, SwitchBackupSnapshot, SwitchConfigState } from '../types/switch';

export interface SavedSwitchProfile {
  id: string;
  profileName: string;
  modelId: string;
  hostname: string;
  mgmtIp: string;
  notes: string;
  configData: SwitchConfigState;
  generatedCli: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalDbStateResponse {
  ok: boolean;
  dataDir?: string;
  profiles?: SavedSwitchProfile[];
  fleetSwitches?: FleetSwitch[];
  backups?: SwitchBackupSnapshot[];
  error?: string;
}

export async function fetchLocalDbState(): Promise<LocalDbStateResponse> {
  const res = await fetch('/api/local-db/state');
  if (!res.ok) {
    throw new Error('Failed to load local disk database');
  }
  return res.json();
}

export async function saveLocalProfile(params: {
  id?: string;
  profileName: string;
  notes: string;
  config: SwitchConfigState;
  generatedCli: string;
}): Promise<{ profile: SavedSwitchProfile; dataDir: string }> {
  const res = await fetch('/api/local-db/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: params.id,
      profileName: params.profileName,
      modelId: params.config.modelId,
      hostname: params.config.hostname,
      mgmtIp: params.config.mgmtIp,
      notes: params.notes,
      configData: params.config,
      generatedCli: params.generatedCli,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Failed to save profile to hard drive');
  }
  return { profile: data.profile, dataDir: data.dataDir };
}

export async function deleteLocalProfile(id: string): Promise<void> {
  const res = await fetch(`/api/local-db/profiles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Failed to delete profile from hard drive');
  }
}

export async function saveLocalFleet(switches: FleetSwitch[]): Promise<void> {
  await fetch('/api/local-db/fleet', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ switches }),
  });
}

export async function saveLocalBackup(snapshot: SwitchBackupSnapshot): Promise<void> {
  await fetch('/api/local-db/backups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  });
}

export async function importLocalDbBundle(bundle: {
  profiles?: SavedSwitchProfile[];
  fleetSwitches?: FleetSwitch[];
  backups?: SwitchBackupSnapshot[];
}): Promise<LocalDbStateResponse> {
  const res = await fetch('/api/local-db/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bundle),
  });
  const data = (await res.json()) as LocalDbStateResponse;
  if (!data.ok) {
    throw new Error(data.error || 'Failed to import database file');
  }
  return data;
}
