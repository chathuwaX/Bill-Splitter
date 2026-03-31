"""
Demo seed script - creates 3 users, friendships, bills, and payments.
Run: python seed_demo.py
"""
import urllib.request
import urllib.error
import json

BASE = "http://localhost:8000/api"

def post(path, data, token=None):
    body = json.dumps(data).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        msg = json.loads(e.read())
        print(f"  [skip] {path}: {msg.get('detail', msg)}")
        return None

def get(path, token):
    headers = {"Authorization": f"Bearer {token}"}
    req = urllib.request.Request(f"{BASE}{path}", headers=headers)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

print("=== FriendBill Demo Seed ===\n")

# 1. Register users
print("Creating users...")
users = {}
for u in [
    {"username": "alice", "email": "alice@demo.com", "password": "demo1234", "full_name": "Alice Johnson"},
    {"username": "bob",   "email": "bob@demo.com",   "password": "demo1234", "full_name": "Bob Smith"},
    {"username": "carol", "email": "carol@demo.com", "password": "demo1234", "full_name": "Carol White"},
]:
    r = post("/auth/register", u)
    if r:
        users[u["username"]] = {"token": r["access_token"], "id": r["user"]["id"]}
        print(f"  ✓ {u['full_name']} (@{u['username']}) — id={r['user']['id']}")
    else:
        # Try login
        r = post("/auth/login", {"username": u["username"], "password": u["password"]})
        if r:
            users[u["username"]] = {"token": r["access_token"], "id": r["user"]["id"]}
            print(f"  ✓ {u['username']} (already exists, logged in)")

if len(users) < 3:
    print("Could not create/login all users. Aborting.")
    exit(1)

alice_tok = users["alice"]["token"]
bob_tok   = users["bob"]["token"]
carol_tok = users["carol"]["token"]
alice_id  = users["alice"]["id"]
bob_id    = users["bob"]["id"]
carol_id  = users["carol"]["id"]

# 2. Friend requests: alice→bob, alice→carol, bob→carol
print("\nSetting up friendships...")
post("/friends/request", {"username": "bob"},   alice_tok)
post("/friends/request", {"username": "carol"}, alice_tok)
post("/friends/request", {"username": "carol"}, bob_tok)

# Accept all pending requests
for tok, name in [(bob_tok, "bob"), (carol_tok, "carol")]:
    reqs = get("/friends/requests", tok)
    for r in reqs:
        res = post(f"/friends/accept/{r['id']}", {}, tok)
        if res:
            print(f"  ✓ {name} accepted friend request from {r['requester']['username']}")

# 3. Create bills
print("\nCreating bills...")

# Alice pays for dinner, splits with bob & carol
b1 = post("/bills/", {
    "title": "Dinner at KFC",
    "description": "Friday night dinner",
    "total_amount": 3600.00,
    "participant_ids": [bob_id, carol_id]
}, alice_tok)
if b1: print(f"  ✓ Bill: '{b1['title']}' — LKR {b1['total_amount']}")

# Bob pays for movie tickets, splits with alice
b2 = post("/bills/", {
    "title": "Movie Tickets",
    "description": "Avengers screening",
    "total_amount": 2400.00,
    "participant_ids": [alice_id]
}, bob_tok)
if b2: print(f"  ✓ Bill: '{b2['title']}' — LKR {b2['total_amount']}")

# Carol pays for groceries, splits with alice & bob
b3 = post("/bills/", {
    "title": "Grocery Run",
    "description": "Weekly groceries",
    "total_amount": 4500.00,
    "participant_ids": [alice_id, bob_id]
}, carol_tok)
if b3: print(f"  ✓ Bill: '{b3['title']}' — LKR {b3['total_amount']}")

# Alice pays for Uber, custom split
b4 = post("/bills/", {
    "title": "Uber Ride",
    "description": "Trip to the beach",
    "total_amount": 1800.00,
    "participant_ids": [bob_id, carol_id],
    "custom_splits": [
        {"user_id": alice_id, "amount_owed": 600.00},
        {"user_id": bob_id,   "amount_owed": 700.00},
        {"user_id": carol_id, "amount_owed": 500.00},
    ]
}, alice_tok)
if b4: print(f"  ✓ Bill: '{b4['title']}' (custom split) — LKR {b4['total_amount']}")

# 4. Accept some bills
print("\nAccepting bills...")
bills_alice = get("/bills/", alice_tok)
bills_bob   = get("/bills/", bob_tok)
bills_carol = get("/bills/", carol_tok)

for bill in bills_alice:
    p = next((x for x in bill["participants"] if x["user_id"] == alice_id), None)
    if p and p["status"] == "pending":
        post(f"/bills/{bill['id']}/accept", {}, alice_tok)
        print(f"  ✓ Alice accepted: '{bill['title']}'")

for bill in bills_bob:
    p = next((x for x in bill["participants"] if x["user_id"] == bob_id), None)
    if p and p["status"] == "pending":
        post(f"/bills/{bill['id']}/accept", {}, bob_tok)
        print(f"  ✓ Bob accepted: '{bill['title']}'")

# Carol leaves one bill pending for demo
accepted_carol = 0
for bill in bills_carol:
    p = next((x for x in bill["participants"] if x["user_id"] == carol_id), None)
    if p and p["status"] == "pending" and accepted_carol < 2:
        post(f"/bills/{bill['id']}/accept", {}, carol_tok)
        print(f"  ✓ Carol accepted: '{bill['title']}'")
        accepted_carol += 1

# 5. Bob sends a partial payment to alice
print("\nCreating payments...")
p1 = post("/payments/", {"payee_id": alice_id, "amount": 800.00, "note": "Partial for KFC dinner"}, bob_tok)
if p1: print(f"  ✓ Bob → Alice: LKR 800.00 (pending acceptance)")

# Alice accepts it
if p1:
    post(f"/payments/{p1['id']}/accept", {}, alice_tok)
    print(f"  ✓ Alice accepted Bob's payment")

# Carol sends payment to alice
p2 = post("/payments/", {"payee_id": alice_id, "amount": 500.00, "note": "For Uber ride"}, carol_tok)
if p2: print(f"  ✓ Carol → Alice: LKR 500.00 (awaiting acceptance)")

print("\n=== Demo data ready! ===")
print("\nLogin credentials:")
print("  alice / demo1234  (Alice Johnson)")
print("  bob   / demo1234  (Bob Smith)")
print("  carol / demo1234  (Carol White)")
print("\nOpen: http://localhost:5173")
