import type { LucideIcon } from "lucide-react";

export function SurfaceHeader({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-cyan-400/9 text-cyan-200"><Icon className="size-4" /></div><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-0.5 text-[11px] text-white/32">{description}</p></div></div>;
}
