"""LangGraph Agent for Personal Accountant"""
import os
import json
import re
from datetime import datetime
from typing import Dict, Any, List, Optional, Literal
from dotenv import load_dotenv

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite import SqliteSaver
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage

import httpx

from agent.state import AgentState, UserProfile, FinancialSnapshot, Transaction, Account
from agent.tools import TOOLS, add_transaction, update_balance, generate_report, export_csv, detect_anomalies, tax_estimate

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

MODELS = [
    "x-ai/grok-4.1-fast",
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3-opus"
]

SYSTEM_PROMPT = """You are an expert personal accountant AI assistant. You help users track their finances using a double-entry ledger system with precision and clarity.

## YOUR CAPABILITIES
- Parse natural language transactions with 100% accuracy
- Maintain double-entry bookkeeping (every transaction has a debit AND credit)
- Track cost basis for investments and crypto assets
- Provide real-time tax estimates and financial insights
- Generate spending analysis and detect anomalies

## TRANSACTION PARSING RULES

### Expenses (money going out)
When user says "Paid $X for Y with Z":
- Debit: Expense account (e.g., "Groceries", "Dining", "Transport")
- Credit: Payment account (e.g., "Chase Checking", "Amex Card")
- Category: "expense"

Examples:
- "Paid $50 for dinner" → debit Dining, credit Cash, amount 50
- "Spent $127.43 on groceries with Chase" → debit Groceries, credit Chase Checking, amount 127.43
- "$30 Uber ride" → debit Transport, credit Cash, amount 30

### Income (money coming in)
When user says "Received $X from Y":
- Debit: Bank/Cash account (receiving money)
- Credit: Income source account
- Category: "income"

Examples:
- "Got $5000 salary" → debit Checking, credit Salary, amount 5000
- "Received $200 dividend" → debit Brokerage, credit Dividends, amount 200

### Investments & Crypto
When user says "Bought/Sold X shares/coins":
- Track: quantity, cost_basis, asset_type
- For buys: debit Investment account, credit Cash
- For sells: debit Cash, credit Investment account (calculate gains)

Examples:
- "Bought 10 AAPL at $175" → debit AAPL Stock, credit Brokerage Cash, amount 1750, quantity 10, cost_basis 175, asset_type "stock"
- "Sold 0.5 BTC for $21000" → debit Coinbase, credit Bitcoin, amount 21000, quantity 0.5, asset_type "crypto"

### Transfers
When moving money between accounts:
- Debit: Receiving account
- Credit: Sending account
- Category: "transfer"

## RESPONSE FORMAT
After recording a transaction, confirm it briefly and show the financial snapshot that's automatically appended.

For questions and analysis, provide clear, actionable insights.

## IMPORTANT RULES
1. ALWAYS use the add_transaction tool for any financial transaction
2. Parse amounts accurately - handle $X, X dollars, X.XX formats
3. Infer reasonable account names from context
4. Ask for clarification only if truly ambiguous
5. Be conversational but precise
6. Never hallucinate transactions - only record what user explicitly mentions

## AVAILABLE TOOLS
- add_transaction: Record a new double-entry transaction
- update_balance: Set account balance directly (for reconciliation)
- generate_report: Create financial summaries
- export_csv: Export transaction data
- detect_anomalies: Find unusual spending patterns
- tax_estimate: Calculate estimated tax liability"""

SETUP_QUESTIONS = [
    "What's your tax residency? (e.g., US - California, UK, Canada - Ontario)",
    "What's your filing status? (Single, Married Filing Jointly, Married Filing Separately, Head of Household)",
    "How many dependents do you claim?",
    "What are your income sources? (e.g., W-2 employment, 1099 contractor, business income, investments)",
    "What's your estimated annual income?",
    "What retirement accounts do you have? (e.g., 401k, IRA, Roth IRA, none)",
    "What investment accounts do you have? (e.g., brokerage, crypto exchanges, none)",
    "What's your primary bank?"
]


def create_default_state() -> AgentState:
    """Create a fresh agent state with defaults."""
    return {
        "messages": [],
        "user_profile": None,
        "transactions": [],
        "accounts": {},
        "snapshot": {
            "total_cash": 0.0,
            "total_investments": 0.0,
            "total_liabilities": 0.0,
            "net_worth": 0.0,
            "ytd_income": 0.0,
            "ytd_expenses": 0.0,
            "estimated_tax_liability": 0.0,
            "monthly_burn_rate": 0.0
        },
        "pending_sync": [],
        "setup_step": 0,
        "thread_id": "",
        "last_updated": datetime.utcnow().isoformat()
    }


async def call_openrouter(messages: List[Dict], tools: List[Dict] = None, model_index: int = 0) -> Dict:
    """Call OpenRouter API with fallback to alternative models."""
    if model_index >= len(MODELS):
        raise Exception("All models failed")
    
    model = MODELS[model_index]
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:3000"),
        "X-Title": os.getenv("OPENROUTER_APP_NAME", "PersonalAccountant")
    }
    
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 4096
    }
    
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Model {model} failed: {e}, trying next...")
            return await call_openrouter(messages, tools, model_index + 1)


def format_tools_for_api() -> List[Dict]:
    """Format LangChain tools for OpenRouter API."""
    formatted = []
    for tool in TOOLS:
        formatted.append({
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.args_schema.schema() if hasattr(tool, 'args_schema') else {}
            }
        })
    return formatted


def calculate_snapshot(state: AgentState) -> FinancialSnapshot:
    """Calculate current financial snapshot from accounts and transactions."""
    total_cash = 0.0
    total_investments = 0.0
    total_liabilities = 0.0
    ytd_income = 0.0
    ytd_expenses = 0.0
    
    current_year = datetime.now().year
    
    for name, account in state.get("accounts", {}).items():
        if account["type"] == "asset":
            if "invest" in name.lower() or "stock" in name.lower() or "crypto" in name.lower():
                total_investments += account["balance"]
            else:
                total_cash += account["balance"]
        elif account["type"] == "liability":
            total_liabilities += account["balance"]
    
    for tx in state.get("transactions", []):
        tx_date = datetime.fromisoformat(tx["timestamp"].replace("Z", ""))
        if tx_date.year == current_year:
            if tx["category"] == "income":
                ytd_income += tx["amount"]
            elif tx["category"] == "expense":
                ytd_expenses += tx["amount"]
    
    net_worth = total_cash + total_investments - total_liabilities
    
    # Simple tax estimate (simplified)
    taxable_income = ytd_income - ytd_expenses * 0.1  # Simplified deduction
    estimated_tax = taxable_income * 0.22 if taxable_income > 0 else 0  # Simplified 22% bracket
    
    # Monthly burn rate
    months_elapsed = max(1, datetime.now().month)
    monthly_burn = ytd_expenses / months_elapsed
    
    return {
        "total_cash": total_cash,
        "total_investments": total_investments,
        "total_liabilities": total_liabilities,
        "net_worth": net_worth,
        "ytd_income": ytd_income,
        "ytd_expenses": ytd_expenses,
        "estimated_tax_liability": estimated_tax,
        "monthly_burn_rate": monthly_burn
    }


async def handle_setup(state: AgentState) -> AgentState:
    """Handle initial setup questions."""
    setup_step = state.get("setup_step", 0)
    messages = state.get("messages", [])
    
    if setup_step < len(SETUP_QUESTIONS):
        # Check if user just answered a question
        if messages and messages[-1].get("role") == "user":
            # Store the answer and move to next question
            user_profile = state.get("user_profile") or {
                "tax_residency": "",
                "filing_status": "",
                "dependents": 0,
                "income_sources": [],
                "annual_income_estimate": 0.0,
                "retirement_accounts": [],
                "investment_accounts": [],
                "primary_bank": "",
                "setup_complete": False
            }
            
            answer = messages[-1].get("content", "")
            
            # Parse and store based on step
            if setup_step == 0:
                user_profile["tax_residency"] = answer
            elif setup_step == 1:
                user_profile["filing_status"] = answer
            elif setup_step == 2:
                try:
                    user_profile["dependents"] = int(re.search(r'\d+', answer).group()) if re.search(r'\d+', answer) else 0
                except:
                    user_profile["dependents"] = 0
            elif setup_step == 3:
                user_profile["income_sources"] = [s.strip() for s in answer.split(",")]
            elif setup_step == 4:
                try:
                    # Extract number from answer
                    num = re.sub(r'[^\d.]', '', answer)
                    user_profile["annual_income_estimate"] = float(num) if num else 0.0
                except:
                    user_profile["annual_income_estimate"] = 0.0
            elif setup_step == 5:
                user_profile["retirement_accounts"] = [s.strip() for s in answer.split(",")]
            elif setup_step == 6:
                user_profile["investment_accounts"] = [s.strip() for s in answer.split(",")]
            elif setup_step == 7:
                user_profile["primary_bank"] = answer
                user_profile["setup_complete"] = True
            
            state["user_profile"] = user_profile
            state["setup_step"] = setup_step + 1
            
            # Add next question or completion message
            if setup_step + 1 < len(SETUP_QUESTIONS):
                messages.append({
                    "role": "assistant",
                    "content": f"Got it! {SETUP_QUESTIONS[setup_step + 1]}"
                })
            else:
                messages.append({
                    "role": "assistant",
                    "content": "✅ Setup complete! I've recorded your financial profile. You can now start tracking transactions. Try saying something like 'Paid $50 for dinner at Restaurant with Chase card' or 'Received $5000 salary deposit'."
                })
        else:
            # First interaction - ask first question
            messages.append({
                "role": "assistant",
                "content": f"👋 Welcome to your Personal Accountant! Let me set up your profile.\n\n{SETUP_QUESTIONS[0]}"
            })
    
    state["messages"] = messages
    return state


async def process_message(state: AgentState) -> AgentState:
    """Process user message with LLM and tools."""
    messages = state.get("messages", [])
    
    # Build context for LLM
    api_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    # Add user profile context
    if state.get("user_profile"):
        profile = state["user_profile"]
        profile_context = f"""
USER PROFILE:
- Tax Residency: {profile.get('tax_residency', 'Unknown')}
- Filing Status: {profile.get('filing_status', 'Unknown')}
- Dependents: {profile.get('dependents', 0)}
- Income Sources: {', '.join(profile.get('income_sources', []))}
- Annual Income Estimate: ${profile.get('annual_income_estimate', 0):,.2f}
- Retirement Accounts: {', '.join(profile.get('retirement_accounts', []))}
- Investment Accounts: {', '.join(profile.get('investment_accounts', []))}
- Primary Bank: {profile.get('primary_bank', 'Unknown')}
"""
        api_messages.append({"role": "system", "content": profile_context})
    
    # Add current snapshot context
    snapshot = calculate_snapshot(state)
    state["snapshot"] = snapshot
    snapshot_context = f"""
CURRENT SNAPSHOT:
- Total Cash: ${snapshot['total_cash']:,.2f}
- Total Investments: ${snapshot['total_investments']:,.2f}
- Total Liabilities: ${snapshot['total_liabilities']:,.2f}
- Net Worth: ${snapshot['net_worth']:,.2f}
- YTD Income: ${snapshot['ytd_income']:,.2f}
- YTD Expenses: ${snapshot['ytd_expenses']:,.2f}
- Est. Tax Liability: ${snapshot['estimated_tax_liability']:,.2f}
- Monthly Burn Rate: ${snapshot['monthly_burn_rate']:,.2f}
"""
    api_messages.append({"role": "system", "content": snapshot_context})
    
    # Add accounts context
    if state.get("accounts"):
        accounts_list = "\n".join([f"- {name}: ${acc['balance']:,.2f} ({acc['type']})" 
                                   for name, acc in state["accounts"].items()])
        api_messages.append({"role": "system", "content": f"ACCOUNTS:\n{accounts_list}"})
    
    # Add recent transactions
    recent_txs = state.get("transactions", [])[-10:]
    if recent_txs:
        tx_list = "\n".join([f"- {tx['timestamp'][:10]}: {tx['description']} - ${tx['amount']:,.2f}" 
                            for tx in recent_txs])
        api_messages.append({"role": "system", "content": f"RECENT TRANSACTIONS:\n{tx_list}"})
    
    # Add conversation history
    for msg in messages[-20:]:  # Last 20 messages for context
        api_messages.append({"role": msg["role"], "content": msg["content"]})
    
    # Call LLM
    tools = format_tools_for_api()
    response = await call_openrouter(api_messages, tools)
    
    # Process response
    choice = response.get("choices", [{}])[0]
    message = choice.get("message", {})
    
    # Handle tool calls
    if message.get("tool_calls"):
        for tool_call in message["tool_calls"]:
            func_name = tool_call["function"]["name"]
            func_args = json.loads(tool_call["function"]["arguments"])
            
            # Execute tool
            result = None
            if func_name == "add_transaction":
                result = add_transaction.invoke(func_args)
                if result.get("success"):
                    tx = result["transaction"]
                    state["transactions"].append(tx)
                    
                    # Update accounts
                    from_acc = func_args["account_from"]
                    to_acc = func_args["account_to"]
                    amount = func_args["amount"]
                    
                    if from_acc not in state["accounts"]:
                        state["accounts"][from_acc] = {"name": from_acc, "type": "asset", "balance": 0, "currency": "USD"}
                    if to_acc not in state["accounts"]:
                        acc_type = "expense" if func_args.get("category") == "expense" else "asset"
                        state["accounts"][to_acc] = {"name": to_acc, "type": acc_type, "balance": 0, "currency": "USD"}
                    
                    state["accounts"][from_acc]["balance"] -= amount
                    state["accounts"][to_acc]["balance"] += amount
                    
            elif func_name == "update_balance":
                result = update_balance.invoke(func_args)
                if result.get("success"):
                    acc = result["account"]
                    state["accounts"][acc["name"]] = acc
                    
            elif func_name == "generate_report":
                result = generate_report.invoke(func_args)
            elif func_name == "export_csv":
                result = export_csv.invoke(func_args)
            elif func_name == "detect_anomalies":
                result = detect_anomalies.invoke(func_args)
            elif func_name == "tax_estimate":
                result = tax_estimate.invoke(func_args)
            
            # Add tool result to context
            api_messages.append(message)
            api_messages.append({
                "role": "tool",
                "tool_call_id": tool_call["id"],
                "content": json.dumps(result)
            })
        
        # Get final response after tool execution
        response = await call_openrouter(api_messages)
        message = response.get("choices", [{}])[0].get("message", {})
    
    # Add assistant response
    assistant_content = message.get("content", "I apologize, but I couldn't process that. Could you rephrase?")
    
    # Append snapshot to response
    snapshot = calculate_snapshot(state)
    state["snapshot"] = snapshot
    snapshot_display = f"\n\n💰 Cash: ${snapshot['total_cash']:,.2f} | 📈 Investments: ${snapshot['total_investments']:,.2f} | 📊 Net Worth: ${snapshot['net_worth']:,.2f}\n📅 YTD: Income ${snapshot['ytd_income']:,.2f} / Expenses ${snapshot['ytd_expenses']:,.2f} | 🏛️ Est. Tax: ${snapshot['estimated_tax_liability']:,.2f}"
    
    messages.append({
        "role": "assistant",
        "content": assistant_content + snapshot_display
    })
    
    state["messages"] = messages
    state["last_updated"] = datetime.utcnow().isoformat()
    
    return state


def should_setup(state: AgentState) -> str:
    """Determine if we should run setup or process message."""
    profile = state.get("user_profile")
    if not profile or not profile.get("setup_complete"):
        return "setup"
    return "process"


def create_graph():
    """Create the LangGraph workflow."""
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("setup", handle_setup)
    workflow.add_node("process", process_message)
    
    # Add conditional edge from start
    workflow.add_conditional_edges(
        "__start__",
        should_setup,
        {
            "setup": "setup",
            "process": "process"
        }
    )
    
    # Both nodes end the graph
    workflow.add_edge("setup", END)
    workflow.add_edge("process", END)
    
    return workflow


import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

# Global checkpointer storage
_checkpointer = None
_compiled_graph = None

async def get_checkpointer():
    """Get async SQLite checkpointer for persistence."""
    global _checkpointer
    if _checkpointer is None:
        checkpoint_path = os.getenv("CHECKPOINT_PATH", "./data/checkpoints.db")
        os.makedirs(os.path.dirname(checkpoint_path) if os.path.dirname(checkpoint_path) else ".", exist_ok=True)
        conn = await aiosqlite.connect(checkpoint_path)
        _checkpointer = AsyncSqliteSaver(conn)
    return _checkpointer


async def get_compiled_graph():
    """Get or create the compiled graph."""
    global _compiled_graph
    if _compiled_graph is None:
        workflow = create_graph()
        checkpointer = await get_checkpointer()
        _compiled_graph = workflow.compile(checkpointer=checkpointer)
    return _compiled_graph
