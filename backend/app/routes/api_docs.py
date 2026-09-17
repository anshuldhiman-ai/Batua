"""API documentation route with enhanced examples and usage information."""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class APIEndpoint(BaseModel):
    """Model for API endpoint documentation."""
    method: str
    path: str
    description: str
    example_request: dict | None = None
    example_response: dict | None = None
    notes: str = ""


@router.get("/docs", response_model=dict)
async def api_documentation():
    """Comprehensive API documentation with examples."""
    return {
        "title": "Batua API Documentation",
        "version": "1.0.0",
        "description": "REST API for Batua personal finance manager",
        "base_url": "/api",
        "endpoints": {
            "health": {
                "endpoints": [
                    {
                        "method": "GET",
                        "path": "/",
                        "description": "Health check with dependency status",
                        "example_response": {
                            "app": "Batua",
                            "status": "healthy",
                            "storage": "sqlite",
                            "ai": True,
                            "ai_model": "gemini-2.5-flash",
                            "dependencies": {
                                "storage": "healthy",
                                "ml_nlp": "healthy",
                                "ml_analytics": "healthy",
                                "local_llm": "unavailable",
                                "excel_loader": "healthy",
                                "transcription": "healthy"
                            },
                            "version": "1.0.0"
                        },
                        "notes": "Use this endpoint to check if the API is running and which dependencies are available"
                    },
                    {
                        "method": "GET",
                        "path": "/ready",
                        "description": "Readiness check for container orchestration",
                        "example_response": {
                            "status": "ready"
                        },
                        "notes": "Returns 'ready' if the API can serve traffic, 'not_ready' otherwise"
                    }
                ]
            },
            "transactions": {
                "description": "CRUD operations for financial transactions",
                "endpoints": [
                    {
                        "method": "GET",
                        "path": "/transactions",
                        "description": "List all transactions with optional filtering",
                        "example_request": {
                            "month": "2026-06",
                            "category": "Food Delivery",
                            "search": "zomato"
                        },
                        "example_response": {
                            "transactions": [
                                {
                                    "id": "txn_1234567890",
                                    "date": "2026-06-19",
                                    "description": "Zomato",
                                    "amount": -450.0,
                                    "category": "Food Delivery",
                                    "payment_method": "UPI",
                                    "quantity": 1,
                                    "price": 450.0,
                                    "txn_type": "debit",
                                    "notes": "Dinner with friends"
                                }
                            ],
                            "total": 1
                        },
                        "notes": "Supports filtering by month, category, and search terms"
                    },
                    {
                        "method": "POST",
                        "path": "/transactions",
                        "description": "Create a new transaction",
                        "example_request": {
                            "date": "2026-06-19",
                            "description": "Zomato",
                            "amount": -450.0,
                            "category": "Food Delivery",
                            "payment_method": "UPI",
                            "quantity": 1,
                            "price": 450.0,
                            "notes": "Dinner with friends"
                        },
                        "example_response": {
                            "id": "txn_1234567890",
                            "date": "2026-06-19",
                            "description": "Zomato",
                            "amount": -450.0,
                            "category": "Food Delivery",
                            "payment_method": "UPI",
                            "quantity": 1,
                            "price": 450.0,
                            "txn_type": "debit",
                            "notes": "Dinner with friends",
                            "created_at": "2026-06-19T10:30:00Z"
                        },
                        "notes": "Amount should be negative for expenses, positive for income"
                    },
                    {
                        "method": "PUT",
                        "path": "/transactions/{txn_id}",
                        "description": "Update an existing transaction",
                        "example_request": {
                            "amount": -500.0,
                            "notes": "Updated amount"
                        },
                        "example_response": {
                            "id": "txn_1234567890",
                            "date": "2026-06-19",
                            "description": "Zomato",
                            "amount": -500.0,
                            "category": "Food Delivery",
                            "payment_method": "UPI",
                            "quantity": 1,
                            "price": 500.0,
                            "txn_type": "debit",
                            "notes": "Updated amount"
                        },
                        "notes": "Only include fields you want to update"
                    },
                    {
                        "method": "DELETE",
                        "path": "/transactions/{txn_id}",
                        "description": "Delete a transaction",
                        "example_response": {
                            "success": True,
                            "deleted_id": "txn_1234567890"
                        },
                        "notes": "Permanently removes the transaction"
                    }
                ]
            },
            "nl_parse": {
                "description": "Natural language transaction parsing",
                "endpoints": [
                    {
                        "method": "POST",
                        "path": "/nl-parse",
                        "description": "Parse natural language input into structured transaction",
                        "example_request": {
                            "text": "zomato 450 yesterday upi",
                            "force_recurring": False
                        },
                        "example_response": {
                            "description": "Zomato",
                            "amount": -450.0,
                            "category": "Food Delivery",
                            "payment_method": "UPI",
                            "date": "2026-06-18",
                            "quantity": 1,
                            "price": 450.0,
                            "txn_type": "debit",
                            "kind": "single",
                            "notes": ""
                        },
                        "notes": "Supports various formats: 'zomato 450 upi', 'salary +5k credit', 'rent -15000 monthly'"
                    },
                    {
                        "method": "POST",
                        "path": "/nl-parse/bulk",
                        "description": "Parse multiple transactions from multiline text",
                        "example_request": {
                            "text": "zomato 450 upi\nswiggy 320 credit card\nsalary +50000 credit"
                        },
                        "example_response": {
                            "items": [
                                {
                                    "description": "Zomato",
                                    "amount": -450.0,
                                    "category": "Food Delivery",
                                    "payment_method": "UPI",
                                    "kind": "single"
                                },
                                {
                                    "description": "Swiggy",
                                    "amount": -320.0,
                                    "category": "Food Delivery",
                                    "payment_method": "Credit Card",
                                    "kind": "single"
                                },
                                {
                                    "description": "Salary",
                                    "amount": 50000.0,
                                    "category": "Income",
                                    "payment_method": "",
                                    "kind": "single"
                                }
                            ]
                        },
                        "notes": "Each line is treated as a separate transaction"
                    }
                ]
            },
            "analytics": {
                "description": "Financial analytics and insights",
                "endpoints": [
                    {
                        "method": "GET",
                        "path": "/analytics/summary",
                        "description": "Get financial summary for a specific month",
                        "example_request": {
                            "month": "2026-06"
                        },
                        "example_response": {
                            "month": "2026-06",
                            "income": 85000.0,
                            "expense": 45000.0,
                            "net": 40000.0,
                            "savings_rate": 47.1,
                            "transaction_count": 45
                        },
                        "notes": "Returns income, expenses, net, and savings rate"
                    },
                    {
                        "method": "GET",
                        "path": "/analytics/category-breakdown",
                        "description": "Get spending breakdown by category",
                        "example_request": {
                            "month": "2026-06"
                        },
                        "example_response": {
                            "categories": [
                                {"category": "Food Delivery", "amount": 12000.0, "percentage": 26.7},
                                {"category": "Transportation", "amount": 8000.0, "percentage": 17.8},
                                {"category": "Groceries", "amount": 15000.0, "percentage": 33.3}
                            ]
                        },
                        "notes": "Useful for visualizing spending patterns"
                    }
                ]
            },
            "budgets": {
                "description": "Budget management",
                "endpoints": [
                    {
                        "method": "GET",
                        "path": "/budgets",
                        "description": "List all budgets",
                        "example_response": {
                            "budgets": [
                                {
                                    "id": "budget_1234567890",
                                    "category": "Food Delivery",
                                    "limit": 5000.0,
                                    "spent": 3200.0,
                                    "remaining": 1800.0,
                                    "health": "good"
                                }
                            ]
                        },
                        "notes": "Includes spending status and health indicators"
                    },
                    {
                        "method": "POST",
                        "path": "/budgets",
                        "description": "Create a new budget",
                        "example_request": {
                            "category": "Food Delivery",
                            "limit": 5000.0
                        },
                        "example_response": {
                            "id": "budget_1234567890",
                            "category": "Food Delivery",
                            "limit": 5000.0
                        },
                        "notes": "Budgets are tracked per category per month"
                    }
                ]
            },
            "goals": {
                "description": "Savings goals management",
                "endpoints": [
                    {
                        "method": "GET",
                        "path": "/goals",
                        "description": "List all savings goals",
                        "example_response": {
                            "goals": [
                                {
                                    "id": "goal_abc123def456",
                                    "name": "Emergency Fund",
                                    "target_amount": 100000.0,
                                    "current_amount": 25000.0,
                                    "target_date": "2026-12-31",
                                    "progress": 25.0,
                                    "status": "on_track"
                                }
                            ]
                        },
                        "notes": "Includes progress tracking and status"
                    },
                    {
                        "method": "POST",
                        "path": "/goals",
                        "description": "Create a new savings goal",
                        "example_request": {
                            "name": "Emergency Fund",
                            "target_amount": 100000.0,
                            "current_amount": 0.0,
                            "target_date": "2026-12-31"
                        },
                        "example_response": {
                            "id": "goal_abc123def456",
                            "name": "Emergency Fund",
                            "target_amount": 100000.0,
                            "current_amount": 0.0,
                            "target_date": "2026-12-31",
                            "created_at": "2026-06-19T10:30:00Z"
                        },
                        "notes": "Target date must be in YYYY-MM-DD format"
                    }
                ]
            },
            "excel": {
                "description": "Excel/CSV import functionality",
                "endpoints": [
                    {
                        "method": "POST",
                        "path": "/excel/upload",
                        "description": "Upload and process Excel/CSV file",
                        "notes": "Requires multipart/form-data with file upload. Auto-detects columns and date formats",
                        "example_response": {
                            "success": True,
                            "imported_count": 150,
                            "errors": [],
                            "preview": [
                                {
                                    "date": "2026-06-15",
                                    "description": "Amazon",
                                    "amount": -2500.0,
                                    "category": "Shopping"
                                }
                            ]
                        }
                    }
                ]
            },
            "ml_features": {
                "description": "Machine learning features and insights",
                "endpoints": [
                    {
                        "method": "GET",
                        "path": "/ml/insights",
                        "description": "Get ML-powered financial insights",
                        "example_response": {
                            "anomalies": [
                                {
                                    "description": "Unusually high spending on Food Delivery",
                                    "amount": 3500.0,
                                    "date": "2026-06-15",
                                    "severity": "high"
                                }
                            ],
                            "recommendations": [
                                {
                                    "category": "Food Delivery",
                                    "suggestion": "Consider setting a lower budget limit",
                                    "potential_savings": 1500.0
                                }
                            ],
                            "forecast": {
                                "next_month_expense": 48000.0,
                                "confidence": 0.85
                            }
                        },
                        "notes": "Uses ML models for anomaly detection and forecasting"
                    }
                ]
            }
        },
        "common_errors": {
            "400": "Bad Request - Invalid input data",
            "404": "Not Found - Resource doesn't exist",
            "500": "Internal Server Error - Server error occurred"
        },
        "authentication": {
            "status": "Not implemented",
            "note": "Current version is single-user without authentication"
        },
        "rate_limiting": {
            "status": "Not implemented",
            "note": "No rate limiting in current version"
        }
    }


@router.get("/docs/quickstart")
async def quickstart_guide():
    """Quick start guide for API usage."""
    return {
        "title": "Batua API Quick Start",
        "getting_started": [
            "1. Check API health: GET /api/",
            "2. Parse a transaction: POST /api/nl-parse with {\"text\": \"zomato 450 upi\"}",
            "3. Create transaction: POST /api/transactions with parsed data",
            "4. Get analytics: GET /api/analytics/summary?month=2026-06",
            "5. Set budget: POST /api/budgets with {\"category\": \"Food Delivery\", \"limit\": 5000}"
        ],
        "example_workflow": {
            "step_1": {
                "description": "Parse natural language input",
                "request": {
                    "method": "POST",
                    "url": "/api/nl-parse",
                    "body": {
                        "text": "zomato 450 yesterday upi"
                    }
                }
            },
            "step_2": {
                "description": "Create the transaction",
                "request": {
                    "method": "POST",
                    "url": "/api/transactions",
                    "body": {
                        "date": "2026-06-18",
                        "description": "Zomato",
                        "amount": -450.0,
                        "category": "Food Delivery",
                        "payment_method": "UPI"
                    }
                }
            },
            "step_3": {
                "description": "View updated analytics",
                "request": {
                    "method": "GET",
                    "url": "/api/analytics/summary?month=2026-06"
                }
            }
        },
        "natural_language_examples": [
            "zomato 450 yesterday upi",
            "salary +50000 credit",
            "rent -15000 monthly",
            "swiggy 320 credit card dinner",
            "petrol 1200 hdfc",
            "groceries 2500 bigbasket"
        ],
        "tips": [
            "Use negative amounts for expenses, positive for income",
            "Date format should be YYYY-MM-DD",
            "Categories are auto-detected but can be overridden",
            "Payment methods are optional but recommended",
            "Use the /nl-parse endpoint for automatic parsing"
        ]
    }