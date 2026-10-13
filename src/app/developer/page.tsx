'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSession } from '@/context/SessionContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  ShieldAlert,
  Terminal,
  Database,
  RefreshCw,
  FileText, 
  Settings,
  AlertTriangle,
  Users,
  UserPlus,
  Edit2,
  Trash2,
  Search,
  Filter,
  CheckCircle,
  Activity,
  Server,
  Settings2,
  Lock,
  Globe
} from 'lucide-react';

export default function DeveloperPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin"></div>
      </div>
    }>
      <DeveloperDashboard />
    </Suspense>
  );
}

function DeveloperDashboard() {
  const { user, loading } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'users';

  // --- USER MANAGEMENT STATES ---
  const [usersList, setUsersList] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    totalUsers: 0,
    activeUsers: 0,
    totalProjects: 0,
    totalTasks: 0,
    dailyLogins: 0
  });
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Create User Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createTimezone, setCreateTimezone] = useState('UTC');
  const [createRole, setCreateRole] = useState('USER');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Edit User Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState('USER');
  const [editStatus, setEditStatus] = useState('ACTIVE');
  const [editTimezone, setEditTimezone] = useState('UTC');
  const [editError, setEditError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  // Delete User Confirmation States
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState('');
  const [deleteUserName, setDeleteUserName] = useState('');
  const [permanentDelete, setPermanentDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // --- DATABASE HEALTH STATES ---
  const [dbStats, setDbStats] = useState<Record<string, number>>({});
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<any[]>([]);
  const [inspectLoading, setInspectLoading] = useState(false);

  // --- SYSTEM SETTINGS STATES ---
  const [experiments, setExperiments] = useState({
    predictiveTimeEstimates: true,
    weeklyReviewAutoExport: false,
    smartPriorityEscalation: false
  });

  // Redirect if not developer
  useEffect(() => {
    if (!loading && (!user || !user.isDeveloper)) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Load Users & Stats (for Users tab and Dashboard statistics)
  const fetchUsersAndStats = async () => {
    setLoadingUsers(true);
    try {
      const query = new URLSearchParams({
        search: searchQuery,
        role: roleFilter,
        status: statusFilter
      });
      const res = await fetch(`/api/developer/users?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
        setStats(data.stats || {
          totalUsers: 0,
          activeUsers: 0,
          totalProjects: 0,
          totalTasks: 0,
          dailyLogins: 0
        });
      }
    } catch (err) {
      console.error('Failed to load user management details:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (user?.isDeveloper) {
      if (activeTab === 'users') {
        fetchUsersAndStats();
      } else if (activeTab === 'database') {
        fetchDbStats();
      }
    }
  }, [user, activeTab, searchQuery, roleFilter, statusFilter]);

  // Handle Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/developer/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          email: createEmail,
          password: createPassword,
          timezone: createTimezone,
          role: createRole
        })
      });
      const data = await res.json();
      if (res.ok) {
        setShowCreateModal(false);
        setCreateName('');
        setCreateEmail('');
        setCreatePassword('');
        setCreateTimezone('UTC');
        setCreateRole('USER');
        fetchUsersAndStats();
      } else {
        setCreateError(data.error || 'Couldn’t create the user. Try again.');
      }
    } catch (err) {
      setCreateError('Network error. Check your connection and try again.');
    } finally {
      setCreating(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (targetUser: any) => {
    setEditingUserId(targetUser.id);
    setEditName(targetUser.name || '');
    setEditEmail(targetUser.email || '');
    setEditPassword('');
    setEditRole(targetUser.role || 'USER');
    setEditStatus(targetUser.status || 'ACTIVE');
    setEditTimezone(targetUser.timezone || 'UTC');
    setEditError(null);
    setShowEditModal(true);
  };

  // Handle Edit User
  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    setEditError(null);
    try {
      const res = await fetch('/api/developer/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingUserId,
          name: editName,
          email: editEmail,
          password: editPassword || undefined,
          role: editRole,
          status: editStatus,
          timezone: editTimezone
        })
      });
      const data = await res.json();
      if (res.ok) {
        setShowEditModal(false);
        fetchUsersAndStats();
      } else {
        setEditError(data.error || 'Couldn’t update the user. Try again.');
      }
    } catch (err) {
      setEditError('Network error. Check your connection and try again.');
    } finally {
      setUpdating(false);
    }
  };

  // Open Delete Confirm
  const openDeleteConfirm = (targetUser: any) => {
    setDeleteUserId(targetUser.id);
    setDeleteUserName(targetUser.name || targetUser.email);
    setPermanentDelete(false);
    setShowDeleteConfirm(true);
  };

  // Handle Delete User
  const handleDeleteUser = async () => {
    setDeleting(true);
    try {
      const query = new URLSearchParams({
        id: deleteUserId,
        permanent: permanentDelete.toString()
      });
      const res = await fetch(`/api/developer/users?${query.toString()}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setShowDeleteConfirm(false);
        fetchUsersAndStats();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  // Load Database Stats
  const fetchDbStats = async () => {
    try {
      const tasksRes = await fetch('/api/tasks');
      const tasks = await tasksRes.ok ? await tasksRes.json() : [];
      const projectsRes = await fetch('/api/projects');
      const projects = await projectsRes.ok ? await projectsRes.json() : [];
      const calendarRes = await fetch('/api/calendar');
      const events = await calendarRes.ok ? await calendarRes.json() : [];
      
      setDbStats({
        users: stats.totalUsers || 1,
        projects: projects.length,
        tasks: tasks.length,
        calendarEvents: events.length,
        settings: stats.totalUsers || 1
      });
    } catch (err) {
      console.error(err);
    }
  };

  const inspectTable = async (table: string) => {
    setSelectedTable(table);
    setInspectLoading(true);
    try {
      let endpoint = '';
      if (table === 'tasks') endpoint = '/api/tasks';
      else if (table === 'projects') endpoint = '/api/projects';
      else if (table === 'calendarEvents') endpoint = '/api/calendar';
      else if (table === 'settings') endpoint = '/api/settings';

      if (endpoint) {
        const res = await fetch(endpoint);
        const data = await res.json();
        setTableData(Array.isArray(data) ? data : [data]);
      } else {
        setTableData([{ message: `Inspect active user: ${user?.name} (${user?.email})` }]);
      }
    } catch (err) {
      console.error(err);
      setTableData([{ error: 'Couldn’t load the table. Try again.' }]);
    } finally {
      setInspectLoading(false);
    }
  };

  // --- LOGS STATE (real: merges audit.log + error.log via /api/developer/logs) ---
  const [logEntries, setLogEntries] = useState<Array<Record<string, unknown>>>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/developer/logs');
      if (res.ok) setLogEntries(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (user?.isDeveloper && activeTab === 'logs') fetchLogs();
     
  }, [user, activeTab]);

  if (loading || !user || !user.isDeveloper) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl pb-16">
      
      {/* Header */}
      <div>
        <h1 className="app-title text-foreground flex items-center">
          Admin
        </h1>
        <p className="text-muted-foreground text-sm font-light mt-1">
          User management, a read-only database inspector, and the audit log.
        </p>
      </div>

      {/* TAB 1: USER MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          
          {/* Developer Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 border-t border-b border-border">
            {[
              { label: 'Total users', value: stats.totalUsers },
              { label: 'Active users', value: stats.activeUsers },
              { label: 'Total projects', value: stats.totalProjects },
              { label: 'Total tasks', value: stats.totalTasks },
              { label: 'Sign-ins today', value: stats.dailyLogins },
            ].map((s) => (
              <div key={s.label} className="stat">
                <div className="n tnum">{s.value}</div>
                <div className="l">{s.label}</div>
              </div>
            ))}
          </div>

          {/* User List Panel */}
          <div className="bg-surface border border-border rounded-md p-6 space-y-6">
            
            {/* Search & Filters */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-[6px] pl-9 pr-4 py-2 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-border-strong"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  aria-label="Filter by role"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-surface-raised border border-border rounded-[6px] px-3 py-2 text-xs text-ink-secondary focus:outline-none focus:border-border-strong"
                >
                  <option value="">All roles</option>
                  <option value="USER">User</option>
                  <option value="DEVELOPER">Developer</option>
                </select>

                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-surface-raised border border-border rounded-[6px] px-3 py-2 text-xs text-ink-secondary focus:outline-none focus:border-border-strong"
                >
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="DISABLED">Disabled</option>
                </select>

                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold rounded-full transition-[background-color,transform] duration-200 hover:-translate-y-px active:scale-[0.97] cursor-pointer whitespace-nowrap"
                >
                  <UserPlus className="w-4 h-4" /> Create user
                </button>
              </div>
            </div>

            {/* User Directory Table */}
            {loadingUsers ? (
              <div className="py-12 flex justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-ink-faint" />
              </div>
            ) : usersList.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-md">
                <p className="text-ink-faint text-xs font-light">No users match your search.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded-md bg-surface-sunken/50">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground font-semibold bg-card">
                      <th className="px-5 py-3.5">User</th>
                      <th className="px-5 py-3.5">Role</th>
                      <th className="px-5 py-3.5">Usage</th>
                      <th className="px-5 py-3.5">Activity</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {usersList.map((u) => (
                      <tr key={u.id} className="hover:bg-surface-raised/10 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center space-x-3">
                            {u.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={u.avatarUrl} alt={u.name} className="w-8 h-8 rounded-lg border border-border-strong object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-surface-raised border border-border-strong flex items-center justify-center font-bold text-muted-foreground">
                                {u.name?.[0] || 'U'}
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-foreground">{u.name || 'N/A'}</p>
                              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-mono">
                          <span className={`badge ${u.role === 'DEVELOPER' ? 'badge-accent' : 'badge-neutral'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground font-mono text-[10px]">
                          <div>Projects: <span className="text-foreground font-bold">{u.totalProjects}</span></div>
                          <div className="mt-0.5">Tasks: <span className="text-foreground font-bold">{u.totalTasks}</span></div>
                        </td>
                        <td className="px-5 py-4 text-muted-foreground font-mono text-[10px]">
                          <div>Joined: {new Date(u.createdAt).toLocaleDateString()}</div>
                          <div className="mt-0.5">
                            Last sign-in: {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() + ' ' + new Date(u.lastLogin).toLocaleTimeString(undefined, {hour: '2-digit', minute:'2-digit'}) : 'Never'}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`badge ${
                            u.status === 'ACTIVE' ? 'badge-accent' :
                            u.status === 'SUSPENDED' ? 'badge-danger' :
                            'badge-neutral'
                          }`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEditModal(u)}
                              className="p-1.5 bg-surface-raised border border-border-strong hover:border-border-strong text-ink-secondary hover:text-foreground rounded-lg transition-colors cursor-pointer"
                              title="Edit user" aria-label="Edit user">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openDeleteConfirm(u)}
                              disabled={u.id === user.id}
                              className="p-1.5 bg-surface-raised border border-border-strong hover:border-border text-muted-foreground hover:text-danger rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                              title="Delete user" aria-label="Delete user">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SYSTEM SETTINGS */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            
            {/* Feature Experiments */}
            <div className="settings-section">
              <h3 className="text-sm font-bold text-foreground flex items-center">
                <Settings2 className="w-4.5 h-4.5 mr-2 text-muted-foreground" /> Experiments
              </h3>
              <p className="desc">Preview only. These switches don&rsquo;t change how the app behaves yet.</p>

              {Object.entries(experiments).map(([flag, enabled]) => (
                <div key={flag} className="settings-row">
                  <span className="label">{flag.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</span>
                  <button
                    onClick={() => setExperiments(prev => ({ ...prev, [flag]: !enabled }))}
                    className={`rune-switch ${enabled ? 'on' : ''}`}
                    aria-pressed={enabled}
                  />
                </div>
              ))}
            </div>

            {/* Server deployment details */}
            <div className="settings-section">
              <h3 className="text-sm font-bold text-foreground flex items-center">
                <Server className="w-4.5 h-4.5 mr-2 text-muted-foreground" /> Runtime
              </h3>

              <div className="text-xs text-muted-foreground space-y-2.5 font-light mt-4">
                <div className="grid grid-cols-2 gap-4 bg-surface-sunken/40 p-3.5 border border-border rounded-[10px] font-mono text-[10px]">
                  <div>
                    <span className="text-ink-faint block">DATABASE:</span>
                    <span className="text-ink-secondary">PostgreSQL</span>
                  </div>
                  <div>
                    <span className="text-ink-faint block">FRAMEWORK:</span>
                    <span className="text-ink-secondary">Next.js 16</span>
                  </div>
                  <div>
                    <span className="text-ink-faint block">SESSIONS:</span>
                    <span className="text-ink-secondary">Signed JWT (jose)</span>
                  </div>
                  <div>
                    <span className="text-ink-faint block">PASSWORD HASHING:</span>
                    <span className="text-ink-secondary">PBKDF2</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="space-y-6">
            <div className="settings-section mb-0">
              <h3 className="text-sm font-bold text-foreground flex items-center">
                <Lock className="w-4.5 h-4.5 mr-2 text-muted-foreground" /> Developer access
              </h3>
              <p className="text-xs text-ink-faint leading-relaxed font-light mt-2">
                Developer accounts skip onboarding and can use the database inspector and the audit and error log.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DATABASE HEALTH */}
      {activeTab === 'database' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="settings-section mb-0">
              <h3 className="text-sm font-bold text-foreground flex items-center">
                <Database className="w-4.5 h-4.5 mr-2 text-muted-foreground" /> Database inspector
              </h3>

              <div className="space-y-2 mt-4">
                {Object.entries(dbStats).map(([table, count]) => (
                  <button
                    key={table}
                    onClick={() => inspectTable(table)}
                    className={`w-full flex justify-between items-center px-4 py-3 rounded-[10px] border text-xs font-mono transition-colors text-left ${selectedTable === table ? 'bg-surface-sunken border-border-strong text-foreground' : 'bg-surface-sunken/40 border-border hover:border-border-strong text-muted-foreground'}`}
                  >
                    <span className="capitalize">{table.replace(/([A-Z])/g, ' $1')}</span>
                    <span className="badge badge-neutral">{count} records</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {selectedTable && (
              <div className="settings-section mb-0 flex flex-col h-full justify-between">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-foreground flex items-center font-mono">
                    <FileText className="w-4.5 h-4.5 mr-2 text-muted-foreground" /> Table: {selectedTable}
                  </h3>
                  <button
                    onClick={() => setSelectedTable(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Close
                  </button>
                </div>

                {inspectLoading ? (
                  <div className="text-center py-6">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </div>
                ) : (
                  <pre className="bg-surface-sunken border border-border p-4 rounded-md text-xs text-muted-foreground font-mono overflow-x-auto whitespace-pre leading-normal max-h-96">
                    {JSON.stringify(tableData, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: APPLICATION LOGS - real audit + error history, not mock data */}
      {activeTab === 'logs' && (
        <div className="bg-surface-sunken border border-border rounded-md p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-border pb-3">
            <h3 className="text-[12.5px] font-semibold text-foreground flex items-center font-mono">
              <Activity className="w-4.5 h-4.5 mr-1.5 text-muted-foreground" /> Audit and error log
            </h3>
            <button
              onClick={fetchLogs}
              disabled={loadingLogs}
              className="flex items-center gap-1 text-[10px] text-ink-faint hover:text-foreground font-mono disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>

          {loadingLogs && logEntries.length === 0 ? (
            <div className="py-10 flex justify-center">
              <RefreshCw className="w-5 h-5 animate-spin text-ink-faint" />
            </div>
          ) : logEntries.length === 0 ? (
            <div className="empty-state">
              <div className="icon-slot"><Activity className="w-6 h-6" /></div>
              <h4>No entries yet</h4>
              <p>Admin actions and server errors will appear here.</p>
            </div>
          ) : (
            <div className="font-mono text-[11px] space-y-2 max-h-96 overflow-y-auto pr-2">
              {logEntries.map((log, idx) => {
                const isError = log.kind === 'error';
                const color = isError ? 'text-danger' : 'text-primary';
                const time = typeof log.at === 'string' ? new Date(log.at).toLocaleString() : '–';
                const msg = isError
                  ? String(log.message ?? 'Unknown error') + (log.path ? ` (${log.method ?? ''} ${log.path})` : '')
                  : `${String(log.action ?? 'action')}${log.targetEmail ? ` → ${log.targetEmail}` : ''} (by ${String(log.actorEmail ?? 'unknown')})`;
                return (
                  <div key={idx} className="flex gap-4 hover:bg-surface-raised/10 py-0.5 rounded transition-colors">
                    <span className="text-ink-faint shrink-0">{time}</span>
                    <span className={`font-bold shrink-0 w-14 ${color}`}>[{isError ? 'ERROR' : 'AUDIT'}]</span>
                    <span className="text-muted-foreground font-light break-all">{msg}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md bg-card border border-border rounded-lg p-6 shadow-[var(--shadow-modal)] space-y-4">
            <h3 className="text-lg font-bold text-foreground flex items-center">
              <UserPlus className="w-5 h-5 mr-2 text-muted-foreground" /> Create user
            </h3>
            {createError && (
              <div className="p-3 bg-danger-soft border border-danger text-danger text-xs rounded-md">
                {createError}
              </div>
            )}
            <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
              <div>
                <label htmlFor="page-full-name" className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">Full name</label>
                <input id="page-full-name"
                  type="text"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-md px-3.5 py-2 text-foreground focus:outline-none focus:border-border-strong"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label htmlFor="page-email-address" className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">Email address</label>
                <input id="page-email-address"
                  type="email"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-md px-3.5 py-2 text-foreground focus:outline-none focus:border-border-strong"
                  placeholder="email@rune.io"
                />
              </div>
              <div>
                <label htmlFor="page-password" className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">Password</label>
                <input id="page-password"
                  type="password"
                  required
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-md px-3.5 py-2 text-foreground focus:outline-none focus:border-border-strong"
                  autoComplete="new-password"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="page-time-zone" className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">Time zone</label>
                  <select id="page-time-zone"
                    value={createTimezone}
                    onChange={(e) => setCreateTimezone(e.target.value)}
                    className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-border-strong"
                  >
                    <option value="UTC">UTC</option>
                    <option value="GMT">GMT</option>
                    <option value="EST">EST</option>
                    <option value="PST">PST</option>
                    <option value="IST">IST</option>
                    <option value="CET">CET</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="page-role" className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">Role</label>
                  <select id="page-role"
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value)}
                    className="w-full bg-surface-raised border border-border rounded-md px-3 py-2 text-foreground focus:outline-none focus:border-border-strong"
                  >
                    <option value="USER">User</option>
                    <option value="DEVELOPER">Developer</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-surface-raised hover:bg-surface-sunken border border-border-strong text-muted-foreground text-xs font-bold rounded-full transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold rounded-full transition-[background-color,transform] duration-200 hover:-translate-y-px active:scale-[0.97]"
                >
                  {creating ? 'Creating…' : 'Create user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md bg-card border border-border rounded-lg p-6 shadow-[var(--shadow-modal)] space-y-4">
            <h3 className="text-lg font-bold text-foreground flex items-center">
              <Edit2 className="w-5 h-5 mr-2 text-muted-foreground" /> Edit user
            </h3>
            {editError && (
              <div className="p-3 bg-danger-soft border border-danger text-danger text-xs rounded-md">
                {editError}
              </div>
            )}
            <form onSubmit={handleEditUser} className="space-y-4 text-xs">
              <div>
                <label htmlFor="page-full-name-2" className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">Full name</label>
                <input id="page-full-name-2"
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-md px-3.5 py-2 text-foreground focus:outline-none focus:border-border-strong"
                />
              </div>
              <div>
                <label htmlFor="page-email-address-2" className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">Email address</label>
                <input id="page-email-address-2"
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-md px-3.5 py-2 text-foreground focus:outline-none focus:border-border-strong"
                />
              </div>
              <div>
                <label htmlFor="page-new-password-leave-blank-to-keep" className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">New password (leave blank to keep the current one)</label>
                <input id="page-new-password-leave-blank-to-keep"
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-md px-3.5 py-2 text-foreground focus:outline-none focus:border-border-strong"
                  placeholder="New password"
                />
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor="page-role-2" className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">Role</label>
                  <select id="page-role-2"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full bg-surface-raised border border-border rounded-md px-2 py-2 text-foreground focus:outline-none focus:border-border-strong"
                  >
                    <option value="USER">User</option>
                    <option value="DEVELOPER">Developer</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="page-status" className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">Status</label>
                  <select id="page-status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full bg-surface-raised border border-border rounded-md px-2 py-2 text-foreground focus:outline-none focus:border-border-strong"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="SUSPENDED">Suspended</option>
                    <option value="DISABLED">Disabled</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="page-time-zone-2" className="block text-[11.5px] text-muted-foreground mb-1 font-semibold">Time zone</label>
                  <select id="page-time-zone-2"
                    value={editTimezone}
                    onChange={(e) => setEditTimezone(e.target.value)}
                    className="w-full bg-surface-raised border border-border rounded-md px-2 py-2 text-foreground focus:outline-none focus:border-border-strong"
                  >
                    <option value="UTC">UTC</option>
                    <option value="GMT">GMT</option>
                    <option value="EST">EST</option>
                    <option value="PST">PST</option>
                    <option value="IST">IST</option>
                    <option value="CET">CET</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-surface-raised hover:bg-surface-sunken border border-border-strong text-muted-foreground text-xs font-bold rounded-full transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-5 py-2 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold rounded-full transition-[background-color,transform] duration-200 hover:-translate-y-px active:scale-[0.97]"
                >
                  {updating ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE USER CONFIRM MODAL */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md bg-card border border-danger/20 rounded-lg p-6 shadow-[var(--shadow-modal)] space-y-4">
            <h3 className="text-lg font-bold text-danger flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2" /> Delete user
            </h3>
            
            <p className="text-muted-foreground text-xs font-light leading-relaxed">
              Delete the account for <strong className="text-foreground">{deleteUserName}</strong>?
            </p>

            <div className="bg-surface-raised border border-border p-4 rounded-md flex items-start space-x-2.5">
              <input
                type="checkbox"
                id="permDelete"
                checked={permanentDelete}
                onChange={(e) => setPermanentDelete(e.target.checked)}
                className="mt-0.5 rounded border-border-strong bg-transparent text-danger focus:ring-0 focus:ring-offset-0"
              />
              <label htmlFor="permDelete" className="text-[11px] text-muted-foreground leading-normal select-none">
                <strong className="text-foreground">Delete permanently</strong>
                <span className="block mt-0.5">Erase this user’s profile, projects, and tasks from the database for good. If unchecked, the account is suspended instead.</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-surface-raised hover:bg-surface-sunken border border-border-strong text-muted-foreground text-xs font-bold rounded-full transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleting}
                className="px-5 py-2 bg-danger hover:bg-danger text-danger-foreground text-xs font-bold rounded-full transition-[background-color,transform] duration-200 hover:-translate-y-px active:scale-[0.97]"
              >
                {deleting ? 'Deleting…' : 'Delete user'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export const dynamic = 'force-dynamic';
