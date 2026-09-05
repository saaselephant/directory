import { resolveSoftwareOutbound } from "@/lib/repositories/outbound";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const destination = await resolveSoftwareOutbound(slug);
  if (!destination)
    return new Response("This software link is unavailable.", { status: 404, headers });
  return new Response(null, { status: 303, headers: { ...headers, Location: destination } });
}
