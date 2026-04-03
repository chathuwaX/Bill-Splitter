# FriendBill

FriendBill is a web application designed to help you and your friends easily track shared expenses, split bills, and manage debts. It automatically calculates who owes whom and merging logic to simplify settling up.

## Features
- User Authentication (Sign up, login, persistent sessions)
- Friends Management (Add friends to your account)
- Bill Splitting (Create a bill, specify who paid, and who was involved)
- Debt Tracking (Dashboard overview of total "To Receive" and "To Give")
- Debt Merging (Merge debts between two people to a single net balance)
- History (Detailed logs of all your transactions and merged balances)

## Project Structure
- `backend/`: FastAPI Python application with SQLite database
- `frontend/`: React & Vite application with styling using plain CSS

## Setup Prerequisites
1. Python 3.9+
2. Node.js 18+

## How to run locally

### 1. Backend Setup
```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On MacOS/Linux:
# source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```
The backend API will run on http://localhost:8000.

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
The frontend website will run on http://localhost:5173.

## Usage
- Open the frontend URL in your browser.
- Register for an account.
- Add some friends.
- Create bills and watch the balances update!
- Settle debits via the 'Merge' feature.
