import { translateApiErrorMessage } from '@/constants/api-error-translations'

export interface ApiRequestOptions {
  method?: string
  body?: Record<string, unknown> | FormData | undefined
  token?: string | null
  signal?: AbortSignal
  headers?: Record<string, string>
  /**
   * Disable in-flight request de-duplication for GET requests.
   * By default, simultaneous identical GETs (same url, method and token)
   * will share one network request.
   */
  noDedupe?: boolean
}

export interface ApiResponseEnvelope<T> {
  code: number
  message: string
  timestamp: number
  data: T
}

export class ApiError<T = unknown> extends Error {
  status: number
  code?: number
  payload?: T
  rawMessage?: string

  constructor(
    status: number,
    message: string,
    code?: number,
    payload?: T,
    rawMessage?: string,
  ) {
    super(message)
    this.status = status
    this.code = code
    this.payload = payload
    this.rawMessage = rawMessage
  }
}

const API_PREFIX = '/api'
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
).replace(/\/$/, '')

export function getApiBaseUrl() {
  return API_BASE_URL
}

// In-flight requests map to dedupe identical concurrent GET requests
const inflight = new Map<string, Promise<unknown>>()

export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  if (path.startsWith('http')) {
    return performRequest<T>(path, options)
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const requestPath =
    normalizedPath.startsWith(`${API_PREFIX}/`) || normalizedPath === API_PREFIX
      ? normalizedPath
      : `${API_PREFIX}${normalizedPath}`
  const url = `${API_BASE_URL}${requestPath}`
  return performRequest<T>(url, options)
}

function performRequest<T>(
  url: string,
  options: ApiRequestOptions,
): Promise<T> {
  const method = options.method ?? 'GET'
  const isDedupeCandidate =
    method === 'GET' && !options.body && !options.noDedupe
  const dedupeKey = isDedupeCandidate
    ? `${method}:${url}:${options.token ?? ''}`
    : null

  // Return the existing in-flight promise if present
  if (dedupeKey && inflight.has(dedupeKey)) {
    return inflight.get(dedupeKey)! as Promise<T>
  }

  const doRequest = async (tokenOverride?: string): Promise<T> => {
    const authToken = tokenOverride ?? options.token
    const init: RequestInit = {
      method,
      credentials: 'include',
      signal: options.signal,
      headers: {
        Accept: 'application/json',
        ...(options.headers ?? {}),
      },
    }

    if (authToken) {
      ;(init.headers as Record<string, string>)['Authorization'] =
        `Bearer ${authToken}`
    }

    if (options.body instanceof FormData) {
      init.body = options.body
    } else if (options.body) {
      ;(init.headers as Record<string, string>)['Content-Type'] =
        'application/json'
      init.body = JSON.stringify(options.body)
    }

    const response = await fetch(url, init)
    const contentType = response.headers.get('content-type')
    const isJson = contentType?.includes('application/json')

    if (!response.ok) {
      if (isJson) {
        const payload = (await response.json()) as Partial<
          ApiResponseEnvelope<T>
        >
        const payloadMessage = payload.message ?? 'Request failed'
        const clientMessage =
          translateApiErrorMessage(payloadMessage) ?? payloadMessage
        throw new ApiError(
          response.status,
          clientMessage,
          payload.code,
          payload.data,
          payloadMessage,
        )
      }
      throw new ApiError(response.status, response.statusText)
    }

    if (!isJson) {
      return response as unknown as T
    }

    const result = (await response.json()) as ApiResponseEnvelope<T> | T
    if (isEnvelope(result)) {
      return result.data
    }
    return result as T
  }

  const promise = (async () => {
    try {
      return await doRequest()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && options.token) {
        const refreshedToken = await attemptTokenRefresh()
        if (refreshedToken) {
          return doRequest(refreshedToken)
        }
      }
      throw error
    } finally {
      if (dedupeKey) inflight.delete(dedupeKey)
    }
  })()

  if (dedupeKey) inflight.set(dedupeKey, promise)
  return promise
}

async function attemptTokenRefresh(): Promise<string | null> {
  try {
    const { useAuthStore } = await import('@/stores/auth')
    const auth = useAuthStore()
    if (!auth.refreshToken) {
      return null
    }
    await auth.refreshSession()
    return auth.token
  } catch {
    return null
  }
}

function isEnvelope<T>(
  payload: ApiResponseEnvelope<T> | T,
): payload is ApiResponseEnvelope<T> {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      'code' in payload &&
      'message' in payload &&
      'timestamp' in payload &&
      'data' in payload,
  )
}
