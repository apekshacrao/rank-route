# RankRoute – AI-Based KCET College Predictor

## Overview

RankRoute is an AI-powered student guidance platform designed to help engineering aspirants make smarter admission decisions during KCET counseling. The platform combines machine learning, interactive college maps, analytics, mock tests, and personalized recommendations to provide a complete counseling assistance system.

The project goes beyond a traditional college predictor by integrating:

* AI-based college prediction
* Interactive Karnataka engineering college map explorer
* Nearby facilities and navigation support
* AI-generated mock tests
* Cutoff analytics and forecasting
* Personalized college recommendations

---

# Features

## 🎯 AI-Based College Prediction

* ML-powered `/predict` API endpoint
* Predicts colleges based on:

  * KCET rank
  * Category
  * Preferred branch
* Displays:

  * Predicted colleges
  * Confidence score
  * Admission chance
  * Personalized recommendations

---

## 🗺️ College Map Explorer

* Interactive map showing engineering colleges across Karnataka
* Built using Leaflet.js and OpenStreetMap
* Displays:

  * College locations
  * Distance from user
  * Nearby facilities
  * NIRF rankings
  * Directions support

---

## 🧠 AI / Local Mock Test Generator

* Generates mock tests dynamically
* Supports:

  * AI-generated questions
  * Local fallback question bank
* Includes:

  * Timer-based auto submission
  * Instant result analysis
  * Answer review system

---

## 📊 Analytics & Cutoff Forecasting

* Displays previous cutoff trends
* Forecasts next-year cutoff using regression analysis
* Helps students analyze admission possibilities more effectively

---

## 🔔 Official Notifications System

* Dedicated notifications page for:

  * KCET updates
  * COMEDK notifications
  * PESSAT updates
  * Counseling schedules
  * Admission alerts

---

# Project Structure

```text
backend/
│
├── app.py
├── data/
│   ├── dataset.csv
│   ├── questions.json
│   ├── college_cutoffs.json
│   └── nearby_facilities.json
│
├── model/
│   ├── train_model.py
│   ├── model.pkl
│   └── encoder.pkl
│
├── routes/
│   ├── predict.py
│   ├── mocktest.py
│   ├── analytics.py
│   └── users.py
│
├── services/
│   ├── ml_model_service.py
│   ├── recommendation_service.py
│   ├── prediction_service.py
│   └── user_service.py
│
frontend/
│
├── html/
│   ├── dashboard.html
│   ├── predictorpage.html
│   ├── map.html
│   ├── notifications.html
│   ├── mocktest.html
│   ├── crashcourse.html
│   └── aboutproject.html
│
├── css/
│   └── style.css
│
└── js/
    ├── script.js
    └── map.js
```

---

# How the ML Model Works

## Input Features

The prediction model uses:

* KCET Rank
* Student Category
* Preferred Branch

---

## Category Encoding

| Category | Encoded Value |
| -------- | ------------- |
| GM       | 0             |
| OBC      | 1             |
| SC/ST    | 2             |

---

## Branch Encoding

| Branch | Encoded Value |
| ------ | ------------- |
| CSE    | 0             |
| ISE    | 1             |
| ECE    | 2             |
| AIML   | 3             |

---

## ML Algorithm

Default model:

* RandomForestClassifier

Optional models:

* DecisionTreeClassifier
* LogisticRegression

---

## Output

The model predicts:

* College name
* Confidence score
* Admission probability
* Recommendation insights

---

# Technologies Used

## Frontend

* HTML
* CSS
* JavaScript

## Backend

* Python
* Flask

## Database

* SQLite

## Maps & Navigation

* Leaflet.js
* OpenStreetMap
* Google Maps Directions

## AI / ML

* Scikit-learn
* Random Forest Classifier
* Regression Forecasting

---

# Setup Instructions

## Install Dependencies

```bash
pip install -r requirements.txt
```

## Train the ML Model

```bash
python backend/model/train_model.py
```

## Run Backend Server

```bash
python backend/app.py
```

---

# Windows Startup Without PowerShell Errors

PowerShell blocks `.ps1` files by default for security reasons.

Use temporary bypass:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Then run:

```powershell
.\run_lan_server.ps1
```

---

## One-Line Safe Launch

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass; Start-Process "http://127.0.0.1:5000"; python backend/app.py
```

---

# API Endpoints

## 🎯 Predict Colleges

### POST `/predict`

### Request

```json
{
  "rank": 3200,
  "category": "GM",
  "branch": "CSE",
  "previous_test_scores": [72, 84, 79]
}
```

### Response

* Predicted colleges
* Confidence score
* Recommendations
* Admission chance

---

## 🧪 Generate Mock Test

### POST `/generate-test`

```json
{
  "subject": "physics",
  "difficulty": "medium",
  "use_ai": true
}
```

If AI generation fails, the local question bank is used automatically.

---

## ✅ Submit Mock Test

### POST `/submit-test`

```json
{
  "test_id": "<id>",
  "answers": [
    {
      "id": 0,
      "selected_option": "velocity-time"
    }
  ]
}
```

### Returns

* Score
* Percentage
* Correct/Wrong count
* Detailed answer review

---

## 📈 Analytics Forecast

### GET Endpoints

```http
/cutoff-trends?category=GM&branch=CSE

/cutoff-forecast?category=GM&branch=CSE
```

---

## 🗺️ College Map Data

### GET `/colleges`

Returns:

* College names
* Coordinates
* Branches
* Cutoff information
* Nearby facilities

---

# Security & Optimization

The project includes:

* Password hashing
* Secure login handling
* Indexed database optimization
* Efficient data retrieval
* Responsive architecture
* Smooth UI performance optimization

-----

# Future Enhancements

Planned upgrades:

* AI chatbot counselor
* Real-time notifications
* Mobile application
* Cloud deployment
* Personalized AI recommendations
* Advanced analytics dashboard

---

# Project Benefits and Stakeholder Impact:

* 👨‍🎓 Students:

Can easily report issues without searching for the right department.
Get transparency through status tracking and resolution updates.


------
# Final Objective

RankRoute aims to become a complete AI-powered student counseling and guidance platform that helps engineering aspirants:

* Predict colleges
* Analyze admission chances
* Explore campuses
* Navigate locations
* Prepare for exams
* Make smarter career decisions
