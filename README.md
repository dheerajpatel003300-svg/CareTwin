# CareTwin

<div align="center">

  <img src="https://img.shields.io/badge/Status-Prototype-orange" alt="Status" />
  <img src="https://img.shields.io/badge/Stack-Next.js%20%7C%20Express%20%7C%20FastAPI-blue" alt="Stack" />
  <img src="https://img.shields.io/badge/AI-Enabled-9cf" alt="AI Enabled" />
  <img src="https://img.shields.io/badge/ML-XGBoost-purple" alt="XGBoost" />

</div>

CareTwin is a healthcare platform for managing family health data, medical records, secure document workflows, and a research-oriented mortality-risk demo. It is structured as a small monorepo with a frontend, backend API, and ML inference service.

## Overview

CareTwin combines:

- a Next.js web app for user-facing healthcare workflows
- an Express + Prisma backend for authentication, profile and record management
- a FastAPI ML service for mortality-risk scoring
- a mortality-risk integration add-on for demo use and testing

## Architecture

```text
CareTwin/
├── README.md
├── DEPLOY.md
├── .vscode/
├── caretwin-frontend/        # Next.js app
├── caretwin-backend/         # Express API + Prisma + PostgreSQL + Redis
├── caretwin-ml-service/      # Python FastAPI prediction service
├── caretwin-mortality-addon/ # Backend/frontend patch bundle for the mortality demo
└── .gitignore
```

## Features

### Frontend

- responsive dashboard and patient-facing experience
- authentication flows and profile management
- family and medical record management views
- AI chat and document-related experience
- mortality-risk demo page for research-only predictions

### Backend

- secure auth and user management
- family member and medical record APIs
- document upload and OCR workflow
- AI chat integration
- ML prediction service integration
- Redis-backed health and readiness checks
- local or S3-compatible storage support

### ML service

- FastAPI app for model inference
- preprocessing + XGBoost prediction pipeline
- schema discovery endpoint for frontend integration
- private-key protected API access

## Tech Stack

- Frontend: Next.js, React, Tailwind, TypeScript
- Backend: Node.js, Express, Prisma, PostgreSQL, Redis
- ML Service: Python, FastAPI, scikit-learn, XGBoost, joblib
- Storage: local filesystem or S3-compatible object storage
- OCR: Tesseract + Poppler

## Prerequisites

### Backend

- Node.js 20+
- PostgreSQL
- Redis on port 6379
- Tesseract OCR and Poppler installed locally

### Frontend

- Node.js 20+
- configured backend origin via environment variables

### ML Service

- Python 3.x
- pip dependencies installed from `requirements.txt`
- matching ML API key for service access

## Deployment

Key deployment considerations:

- run PostgreSQL and Redis in production
- keep the ML service private and protected with a shared API key
- configure S3-compatible storage for secure document hosting when needed
- keep the backend and frontend origins aligned in CORS and env settings

## Security and Clinical Guidance

This project includes AI and mortality-risk features intended for research and demonstration use. These features are not clinical advice, and predictions should not be treated as medical validation. Any production rollout requires review, monitoring, and proper clinical oversight.

## Documentation

- [caretwin-backend/README.md](./caretwin-backend/README.md) — backend API details
- [caretwin-frontend/README.md](./caretwin-frontend/README.md) — frontend setup and config
- [caretwin-mortality-addon/README.md](./caretwin-mortality-addon/README.md) — mortality demo notes
