/**
 * Acará Poker Club Helper — Cloudflare Worker backend
 *
 * Secrets / variables:
 *   ANTHROPIC_API_KEY  (secret, required)
 *   ALLOWED_ORIGINS    (text variable, required in production)
 *     Example: https://usuario.github.io
 *     Multiple origins: comma-separated.
 *   ANTHROPIC_MODEL    (optional; default claude-sonnet-5)
 */

const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_IMAGE_BASE64_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 32 * 1024 * 1024;

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = allowedOrigins(env);
  const allowOrigin = allowed.includes("*")
    ? "*"
    : (allowed.includes(origin) ? origin : "");

  return {
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request, env),
    },
  });
}

function originAllowed(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true; // curl / server-to-server tests
  const allowed = allowedOrigins(env);
  return allowed.includes("*") || allowed.includes(origin);
}

function stripDataUrlPrefix(data) {
  return String(data || "").replace(/^data:[^;]+;base64,/, "");
}

function normalizeMediaType(value) {
  const supported = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  const v = String(value || "").toLowerCase();
  return supported.has(v) ? v : null;
}

function extractJson(text) {
  const cleaned = String(text || "").replace(/```json|```/gi, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("O modelo não retornou JSON válido.");
  return JSON.parse(cleaned.slice(first, last + 1));
}

function validCardCode(code) {
  return /^(?:[2-9TJQKA])[SHDC]$/.test(String(code || "").toUpperCase());
}

function sanitizeResult(value) {
  const board = Array.isArray(value?.board)
    ? value.board.map(x => String(x).toUpperCase()).filter(validCardCode).slice(0, 5)
    : [];

  const players = Array.isArray(value?.players)
    ? value.players.slice(0, 12).map((p, i) => ({
        name: String(p?.name || `Jogador ${i + 1}`).slice(0, 40),
        cards: Array.isArray(p?.cards)
          ? p.cards.map(x => String(x).toUpperCase()).filter(validCardCode).slice(0, 2)
          : [],
      })).filter(p => p.cards.length)
    : [];

  return { board, players };
}

const PROMPT = `Analise cuidadosamente esta foto de uma mesa de poker Texas Hold'em.

Identifique:
1. As cartas comunitárias no centro da mesa, na ordem visual da esquerda para a direita.
2. As cartas de cada jogador que estejam claramente visíveis. Dê nomes simples como "Jogador 1", "Jogador 2" seguindo a posição visual.

Responda SOMENTE com JSON válido, sem markdown e sem explicações, neste formato:
{"board":["AS","KH","2D"],"players":[{"name":"Jogador 1","cards":["QC","QD"]}]}

Códigos: valor + naipe. Valores: 2-9, T, J, Q, K, A. Naipes: S=espadas, H=copas, D=ouros, C=paus.
Não invente cartas. Se uma carta não estiver legível com confiança, omita-a.
Se não conseguir identificar nenhuma carta com confiança, retorne {"board":[],"players":[]}.`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (!originAllowed(request, env)) {
        return json({ error: "Origem não autorizada." }, 403, request, env);
      }
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "acara-poker-api",
        model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        configured: Boolean(env.ANTHROPIC_API_KEY),
      }, 200, request, env);
    }

    if (url.pathname !== "/analyze" || request.method !== "POST") {
      return json({ error: "Rota não encontrada." }, 404, request, env);
    }

    if (!originAllowed(request, env)) {
      return json({ error: "Origem não autorizada. Ajuste ALLOWED_ORIGINS no Worker." }, 403, request, env);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "ANTHROPIC_API_KEY não foi configurada no Worker." }, 500, request, env);
    }

    const len = Number(request.headers.get("Content-Length") || "0");
    if (len && len > MAX_REQUEST_BYTES) {
      return json({ error: "Requisição muito grande. Escolha uma foto menor." }, 413, request, env);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Corpo JSON inválido." }, 400, request, env);
    }

    const mediaType = normalizeMediaType(body?.image?.media_type);
    const imageData = stripDataUrlPrefix(body?.image?.data);

    if (!mediaType || !imageData) {
      return json({ error: "Imagem ausente ou formato não suportado (JPEG, PNG, WEBP ou GIF)." }, 400, request, env);
    }

    // Anthropic limits each base64-encoded image to 10 MB.
    if (imageData.length > MAX_IMAGE_BASE64_BYTES) {
      return json({ error: "Imagem muito grande para análise. Tire outra foto ou reduza a resolução." }, 413, request, env);
    }

    let apiResponse;
    try {
      apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
          max_tokens: 700,
          thinking: { type: "disabled" },
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageData,
                },
              },
              { type: "text", text: PROMPT },
            ],
          }],
        }),
      });
    } catch (error) {
      return json({ error: "Falha de rede entre o Worker e a Anthropic." }, 502, request, env);
    }

    const raw = await apiResponse.text();

    if (!apiResponse.ok) {
      let detail = "";
      try {
        const parsed = JSON.parse(raw);
        detail = parsed?.error?.message || parsed?.message || "";
      } catch {}
      return json({
        error: `Anthropic respondeu HTTP ${apiResponse.status}${detail ? ": " + detail : ""}`,
      }, 502, request, env);
    }

    let apiData;
    try {
      apiData = JSON.parse(raw);
      const text = (apiData.content || [])
        .filter(x => x?.type === "text")
        .map(x => x.text || "")
        .join("")
        .trim();
      const result = sanitizeResult(extractJson(text));
      return json(result, 200, request, env);
    } catch (error) {
      return json({ error: "Não foi possível interpretar a resposta do modelo." }, 502, request, env);
    }
  },
};
