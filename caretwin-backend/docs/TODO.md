New-Item -ItemType Directory -Force -Path docs | Out-Null
@'
# CareTwin backend: to-do and decisions

## Planned integrations
- OCR service: https://github.com/Amit-11-Yadav/CareTwin-OCR (Python, runs as an internal-only service called from Node; extracted values stay "unconfirmed" until the user confirms them)
- ML model: repo link and details still to come (needs the same clinical review gate as the symptom rules before users see predictions)

## Before launch
- Clinician review of src/data/symptomRules.js and src/data/chatSafety.js, and of the chat system prompt
- Read Groq's data-retention terms and mention third-party AI processing in the privacy policy
- Re-run the diagnosis / dosage / prompt-injection chat tests on whatever model production uses
- Run `node scripts/security-check.js --prod` and clear every FAIL
- Rotate the postgres superuser password that was pasted in chat; production DB role must not have CREATEDB
- Do NOT deploy scripts/ or docs/ (scripts/verify-user.js bypasses email verification)
- Set up real email (MAIL_PROVIDER=smtp or a transactional provider with SPF/DKIM on your own domain)
- Re-run `npm audit` and re-check the prisma / deepmerge-ts finding

## Accepted risks
- npm audit high (deepmerge-ts via the prisma CLI): CLI-only, no safe fix available right now

## Pending
- Real ANTHROPIC_API_KEY only matters if LLM_PROVIDER is switched back to anthropic (currently groq, model openai/gpt-oss-120b)

## Done
- Phases 0-7: auth, profile, notifications, dashboard, records and files, symptom checker, chat, settings, support
- Hardening batch 1 (logs, file removal on record delete, download header, audit events, resend-verification) and batch 2 (email service, console mode)
'@ | Set-Content -Path docs\TODO.md -Encoding utf8
Get-Content docs\TODO.md | Select-Object -First 5