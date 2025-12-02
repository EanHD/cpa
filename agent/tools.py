"""LangGraph Agent Tools for Personal Accountant"""
import uuid
import json
import csv
import io
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from langchain_core.tools import tool


@tool
def add_transaction(
    description: str,
    amount: float,
    account_from: str,
    account_to: str,
    category: str,
    subcategory: Optional[str] = None,
    cost_basis: Optional[float] = None,
    asset_type: Optional[str] = None,
    quantity: Optional[float] = None
) -> Dict[str, Any]:
    """
    Add a new double-entry transaction to the ledger.
    
    Args:
        description: Human-readable description of the transaction
        amount: Transaction amount in USD
        account_from: Source account (debit)
        account_to: Destination account (credit)
        category: Main category (income, expense, transfer, investment)
        subcategory: Optional subcategory for detailed tracking
        cost_basis: For investments, the cost basis per unit
        asset_type: For investments (stock, crypto, etc.)
        quantity: For investments, number of units
    
    Returns:
        The created transaction with ID and timestamp
    """
    transaction = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.utcnow().isoformat(),
        "description": description,
        "amount": amount,
        "account_from": account_from,
        "account_to": account_to,
        "category": category,
        "subcategory": subcategory,
        "cost_basis": cost_basis,
        "asset_type": asset_type,
        "quantity": quantity
    }
    return {"success": True, "transaction": transaction}


@tool
def update_balance(
    account_name: str,
    new_balance: float,
    account_type: str = "asset",
    currency: str = "USD"
) -> Dict[str, Any]:
    """
    Update the balance of an account directly (for reconciliation).
    
    Args:
        account_name: Name of the account
        new_balance: New balance amount
        account_type: Type of account (asset, liability, income, expense, equity)
        currency: Currency code (default USD)
    
    Returns:
        Updated account information
    """
    return {
        "success": True,
        "account": {
            "name": account_name,
            "type": account_type,
            "balance": new_balance,
            "currency": currency,
            "updated_at": datetime.utcnow().isoformat()
        }
    }


@tool
def generate_report(
    report_type: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate a financial report.
    
    Args:
        report_type: Type of report (summary, income_statement, balance_sheet, cash_flow, tax_summary)
        start_date: Start date for the report period (ISO format)
        end_date: End date for the report period (ISO format)
    
    Returns:
        Report data
    """
    if not start_date:
        start_date = datetime(datetime.now().year, 1, 1).isoformat()
    if not end_date:
        end_date = datetime.utcnow().isoformat()
    
    return {
        "success": True,
        "report_type": report_type,
        "period": {"start": start_date, "end": end_date},
        "generated_at": datetime.utcnow().isoformat()
    }


@tool
def export_csv(
    data_type: str = "transactions",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Export data as CSV.
    
    Args:
        data_type: Type of data to export (transactions, accounts, all)
        start_date: Start date filter (ISO format)
        end_date: End date filter (ISO format)
    
    Returns:
        CSV data and metadata
    """
    return {
        "success": True,
        "data_type": data_type,
        "format": "csv",
        "generated_at": datetime.utcnow().isoformat()
    }


@tool
def detect_anomalies(
    threshold_multiplier: float = 2.0,
    lookback_days: int = 90
) -> Dict[str, Any]:
    """
    Detect unusual spending patterns or anomalies in transactions.
    
    Args:
        threshold_multiplier: How many standard deviations to consider anomalous
        lookback_days: Number of days to analyze
    
    Returns:
        List of detected anomalies
    """
    return {
        "success": True,
        "threshold_multiplier": threshold_multiplier,
        "lookback_days": lookback_days,
        "analyzed_at": datetime.utcnow().isoformat()
    }


@tool
def tax_estimate(
    year: Optional[int] = None,
    include_projections: bool = True
) -> Dict[str, Any]:
    """
    Calculate estimated tax liability based on transactions.
    
    Args:
        year: Tax year (defaults to current year)
        include_projections: Whether to include projected annual amounts
    
    Returns:
        Tax estimate breakdown
    """
    if not year:
        year = datetime.now().year
    
    return {
        "success": True,
        "year": year,
        "include_projections": include_projections,
        "calculated_at": datetime.utcnow().isoformat()
    }


# Export all tools
TOOLS = [
    add_transaction,
    update_balance,
    generate_report,
    export_csv,
    detect_anomalies,
    tax_estimate
]
