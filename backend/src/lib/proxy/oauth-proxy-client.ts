import { OAuthProviderSettings } from '../../oauth/types/provider.types';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

type ProxyBodyType = 'json' | 'text' | 'binary';

interface OAuthProxyPacket {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  bodyType: ProxyBodyType;
  body: string; // json/text as string; binary as base64 string
}

export function getProxyConfig() {
  const proxyUrl = process.env.OAUTH_PROXY_URL || process.env.PROXY_URL;
  const proxyKey = process.env.OAUTH_PROXY_KEY || process.env.PROXY_KEY;
  return { proxyUrl, proxyKey };
}

async function fetchWithProxy(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const systemProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

  if (systemProxy) {
    const dispatcher = new ProxyAgent(systemProxy);
    // @ts-ignore - undici types might slightly differ from global fetch types
    return undiciFetch(url, {
      ...init,
      dispatcher,
    }) as unknown as Promise<Response>;
  }

  return fetch(url, init);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = Buffer.from(base64, 'base64');
  return binaryString.buffer.slice(
    binaryString.byteOffset,
    binaryString.byteOffset + binaryString.byteLength,
  );
}

async function unwrapProxyResponse(response: Response): Promise<Response> {
  // Proxy worker returns a JSON envelope: { ok, status, headers, bodyType, body }
  // If shape doesn't match, return original response.
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  if (!isJson) return response;

  let packet: OAuthProxyPacket | null = null;
  try {
    packet = (await response.json()) as OAuthProxyPacket;
  } catch {
    return response;
  }

  if (!packet || typeof packet.status !== 'number' || !('bodyType' in packet)) {
    // Not our proxy envelope
    // Recreate original JSON body Response so upstream can still read it
    return new Response(JSON.stringify(packet ?? null), {
      status: response.status,
      headers: response.headers,
    });
  }

  const headers = new Headers();
  for (const [k, v] of Object.entries(packet.headers || {})) headers.set(k, v);

  // Ensure content-type consistent with upstream if provided; otherwise infer
  if (!headers.has('content-type')) {
    if (packet.bodyType === 'json')
      headers.set('content-type', 'application/json');
    else if (packet.bodyType === 'text')
      headers.set('content-type', 'text/plain; charset=utf-8');
  }

  if (packet.bodyType === 'binary') {
    const buf = base64ToArrayBuffer(packet.body ?? '');
    return new Response(buf, { status: packet.status, headers });
  }

  // For json/text, body is plain string (json string for json type)
  return new Response(packet.body ?? '', { status: packet.status, headers });
}

export async function oauthProxyFetch(
  targetUrl: string,
  init: RequestInit,
  settings: OAuthProviderSettings,
): Promise<Response> {
  const { proxyUrl, proxyKey } = getProxyConfig();
  const useProxy = settings.providerProxyEnabled && proxyUrl && proxyKey;

  if (!useProxy) {
    try {
      return await fetchWithProxy(targetUrl, init);
    } catch (error) {
      throw new Error(
        `Direct OAuth request failed (Target: ${targetUrl}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const proxyRequestBody = {
    url: targetUrl,
    method: init.method || 'GET',
    headers: init.headers || {},
    bodyType: init.body instanceof URLSearchParams ? 'form' : 'raw',
    body:
      init.body instanceof URLSearchParams
        ? init.body.toString()
        : (init.body as any),
    key: proxyKey,
  };

  try {
    const response = await fetchWithProxy(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(proxyRequestBody),
    });

    // If this is our Worker, unwrap envelope back to real upstream response
    return await unwrapProxyResponse(response);
  } catch (error) {
    throw new Error(
      `OAuth Proxy request failed (Proxy: ${proxyUrl}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
