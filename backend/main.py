from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine
import models
from routers import auth, friends, bills, payments, notifications, debts

# Create all tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="FriendBill API", version="1.0.0", docs_url="/docs")

# CORS — allow both Vite dev ports
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(friends.router)
app.include_router(bills.router)
app.include_router(payments.router)
app.include_router(notifications.router)
app.include_router(debts.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "FriendBill API v1"}


@app.get("/health")
def health():
    return {"status": "healthy"}
