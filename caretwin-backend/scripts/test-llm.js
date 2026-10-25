require("dotenv").config();

async function direct() {
  const key = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL;
  console.log("provider:", process.env.LLM_PROVIDER, "| model:", model, "| key set:", Boolean(key));

  const body = {
    model,
    messages: [{ role: "user", content: "Say hello in five words." }],
    max_tokens: 1500,
  };
  if (model && model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);

  console.log("\n--- direct call to Groq");
  console.log("HTTP status:", res.status);
  if (!res.ok) {
    console.log("error message:", data?.error?.message || "(none)");
    console.log("error type:", data?.error?.type || "(none)");
    return;
  }
  const choice = data?.choices?.[0];
  console.log("finish_reason:", choice?.finish_reason);
  console.log("reply:", JSON.stringify(choice?.message?.content));
}

async function viaService() {
  console.log("\n--- through llm.service.js (what the server uses)");
  const { generateReply } = require("../src/services/llm.service");
  try {
    const text = await generateReply({ history: [], userMessage: "Say hello in five words." });
    console.log("reply:", JSON.stringify(text));
  } catch (e) {
    console.log("FAILED with status", e.statusCode, "-", e.message);
  }
}

direct()
  .then(viaService)
  .catch((e) => console.error("script error:", e.message));