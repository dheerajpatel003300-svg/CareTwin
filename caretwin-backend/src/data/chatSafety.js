// NOT YET CLINICALLY REVIEWED. Must be reviewed before any real user sees it.
// Patterns run on normalized text: lowercase, curly quotes straightened, punctuation removed.
// Bias: a false positive shows emergency guidance unnecessarily; a false negative is the real risk.

const PATTERNS = [
  {
    id: "self_harm",
    kind: "crisis",
    re: /\b(kill myself|killing myself|end my life|ending my life|want to die|wanna die|suicid\w*|hurt myself|harm myself|hurting myself|take my own life|don't want to (live|be alive)|better off dead)\b/,
  },
  {
    id: "overdose",
    kind: "crisis",
    re: /\b(overdos\w*|took too many (pills|tablets)|swallowed (a lot of|too many) (pills|tablets))\b/,
  },
  {
    id: "cardiac",
    kind: "emergency",
    re: /\b(chest (pain|pressure|tightness)|pain in my chest|pressure in my chest|tightness in my chest)\b/,
  },
  {
    id: "breathing",
    kind: "emergency",
    re: /\b(can't breathe|cannot breathe|can't catch my breath|struggling to breathe|trouble breathing|difficulty breathing|hard to breathe)\b/,
  },
  {
    id: "stroke",
    kind: "emergency",
    re: /\b(face (is )?droop\w*|slurred speech|can't speak|sudden(ly)? (numb|weak)\w*|one side of my (body|face))\b/,
  },
  {
    id: "bleeding",
    kind: "emergency",
    re: /\b(won't stop bleeding|bleeding (heavily|badly|a lot|profusely)|heavy bleeding)\b/,
  },
  {
    id: "unconscious",
    kind: "emergency",
    re: /\b(passed out|unconscious|unresponsive|not waking up|won't wake up|seizure|convulsion\w*)\b/,
  },
  {
    id: "allergic",
    kind: "emergency",
    re: /\b(anaphyla\w*|throat (is )?(closing|swelling)|swollen tongue|tongue (is )?swelling)\b/,
  },
];

const REPLIES = {
  emergency:
    "What you describe could be serious. Please call your local emergency number or go to the nearest emergency department right now. If you are with someone, ask them to stay with you. Do not drive yourself.\n\nThis assistant cannot assess emergencies, so please get in-person help immediately.",
  crisis:
    "I'm really sorry you are going through this, and I'm glad you told me. You do not have to face it alone. Please contact your local emergency number or a crisis helpline right now, or reach out to someone you trust and stay with them.\n\nIf you may have taken something harmful, seek emergency medical help immediately.",
};

module.exports = { PATTERNS, REPLIES };