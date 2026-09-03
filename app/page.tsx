import { requireSessionUser } from "@/lib/auth";
import AgentConsole from "./console";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireSessionUser("/");
  return <AgentConsole user={user} />;
}
