"""FastAPI Backend for Personal Accountant"""
import os
import json
import csv
import io
import sqlite3
from datetime import datetime
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from cryptography.fernet import Fernet
from dotenv import load_dotenv

import sys
sys.path.insert(0, '/app')

from agent.graph import get_compiled_graph, create_default_state, calculate_snapshot
from agent.state import AgentState

load_dotenv()

# Encryption setup
FERNET_KEY = os.getenv("FERNET_KEY")
if FERNET_KEY:
    fernet = Fernet(FERNET_KEY.encode() if isinstance(FERNET_KEY, str) else FERNET_KEY)
else:
    fernet = None

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/accountant.db")


def init_db():
    """Initialize SQLite database."""
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # User sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            thread_id TEXT PRIMARY KEY,
            state_data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    
    # Transactions table (for querying)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            account_from TEXT NOT NULL,
            account_to TEXT NOT NULL,
            category TEXT NOT NULL,
            subcategory TEXT,
            cost_basis REAL,
            asset_type TEXT,
            quantity REAL,
            encrypted_data TEXT,
            FOREIGN KEY (thread_id) REFERENCES sessions(thread_id)
        )
    """)
    
    # Accounts table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            balance REAL NOT NULL,
            currency TEXT DEFAULT 'USD',
            FOREIGN KEY (thread_id) REFERENCES sessions(thread_id),
            UNIQUE(thread_id, name)
        )
    """)
    
    conn.commit()
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    init_db()
    yield


app = FastAPI(
    title="Personal Accountant API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MessageRequest(BaseModel):
    thread_id: str
    message: str
    encrypted: bool = False


class SyncRequest(BaseModel):
    thread_id: str
    transactions: List[Dict[str, Any]]
    accounts: Dict[str, Any]


def encrypt_data(data: str) -> str:
    """Encrypt data using Fernet."""
    if fernet:
        return fernet.encrypt(data.encode()).decode()
    return data


def decrypt_data(data: str) -> str:
    """Decrypt data using Fernet."""
    if fernet:
        return fernet.decrypt(data.encode()).decode()
    return data


def save_state(thread_id: str, state: Dict):
    """Save state to SQLite."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    state_json = json.dumps(state)
    encrypted_state = encrypt_data(state_json)
    now = datetime.utcnow().isoformat()
    
    cursor.execute("""
        INSERT OR REPLACE INTO sessions (thread_id, state_data, created_at, updated_at)
        VALUES (?, ?, COALESCE((SELECT created_at FROM sessions WHERE thread_id = ?), ?), ?)
    """, (thread_id, encrypted_state, thread_id, now, now))
    
    # Save transactions
    for tx in state.get("transactions", []):
        tx_json = json.dumps(tx)
        encrypted_tx = encrypt_data(tx_json)
        cursor.execute("""
            INSERT OR REPLACE INTO transactions 
            (id, thread_id, timestamp, description, amount, account_from, account_to, 
             category, subcategory, cost_basis, asset_type, quantity, encrypted_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            tx["id"], thread_id, tx["timestamp"], tx["description"], tx["amount"],
            tx["account_from"], tx["account_to"], tx["category"],
            tx.get("subcategory"), tx.get("cost_basis"), tx.get("asset_type"),
            tx.get("quantity"), encrypted_tx
        ))
    
    # Save accounts
    for name, acc in state.get("accounts", {}).items():
        cursor.execute("""
            INSERT OR REPLACE INTO accounts (thread_id, name, type, balance, currency)
            VALUES (?, ?, ?, ?, ?)
        """, (thread_id, name, acc["type"], acc["balance"], acc.get("currency", "USD")))
    
    conn.commit()
    conn.close()


def load_state(thread_id: str) -> Optional[Dict]:
    """Load state from SQLite."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT state_data FROM sessions WHERE thread_id = ?", (thread_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        decrypted = decrypt_data(row[0])
        return json.loads(decrypted)
    return None


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.post("/chat")
async def chat(request: MessageRequest):
    """Process a chat message."""
    thread_id = request.thread_id
    user_message = request.message
    
    # Load or create state
    state = load_state(thread_id)
    if not state:
        state = create_default_state()
        state["thread_id"] = thread_id
    
    # Add user message
    state["messages"].append({
        "role": "user",
        "content": user_message
    })
    
    # Run through graph
    config = {"configurable": {"thread_id": thread_id}}
    
    try:
        graph = await get_compiled_graph()
        result = await graph.ainvoke(state, config)
        
        # Save updated state
        save_state(thread_id, result)
        
        # Get last assistant message
        messages = result.get("messages", [])
        last_message = messages[-1] if messages else {"role": "assistant", "content": "No response"}
        
        return {
            "response": last_message.get("content", ""),
            "snapshot": result.get("snapshot", {}),
            "setup_complete": result.get("user_profile", {}).get("setup_complete", False),
            "setup_step": result.get("setup_step", 0)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/state/{thread_id}")
async def get_state(thread_id: str):
    """Get current state for a thread."""
    state = load_state(thread_id)
    if not state:
        state = create_default_state()
        state["thread_id"] = thread_id
    
    # Calculate fresh snapshot
    state["snapshot"] = calculate_snapshot(state)
    
    return {
        "thread_id": thread_id,
        "snapshot": state.get("snapshot", {}),
        "user_profile": state.get("user_profile"),
        "accounts": state.get("accounts", {}),
        "transaction_count": len(state.get("transactions", [])),
        "setup_complete": state.get("user_profile", {}).get("setup_complete", False) if state.get("user_profile") else False
    }


@app.get("/transactions/{thread_id}")
async def get_transactions(thread_id: str, limit: int = 100, offset: int = 0):
    """Get transactions for a thread."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id, timestamp, description, amount, account_from, account_to, 
               category, subcategory, cost_basis, asset_type, quantity
        FROM transactions 
        WHERE thread_id = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
    """, (thread_id, limit, offset))
    
    rows = cursor.fetchall()
    conn.close()
    
    transactions = []
    for row in rows:
        transactions.append({
            "id": row[0],
            "timestamp": row[1],
            "description": row[2],
            "amount": row[3],
            "account_from": row[4],
            "account_to": row[5],
            "category": row[6],
            "subcategory": row[7],
            "cost_basis": row[8],
            "asset_type": row[9],
            "quantity": row[10]
        })
    
    return {"transactions": transactions, "count": len(transactions)}


@app.get("/export/{thread_id}")
async def export_csv_endpoint(thread_id: str):
    """Export all transactions as CSV."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id, timestamp, description, amount, account_from, account_to, 
               category, subcategory, cost_basis, asset_type, quantity
        FROM transactions 
        WHERE thread_id = ?
        ORDER BY timestamp DESC
    """, (thread_id,))
    
    rows = cursor.fetchall()
    conn.close()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Timestamp", "Description", "Amount", "Account From", "Account To",
        "Category", "Subcategory", "Cost Basis", "Asset Type", "Quantity"
    ])
    
    for row in rows:
        writer.writerow(row)
    
    output.seek(0)
    
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=ledger_{thread_id}_{datetime.now().strftime('%Y%m%d')}.csv"}
    )


@app.post("/sync")
async def sync_data(request: SyncRequest):
    """Sync offline data to server."""
    thread_id = request.thread_id
    
    # Load existing state
    state = load_state(thread_id)
    if not state:
        state = create_default_state()
        state["thread_id"] = thread_id
    
    # Merge transactions (avoid duplicates)
    existing_ids = {tx["id"] for tx in state.get("transactions", [])}
    for tx in request.transactions:
        if tx["id"] not in existing_ids:
            state["transactions"].append(tx)
    
    # Merge accounts (take latest balances)
    for name, acc in request.accounts.items():
        state["accounts"][name] = acc
    
    # Recalculate snapshot
    state["snapshot"] = calculate_snapshot(state)
    state["last_updated"] = datetime.utcnow().isoformat()
    
    # Save
    save_state(thread_id, state)
    
    return {
        "success": True,
        "snapshot": state["snapshot"],
        "transaction_count": len(state["transactions"])
    }


@app.get("/monthly-data/{thread_id}")
async def get_monthly_data(thread_id: str, year: Optional[int] = None):
    """Get monthly income/expense data for charts."""
    if not year:
        year = datetime.now().year
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # Get monthly totals
    cursor.execute("""
        SELECT 
            strftime('%m', timestamp) as month,
            category,
            SUM(amount) as total
        FROM transactions 
        WHERE thread_id = ? AND strftime('%Y', timestamp) = ?
        GROUP BY month, category
        ORDER BY month
    """, (thread_id, str(year)))
    
    rows = cursor.fetchall()
    conn.close()
    
    monthly_data = {str(i).zfill(2): {"income": 0, "expense": 0} for i in range(1, 13)}
    
    for row in rows:
        month, category, total = row
        if category == "income":
            monthly_data[month]["income"] = total
        elif category == "expense":
            monthly_data[month]["expense"] = total
    
    result = []
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    
    for i, name in enumerate(month_names, 1):
        month_key = str(i).zfill(2)
        result.append({
            "month": name,
            "income": monthly_data[month_key]["income"],
            "expenses": monthly_data[month_key]["expense"]
        })
    
    return {"data": result, "year": year}


# WebSocket for real-time updates
@app.websocket("/ws/{thread_id}")
async def websocket_endpoint(websocket: WebSocket, thread_id: str):
    """WebSocket for real-time chat."""
    await websocket.accept()
    
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Process message
            state = load_state(thread_id)
            if not state:
                state = create_default_state()
                state["thread_id"] = thread_id
            
            state["messages"].append({
                "role": "user",
                "content": message_data.get("message", "")
            })
            
            config = {"configurable": {"thread_id": thread_id}}
            graph = await get_compiled_graph()
            result = await graph.ainvoke(state, config)
            
            save_state(thread_id, result)
            
            messages = result.get("messages", [])
            last_message = messages[-1] if messages else {"role": "assistant", "content": "No response"}
            
            await websocket.send_json({
                "response": last_message.get("content", ""),
                "snapshot": result.get("snapshot", {}),
                "setup_complete": result.get("user_profile", {}).get("setup_complete", False)
            })
            
    except WebSocketDisconnect:
        pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
