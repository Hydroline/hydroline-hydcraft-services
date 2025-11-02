export interface ApiRequestOptions {
  method?: string;
  body?: Record<string, unknown> | FormData | undefined;
  token?: string | null;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface ApiResponseEnvelope<T> {
  code: number;
  message: string;
  timestamp: number;
  data: T;
}

export class ApiError<T = unknown> extends Error {
  status: number;
  code?: number;
  payload?: T;

  constructor(status: number, message: string, code?: number, payload?: T) {
    super(message);
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const method = options.method ?? 'GET';
  const init: RequestInit = {
    method,
    credentials: 'include',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
      ...(options.headers ?? {}),
    },
  };

  if (options.token) {
    (init.headers as Record<string, string>)['Authorization'] = `Bearer ${options.token}`;
  }

  if (options.body instanceof FormData) {
    init.body = options.body;
  } else if (options.body) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, init);
  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');

  if (!response.ok) {
    if (isJson) {
      const payload = (await response.json()) as Partial<ApiResponseEnvelope<T>>;
      throw new ApiError(response.status, payload.message ?? '请求失败', payload.code, payload.data);
    }
    throw new ApiError(response.status, response.statusText);
  }

  if (!isJson) {
    return response as unknown as T;
  }

  const result = (await response.json()) as ApiResponseEnvelope<T> | T;
  if (isEnvelope(result)) {
    return result.data;
  }
  return result as T;
}

function isEnvelope<T>(payload: ApiResponseEnvelope<T> | T): payload is ApiResponseEnvelope<T> {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      'code' in payload &&
      'message' in payload &&
      'timestamp' in payload &&
      'data' in payload,
  );
}
