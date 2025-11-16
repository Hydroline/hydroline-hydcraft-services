export interface McsmApiResponse<T> {
  status: number;
  data: T;
  time?: number;
  message?: string;
}

export type McsmInstanceStatus = -1 | 0 | 1 | 2 | 3;

export interface McsmProcessInfo {
  cpu?: number;
  memory?: number;
  ppid?: number;
  pid?: number;
  ctime?: number;
  elapsed?: number;
  uptime?: number;
}

export interface McsmInstanceDetail {
  config?: Record<string, unknown>;
  info?: Record<string, unknown> & {
    currentPlayers?: number;
    maxPlayers?: number;
    version?: string;
    openFrpStatus?: boolean;
    playersChart?: unknown[];
  };
  instanceUuid: string;
  processInfo?: McsmProcessInfo;
  space?: number;
  started?: number;
  status: McsmInstanceStatus;
}

export interface McsmCommandResult {
  instanceUuid: string;
}

export interface McsmOutputLog {
  output: string;
}

export interface McsmInstanceIdentity {
  uuid: string;
  daemonId: string;
}

export interface McsmOverviewRemote {
  id?: string;
  uuid?: string;
  process?: {
    cpu?: number;
    memory?: number;
    cwd?: string;
  };
  cpuMemChart?: { cpu?: number; mem?: number }[];
}

export interface McsmOverview {
  version: string;
  remote: McsmOverviewRemote[];
}
