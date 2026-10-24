import { forwardTestApi } from "../../../../lib/test-api-proxy";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return forwardTestApi(`/sensors/${encodeURIComponent(id)}`, request);
}
