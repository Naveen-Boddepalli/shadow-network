import pytest
from fastapi.testclient import TestClient
import sys
import os

# Add parent directory to sys.path to allow importing main
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app

client = TestClient(app)

def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["service"] == "Shadow Network AI Engine"

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert "status" in response.json()
