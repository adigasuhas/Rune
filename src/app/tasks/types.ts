export interface Goal {
  id: string;
  text: string;
  completed: boolean;
}

export interface Project {
  id: string;
  name: string;
  color?: string;
  goals?: string;
  teamId?: string | null;
  canEdit?: boolean;
}

export interface AssignableMember {
  userId: string;
  name: string | null;
  email: string;
}

export interface Task {
  id: string;
  name: string;
  detail?: string;
  projectId?: string;
  linkedGoalId?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  date: string;
  sessionType: string;
  estimatedTime: number;
  actualTime?: number;
  timeDifference?: number;
  context: string;
  effort: number;
  impact: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
  notes?: string;
  blockedReason?: string | null;
  blockedOnUserId?: string | null;
  blockedOnName?: string | null;
  postponeHistory?: string;
  manualOrder?: number | null;
  createdAt?: string;
  assignedById?: string | null;
  assignedByName?: string | null;
  assignmentStatus?: 'PENDING_ACCEPTANCE' | 'ACCEPTED' | 'DECLINED' | null;
  declineReason?: string | null;
}
