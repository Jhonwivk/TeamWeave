"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, Bot, Check, ChevronRight, Code2, Copy, Cpu, Download, ExternalLink, FileText, FolderOpen, GitBranch, GitFork, Laptop, Layers3, Loader2, MessageSquareText, Monitor, Plus, RefreshCw, Search, Server, Settings2, ShieldCheck, Sparkles, TerminalSquare, Trash2, UserRound, UserRoundCheck, UsersRound, Wifi, WifiOff, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACTOR_CATALOG, type ActorId } from "@/lib/actors";
import type { AuthUser } from "@/lib/auth";

type Repository = { id: string; fullName: string; url: string; defaultBranch: string; visibility: string; createdAt: number };
type Worker = { id: string; name: string; platform: string; capabilities: string[]; runtimes: string[]; lastSeenAt: number | null; createdAt: number };
type Workspace = { id: string; repositoryId: string; workerId: string | null; localPath: string | null; baseBranch: string; workingBranch: string | null; status: "queued" | "claiming" | "preparing" | "ready" | "stopped" | "failed" | string; error: string | null; createdAt: number; lastActiveAt: number; updatedAt: number; repository?: string; repositoryUrl?: string };
type WorkspaceEvent = { id: number; workspaceId: string; kind: string; message: string; payload: Record<string, unknown> | null; createdAt: number };
type TerminalSession = { id: string; ownerId: string; workspaceId: string; workerId: string | null; shell: string; cwd: string | null; cols: number; rows: number; pid: number | null; status: string; exitCode: number | null; error: string | null; createdAt: number; lastActiveAt: number; updatedAt: number };
type TerminalEvent = { id: number; ownerId: string; workspaceId: string; terminalId: string; kind: string; data: string | null; payload: Record<string, unknown> | null; createdAt: number };
type Task = { id: string; repositoryId: string; workspaceId: string | null; title: string; prompt: string; actor: ActorId; model: string | null; mode: "single" | "multi"; runtime: "auto" | "herdr" | "direct"; activeSessionId: string | null; baseBranch: string; workBranch: string | null; status: string; workerId: string | null; attempt: number; summary: string | null; diffStat: string | null; prUrl: string | null; error: string | null; createdAt: number; updatedAt: number };
type AgentSession = { id: string; taskId: string; actor: ActorId; role: string; model: string | null; ordinal: number; status: string; runtime: string | null; runtimeName: string | null; workspaceId: string | null; paneId: string | null; summary: string | null; createdAt: number; updatedAt: number };
type SessionMessage = { id: string; taskId: string; fromSessionId: string | null; toSessionId: string | null; kind: string; body: string; artifacts: string[]; gitRef: string | null; status: string; createdAt: number; deliveredAt: number | null; acknowledgedAt: number | null };
type TaskEvent = { id: number; taskId: string; kind: string; message: string; payload: { compareUrl?: string; sessionId?: string } | null; createdAt: number };
type State = { repositories: Repository[]; workers: Worker[]; tasks: Task[]; events: TaskEvent[]; sessions: AgentSession[]; messages: SessionMessage[]; workspaces: Workspace[]; workspaceEvents: WorkspaceEvent[]; serverTime: number };
type DraftStep = { actor: ActorId; role: string };
type ConsoleSection = "board" | "repositories" | "workspaces" | "workers" | "activity";

const emptyState: State = { repositories: [], workers: [], tasks: [], events: [], sessions: [], messages: [], workspaces: [], workspaceEvents: [], serverTime: Date.now() };
const actorVisuals: Record<ActorId, { icon: typeof Bot; tone: string }> = {
  pi: { icon: Sparkles, tone: "violet" },
  codex: { icon: Code2, tone: "cyan" },
  claude: { icon: Bot, tone: "amber" },
  gemini: { icon: Sparkles, tone: "cyan" },
  cursor: { icon: Code2, tone: "violet" },
  copilot: { icon: GitFork, tone: "green" },
  opencode: { icon: TerminalSquare, tone: "cyan" },
  qwen: { icon: Bot, tone: "amber" },
  aider: { icon: Laptop, tone: "green" },
  kimi: { icon: Bot, tone: "violet" },
  kiro: { icon: Layers3, tone: "amber" },
  droid: { icon: Bot, tone: "cyan" },
  amp: { icon: Activity, tone: "violet" },
  devin: { icon: Bot, tone: "violet" },
  cline: { icon: TerminalSquare, tone: "cyan" },
  qodercli: { icon: Code2, tone: "amber" },
};
const actors = ACTOR_CATALOG.map((actor) => ({ ...actor, ...actorVisuals[actor.id] }));
const columns = [
  { key: "queued", title: "Queued", helper: "Waiting for a compatible worker", statuses: ["queued"] },
  { key: "running", title: "Running", helper: "Session or GitHub action in progress", statuses: ["claimed", "running", "resume_requested", "resuming", "publish_requested", "publishing"] },
  { key: "review", title: "Review", helper: "Human decision required", statuses: ["blocked", "review", "failed"] },
  { key: "done", title: "Done", helper: "PR created or task closed", statuses: ["done", "cancelled"] },
];
const statusLabels: Record<string, string> = { queued: "Queued", claimed: "Claimed", running: "Running", blocked: "Agent blocked", resume_requested: "Reply queued", resuming: "Resuming", review: "Needs review", publish_requested: "Creating PR", publishing: "Creating PR", done: "PR created", failed: "Failed", cancelled: "Cancelled" };
const navItems: Array<{ id: ConsoleSection; label: string; description: string; icon: typeof Bot }> = [
  { id: "board", label: "Overview", description: "Delivery board and next actions", icon: Activity },
  { id: "repositories", label: "Repositories", description: "Connected GitHub sources", icon: GitFork },
  { id: "workspaces", label: "Workspaces", description: "Persistent development checkouts", icon: FolderOpen },
  { id: "workers", label: "Workers", description: "Local execution machines", icon: Server },
  { id: "activity", label: "Activity", description: "Events and audit trail", icon: Layers3 },
];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}

export default function AgentConsole({ user }: { user: AuthUser }) {
  const [state, setState] = useState<State>(emptyState);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [repoOpen, setRepoOpen] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [workerOpen, setWorkerOpen] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [activeSection, setActiveSection] = useState<ConsoleSection>("board");
  const [shellWorkspaceId, setShellWorkspaceId] = useState<string | null>(null);
  const [actor, setActor] = useState<ActorId>("codex");
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [runtime, setRuntime] = useState<"auto" | "herdr" | "direct">("auto");
  const [teamSteps, setTeamSteps] = useState<DraftStep[]>([
    { actor: "claude", role: "Planner" },
    { actor: "codex", role: "Implementer" },
    { actor: "pi", role: "Reviewer" },
  ]);
  const [repositoryId, setRepositoryId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("none");
  const [enrollment, setEnrollment] = useState<{ token: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (quiet = false) => {
    try {
      const next = await requestJson<State>("/api/state", { cache: "no-store" });
      setState(next);
      setSelected((current) => current ? next.tasks.find((task) => task.id === current.id) || null : null);
      if (!quiet) setNotice(null);
    } catch (error) {
      if (!quiet) setNotice(error instanceof Error ? error.message : "Could not load workspace");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { const initial = setTimeout(() => void refresh(), 0); const timer = setInterval(() => void refresh(true), 4000); return () => { clearTimeout(initial); clearInterval(timer); }; }, [refresh]);
  useEffect(() => { if (!repositoryId && state.repositories[0]) { const timer = setTimeout(() => setRepositoryId(state.repositories[0].id), 0); return () => clearTimeout(timer); } }, [state.repositories, repositoryId]);

  const eventsByTask = useMemo(() => {
    const grouped = new Map<string, TaskEvent[]>();
    state.events.forEach((event) => grouped.set(event.taskId, [...(grouped.get(event.taskId) || []), event]));
    return grouped;
  }, [state.events]);
  const sessionsByTask = useMemo(() => {
    const grouped = new Map<string, AgentSession[]>();
    state.sessions.forEach((session) => grouped.set(session.taskId, [...(grouped.get(session.taskId) || []), session]));
    return grouped;
  }, [state.sessions]);
  const messagesByTask = useMemo(() => {
    const grouped = new Map<string, SessionMessage[]>();
    state.messages.forEach((message) => grouped.set(message.taskId, [...(grouped.get(message.taskId) || []), message]));
    return grouped;
  }, [state.messages]);
  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? state.tasks.filter((task) => `${task.title} ${task.actor} ${task.mode} ${task.id}`.toLowerCase().includes(needle)) : state.tasks;
  }, [state.tasks, query]);
  const onlineWorkers = state.workers.filter((worker) => worker.lastSeenAt && state.serverTime - worker.lastSeenAt < 15000);
  const userInitials = (user.name || user.login).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const repoById = new Map(state.repositories.map((repo) => [repo.id, repo]));
  const workerById = new Map(state.workers.map((worker) => [worker.id, worker]));
  const workspaceByRepository = new Map(state.workspaces.map((workspace) => [workspace.repositoryId, workspace]));
  const availableWorkspaces = state.workspaces.filter((workspace) => workspace.repositoryId === repositoryId && !["stopped", "failed"].includes(workspace.status));
  const shellWorkspace = shellWorkspaceId ? state.workspaces.find((workspace) => workspace.id === shellWorkspaceId) || null : null;
  const activeSessionCount = state.sessions.filter((session) => ["starting", "working", "blocked"].includes(session.status)).length;
  const attentionCount = state.tasks.filter((task) => ["blocked", "review"].includes(task.status)).length;
  const activeTaskCount = state.tasks.filter((task) => ["queued", "claimed", "running", "blocked", "resume_requested", "resuming", "review", "publish_requested", "publishing"].includes(task.status)).length;
  const activeWorkspaceCount = state.workspaces.filter((workspace) => ["queued", "claiming", "preparing", "ready"].includes(workspace.status)).length;
  const activeNavItem = navItems.find((item) => item.id === activeSection) || navItems[0];

  function enterWorkspace(workspace: Workspace) {
    setShellWorkspaceId(workspace.id);
    setActiveSection("workspaces");
  }

  function navigateTo(section: ConsoleSection) {
    setActiveSection(section);
    if (section !== "workspaces") setShellWorkspaceId(null);
  }

  function createTaskInWorkspace(workspace: Workspace) {
    setRepositoryId(workspace.repositoryId);
    setWorkspaceId(workspace.id);
    setCreateOpen(true);
  }

  async function addRepository(form: FormData) {
    const fullName = String(form.get("fullName") || "").trim();
    if (!/^(?:https?:\/\/github\.com\/)?[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(fullName)) {
      setRepoError("Use owner/repository format, for example Jhonwivk/TeamWeave.");
      return;
    }
    setRepoError(null);
    setBusy(true);
    try {
      await requestJson("/api/repositories", { method: "POST", body: JSON.stringify({ fullName, defaultBranch: form.get("defaultBranch"), visibility: form.get("visibility") }) });
      setRepoOpen(false); setNotice("GitHub repository connected"); await refresh(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not connect repository";
      setRepoError(message);
      setNotice(message);
    }
    finally { setBusy(false); }
  }
  async function openWorkspace(repository: Repository) {
    setBusy(true);
    try {
      const result = await requestJson<{ workspace: Workspace; reused?: boolean }>("/api/workspaces", { method: "POST", body: JSON.stringify({ repositoryId: repository.id, baseBranch: repository.defaultBranch }) });
      setNotice(result.reused ? `${repository.fullName} workspace is already open` : `${repository.fullName} workspace queued`);
      await refresh(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not open workspace"); }
    finally { setBusy(false); }
  }
  async function workspaceAction(workspace: Workspace, action: "stop" | "reopen" | "delete") {
    if (action === "delete" && typeof window !== "undefined" && !window.confirm(`Delete the stopped workspace for ${workspace.repository || "this repository"}?`)) return;
    setBusy(true);
    try {
      await requestJson(`/api/workspaces/${workspace.id}/action`, { method: "POST", body: JSON.stringify({ action }) });
      setNotice(action === "stop" ? "Workspace stopped" : action === "delete" ? "Workspace deleted" : "Workspace queued again");
      await refresh(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Workspace action failed"); }
    finally { setBusy(false); }
  }
  async function addTask(form: FormData) {
    setBusy(true);
    try {
      await requestJson("/api/tasks", { method: "POST", body: JSON.stringify({ repositoryId, workspaceId: workspaceId === "none" ? undefined : workspaceId, actor, mode, runtime, steps: mode === "multi" ? teamSteps : undefined, title: form.get("title"), prompt: form.get("prompt"), model: form.get("model"), baseBranch: form.get("baseBranch") }) });
      setCreateOpen(false); setNotice(mode === "multi" ? `${teamSteps.length}-agent workflow queued` : "Single-agent task queued"); await refresh(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not create task"); }
    finally { setBusy(false); }
  }
  async function enrollWorker(form: FormData) {
    setBusy(true);
    try {
      const result = await requestJson<{ worker: { name: string }; token: string }>("/api/workers/enroll", { method: "POST", body: JSON.stringify({ name: form.get("name") }) });
      setEnrollment({ token: result.token, name: result.worker.name }); await refresh(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not create worker token"); }
    finally { setBusy(false); }
  }
  async function act(task: Task, action: "approve" | "retry" | "cancel" | "respond", reply?: string) {
    setBusy(true);
    try { await requestJson(`/api/tasks/${task.id}/action`, { method: "POST", body: JSON.stringify({ action, reply }) }); await refresh(true); setNotice(action === "approve" ? "Approved. The worker will create a GitHub pull request." : action === "retry" ? "Task queued for another run." : action === "respond" ? "Response queued for the blocked Herdr session." : "Task cancelled."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Action failed"); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#080a11] text-[#f4f5f8]">
      <div className="flex min-h-screen">
        <ProductSidebar activeSection={activeSection} onSectionChange={navigateTo} onlineWorkers={onlineWorkers.length} workerCount={state.workers.length} workspaceCount={activeWorkspaceCount} attentionCount={attentionCount} user={user} onWorkerSetup={() => setWorkerOpen(true)} />

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-white/8 bg-[#0b0e17]/90 px-4 py-3 backdrop-blur md:px-7">
            <div className="mx-auto flex min-h-10 max-w-[1600px] items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-[0_0_30px_rgba(139,92,246,.35)] lg:hidden"><Sparkles className="size-5" /></div>
                <div className="min-w-0"><div className="hidden items-center gap-2 text-xs text-white/30 md:flex"><span>TeamWeave</span><ChevronRight className="size-3" /><span>{shellWorkspace ? "Workspace" : "Control plane"}</span></div><div className="truncate text-sm font-semibold md:mt-1">{shellWorkspace ? shellWorkspace.repository || "Development workspace" : activeNavItem.label}</div></div>
              </div>
              <div className="hidden min-w-0 flex-1 justify-center px-6 lg:flex"><div className="relative w-full max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/25" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 w-full rounded-lg border border-white/8 bg-white/[.035] pl-9 pr-3 text-xs outline-none placeholder:text-white/25 focus:border-violet-400/45" placeholder="Search tasks, repositories, agents" /></div></div>
              <div className="flex shrink-0 items-center gap-2">
                <div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:flex ${onlineWorkers.length ? "border-emerald-400/15 bg-emerald-400/8 text-emerald-300" : "border-white/8 bg-white/4 text-white/40"}`}>{onlineWorkers.length ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}{onlineWorkers.length} worker{onlineWorkers.length === 1 ? "" : "s"} online</div>
                <Button variant="ghost" size="icon" className="text-white/55 hover:bg-white/8 hover:text-white" onClick={() => setWorkerOpen(true)} aria-label="Worker setup"><Settings2 /></Button>
                <Button size="sm" onClick={() => state.repositories.length ? setCreateOpen(true) : setRepoOpen(true)} className="hidden bg-violet-500 text-white shadow-[0_8px_24px_rgba(139,92,246,.18)] hover:bg-violet-400 sm:inline-flex"><Plus /> New task</Button>
                <div className="grid size-9 place-items-center rounded-full bg-[#24283a] text-xs font-semibold" title={user.name || user.login}>{userInitials}</div>
              </div>
            </div>
          </header>

          <div className="border-b border-white/8 bg-[#0a0d15] px-4 lg:hidden">
            <nav className="scrollbar-none mx-auto flex max-w-[1600px] gap-1 overflow-x-auto py-2" aria-label="Primary navigation">
              {navItems.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => navigateTo(item.id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${activeSection === item.id ? "bg-violet-400/12 text-violet-100" : "text-white/42 hover:bg-white/5 hover:text-white/75"}`}><Icon className="size-3.5" />{item.label}{item.id === "workspaces" && activeWorkspaceCount > 0 && <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[10px]">{activeWorkspaceCount}</span>}{item.id === "activity" && attentionCount > 0 && <span className="size-1.5 rounded-full bg-amber-300" />}</button>; })}
            </nav>
          </div>

          <div className="mx-auto max-w-[1600px] px-4 py-5 md:px-7 md:py-7">
            <Tabs value={activeSection} onValueChange={(value) => navigateTo(value as ConsoleSection)} className="gap-6">
              <TabsList className="sr-only"><TabsTrigger value="board">Overview</TabsTrigger><TabsTrigger value="repositories">Repositories</TabsTrigger><TabsTrigger value="workspaces">Workspaces</TabsTrigger><TabsTrigger value="workers">Workers</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger></TabsList>
              <div className="flex flex-col justify-between gap-5 border-b border-white/8 pb-6 lg:flex-row lg:items-end">
                <div><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] text-violet-300"><span className="size-1.5 rounded-full bg-violet-300" />{shellWorkspace ? "Development workspace" : activeNavItem.label}</div><h1 className="text-2xl font-semibold tracking-[-.03em] md:text-3xl">{shellWorkspace ? shellWorkspace.repository || "Development workspace" : activeNavItem.label}</h1><p className="mt-1.5 max-w-2xl text-sm text-white/45">{shellWorkspace ? "Agents, files, Git, preview, and terminal share one durable workspace." : activeNavItem.description}</p></div>
                {!shellWorkspace && activeSection === "board" && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setRepoOpen(true)} className="h-10 border-white/10 bg-transparent text-white/75 hover:bg-white/8 hover:text-white"><GitFork /> Connect repository</Button><Button onClick={() => state.repositories.length ? setCreateOpen(true) : setRepoOpen(true)} className="h-10 bg-violet-500 text-white shadow-[0_8px_24px_rgba(139,92,246,.18)] hover:bg-violet-400"><Plus /> New task</Button></div>}
              </div>

          {notice && <div className="flex items-center justify-between rounded-xl border border-violet-400/20 bg-violet-400/8 px-4 py-3 text-sm text-violet-100"><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss"><XCircle className="size-4" /></button></div>}

          <TabsContent value="board" className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={Bot} label="Active sessions" value={String(activeSessionCount)} tone="violet" /><Stat icon={Cpu} label="Workers online" value={`${onlineWorkers.length} / ${state.workers.length}`} tone="cyan" /><Stat icon={UserRoundCheck} label="Needs attention" value={String(attentionCount)} tone="amber" /><Stat icon={GitFork} label="Pull requests" value={String(state.tasks.filter((task) => !!task.prUrl).length)} tone="green" /></section>
            <NextActionPanel repositoryCount={state.repositories.length} workerCount={state.workers.length} workspaceCount={activeWorkspaceCount} pullRequestCount={state.tasks.filter((task) => !!task.prUrl).length} attentionCount={attentionCount} activeTaskCount={activeTaskCount} onConnectRepository={() => setRepoOpen(true)} onSetupWorker={() => setWorkerOpen(true)} onOpenReview={() => { const task = state.tasks.find((item) => ["blocked", "review"].includes(item.status)); if (task) setSelected(task); }} onNewTask={() => state.repositories.length ? setCreateOpen(true) : setRepoOpen(true)} onViewActivity={() => navigateTo("activity")} />
            <section className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-[#0d101a] p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-semibold">Task board</div><p className="mt-1 text-xs text-white/35">Track agent work from queue to approved pull request.</p></div><div className="relative w-full sm:max-w-xs lg:hidden"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/30" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl border border-white/8 bg-[#080a11] pl-10 pr-3 text-sm outline-none placeholder:text-white/25 focus:border-violet-400/50" placeholder="Search tasks or actors" /></div></section>
            {loading ? <Loading /> : state.repositories.length === 0 ? <Empty icon={GitFork} title="Connect a GitHub repository" text="TeamWeave stores only the repository address. GitHub authentication remains on your local worker." action="Connect repository" onAction={() => setRepoOpen(true)} /> : state.workers.length === 0 ? <Empty icon={Laptop} title="Register your local worker" text="The worker runs persistent Herdr sessions or falls back to direct agent CLIs." action="Set up worker" onAction={() => setWorkerOpen(true)} /> : <section className="grid items-start gap-4 xl:grid-cols-4">{columns.map((column) => <div key={column.key} className="rounded-2xl border border-white/8 bg-[#0d101a] p-3"><div className="mb-3 flex items-center justify-between px-1"><div><h2 className="text-sm font-semibold">{column.title}</h2><p className="mt-0.5 text-xs text-white/35">{column.helper}</p></div><span className="rounded-full bg-white/6 px-2 py-1 text-xs text-white/45">{visibleTasks.filter((task) => column.statuses.includes(task.status)).length}</span></div><div className="space-y-3">{visibleTasks.filter((task) => column.statuses.includes(task.status)).map((task) => <TaskCard key={task.id} task={task} sessions={sessionsByTask.get(task.id) || []} repo={repoById.get(task.repositoryId)} worker={task.workerId ? workerById.get(task.workerId) : undefined} onOpen={() => setSelected(task)} />)}{visibleTasks.filter((task) => column.statuses.includes(task.status)).length === 0 && <div className="rounded-xl border border-dashed border-white/8 px-3 py-8 text-center text-xs text-white/25">No tasks</div>}</div></div>)}</section>}
          </TabsContent>

          <TabsContent value="repositories">
            <section className="space-y-4">
              <div className="flex items-center justify-between"><div><h2 className="font-semibold">Connected repositories</h2><p className="mt-1 text-sm text-white/40">Git credentials never leave your worker machine.</p></div><Button onClick={() => setRepoOpen(true)} className="bg-violet-500 text-white hover:bg-violet-400"><Plus /> Connect</Button></div>
              {state.repositories.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{state.repositories.map((repo) => {
                const workspace = workspaceByRepository.get(repo.id);
                const isActive = workspace && ["queued", "claiming", "preparing", "ready"].includes(workspace.status);
                return <article key={repo.id} className="rounded-2xl border border-white/8 bg-[#0d101a] p-5"><div className="flex items-start justify-between"><div className="grid size-10 place-items-center rounded-xl bg-white/6"><GitFork className="size-5" /></div><span className="rounded-full bg-white/6 px-2 py-1 text-xs capitalize text-white/45">{repo.visibility}</span></div><h3 className="mt-5 font-semibold">{repo.fullName}</h3><div className="mt-3 flex items-center gap-2 text-xs text-white/38"><GitBranch className="size-3.5" />{repo.defaultBranch}</div>{workspace && <div className="mt-4 rounded-xl border border-violet-400/12 bg-violet-400/5 p-3"><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 text-violet-200"><FolderOpen className="size-3.5" />Workspace</span><span className={`status status-${workspace.status}`}>{workspace.status}</span></div><div className="mt-2 truncate font-mono text-[11px] text-white/35">{workspace.workingBranch || "branch pending"}</div></div>}<div className="mt-5 flex flex-wrap items-center gap-3">{isActive && workspace ? <Button onClick={() => enterWorkspace(workspace)} className="h-9 bg-violet-500 text-white hover:bg-violet-400"><FolderOpen className="size-3.5" />Enter workspace</Button> : <Button variant="outline" disabled={busy} onClick={() => void openWorkspace(repo)} className="h-9 border-white/10 bg-transparent text-white hover:bg-white/8"><FolderOpen className="size-3.5" />{workspace ? "Reopen workspace" : "Open workspace"}</Button>}<a href={`https://github.com/${repo.fullName}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-violet-300 hover:text-violet-200">GitHub <ExternalLink className="size-3.5" /></a></div></article>;
              })}</div> : <Empty icon={GitFork} title="No repositories yet" text="Connect a public or private GitHub repository by its owner/name." action="Connect repository" onAction={() => setRepoOpen(true)} />}
            </section>
          </TabsContent>

          <TabsContent value="workspaces">
            {shellWorkspace ? <WorkspaceShell workspace={shellWorkspace} repository={repoById.get(shellWorkspace.repositoryId)} worker={shellWorkspace.workerId ? workerById.get(shellWorkspace.workerId) : undefined} repositories={state.repositories} workspaces={state.workspaces} tasks={state.tasks.filter((task) => task.workspaceId === shellWorkspace.id)} sessions={state.sessions} events={state.events} workspaceEvents={state.workspaceEvents.filter((event) => event.workspaceId === shellWorkspace.id)} busy={busy} onBack={() => setShellWorkspaceId(null)} onSwitch={enterWorkspace} onNewTask={() => createTaskInWorkspace(shellWorkspace)} onOpenTask={setSelected} onWorkspaceAction={workspaceAction} /> : <section className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Development workspaces</h2><p className="mt-1 text-sm text-white/40">A worker clones or reuses the repository, creates one isolated branch, and keeps the path ready for terminal and preview sessions.</p></div><Button onClick={() => setRepoOpen(true)} variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/8"><Plus /> Connect repo</Button></div>{state.workspaces.length ? <div className="grid gap-4 lg:grid-cols-2">{state.workspaces.map((workspace) => <article key={workspace.id} className="rounded-2xl border border-white/8 bg-[#0d101a] p-5"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-violet-400/10 text-violet-200"><FolderOpen className="size-5" /></div><div><h3 className="font-semibold">{workspace.repository || "Repository workspace"}</h3><p className="mt-1 text-xs text-white/35">{workspace.id}</p></div></div><span className={`status status-${workspace.status}`}>{workspace.status}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Meta icon={GitBranch} label="Base branch" value={workspace.baseBranch} /><Meta icon={GitBranch} label="Working branch" value={workspace.workingBranch || "Pending worker"} /></div><div className="mt-3 rounded-xl bg-white/[.035] p-3"><div className="text-[11px] text-white/30">Local path</div><div className="mt-1 truncate font-mono text-xs text-cyan-100/60">{workspace.localPath || "Waiting for a worker to prepare this checkout"}</div></div>{workspace.error && <div className="mt-3 rounded-lg bg-rose-400/6 p-3 text-xs leading-5 text-rose-100/70">{workspace.error}</div>}<div className="mt-4 flex items-center justify-between text-xs text-white/35"><span>{workspace.workerId ? workerById.get(workspace.workerId)?.name || "Assigned worker" : "Waiting for worker"}</span><span>{relative(workspace.updatedAt)}</span></div><div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => enterWorkspace(workspace)} className="bg-violet-500 text-white hover:bg-violet-400"><FolderOpen className="size-3.5" />Open workspace</Button>{["queued", "claiming", "preparing", "ready"].includes(workspace.status) && <Button variant="outline" disabled={busy} onClick={() => void workspaceAction(workspace, "stop")} className="border-white/10 bg-transparent text-white hover:bg-white/8">Stop workspace</Button>}{["stopped", "failed"].includes(workspace.status) && <><Button disabled={busy} onClick={() => void workspaceAction(workspace, "reopen")} className="bg-violet-500 text-white hover:bg-violet-400">Queue again</Button><Button variant="ghost" disabled={busy} onClick={() => void workspaceAction(workspace, "delete")} className="text-rose-200/70 hover:bg-rose-400/10 hover:text-rose-100"><Trash2 className="size-3.5" />Delete</Button></>}</div></article>)}</div> : <Empty icon={FolderOpen} title="No development workspaces" text="Open a workspace from a connected repository. Your local worker will prepare the checkout and report its branch and path here." action="Connect repository" onAction={() => setRepoOpen(true)} />}</section>}
          </TabsContent>

          <TabsContent value="workers"><section className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Execution workers</h2><p className="mt-1 text-sm text-white/40">Workers detect installed actors and the Herdr runtime automatically.</p></div><Button onClick={() => setWorkerOpen(true)} className="bg-violet-500 text-white hover:bg-violet-400"><Plus /> Register worker</Button></div>{state.workers.length ? <div className="grid gap-4 lg:grid-cols-3">{state.workers.map((worker) => { const online = !!worker.lastSeenAt && state.serverTime - worker.lastSeenAt < 15000; return <article key={worker.id} className="rounded-2xl border border-white/8 bg-[#0d101a] p-5"><div className="flex items-start justify-between"><div className="grid size-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><Server className="size-5" /></div><span className={`flex items-center gap-1.5 text-xs ${online ? "text-emerald-300" : "text-white/35"}`}><span className={`size-1.5 rounded-full ${online ? "bg-emerald-300" : "bg-white/25"}`} />{online ? "Online" : "Offline"}</span></div><h3 className="mt-5 font-semibold">{worker.name}</h3><p className="mt-1 truncate text-xs text-white/35">{worker.platform}</p><div className="mt-5 flex flex-wrap gap-2">{worker.runtimes?.map((runtime) => <span key={runtime} className={`rounded-lg px-2.5 py-1.5 text-xs ${runtime === "herdr" ? "bg-violet-400/12 text-violet-200" : "bg-white/6 text-white/55"}`}>{runtime === "herdr" ? "Herdr" : "Direct"}</span>)}{worker.capabilities.length ? worker.capabilities.map((actor) => <span key={actor} className="rounded-lg bg-white/6 px-2.5 py-1.5 text-xs capitalize text-white/65">{actors.find((item) => item.id === actor)?.name || actor}</span>) : <span className="text-xs text-amber-300/70">Worker has not connected yet</span>}</div></article>; })}</div> : <Empty icon={Server} title="No workers registered" text="Register this Mac with any supported coding agent installed, such as Codex, Claude, Gemini, Cursor, Copilot, OpenCode, Qwen, or Aider." action="Set up worker" onAction={() => setWorkerOpen(true)} />}</section></TabsContent>

          <TabsContent value="activity"><section className="grid gap-5 lg:grid-cols-[1fr_320px]"><div className="rounded-2xl border border-white/8 bg-[#0d101a] p-5"><h2 className="font-semibold">Execution events</h2><div className="mt-5">{state.events.length ? state.events.slice(0, 80).map((event) => <div key={event.id} className="flex gap-4 border-l border-white/8 py-3 pl-5"><div className="mt-1 size-2 shrink-0 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,.6)]" /><div><p className="whitespace-pre-wrap text-sm text-white/72">{event.message}</p><p className="mt-1 text-xs text-white/30">{event.kind} · {relative(event.createdAt)}</p></div></div>) : <p className="py-12 text-center text-sm text-white/30">Events appear when you create a task.</p>}</div></div><div className="rounded-2xl border border-violet-400/15 bg-gradient-to-b from-violet-500/10 to-transparent p-5"><ShieldCheck className="size-7 text-violet-300" /><h2 className="mt-4 font-semibold">Control boundary</h2><p className="mt-2 text-sm leading-6 text-white/45">Herdr keeps terminal sessions alive. TeamWeave stores every handoff, isolates Git changes, and still requires approval before creating a pull request.</p><div className="mt-5 space-y-3 text-sm"><Control label="Durable session messages" /><Control label="One isolated branch" /><Control label="Explicit PR approval" /></div></div></section></TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <Dialog open={repoOpen} onOpenChange={(open) => { setRepoOpen(open); if (!open) setRepoError(null); }}><DialogContent className="border-white/10 bg-[#121622] text-white sm:max-w-lg"><DialogHeader><DialogTitle>Connect GitHub repository</DialogTitle><DialogDescription className="text-white/42">Use owner/repository. Private access is checked by GitHub CLI on your local worker.</DialogDescription></DialogHeader><form action={addRepository} className="space-y-4"><Field label="Repository"><input name="fullName" className="field" placeholder="owner/repository" required autoFocus /></Field>{repoError && <div role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/8 px-3 py-2 text-xs leading-5 text-rose-100">{repoError}</div>}<div className="grid gap-4 sm:grid-cols-2"><Field label="Default branch"><input name="defaultBranch" className="field" defaultValue="main" required /></Field><Field label="Visibility"><select name="visibility" className="field"><option value="unknown">Auto / unknown</option><option value="public">Public</option><option value="private">Private</option></select></Field></div><DialogFooter><Button type="button" variant="ghost" onClick={() => setRepoOpen(false)} className="text-white/55 hover:bg-white/8 hover:text-white">Cancel</Button><Button type="submit" disabled={busy} className="bg-violet-500 text-white hover:bg-violet-400">{busy && <Loader2 className="animate-spin" />}<GitFork /> Connect</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[92vh] overflow-y-auto border-white/10 bg-[#121622] text-white sm:max-w-2xl"><DialogHeader><DialogTitle>Create agent task</DialogTitle><DialogDescription className="text-white/42">Choose one agent for focused work or a sequence of sessions with durable handoffs.</DialogDescription></DialogHeader><form action={addTask} className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#090c13] p-1.5"><button type="button" onClick={() => setMode("single")} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm transition ${mode === "single" ? "bg-violet-500 text-white" : "text-white/45 hover:bg-white/5"}`}><UserRound className="size-4" />Single agent</button><button type="button" onClick={() => setMode("multi")} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm transition ${mode === "multi" ? "bg-violet-500 text-white" : "text-white/45 hover:bg-white/5"}`}><UsersRound className="size-4" />Agent workflow</button></div>
        {mode === "single" ? <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">{actors.map((item) => <button type="button" key={item.id} onClick={() => setActor(item.id)} className={`rounded-xl border p-3 text-left transition ${actor === item.id ? "border-violet-400/55 bg-violet-400/10" : "border-white/8 bg-white/[.025] hover:bg-white/5"}`}><div className={`grid size-8 place-items-center rounded-lg actor-${item.tone}`}><item.icon className="size-4" /></div><div className="mt-3 text-sm font-medium">{item.name}</div><div className="mt-1 text-[11px] leading-4 text-white/35">{item.detail}</div><div className="mt-2 flex flex-wrap gap-1">{item.runtimes.map((itemRuntime) => <span key={itemRuntime} className="rounded bg-white/6 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/35">{itemRuntime}</span>)}</div></button>)}</div> : <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-medium text-white/52">Session order</span><span className="text-[11px] text-white/28">Each stage receives the previous handoff</span></div>{teamSteps.map((step, index) => <div key={index} className="grid grid-cols-[28px_1fr_140px_34px] items-center gap-2 rounded-xl border border-white/8 bg-white/[.025] p-2"><div className="grid size-7 place-items-center rounded-lg bg-violet-400/10 text-xs text-violet-200">{index + 1}</div><input value={step.role} onChange={(event) => setTeamSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value } : item))} className="field h-9" aria-label={`Role for session ${index + 1}`} /><select value={step.actor} onChange={(event) => setTeamSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, actor: event.target.value as ActorId } : item))} className="field h-9" aria-label={`Actor for session ${index + 1}`}>{actors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" disabled={teamSteps.length <= 2} onClick={() => setTeamSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="grid size-8 place-items-center rounded-lg text-white/30 hover:bg-white/6 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-20" aria-label={`Remove session ${index + 1}`}><Trash2 className="size-4" /></button></div>)}{teamSteps.length < 4 && <button type="button" onClick={() => setTeamSteps((current) => [...current, { actor: "codex", role: `Agent ${current.length + 1}` }])} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 py-2.5 text-xs text-white/38 hover:border-violet-400/30 hover:text-violet-200"><Plus className="size-3.5" />Add session</button>}</div>}
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Repository"><Select value={repositoryId} onValueChange={(value) => { if (value) { setRepositoryId(value); setWorkspaceId("none"); } }}><SelectTrigger className="field h-10 w-full"><SelectValue placeholder="Select repository" /></SelectTrigger><SelectContent>{state.repositories.map((repo) => <SelectItem key={repo.id} value={repo.id}>{repo.fullName}</SelectItem>)}</SelectContent></Select></Field><Field label="Base branch"><input name="baseBranch" className="field" defaultValue={repoById.get(repositoryId)?.defaultBranch || "main"} required /></Field></div>
        <Field label="Development workspace (optional)"><Select value={workspaceId} onValueChange={setWorkspaceId}><SelectTrigger className="field h-10 w-full"><SelectValue placeholder="Use a new task checkout" /></SelectTrigger><SelectContent><SelectItem value="none">Create task checkout automatically</SelectItem>{availableWorkspaces.map((workspace) => <SelectItem key={workspace.id} value={workspace.id}>{workspace.repository} · {workspace.status} · {workspace.workingBranch || "branch pending"}</SelectItem>)}</SelectContent></Select></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Runtime"><Select value={runtime} onValueChange={(value) => value && setRuntime(value as "auto" | "herdr" | "direct")}><SelectTrigger className="field h-10 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Auto · best available per actor</SelectItem><SelectItem value="herdr">Require Herdr</SelectItem><SelectItem value="direct">Direct CLI</SelectItem></SelectContent></Select></Field>{mode === "single" ? <Field label="Model override (optional)"><input name="model" className="field" placeholder={actors.find((item) => item.id === actor)?.modelHint || "Use CLI default"} /></Field> : <div className="rounded-xl border border-violet-400/12 bg-violet-400/6 p-3 text-xs leading-5 text-violet-100/55">All sessions share one isolated branch and run in order. Auto mode can mix Herdr and direct adapters when a workflow needs it.</div>}</div>
        <Field label="Task title"><input name="title" className="field" placeholder="Fix session restore race" required /></Field><Field label="Instructions"><textarea name="prompt" className="field min-h-32 resize-y" placeholder="Describe the goal, constraints, and checks the agent should run…" required /></Field>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} className="text-white/55 hover:bg-white/8 hover:text-white">Cancel</Button><Button disabled={busy || !repositoryId || (mode === "multi" && teamSteps.some((step) => !step.role.trim()))} className="bg-violet-500 text-white hover:bg-violet-400">{busy && <Loader2 className="animate-spin" />}<Plus /> Queue {mode === "multi" ? "workflow" : "task"}</Button></DialogFooter>
      </form></DialogContent></Dialog>

      <Dialog open={workerOpen} onOpenChange={(open) => { setWorkerOpen(open); if (!open) setEnrollment(null); }}><DialogContent className="max-h-[92vh] overflow-y-auto border-white/10 bg-[#121622] text-white sm:max-w-2xl"><DialogHeader><DialogTitle>Register local worker</DialogTitle><DialogDescription className="text-white/42">Run one small Node process beside Herdr, your coding agents, and local GitHub credentials.</DialogDescription></DialogHeader>{!enrollment ? <form action={enrollWorker} className="space-y-5"><div className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl border border-violet-400/18 bg-violet-400/7 p-3"><Layers3 className="size-4 text-violet-300" /><div className="mt-2 text-sm">Herdr</div><div className="mt-1 text-[11px] text-white/35">Preferred runtime</div></div>{actors.map((item) => <div key={item.id} className="rounded-xl border border-white/8 bg-white/[.025] p-3"><item.icon className="size-4 text-violet-300" /><div className="mt-2 text-sm">{item.name}</div><div className="mt-1 text-[11px] text-white/35">Auto-detected</div></div>)}</div><Field label="Worker name"><input name="name" className="field" defaultValue="My Mac" required /></Field><div className="rounded-xl border border-amber-400/15 bg-amber-400/6 p-4 text-xs leading-5 text-amber-100/65">Authenticate GitHub with <code>gh auth login</code> and <code>gh auth setup-git</code>. Start Herdr once for persistent sessions, or let the worker use direct CLI fallback.</div><DialogFooter><Button disabled={busy} className="bg-violet-500 text-white hover:bg-violet-400">{busy && <Loader2 className="animate-spin" />} Generate worker token</Button></DialogFooter></form> : <WorkerInstructions enrollment={enrollment} />}</DialogContent></Dialog>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-h-[92vh] overflow-y-auto border-white/10 bg-[#10141f] text-white sm:max-w-3xl">{selected && <TaskDetail task={selected} repo={repoById.get(selected.repositoryId)} workspace={selected.workspaceId ? state.workspaces.find((workspace) => workspace.id === selected.workspaceId) : undefined} worker={selected.workerId ? workerById.get(selected.workerId) : undefined} events={eventsByTask.get(selected.id) || []} sessions={sessionsByTask.get(selected.id) || []} messages={messagesByTask.get(selected.id) || []} busy={busy} onAction={act} />}</DialogContent></Dialog>
    </main>
  );
}

function TaskCard({ task, sessions, repo, worker, onOpen }: { task: Task; sessions: AgentSession[]; repo?: Repository; worker?: Worker; onOpen: () => void }) {
  const primaryActor = actors.find((item) => item.id === task.actor)!;
  return <button onClick={onOpen} className="group w-full rounded-xl border border-white/8 bg-[#141824] p-3.5 text-left transition hover:-translate-y-0.5 hover:border-violet-400/30 hover:bg-[#171b29]"><div className="flex items-center justify-between"><span className={`status status-${task.status}`}>{statusLabels[task.status] || task.status}</span><span className="font-mono text-[10px] text-white/25">{task.id.slice(-6)}</span></div><h3 className="mt-3 text-sm font-medium leading-5 text-white/90">{task.title}</h3><p className="mt-1.5 truncate text-xs text-white/34">{repo?.fullName || "Unknown repository"}</p><div className="mt-3 flex items-center justify-between border-t border-white/6 pt-3 text-[11px]"><span className="flex items-center gap-1.5 text-white/55">{task.mode === "multi" ? <UsersRound className="size-3.5" /> : <primaryActor.icon className="size-3.5" />}{task.mode === "multi" ? `${sessions.length}-agent workflow` : primaryActor.name}</span><span className="text-white/28">{relative(task.updatedAt)}</span></div>{sessions.length > 1 && <div className="mt-2 flex items-center gap-1">{sessions.map((session, index) => <span key={session.id} className="flex items-center gap-1 text-[10px] text-white/32"><span className={`size-1.5 rounded-full ${session.status === "done" ? "bg-emerald-300" : session.status === "blocked" ? "bg-amber-300" : ["starting", "working"].includes(session.status) ? "bg-cyan-300" : "bg-white/20"}`} />{session.role}{index < sessions.length - 1 && <ArrowRight className="size-2.5 text-white/15" />}</span>)}</div>}{worker && <div className="mt-2 flex items-center gap-1.5 text-[11px] text-white/30"><Cpu className="size-3" />{worker.name}</div>}</button>;
}

function TaskDetail({ task, repo, workspace, worker, events, sessions, messages, busy, onAction }: { task: Task; repo?: Repository; workspace?: Workspace; worker?: Worker; events: TaskEvent[]; sessions: AgentSession[]; messages: SessionMessage[]; busy: boolean; onAction: (task: Task, action: "approve" | "retry" | "cancel" | "respond", reply?: string) => void }) {
  const [reply, setReply] = useState("");
  const compareUrl = [...events].reverse().find((event) => event.payload?.compareUrl)?.payload?.compareUrl;
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  return <><DialogHeader><div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-white/35"><span>{task.id}</span><span>·</span><span>{statusLabels[task.status] || task.status}</span><span>·</span><span>{task.mode === "multi" ? `${sessions.length} sessions` : "single session"}</span><span>·</span><span>attempt {task.attempt}</span></div><DialogTitle className="text-xl">{task.title}</DialogTitle><DialogDescription className="whitespace-pre-wrap pt-1 leading-6 text-white/45">{task.prompt}</DialogDescription></DialogHeader>
    <div className={`grid gap-3 ${workspace ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}><Meta icon={GitFork} label="Repository" value={repo?.fullName || "Unknown"} /><Meta icon={Layers3} label="Runtime" value={task.runtime === "auto" ? "Auto · Herdr preferred" : task.runtime} /><Meta icon={GitBranch} label="Branch" value={task.workBranch || task.baseBranch} />{workspace && <Meta icon={FolderOpen} label="Workspace" value={workspace.status} />}</div>
    <section className="rounded-xl border border-white/8 bg-white/[.025] p-4"><h3 className="flex items-center gap-2 text-sm font-medium"><UsersRound className="size-4 text-violet-300" />Session pipeline</h3><div className="mt-4 space-y-2">{sessions.map((session, index) => { const actorInfo = actors.find((item) => item.id === session.actor) || actors[0]; return <div key={session.id} className={`rounded-xl border p-3 ${task.activeSessionId === session.id ? "border-cyan-400/25 bg-cyan-400/6" : "border-white/7 bg-[#0b0e16]"}`}><div className="flex items-center gap-3"><div className={`grid size-8 shrink-0 place-items-center rounded-lg actor-${actorInfo.tone}`}><actorInfo.icon className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{index + 1}. {session.role}</span><span className="text-xs capitalize text-white/35">{actorInfo.name}</span></div><div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/28"><span className={`status status-${session.status}`}>{session.status}</span>{session.runtime && <span>{session.runtime}</span>}{session.runtimeName && <span className="font-mono">{session.runtimeName}</span>}</div></div>{index < sessions.length - 1 && <ArrowRight className="size-4 shrink-0 text-white/18" />}</div>{session.status === "blocked" && session.summary && <pre className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-amber-400/5 p-3 font-mono text-[11px] leading-5 text-amber-100/55">{session.summary}</pre>}</div>; })}</div></section>
    {messages.length > 0 && <section className="rounded-xl border border-white/8 bg-[#090c13] p-4"><h3 className="flex items-center gap-2 text-sm font-medium"><MessageSquareText className="size-4 text-violet-300" />Cross-session messages</h3><div className="mt-4 space-y-3">{messages.map((message) => <div key={message.id} className="rounded-lg border border-white/6 bg-white/[.025] p-3"><div className="flex flex-wrap items-center gap-2 text-[11px] text-white/32"><span>{message.fromSessionId ? sessionById.get(message.fromSessionId)?.role || "Agent" : "Operator"}</span><ArrowRight className="size-3" /><span>{message.toSessionId ? sessionById.get(message.toSessionId)?.role || "Agent" : "Workflow"}</span><span>·</span><span>{message.status}</span>{message.gitRef && <span className="font-mono text-violet-300/65">{message.gitRef}</span>}</div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-white/50">{message.body}</p>{message.artifacts.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{message.artifacts.map((artifact) => <span key={artifact} className="rounded-md bg-white/5 px-2 py-1 font-mono text-[10px] text-cyan-100/45">{artifact}</span>)}</div>}</div>)}</div></section>}
    {task.status === "blocked" && <form onSubmit={(event) => { event.preventDefault(); if (reply.trim()) { onAction(task, "respond", reply.trim()); setReply(""); } }} className="rounded-xl border border-amber-400/18 bg-amber-400/6 p-4"><h3 className="text-sm font-medium text-amber-100">Agent needs input</h3><p className="mt-1 text-xs leading-5 text-amber-100/50">Your response is stored as a durable message and delivered to the same Herdr session.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><textarea value={reply} onChange={(event) => setReply(event.target.value)} className="field min-h-20 flex-1 resize-y" placeholder="Answer the question or approve the requested action…" required /><Button disabled={busy || !reply.trim()} className="self-end bg-amber-400 text-[#171006] hover:bg-amber-300"><MessageSquareText />Send response</Button></div></form>}
    {task.summary && <section className="rounded-xl border border-white/8 bg-white/[.025] p-4"><h3 className="text-sm font-medium">Workflow summary</h3><pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-white/55">{task.summary}</pre></section>}{task.diffStat && <section className="rounded-xl border border-white/8 bg-[#090c13] p-4"><h3 className="flex items-center gap-2 text-sm font-medium"><GitBranch className="size-4 text-violet-300" />Changed files</h3><pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-cyan-100/60">{task.diffStat}</pre>{compareUrl && <a href={compareUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-violet-300">Inspect branch on GitHub <ExternalLink className="size-3.5" /></a>}</section>}{task.error && <section className="rounded-xl border border-rose-400/15 bg-rose-400/6 p-4 text-sm leading-6 text-rose-100/70">{task.error}</section>}
    <section className="rounded-xl border border-white/8 bg-[#090c13] p-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-medium"><TerminalSquare className="size-4 text-cyan-300" />Execution log {worker && <span className="font-normal text-white/30">· {worker.name}</span>}</h3><div className="max-h-64 space-y-3 overflow-y-auto font-mono text-xs">{events.length ? events.map((event) => <div key={event.id} className="flex gap-3"><span className="shrink-0 text-white/18">{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span className="whitespace-pre-wrap text-white/48">{event.message}</span></div>) : <span className="text-white/30">Waiting for first event…</span>}</div></section>
    <DialogFooter>{["queued", "failed"].includes(task.status) && <Button variant="ghost" disabled={busy} onClick={() => onAction(task, task.status === "failed" ? "retry" : "cancel")} className="text-white/50 hover:bg-white/8 hover:text-white">{task.status === "failed" ? <><RefreshCw /> Retry</> : "Cancel task"}</Button>}{task.status === "review" && <><Button variant="outline" disabled={busy} onClick={() => onAction(task, "retry")} className="border-white/10 bg-transparent text-white hover:bg-white/8"><RefreshCw /> Request changes</Button><Button disabled={busy} onClick={() => onAction(task, "approve")} className="bg-violet-500 text-white hover:bg-violet-400"><Check /> Approve & create PR</Button></>}{task.prUrl && <Button asChild className="bg-emerald-500 text-white hover:bg-emerald-400"><a href={task.prUrl} target="_blank" rel="noreferrer"><GitFork /> Open pull request</a></Button>}</DialogFooter></>;
}
function WorkerInstructions({ enrollment }: { enrollment: { token: string; name: string } }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const command = `curl -fsSLo agentmux-worker.mjs ${origin}/agentmux-worker.mjs && AGENTMUX_URL=${origin} AGENTMUX_TOKEN=${enrollment.token} node agentmux-worker.mjs`;
  return <div className="space-y-5"><div className="rounded-xl border border-emerald-400/15 bg-emerald-400/6 p-4"><div className="flex items-center gap-2 text-sm font-medium text-emerald-200"><Check className="size-4" />{enrollment.name} registered</div><p className="mt-2 text-xs leading-5 text-emerald-100/50">This token is shown once. Start the worker now or store it in your local password manager.</p></div><div><div className="mb-2 text-xs font-medium text-white/50">Run in Terminal</div><div className="relative rounded-xl border border-white/8 bg-[#080a11] p-4 pr-12"><code className="break-all text-xs leading-6 text-cyan-100/70">{command}</code><button onClick={async () => { await navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg bg-white/6 text-white/45 hover:text-white" aria-label="Copy command">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</button></div></div><div className="grid gap-3 sm:grid-cols-3"><Step number="1" text="Install Herdr and run herdr once" /><Step number="2" text="Sign into agents and GitHub CLI" /><Step number="3" text="Paste the worker command" /></div><div className="flex flex-wrap gap-4"><a href="https://herdr.dev/docs/install/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-violet-300 hover:text-violet-200"><ExternalLink className="size-4" />Install Herdr</a><a href="/agentmux-worker.mjs" download className="inline-flex items-center gap-2 text-sm text-violet-300 hover:text-violet-200"><Download className="size-4" />Download worker file</a></div></div>;
}
function Stat({ icon: Icon, label, value, tone }: { icon: typeof Bot; label: string; value: string; tone: string }) { return <div className="rounded-2xl border border-white/8 bg-[#0d101a] p-4"><div className={`grid size-9 place-items-center rounded-xl stat-${tone}`}><Icon className="size-4" /></div><div className="mt-4 text-2xl font-semibold tracking-tight">{value}</div><div className="mt-1 text-xs text-white/45">{label}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm"><span className="mb-2 block text-xs font-medium text-white/52">{label}</span>{children}</label>; }
function Meta({ icon: Icon, label, value }: { icon: typeof Bot; label: string; value: string }) { return <div className="rounded-xl bg-white/[.035] p-3"><div className="flex items-center gap-1.5 text-[11px] text-white/30"><Icon className="size-3.5" />{label}</div><div className="mt-1.5 truncate text-sm capitalize text-white/75">{value}</div></div>; }
function Control({ label }: { label: string }) { return <div className="flex items-center gap-2"><div className="grid size-5 place-items-center rounded-full bg-emerald-400/10"><Check className="size-3 text-emerald-300" /></div><span className="text-white/65">{label}</span></div>; }
function Step({ number, text }: { number: string; text: string }) { return <div className="rounded-xl bg-white/[.035] p-3"><div className="text-xs font-medium text-violet-300">{number}</div><div className="mt-1.5 text-xs leading-5 text-white/45">{text}</div></div>; }
function Empty({ icon: Icon, title, text, action, onAction }: { icon: typeof Bot; title: string; text: string; action: string; onAction: () => void }) { return <section className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[.018] p-8 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-violet-400/10 text-violet-300"><Icon className="size-5" /></div><h2 className="mt-4 font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/40">{text}</p><Button onClick={onAction} className="mt-5 bg-violet-500 text-white hover:bg-violet-400">{action}<ChevronRight /></Button></div></section>; }
function Loading() { return <div className="grid min-h-72 place-items-center"><Loader2 className="size-6 animate-spin text-violet-300" /></div>; }

function ProductSidebar({ activeSection, onSectionChange, onlineWorkers, workerCount, workspaceCount, attentionCount, user, onWorkerSetup }: { activeSection: ConsoleSection; onSectionChange: (section: ConsoleSection) => void; onlineWorkers: number; workerCount: number; workspaceCount: number; attentionCount: number; user: AuthUser; onWorkerSetup: () => void }) {
  const userInitials = (user.name || user.login).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <aside className="hidden w-64 shrink-0 flex-col border-r border-white/8 bg-[#0b0e17] lg:flex">
    <div className="flex h-16 items-center gap-3 border-b border-white/8 px-5"><div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-[0_0_30px_rgba(139,92,246,.35)]"><Sparkles className="size-5" /></div><div><div className="text-[15px] font-semibold tracking-tight">TeamWeave</div><div className="text-[11px] text-white/35">Agent delivery workspace</div></div></div>
    <div className="px-4 pt-6"><div className="px-2 text-[10px] font-semibold uppercase tracking-[.18em] text-white/25">Workspace</div><button className="mt-2 flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[.035] px-3 py-3 text-left hover:bg-white/[.06]"><div className="grid size-8 place-items-center rounded-lg bg-violet-400/12 text-xs font-semibold text-violet-200">{userInitials}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">Personal workspace</div><div className="mt-0.5 truncate text-[11px] text-white/32">{user.name || user.login}</div></div><ChevronRight className="size-4 text-white/25" /></button></div>
    <nav className="mt-7 px-3" aria-label="Primary navigation"><div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-white/25">Manage</div>{navItems.map((item) => { const Icon = item.icon; const count = item.id === "repositories" ? undefined : item.id === "workspaces" ? workspaceCount : item.id === "workers" ? workerCount : item.id === "board" ? attentionCount : undefined; return <button key={item.id} onClick={() => onSectionChange(item.id)} aria-current={activeSection === item.id ? "page" : undefined} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${activeSection === item.id ? "bg-violet-400/12 font-medium text-violet-100 shadow-[inset_2px_0_0_#a78bfa]" : "text-white/48 hover:bg-white/5 hover:text-white/80"}`}><Icon className="size-4" /><span className="flex-1 text-left">{item.label}</span>{count ? <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${item.id === "board" && attentionCount > 0 ? "bg-amber-300/12 text-amber-200" : "bg-white/8 text-white/38"}`}>{count}</span> : null}</button>; })}</nav>
    <div className="mt-auto space-y-3 p-3"><div className="rounded-2xl border border-white/8 bg-white/[.025] p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-medium"><span className={`size-2 rounded-full ${onlineWorkers ? "bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.6)]" : "bg-white/25"}`} />Worker fleet</div><span className="font-mono text-[11px] text-white/35">{onlineWorkers}/{workerCount}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-emerald-300/70 transition-all" style={{ width: workerCount ? `${Math.min(100, onlineWorkers / workerCount * 100)}%` : "0%" }} /></div><p className="mt-3 text-[11px] leading-5 text-white/32">{onlineWorkers ? "Ready to run agent work." : "Connect a local worker to start."}</p><button onClick={onWorkerSetup} className="mt-3 text-xs font-medium text-violet-300 hover:text-violet-200">Configure workers <span aria-hidden="true">→</span></button></div><a href="/api/auth/signout?return_to=/" className="flex items-center justify-between rounded-xl px-3 py-2 text-xs text-white/35 hover:bg-white/5 hover:text-white/65"><span>{user.email || "Signed in"}</span><span>Sign out</span></a></div>
  </aside>;
}

function NextActionPanel({ repositoryCount, workerCount, workspaceCount, pullRequestCount, attentionCount, activeTaskCount, onConnectRepository, onSetupWorker, onOpenReview, onNewTask, onViewActivity }: { repositoryCount: number; workerCount: number; workspaceCount: number; pullRequestCount: number; attentionCount: number; activeTaskCount: number; onConnectRepository: () => void; onSetupWorker: () => void; onOpenReview: () => void; onNewTask: () => void; onViewActivity: () => void }) {
  const repoReady = repositoryCount > 0;
  const workerReady = workerCount > 0;
  const [title, text, actionLabel, action] = !repoReady
    ? ["Connect your first repository", "Bring a GitHub project into a persistent development workspace.", "Connect repository", onConnectRepository]
    : !workerReady
      ? ["Register a local worker", "Your worker is the secure bridge to Herdr, agent CLIs, and local Git credentials.", "Set up worker", onSetupWorker]
      : attentionCount > 0
        ? [`Review ${attentionCount} decision${attentionCount === 1 ? "" : "s"}`, "A task is waiting for your input before the workflow can continue.", "Open review", onOpenReview]
        : activeTaskCount > 0
          ? ["Your team is shipping", `${activeTaskCount} active task${activeTaskCount === 1 ? " is" : "s are"} moving through the delivery pipeline.`, "View activity", onViewActivity]
          : ["Create your first task", "Start with one agent or compose a durable multi-agent workflow.", "New task", onNewTask];
  return <section className="grid gap-4 xl:grid-cols-[1.45fr_.85fr]">
    <div className="relative overflow-hidden rounded-2xl border border-violet-400/18 bg-gradient-to-br from-violet-500/[.17] via-[#141329] to-[#0d101a] p-5 sm:p-6"><div className="absolute -right-16 -top-20 size-52 rounded-full bg-violet-500/15 blur-3xl" /><div className="relative"><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] text-violet-200"><Sparkles className="size-3.5" />Team delivery, in one place</div><h2 className="mt-4 max-w-xl text-xl font-semibold tracking-[-.02em] sm:text-2xl">From repository to reviewed pull request.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-white/50">A durable workspace gives every agent the same checkout, terminal, handoffs, and review boundary.</p><div className="mt-6 flex flex-wrap items-center gap-2 text-xs"><JourneyStep label="Repository" ready={repoReady} /><ChevronRight className="size-3.5 text-white/20" /><JourneyStep label="Worker" ready={workerReady} /><ChevronRight className="size-3.5 text-white/20" /><JourneyStep label="Workspace" ready={workspaceCount > 0} /><ChevronRight className="size-3.5 text-white/20" /><JourneyStep label="PR review" ready={pullRequestCount > 0} /></div></div></div>
    <div className="flex flex-col justify-between rounded-2xl border border-white/8 bg-[#0d101a] p-5"><div><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] text-white/35"><Activity className="size-3.5" />Next action</div><span className="rounded-full bg-white/6 px-2 py-1 text-[10px] text-white/35">Now</span></div><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-white/42">{text}</p></div>{action && <Button onClick={action} className="mt-5 w-full justify-center bg-violet-500 text-white hover:bg-violet-400">{actionLabel}<ChevronRight /></Button>}</div>
  </section>;
}

function JourneyStep({ label, ready }: { label: string; ready: boolean }) { return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 ${ready ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : "border-white/8 bg-white/[.035] text-white/35"}`}><span className={`grid size-3.5 place-items-center rounded-full text-[9px] ${ready ? "bg-emerald-300 text-[#0c1713]" : "bg-white/10 text-white/35"}`}>{ready ? "✓" : "·"}</span>{label}</span>; }

type WorkspaceSurface = "files" | "git" | "preview" | "terminal" | "runs";

function WorkspaceShell({ workspace, repository, worker, repositories, workspaces, tasks, sessions, events, workspaceEvents, busy, onBack, onSwitch, onNewTask, onOpenTask, onWorkspaceAction }: {
  workspace: Workspace;
  repository?: Repository;
  worker?: Worker;
  repositories: Repository[];
  workspaces: Workspace[];
  tasks: Task[];
  sessions: AgentSession[];
  events: TaskEvent[];
  workspaceEvents: WorkspaceEvent[];
  busy: boolean;
  onBack: () => void;
  onSwitch: (workspace: Workspace) => void;
  onNewTask: () => void;
  onOpenTask: (task: Task) => void;
  onWorkspaceAction: (workspace: Workspace, action: "stop" | "reopen" | "delete") => Promise<void>;
}) {
  const [surface, setSurface] = useState<WorkspaceSurface>(workspace.status === "ready" ? "terminal" : "files");
  const taskIds = new Set(tasks.map((task) => task.id));
  const workspaceSessions = sessions.filter((session) => session.workspaceId === workspace.id || taskIds.has(session.taskId));
  const workspaceTaskEvents = events.filter((event) => taskIds.has(event.taskId));
  const activeTasks = tasks.filter((task) => ["queued", "claimed", "running", "blocked", "resume_requested", "resuming", "review", "publish_requested", "publishing"].includes(task.status));
  const reviewTasks = tasks.filter((task) => ["blocked", "review", "failed"].includes(task.status));
  const connectedWorkspaceCount = workspaces.filter((item) => ["queued", "claiming", "preparing", "ready"].includes(item.status)).length;

  return <section className="workspace-shell overflow-hidden rounded-2xl border border-white/10 bg-[#090c14] shadow-[0_24px_80px_rgba(0,0,0,.3)]">
    <div className="flex flex-col gap-4 border-b border-white/8 bg-[#0d111c] px-4 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 text-white/55 hover:bg-white/8 hover:text-white" aria-label="Back to workspaces"><ArrowLeft /></Button><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-400/12 text-violet-200"><FolderOpen className="size-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate font-semibold">{repository?.fullName || workspace.repository || "Repository workspace"}</span><span className={`status status-${workspace.status}`}>{workspace.status}</span></div><div className="mt-1 flex min-w-0 items-center gap-2 font-mono text-[11px] text-white/34"><GitBranch className="size-3 shrink-0" /><span className="truncate">{workspace.workingBranch || workspace.baseBranch}</span></div></div></div>
      <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs text-white/35">{worker ? `${worker.name} · ${worker.platform}` : "Waiting for worker"}</span>{workspace.status === "ready" && <Button onClick={onNewTask} className="bg-violet-500 text-white hover:bg-violet-400"><Plus />Start agent task</Button>}{["queued", "claiming", "preparing", "ready"].includes(workspace.status) && <Button variant="outline" disabled={busy} onClick={() => void onWorkspaceAction(workspace, "stop")} className="border-white/10 bg-transparent text-white/65 hover:bg-white/8 hover:text-white">Stop</Button>}</div>
    </div>

    <div className="grid lg:min-h-[690px] lg:grid-cols-[210px_minmax(280px,.78fr)_minmax(420px,1.35fr)]">
      <aside className="border-b border-white/8 bg-[#0b0e17] p-3 lg:border-b-0 lg:border-r">
        <div className="px-2 py-2 text-[10px] font-semibold uppercase tracking-[.18em] text-white/25">Workspaces</div>
        <div className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:overflow-visible">
          {workspaces.map((item) => <button key={item.id} onClick={() => onSwitch(item)} className={`min-w-48 rounded-xl px-3 py-3 text-left transition lg:min-w-0 lg:w-full ${item.id === workspace.id ? "bg-violet-400/12 text-white" : "text-white/45 hover:bg-white/5 hover:text-white/75"}`}><div className="flex items-center gap-2 text-xs font-medium"><span className={`size-1.5 rounded-full ${item.status === "ready" ? "bg-emerald-300" : item.status === "failed" ? "bg-rose-300" : "bg-amber-300"}`} /><span className="truncate">{item.repository || repositories.find((repo) => repo.id === item.repositoryId)?.fullName || "Workspace"}</span></div><div className="mt-1.5 truncate pl-3.5 font-mono text-[10px] text-white/25">{item.workingBranch || item.status}</div></button>)}
        </div>
        <div className="mt-4 hidden border-t border-white/6 px-2 pt-4 text-[11px] leading-5 text-white/28 lg:block"><div>{connectedWorkspaceCount} workspace{connectedWorkspaceCount === 1 ? "" : "s"} active</div><div className="mt-2">Source and credentials stay on local workers.</div></div>
      </aside>

      <section className="border-b border-white/8 bg-[#0d1019] lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3"><div><h2 className="text-sm font-semibold">Collaboration</h2><p className="mt-0.5 text-[11px] text-white/32">Tasks and durable agent handoffs</p></div><Button variant="ghost" size="icon" onClick={onNewTask} disabled={workspace.status !== "ready"} className="text-violet-200 hover:bg-violet-400/10" aria-label="New workspace task"><Plus /></Button></div>
        <div className="max-h-[570px] space-y-3 overflow-y-auto p-3 lg:max-h-[628px]">
          {reviewTasks.length > 0 && <div className="rounded-xl border border-amber-400/15 bg-amber-400/7 p-3"><div className="flex items-center gap-2 text-xs font-medium text-amber-200"><UserRoundCheck className="size-4" />{reviewTasks.length} decision{reviewTasks.length === 1 ? "" : "s"} waiting</div><p className="mt-1.5 text-[11px] leading-5 text-amber-100/45">Open a task to reply, retry, or approve its pull request.</p></div>}
          {tasks.length ? tasks.map((task) => {
            const taskSessions = workspaceSessions.filter((session) => session.taskId === task.id);
            const latestEvent = workspaceTaskEvents.find((event) => event.taskId === task.id);
            return <button key={task.id} onClick={() => onOpenTask(task)} className="group w-full rounded-xl border border-white/8 bg-[#111522] p-3.5 text-left transition hover:border-violet-400/25 hover:bg-[#151a29]"><div className="flex items-center justify-between gap-3"><span className={`status status-${task.status}`}>{statusLabels[task.status] || task.status}</span><span className="text-[10px] text-white/22">{relative(task.updatedAt)}</span></div><h3 className="mt-3 text-sm font-medium leading-5 text-white/88">{task.title}</h3><p className="mt-2 line-clamp-2 text-[11px] leading-5 text-white/34">{task.summary || latestEvent?.message || task.prompt}</p><div className="mt-3 flex items-center justify-between border-t border-white/6 pt-3 text-[10px] text-white/32"><span className="flex items-center gap-1.5"><Bot className="size-3" />{task.mode === "multi" ? `${taskSessions.length}-agent workflow` : actors.find((item) => item.id === task.actor)?.name || task.actor}</span>{task.diffStat && <span className="font-mono text-emerald-200/55">{task.diffStat}</span>}</div></button>;
          }) : <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-white/8 p-6 text-center"><div><MessageSquareText className="mx-auto size-6 text-white/22" /><h3 className="mt-3 text-sm font-medium">No work assigned yet</h3><p className="mt-2 text-xs leading-5 text-white/32">Start an agent task in this checkout. Its events, handoffs, review, and approval stay here.</p><Button onClick={onNewTask} disabled={workspace.status !== "ready"} className="mt-4 bg-violet-500 text-white hover:bg-violet-400"><Plus />New task</Button></div></div>}
        </div>
        <div className="flex items-center justify-between border-t border-white/8 px-4 py-3 text-[11px] text-white/30"><span>{activeTasks.length} active</span><span>{workspaceSessions.length} agent run{workspaceSessions.length === 1 ? "" : "s"}</span></div>
      </section>

      <section className="min-w-0 bg-[#090c14]">
        <Tabs value={surface} onValueChange={(value) => setSurface(value as WorkspaceSurface)} className="h-full gap-0">
          <div className="border-b border-white/8 bg-[#0c1019] px-2"><TabsList variant="line" className="scrollbar-none h-12 max-w-full justify-start overflow-x-auto"><TabsTrigger value="files" className="px-3 text-xs text-white/42 data-[state=active]:text-white"><FileText />Files</TabsTrigger><TabsTrigger value="git" className="px-3 text-xs text-white/42 data-[state=active]:text-white"><GitBranch />Git</TabsTrigger><TabsTrigger value="preview" className="px-3 text-xs text-white/42 data-[state=active]:text-white"><Monitor />Preview</TabsTrigger><TabsTrigger value="terminal" className="px-3 text-xs text-white/42 data-[state=active]:text-white"><TerminalSquare />Terminal</TabsTrigger><TabsTrigger value="runs" className="px-3 text-xs text-white/42 data-[state=active]:text-white"><Activity />Agent Runs</TabsTrigger></TabsList></div>

          <TabsContent value="files" className="p-4 md:p-5"><SurfaceHeader icon={FileText} title="Files" description="Workspace checkout on your local worker" /><div className="mt-5 overflow-hidden rounded-xl border border-white/8"><div className="flex items-center gap-2 border-b border-white/7 bg-white/[.025] px-4 py-3 font-mono text-[11px] text-white/35"><FolderOpen className="size-3.5" />{workspace.localPath || "Checkout path pending"}</div><div className="grid min-h-80 place-items-center p-8 text-center"><div><FolderOpen className="mx-auto size-8 text-cyan-200/35" /><h3 className="mt-4 text-sm font-medium">Worker file index not available yet</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-white/35">The shell is bound to the real checkout. File browsing will appear here when the worker exposes its safe file index.</p></div></div></div></TabsContent>

          <TabsContent value="git" className="p-4 md:p-5"><SurfaceHeader icon={GitBranch} title="Git" description="Branch, changes, and review boundary" /><div className="mt-5 grid gap-3 sm:grid-cols-2"><Meta icon={GitBranch} label="Base branch" value={workspace.baseBranch} /><Meta icon={GitBranch} label="Working branch" value={workspace.workingBranch || "Pending worker"} /></div><div className="mt-4 rounded-xl border border-white/8 bg-white/[.025] p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-medium">Human approval gate</div><p className="mt-1 text-xs leading-5 text-white/35">Agent changes remain on the workspace branch until a task reaches review and you approve PR creation.</p></div><ShieldCheck className="size-7 shrink-0 text-emerald-300/65" /></div></div><div className="mt-4 space-y-2">{tasks.filter((task) => task.diffStat || task.prUrl).map((task) => <button key={task.id} onClick={() => onOpenTask(task)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/8 px-4 py-3 text-left hover:bg-white/[.025]"><div className="min-w-0"><div className="truncate text-sm text-white/72">{task.title}</div><div className="mt-1 font-mono text-[10px] text-white/28">{task.workBranch || task.baseBranch}</div></div><span className="shrink-0 text-xs text-emerald-200/60">{task.diffStat || "Pull request"}</span></button>)}</div>{repository && <a href={repository.url || `https://github.com/${repository.fullName}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs text-violet-300 hover:text-violet-200">Open repository on GitHub <ExternalLink className="size-3.5" /></a>}</TabsContent>

          <TabsContent value="preview" className="p-4 md:p-5"><SurfaceHeader icon={Monitor} title="Preview" description="Local development server on this workspace" /><div className="mt-5 grid gap-4 xl:grid-cols-[180px_1fr]"><div className="rounded-xl border border-white/8 bg-white/[.025] p-3"><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/25">Processes & ports</div><div className="mt-4 rounded-lg border border-dashed border-white/8 p-4 text-center"><span className="mx-auto block size-2 rounded-full bg-white/20" /><div className="mt-2 text-xs text-white/45">No ports reported</div><div className="mt-1 text-[10px] leading-4 text-white/25">Start a dev server in Terminal.</div></div></div><div className="grid min-h-96 place-items-center rounded-xl border border-white/8 bg-[#06080d] p-8 text-center"><div><Monitor className="mx-auto size-9 text-white/18" /><h3 className="mt-4 text-sm font-medium">Preview is waiting for a detected port</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-white/32">Run your app locally. A private preview target will appear here when process and port discovery is connected.</p><Button variant="outline" onClick={() => setSurface("terminal")} className="mt-4 border-white/10 bg-transparent text-white hover:bg-white/8"><TerminalSquare />Open Terminal</Button></div></div></div></TabsContent>

          <TabsContent value="terminal" className="p-4 md:p-5"><SurfaceHeader icon={TerminalSquare} title="Workspace terminal" description="Human shell in the same checkout used by agents" />{workspace.status === "ready" ? <WorkspaceTerminal workspace={workspace} /> : <div className="mt-5 grid min-h-80 place-items-center rounded-xl border border-dashed border-white/8 p-8 text-center"><div><Loader2 className={`mx-auto size-6 text-amber-200/60 ${["queued", "claiming", "preparing"].includes(workspace.status) ? "animate-spin" : ""}`} /><h3 className="mt-3 text-sm font-medium">Terminal unavailable while workspace is {workspace.status}</h3><p className="mt-2 text-xs text-white/32">A local worker must finish preparing this checkout first.</p></div></div>}</TabsContent>

          <TabsContent value="runs" className="p-4 md:p-5"><SurfaceHeader icon={Activity} title="Agent Runs" description="Sessions attached to this workspace" /><div className="mt-5 space-y-3">{workspaceSessions.length ? workspaceSessions.map((session) => { const actorInfo = actors.find((item) => item.id === session.actor); const ActorIcon = actorInfo?.icon || Bot; return <article key={session.id} className="rounded-xl border border-white/8 bg-white/[.025] p-4"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className={`grid size-9 place-items-center rounded-lg agent-${actorInfo?.tone || "violet"}`}><ActorIcon className="size-4" /></div><div><div className="text-sm font-medium">{actorInfo?.name || session.actor} · {session.role}</div><div className="mt-1 text-[10px] text-white/28">{session.runtimeName || session.runtime || "Runtime pending"}</div></div></div><span className={`status status-${session.status}`}>{session.status}</span></div>{session.summary && <p className="mt-3 border-t border-white/6 pt-3 text-xs leading-5 text-white/42">{session.summary}</p>}</article>; }) : <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-white/8 p-8 text-center"><div><Bot className="mx-auto size-7 text-white/20" /><h3 className="mt-3 text-sm font-medium">No agent runs yet</h3><p className="mt-2 text-xs text-white/32">Start a task from Collaboration to attach a session to this workspace.</p></div></div>}</div>{workspaceEvents.length > 0 && <div className="mt-5 border-t border-white/8 pt-4"><div className="mb-3 text-[10px] font-semibold uppercase tracking-[.16em] text-white/25">Workspace lifecycle</div>{workspaceEvents.slice(0, 8).map((event) => <div key={event.id} className="flex gap-3 py-2 text-xs"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cyan-300/60" /><div><div className="text-white/48">{event.message}</div><div className="mt-1 text-[10px] text-white/22">{relative(event.createdAt)}</div></div></div>)}</div>}</TabsContent>
        </Tabs>
      </section>
    </div>
  </section>;
}

function SurfaceHeader({ icon: Icon, title, description }: { icon: typeof Bot; title: string; description: string }) {
  return <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-cyan-400/9 text-cyan-200"><Icon className="size-4" /></div><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-0.5 text-[11px] text-white/32">{description}</p></div></div>;
}

function WorkspaceTerminal({ workspace }: { workspace: Workspace }) {
  const [terminal, setTerminal] = useState<TerminalSession | null>(null);
  const [events, setEvents] = useState<TerminalEvent[]>([]);
  const [line, setLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cursorRef = useRef(0);
  const terminalId = terminal?.id;

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const result = await requestJson<{ terminal: TerminalSession; commandId: string }>(`/api/workspaces/${workspace.id}/terminal`, {
          method: "POST",
          body: JSON.stringify({ action: "start", cols: 120, rows: 32 }),
        });
        if (!cancelled) {
          cursorRef.current = 0;
          setEvents([]);
          setTerminal(result.terminal);
          setError(null);
        }
      } catch (bootError) {
        if (!cancelled) setError(bootError instanceof Error ? bootError.message : "Could not start terminal");
      }
    }
    void boot();
    return () => { cancelled = true; };
  }, [workspace.id]);

  useEffect(() => {
    const activeTerminalId = terminalId;
    if (!activeTerminalId) return;
    let cancelled = false;
    async function poll() {
      try {
        const result = await requestJson<{ terminal: TerminalSession; events: TerminalEvent[]; nextAfter: number }>(
          `/api/workspaces/${workspace.id}/terminal?terminalId=${encodeURIComponent(String(activeTerminalId))}&after=${cursorRef.current}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        setTerminal(result.terminal);
        if (result.events.length) setEvents((current) => [...current, ...result.events].slice(-800));
        cursorRef.current = Math.max(cursorRef.current, result.nextAfter);
        setError(result.terminal.error);
      } catch (pollError) {
        if (!cancelled) setError(pollError instanceof Error ? pollError.message : "Terminal connection lost");
      }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 900);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [terminalId, workspace.id]);

  async function sendInput(data: string) {
    if (!terminal || ["stopped", "exited", "failed", "stopping"].includes(terminal.status)) return;
    setBusy(true);
    try {
      await requestJson(`/api/workspaces/${workspace.id}/terminal`, { method: "POST", body: JSON.stringify({ action: "input", terminalId: terminal.id, data }) });
      setLine("");
      setError(null);
    } catch (inputError) {
      setError(inputError instanceof Error ? inputError.message : "Could not send terminal input");
    } finally { setBusy(false); }
  }

  async function stopTerminal() {
    if (!terminal || terminal.status === "stopped") return;
    setBusy(true);
    try {
      const result = await requestJson<{ terminal: TerminalSession }>(`/api/workspaces/${workspace.id}/terminal`, { method: "POST", body: JSON.stringify({ action: "stop", terminalId: terminal.id }) });
      setTerminal(result.terminal);
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "Could not stop terminal");
    } finally { setBusy(false); }
  }

  const terminalState = terminal?.status || "connecting";
  return <div className="mt-5 space-y-3"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-[#090c13] px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className={`size-2 rounded-full ${terminalState === "running" ? "bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,.7)]" : terminalState === "failed" ? "bg-rose-300" : "bg-amber-300"}`} /><div className="min-w-0"><div className="flex items-center gap-2 text-sm font-medium"><span>{terminal?.shell || "shell"}</span><span className={`status status-${terminalState}`}>{terminalState}</span></div><div className="mt-1 truncate font-mono text-[11px] text-white/32">{workspace.localPath || terminal?.cwd || "Waiting for workspace path"} · {workspace.workingBranch || "branch"}</div></div></div><Button variant="outline" disabled={busy || !terminal || ["stopped", "exited"].includes(terminal.status)} onClick={() => void stopTerminal()} className="h-8 border-rose-400/20 bg-transparent text-rose-200 hover:bg-rose-400/10"><XCircle className="size-3.5" />Stop</Button></div><div className="overflow-hidden rounded-xl border border-white/8 bg-[#05070b] shadow-inner"><div className="flex items-center justify-between border-b border-white/6 px-4 py-2 text-[11px] text-white/30"><span className="font-mono">~/workspace</span><span>{events.length} events</span></div><div className="scrollbar-thin h-[360px] overflow-y-auto p-4 font-mono text-xs leading-5 text-cyan-100/75">{events.length ? events.map((event) => <div key={event.id} className={event.kind === "terminal.input" ? "text-violet-200" : event.kind.includes("failed") ? "text-rose-200" : "whitespace-pre-wrap"}>{event.kind === "terminal.input" ? `$ ${event.data || ""}` : event.data || `[${event.kind}]`}</div>) : <div className="text-white/30">{error || "Connecting to the local worker…"}</div>}</div><form onSubmit={(event) => { event.preventDefault(); void sendInput(`${line}\n`); }} className="flex items-center gap-2 border-t border-white/6 px-4 py-3"><span className="font-mono text-xs text-emerald-300">$</span><input value={line} onChange={(event) => setLine(event.target.value)} onKeyDown={(event) => { if (event.ctrlKey && event.key.toLowerCase() === "c") { event.preventDefault(); void sendInput("\u0003"); } }} disabled={busy || terminalState !== "running"} className="min-w-0 flex-1 bg-transparent font-mono text-xs text-white outline-none placeholder:text-white/25" placeholder={terminalState === "running" ? "npm install · git status · npm run dev" : "Waiting for shell…"} aria-label="Terminal command" autoFocus /></form></div>{error && <div className="rounded-lg border border-rose-400/15 bg-rose-400/6 px-3 py-2 text-xs leading-5 text-rose-100/70">{error}</div>}<div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-white/32"><span>Commands execute on the local worker</span><span>Ctrl+C sends an interrupt</span><span>Terminal stays alive when this window closes</span></div></div>;
}
function relative(timestamp: number) { const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000)); if (seconds < 60) return `${seconds}s ago`; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return new Date(timestamp).toLocaleDateString(); }
