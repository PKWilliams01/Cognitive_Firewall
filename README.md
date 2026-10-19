# Trading-Discipline-App
A full-stack web application designed as a psychological intervention tool for financial day-traders — helping them recognise and interrupt impulsive decision-making before it costs them money.

**Status:** 🔨 In active development core features functional, UI and analytics being refined.

## The Problem

Retail day-traders lose money the same way, over and over. Not because they lack strategy, but because they abandon it. A bad loss triggers emotional tilt — frustration, urgency, the need to "win it back" — and what follows is revenge trading: rapid, rule-breaking trades made on impulse rather than analysis. Most trading platforms do nothing to intervene. Cognitive Firewall does.

## What It Does

### Pre-Flight Protocol
Before any trading session begins, the user completes a mandatory risk-assessment check-in. It forces a pause — evaluating mindset, confirming the plan, and acknowledging the rules — before the first trade is placed. No check-in, no session.

### Trading Monitor
A custom algorithm tracks trading frequency and rule adherence throughout the session. It watches for the behavioural signatures of tilt: trades firing too fast, position sizes climbing, rules being ignored.

### Hard Lock
When the system detects high emotional tilt, it triggers a Hard Lock — temporarily revoking platform access entirely. The session ends. The trader is forced to step away. This is the core intervention: removing access at the moment the user is least capable of removing themselves.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React.js, Tailwind CSS |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB with Mongoose ODM |
| **Architecture** | REST API, component-based UI, client-side state management |

## Project Structure

```
Cognitive_Firewall/
├── Backend/
│   ├── Controllers/     # Request handlers
│   ├── Middleware/       # Auth & validation
│   ├── Models/          # Mongoose schemas
│   ├── Routes/          # API route definitions
│   ├── Services/        # Business logic
│   └── server.js        # Entry point
├── frontend/
│   ├── public/
│   └── src/             # React components, pages & state
└── README.md
```

## Running Locally

```bash
# Clone the repo
git clone https://github.com/PKWilliams101/Cognitive_Firewall.git
cd Cognitive_Firewall

# Install dependencies
cd Backend && npm install
cd ../frontend && npm install

# Set up environment variables
# Copy the example env files and fill them in:
#   Backend/.env.example  -> Backend/.env   (MONGO_URI, PORT, JWT_SECRET, CLIENT_URL)
#   frontend/.env.example -> frontend/.env  (REACT_APP_API_URL)

# Run both servers
cd ../Backend && npm run dev    # Backend on :5000
cd ../frontend && npm start     # Frontend on :3000
```

## Testing

The backend has an automated test suite (Jest + Supertest):

```bash
cd Backend && npm test
```

It covers the behavioural metrics engine (discipline score, revenge-risk
heat algorithm, impulsivity index) as unit tests, and the API's
authentication and authorization — including the per-user data isolation
(IDOR) guards — as integration tests. The integration tests run against a
dedicated `cognitive_firewall_test` database (created and dropped
automatically), so they never touch development or production data. A
local MongoDB instance must be running.

## Deployment

The app deploys with the frontend on **Vercel** and the backend (Express +
MongoDB) on **Render** with the database on **MongoDB Atlas**. Config lives in
`frontend/vercel.json` and `render.yaml`; see **[DEPLOYMENT.md](DEPLOYMENT.md)**
for the full step-by-step.

## Background

This was my final year project for BSc Computer Science (Software Engineering) at Brunel University London (2025–2026). The concept came directly from personal experience as a trader — I'd been through prop firm challenges, taken a payout, and watched the same emotional patterns derail sessions over and over. I built the tool I wished existed.

## What's Next

- Session analytics dashboard — visualising trading patterns over time
- Configurable tilt thresholds — letting users set their own sensitivity levels
- Session history and journaling — reviewing past sessions to identify recurring patterns

## Author

**Patrick Williams**
- GitHub: [@PKWilliams101](https://github.com/PKWilliams101)
- LinkedIn: [patrick-williams00](https://linkedin.com/in/patrick-williams00)
