"""LangGraph Agent State Definition"""
from typing import TypedDict, List, Optional, Dict, Any
from datetime import datetime


class Transaction(TypedDict):
    id: str
    timestamp: str
    description: str
    amount: float
    account_from: str
    account_to: str
    category: str
    subcategory: Optional[str]
    cost_basis: Optional[float]
    asset_type: Optional[str]
    quantity: Optional[float]
    encrypted_data: Optional[str]


class Account(TypedDict):
    name: str
    type: str  # asset, liability, income, expense, equity
    balance: float
    currency: str


class UserProfile(TypedDict):
    tax_residency: str
    filing_status: str
    dependents: int
    income_sources: List[str]
    annual_income_estimate: float
    retirement_accounts: List[str]
    investment_accounts: List[str]
    primary_bank: str
    setup_complete: bool


class FinancialSnapshot(TypedDict):
    total_cash: float
    total_investments: float
    total_liabilities: float
    net_worth: float
    ytd_income: float
    ytd_expenses: float
    estimated_tax_liability: float
    monthly_burn_rate: float


class AgentState(TypedDict):
    messages: List[Dict[str, Any]]
    user_profile: Optional[UserProfile]
    transactions: List[Transaction]
    accounts: Dict[str, Account]
    snapshot: FinancialSnapshot
    pending_sync: List[Transaction]
    setup_step: int
    thread_id: str
    last_updated: str
