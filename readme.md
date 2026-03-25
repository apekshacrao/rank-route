# RankRoute - AI-Based KCET College Predictor

## Overview
RankRoute now includes a machine learning pipeline for college prediction, AI/local mock test generation, personalized recommendations, and cutoff forecasting.

## Features
- ML-powered `/predict` endpoint with confidence score and ranked college predictions.
- Optional OpenAI-based mock test generation with local fallback question bank.
- `/submit-test` scoring with answer review and timer-aware auto-submit behavior.
- Personalized recommendations for top colleges and branches.
- Analytics trend API with next-year cutoff forecast using regression.

## Project Structure
backend/
- app.py
- model/
	- train_model.py
	- model.pkl (generated)
	- encoder.pkl (generated)
- routes/
	- predict.py
	- mocktest.py
	- analytics.py
- services/
	- ml_model_service.py
	- recommendation_service.py
- data/
	- dataset.csv
	- questions.json

## How The ML Model Works
- Input features: `rank`, `category`, `branch`.
- Category encoding: `GM=0`, `OBC=1`, `SC/ST=2`.
- Branch encoding: `CSE=0`, `ISE=1`, `ECE=2`, `AIML=3`.
- Target label: `college`.
- Default model: `RandomForestClassifier` (switchable to `DecisionTreeClassifier` or `LogisticRegression` in training script).
- Model outputs predicted college and confidence (from `predict_proba` when available).

## Setup
1. Install dependencies:
	 - `pip install -r requirements.txt`
2. Train model:
	 - `python backend/model/train_model.py`
3. Run backend:
	 - `python backend/app.py`

## API Testing

### Predict
POST `/predict`

Request JSON:
```json
{
	"rank": 3200,
	"category": "GM",
	"branch": "CSE",
	"previous_test_scores": [72, 84, 79]
}
```

Response includes:
- `predictions[]` with `college`, `branch`, `chance`, `confidence`
- `model_prediction`
- `recommendations`

### Generate Mock Test
POST `/generate-test`
```json
{
	"subject": "physics",
	"difficulty": "medium",
	"use_ai": true
}
```

If OpenAI fails or no key is configured, local fallback is used.

### Submit Mock Test
POST `/submit-test`
```json
{
	"test_id": "<id>",
	"answers": [
		{"id": 0, "selected_option": "velocity-time"},
		{"id": 1, "selected_option": "minimum"}
	]
}
```

Returns score, correct/wrong count, percentage, and detailed review.

### Analytics Forecast
GET `/cutoff-trends?category=GM&branch=CSE`
GET `/cutoff-forecast?category=GM&branch=CSE`

## OpenAI Integration (Optional)
Set environment variable before starting backend:
- Windows PowerShell: `$env:OPENAI_API_KEY="your_key_here"`

## Notes
- Train the model before calling `/predict`.
- `model.pkl` and `encoder.pkl` are generated artifacts and should be retained for inference.
