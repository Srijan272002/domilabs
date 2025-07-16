# Backend **Assignment Task**

## ⚓️ **Assignment Task: AI-Powered Ship Planning & Optimization System**

### Role: Backend Developer – Connex Labs

### Objective:

Design a **backend service** that uses **AI models** to improve operational efficiency and **optimize voyage planning, fuel usage, and maintenance scheduling** for commercial vessels.

This task assesses your:

✅ Backend design & API skills

✅ Knowledge of Docker & deployment workflows

✅ Understanding of AI integration

✅ Problem-solving & creative thinking in real-world scenarios

---

## 🚀 **Core Concept:**

You're building the **"Planning Brain"** for a smart ship.

This service will:

- **Predict the most efficient route & speed profile** based on destination, weather, and cargo weight.
- **Optimize fuel usage** using AI based on historical journeys.
- **Suggest voyage plans** that balance time, cost, and engine wear.
- **Continuously improve** via learning from new journey data.

---

## 🔧 **System Requirements**

### 📘 1. API Endpoints

Build RESTful (or GraphQL) endpoints for:

- `POST /plan-voyage`: Accepts input like `origin`, `destination`, `departure time`, `weather forecast`, `cargo load`. Returns optimized route plan (ETA, speed schedule, expected fuel use).
- `GET /plan-history`: Lists past plans with actuals vs predicted metrics.
- `POST /feedback`: Accepts feedback from actual voyage (actual fuel used, deviations, time taken) for learning purposes.
- `GET /maintenance-alerts`: Suggests proactive maintenance windows based on usage analytics.

---

### 🧠 2. AI/ML Component

Implement basic models using any ML library (e.g., **scikit-learn, TensorFlow.js, or PyTorch**):

- **Route Optimizer**: Based on distance, cargo weight, and weather.
- **Fuel Predictor**: Estimate fuel needs using regression based on ship, cargo, and route inputs.
- **Maintenance Forecaster**: Use usage logs (mocked) to predict next probable fault or service date.

> Bonus: Integrate a pre-trained model or build a lightweight continuous learning loop.
> 

---

### 💾 3. Database Design

Use **MongoDB** (MERN) or **PostgreSQL/MySQL** (Laravel):

Tables/Schemas:

- `Ship`: ID, engine type, capacity
- `Voyage`: origin, destination, cargo, weather, date, plan, actuals
- `FuelLogs`: time-series data for ship + trip
- `Maintenance`: history and AI-recommended schedule

---

### ⚙️ 4. Infrastructure & DevOps

- Containerize using **Docker**
- Add GitHub Actions for:
    - Lint/test
    - Docker build
    - Deployment to staging (local/cloud)
- (Bonus) Use AWS (EC2, Fargate, or Lambda) for deployment

---

### 🧾 5. Documentation & Delivery

Your GitHub repo should include:

- ✅ **README.md** with:
    - Setup instructions (Docker/Local)
    - API documentation with sample calls
    - Short description of the AI models
    - How your system supports **planning intelligence**
- ✅ Clean Git commit history
- ✅ `.env.example` for required environment variables
- ✅ `docker-compose.yml` if needed
- Once done, please email deliverables.
- Explaining video will be great too.
- (Optional) Deploy a **live API** and share the endpoint.
- send me an email at dj@skycladventures.com
- Within 3 days after submission, you will receive a calendar link.

---

### **Deadline:**

Submit within **7 days** .

---



---

