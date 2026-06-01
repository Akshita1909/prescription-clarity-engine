# Prescription Clarity Engine 🏥

> AI-powered prescription decoder for 300M+ patients in India who leave clinics without understanding their medication.

## Live Demo
Upload any prescription image → Get plain-language explanation in your language in seconds.

## The Problem
- Doctors write in shorthand (OD, BD, SOS, AC, PC)
- Pharmacists are too busy to explain
- Patients are embarrassed to ask
- Result: wrong dosage, missed interactions, re-hospitalization

## The Solution
A web app that:
1. Takes a photo of any prescription (handwritten or printed)
2. Uses vision AI to extract and decode it
3. Explains every drug in plain language
4. Flags dangerous drug-drug and drug-food interactions
5. Generates a clear daily dosage schedule
6. Works in English, Hindi, Tamil, Telugu, Bengali, Marathi

## Tech Stack

### Frontend
- React.js — component-based UI
- CSS Variables — design system with dark theme
- Fetch API — async image upload

### Backend
- FastAPI (Python) — async REST API
- Redis — caching layer (same image = zero API calls)
- SlowAPI — rate limiting (10 req/min per IP)
- httpx — async HTTP client for AI API

### AI Layer
- OpenRouter API — model routing
- Vision LLM — reads handwritten and printed prescriptions
- Structured JSON prompting — extracts drugs, schedule, interactions

## Architecture
