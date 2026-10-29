import { forwardTestApi } from "../../../../lib/test-api-proxy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return forwardTestApi("/api/v1/installations/confirm", request);
}
