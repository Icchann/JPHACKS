import { forwardTestApi } from "../../../../../../lib/test-api-proxy";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return forwardTestApi(
    `/api/v1/installations/nodes/${encodeURIComponent(id)}/active`,
    request,
  );
}
