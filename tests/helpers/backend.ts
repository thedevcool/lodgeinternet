/**
 * A stand-in for the backend, for unit tests.
 *
 * The website holds no prices, stock or balances of its own (P1): everything
 * it shows comes from an `/api/...` answer. So tests replace `fetch` with this
 * and say what the backend answers; the real `lib/apiClient.ts` still runs on
 * top, which is how the tests can also check what each request carried
 * (credentials, the X-Lodge-Client header, the JSON body).
 *
 *   const backend = fakeBackend();
 *   backend.on("POST /api/data-codes/reserve", () => json({ reservationId: "held-1" }));
 *   ...
 *   expect(backend.sent("POST /api/data-codes/reserve")).toHaveLength(1);
 *
 * A request no test answered gets a 404 and is listed in `unanswered`, so a
 * test can assert that nothing unexpected went out. Nothing here touches the
 * network.
 */
import { vi } from "vitest";

/** One request the code under test sent. */
export type SentRequest = {
  /** "POST /api/data-codes/claim": the method and the path without its query. */
  key: string;
  method: string;
  path: string;
  /** The query string without "?", "" when there is none. */
  query: string;
  /** Exactly what was handed to fetch (absolute when an API base is set). */
  url: string;
  headers: Headers;
  credentials: RequestCredentials | undefined;
  /** The parsed JSON body, or undefined when none was sent. */
  body: any;
  signal: AbortSignal | null | undefined;
};

type Answer = (request: SentRequest) => Response | Promise<Response>;

/** A JSON answer, as the backend sends them. Errors are `{ error, code }`. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** An answer that stays open until the test settles it (a slow request). */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** An answer that never arrives: it only ends when the caller gives up (aborts). */
export function hangUntilAborted(request: SentRequest): Promise<Response> {
  return new Promise((_, reject) => {
    request.signal?.addEventListener("abort", () => {
      reject(new DOMException("The request was aborted.", "AbortError"));
    });
  });
}

export function fakeBackend() {
  const answers = new Map<string, Answer>();
  const requests: SentRequest[] = [];
  const unanswered: string[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    // The base only matters for parsing a same-origin path like "/api/x".
    const parsed = new URL(url, "http://website.test");
    const method = (init?.method ?? "GET").toUpperCase();
    const request: SentRequest = {
      key: `${method} ${parsed.pathname}`,
      method,
      path: parsed.pathname,
      query: parsed.search.replace(/^\?/, ""),
      url,
      headers: new Headers(init?.headers),
      credentials: init?.credentials,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      signal: init?.signal,
    };
    requests.push(request);

    const answer = answers.get(request.key);
    if (!answer) {
      unanswered.push(request.key);
      return json({ error: `No test answer for ${request.key}` }, 404);
    }
    return answer(request);
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    fetchMock,
    /** Every request sent so far, in order. */
    requests,
    /** Requests that no `on(...)` answered. */
    unanswered,
    /** Say what the backend answers for "METHOD /path". The latest call wins. */
    on(key: string, answer: Answer): void {
      answers.set(key, answer);
    },
    /** The requests sent to "METHOD /path", in order. */
    sent(key: string): SentRequest[] {
      return requests.filter((request) => request.key === key);
    },
  };
}

export type FakeBackend = ReturnType<typeof fakeBackend>;
