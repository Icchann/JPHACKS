import { forwardTestApi } from "../../../lib/test-api-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).search;
  return forwardTestApi(`/sensors${query}`);
}

export async function POST(request: Request) {
  return forwardTestApi("/sensors", request);
}
