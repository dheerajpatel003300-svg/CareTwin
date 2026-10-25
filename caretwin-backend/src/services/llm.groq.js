const URL_BASE = process.env.GROQ_URL || "https://api.groq.com/openai/v1";
const TIMEOUT_MS = 30000;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Same contract as the other providers: returns reply text, or throws with a statusCode.
async function generateReply({ systemPrompt, history, userMessage }) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL;
  if (!apiKey || !model) {
    console.error("groq: missing configuration", {
      apiKeyConfigured: Boolean(apiKey),
      modelConfigured: Boolean(model),
    });
    throw httpError(503, "The AI assistant is not available right now.");
  }

  const messages = [{ role: "system", content: systemPrompt }];
  for (const m of history) {
    messages.push({ role: m.sender === "assistant" ? "assistant" : "user", content: m.message });
  }
  messages.push({ role: "user", content: userMessage });

  const body = {
    model,
    messages,
    temperature: 0.3,
    // Reasoning models spend part of this budget on thinking, so leave plenty of room
    max_tokens: 1500,
  };
  // gpt-oss models accept a reasoning effort; low keeps replies fast and the budget free
  if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";

  let res;
  try {
    res = await fetch(`${URL_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error("groq call failed:", err.name); // never log message content
    throw httpError(503, "The AI assistant is not available right now.");
  }

  if (!res.ok) {
    // 400 = bad request or parameter, 401 = bad key, 404 = bad model name, 429 = free-tier limit
    console.error("groq call failed: HTTP", res.status);
    throw httpError(503, "The AI assistant is not available right now.");
  }

  const data = await res.json();
  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!text) {
    console.error("groq returned an empty reply, finish_reason:", data?.choices?.[0]?.finish_reason);
    throw httpError(503, "The AI assistant is not available right now.");
  }
  return text;
}

module.exports = { generateReply };