"use client";

import { useState } from "react";
import { ExternalLink, Monitor, RefreshCw, TerminalSquare, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkspacePort, WorkspaceProcess } from "@/lib/workspace-types";
import { SurfaceHeader } from "@/components/workspace/SurfaceHeader";

export function WorkspacePreview({ processes, ports, onOpenTerminal }: { processes: WorkspaceProcess[]; ports: WorkspacePort[]; onOpenTerminal: () => void }) {
  const primaryPort = ports[0];
  const previewUrl = primaryPort ? `${primaryPort.protocol === "https" ? "https" : "http"}://localhost:${primaryPort.port}/` : null;
  const [previewKey, setPreviewKey] = useState(0);

  return <>
    <SurfaceHeader icon={Monitor} title="Preview" description="Local development servers detected by the worker" />
    <div className="mt-5 grid gap-4 xl:grid-cols-[220px_1fr]">
      <div className="rounded-xl border border-white/8 bg-white/[.025] p-3">
        <div className="flex items-center justify-between gap-3"><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/25">Processes & ports</div><span className="rounded-full bg-white/6 px-2 py-1 text-[10px] text-white/35">{ports.length} port{ports.length === 1 ? "" : "s"}</span></div>
        <div className="mt-4 space-y-2">
          {ports.length ? ports.map((port) => <div key={port.id} className="rounded-lg border border-emerald-300/12 bg-emerald-300/[.035] p-3"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.65)]" /><span className="min-w-0 truncate text-xs font-medium text-white/75">{port.label || "Development server"}</span></div><div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[10px] text-emerald-100/55"><span>localhost:{port.port}</span><span className="uppercase text-white/25">{port.protocol}</span></div></div>) : <div className="rounded-lg border border-dashed border-white/8 p-4 text-center"><span className="mx-auto block size-2 rounded-full bg-white/20" /><div className="mt-2 text-xs text-white/45">No listening ports detected</div><div className="mt-1 text-[10px] leading-4 text-white/25">Run a dev server in Terminal; the worker checks every few seconds.</div></div>}
        </div>
        <div className="mt-4 border-t border-white/7 pt-3"><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/25">Processes</div>{processes.length ? <div className="mt-2 space-y-1.5">{processes.slice(0, 6).map((process) => <div key={process.id} className="flex items-center justify-between gap-2 text-[11px]"><span className="min-w-0 truncate text-white/55">{process.name}</span><span className="shrink-0 font-mono text-[10px] text-white/25">#{process.pid}</span></div>)}</div> : <div className="mt-2 text-[11px] leading-5 text-white/28">No workspace processes reported yet.</div>}</div>
      </div>
      <div className="min-h-96 rounded-xl border border-white/8 bg-[#06080d] p-3 sm:p-4">
        {primaryPort && previewUrl ? <div className="flex h-full min-h-[420px] flex-col"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-1 pb-3"><div className="min-w-0"><div className="flex items-center gap-2 text-xs font-medium text-white/75"><span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.65)]" />{primaryPort.label || "Development server"}</div><div className="mt-1 truncate font-mono text-[10px] text-white/32">{previewUrl}</div></div><div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => setPreviewKey((value) => value + 1)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] text-white/55 hover:bg-white/8 hover:text-white"><RefreshCw className="size-3.5" />Refresh</button><a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] text-white/55 hover:bg-white/8 hover:text-white">Open <ExternalLink className="size-3.5" /></a></div></div><div className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-lg border border-white/8 bg-white"><iframe key={`${previewUrl}-${previewKey}`} title={`${primaryPort.label || "Development server"} preview`} src={previewUrl} className="h-full min-h-[360px] w-full border-0" loading="eager" referrerPolicy="no-referrer" /></div><div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-3 text-[10px] text-white/30"><span className="inline-flex items-center gap-1.5"><Wifi className="size-3" />Preview runs on the connected worker machine.</span><button type="button" onClick={onOpenTerminal} className="text-violet-300 hover:text-violet-200">Open Terminal →</button></div></div> : <div className="grid min-h-96 place-items-center p-8 text-center"><div><Monitor className="mx-auto size-9 text-white/18" /><h3 className="mt-4 text-sm font-medium">Preview is waiting for a detected port</h3><p className="mx-auto mt-2 max-w-sm text-xs text-white/32">Start your app locally. The worker discovers listeners inside this workspace and will report them here.</p><Button variant="outline" onClick={onOpenTerminal} className="mt-4 border-white/10 bg-transparent text-white hover:bg-white/8"><TerminalSquare />Open Terminal</Button></div></div>}
      </div>
    </div>
  </>;
}
