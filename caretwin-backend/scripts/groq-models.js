require("dotenv").config();

async function main() {
  const key = process.env.GROQ_API_KEY;
  console.log("key set:", Boolean(key), "| starts with gsk_:", Boolean(key && key.startsWith("gsk_")), "| length:", key ? key.length : 0);
  if (!key) return;

  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  console.log("HTTP status:", res.status);

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.log("error:", body?.error?.message || "(no message)");
    return;
  }
  console.log((body.data || []).map((m) => m.id).sort().join("\n"));
}

main().catch((e) => console.error("request failed:", e.message));
