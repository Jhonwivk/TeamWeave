"use client";

import { useMemo, useState } from "react";
import { ChevronRight, FileText, FolderOpen, Search } from "lucide-react";
import { formatBytes, relative } from "@/lib/format";
import type { Workspace, WorkspaceFile } from "@/lib/workspace-types";
import { SurfaceHeader } from "@/components/workspace/SurfaceHeader";

export function WorkspaceFiles({ workspace, files }: { workspace: Workspace; files: WorkspaceFile[] }) {
  const [query, setQuery] = useState("");
  const presentFiles = useMemo(() => files.filter((file) => file.status === "present"), [files]);
  const visibleFiles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...presentFiles]
      .filter((file) => !needle || file.path.toLowerCase().includes(needle))
      .sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
        return left.path.localeCompare(right.path);
      });
  }, [presentFiles, query]);
  const directoryCount = presentFiles.filter((file) => file.kind === "directory").length;
  const fileCount = presentFiles.length - directoryCount;

  return <>
    <SurfaceHeader icon={FileText} title="Files" description={presentFiles.length ? `${fileCount} files · ${directoryCount} folders · read-only index` : "Read-only checkout index from the connected worker"} />
    <div className="mt-5 overflow-hidden rounded-xl border border-white/8">
      <div className="flex flex-col gap-3 border-b border-white/7 bg-white/[.025] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-white/35"><FolderOpen className="size-3.5 shrink-0" /><span className="truncate">{workspace.localPath || "Checkout path pending"}</span></div>
        <label className="relative block w-full sm:max-w-52"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/25" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 w-full rounded-lg border border-white/8 bg-[#080a11] pl-8 pr-2 text-[11px] text-white outline-none placeholder:text-white/25 focus:border-violet-400/45" placeholder="Filter files" aria-label="Filter workspace files" /></label>
      </div>
      {visibleFiles.length ? <div className="max-h-[520px] overflow-y-auto divide-y divide-white/6">{visibleFiles.map((file) => { const isDirectory = file.kind === "directory"; const Icon = isDirectory ? FolderOpen : FileText; return <div key={file.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[.025]"><div className={`grid size-8 shrink-0 place-items-center rounded-lg ${isDirectory ? "bg-amber-300/10 text-amber-200/70" : "bg-cyan-300/8 text-cyan-200/65"}`}><Icon className="size-4" /></div><div className="min-w-0 flex-1"><div className="truncate font-mono text-xs text-white/72">{file.path}</div><div className="mt-1 text-[10px] text-white/28">{isDirectory ? "Folder" : formatBytes(file.size)}{file.modifiedAt ? ` · ${relative(file.modifiedAt)}` : ""}</div></div><ChevronRight className="size-3.5 shrink-0 text-white/15" /></div>; })}</div> : presentFiles.length ? <div className="grid min-h-56 place-items-center p-8 text-center"><div><Search className="mx-auto size-7 text-white/20" /><h3 className="mt-3 text-sm font-medium">No matching files</h3><p className="mt-2 text-xs text-white/32">Try a different name or clear the filter.</p></div></div> : <div className="grid min-h-72 place-items-center p-8 text-center"><div><FolderOpen className="mx-auto size-8 text-cyan-200/35" /><h3 className="mt-4 text-sm font-medium">{workspace.status === "ready" ? "Waiting for the worker file index" : "File index starts when workspace is ready"}</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-white/32">The worker reports safe file metadata from this checkout every few seconds. Secrets, dependency folders, and Git internals are never indexed.</p></div></div>}
      <div className="border-t border-white/7 bg-white/[.018] px-4 py-3 text-[10px] leading-5 text-white/28">Read-only metadata · file contents and write operations stay in Terminal or Agent Runs.</div>
    </div>
  </>;
}
