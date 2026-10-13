export interface Instrument {
  id: string;
  name: string;
  category: string;
  ram?: string;
  cpuArch?: string;
  nodes?: number;
  coresPerNode?: number;
  gpuNodes?: number;
  gpusPerNode?: number;
  gpuModel?: string;
  gpuMemory?: string;
  hardwareSpecs?: string;
  runtimeType: string;
  maxRuntime?: string;
  slots: string[];
  isFavorite: boolean;
  teamId?: string | null;
  canEdit?: boolean;
  sharedFrom?: string | null;
  createdAt: string;
}

export interface Attempt {
  attemptNumber: number;
  jobId?: string;
  status: string;
  submitTime: string;
  projectedStartTime?: string;
  actualEndTime?: string;
  computeTime: number; // in minutes
  inputFile?: string;
  workingDirectory?: string;
  failureReason?: string;
  failureNotes?: string;
}

export interface Job {
  id: string;
  name: string;
  taskId?: string;
  category: string;
  instrumentId?: string;
  isCpu: boolean;
  isGpu: boolean;
  queue?: string;
  status: string; // Queued, Running, Completed, Failed, Cancelled, Timed Out
  jobId?: string;
  submitTime: string;
  projectedStartTime?: string;
  projectedCompletionTime?: string;
  computeTime: number; // in minutes
  inputFile?: string;
  workingDirectory?: string;
  sampleName?: string;
  sampleId?: string;
  reminders?: {
    enabled?: boolean;
    tags?: string[];
  };
  notes?: string;
  actualEndTime?: string;
  attempts: Attempt[];
  isPinned?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Task {
  id: string;
  name: string;
  status: string;
  date: string;
}
