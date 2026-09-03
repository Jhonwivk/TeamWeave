import { requireChatGPTUser } from "./chatgpt-auth";
import AgentConsole from "./console";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireChatGPTUser("/");
  return <AgentConsole />;
}
