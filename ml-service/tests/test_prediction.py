import sys
import os
from datetime import datetime, timezone, timedelta
from starlette.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.schemas.prediction import DepletionRequest, HistoricalReadingInput
from app.services.depletion_model import DepletionPredictor

client = TestClient(app)
predictor = DepletionPredictor()

def _make_iso(hours_ago: float) -> str:
    dt = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    return dt.isoformat()

class TestDepletionPrediction:
    def test_health_endpoint(self):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"

    def test_basic_decreasing_quantity(self):
        """Test 1: Linear decrease 3000g -> 2800g -> 2600g -> 2400g over 3 days."""
        readings = [
            HistoricalReadingInput(timestamp=_make_iso(72), weightGrams=3000.0),
            HistoricalReadingInput(timestamp=_make_iso(48), weightGrams=2800.0),
            HistoricalReadingInput(timestamp=_make_iso(24), weightGrams=2600.0),
            HistoricalReadingInput(timestamp=_make_iso(0), weightGrams=2400.0),
        ]
        req = DepletionRequest(
            containerId="container-01",
            currentQuantityGrams=2400.0,
            readings=readings,
        )
        res = predictor.predict(req)

        assert res.status == "success"
        assert res.dailyConsumptionRateGrams is not None
        assert 180.0 <= res.dailyConsumptionRateGrams <= 220.0  # ~200g/day
        assert res.estimatedRemainingDays is not None
        assert 10.0 <= res.estimatedRemainingDays <= 14.0  # 2400 / 200 ~ 12 days
        assert res.estimatedDepletionDate is not None
        assert len(res.projections) > 0

    def test_refill_handling(self):
        """Test 2: Refill 3000 -> 2800 -> 5000 -> 4700 -> 4400g over 4 days."""
        readings = [
            HistoricalReadingInput(timestamp=_make_iso(96), weightGrams=3000.0),
            HistoricalReadingInput(timestamp=_make_iso(72), weightGrams=2800.0),  # -200g (1 day)
            HistoricalReadingInput(timestamp=_make_iso(48), weightGrams=5000.0),  # +2200g refill
            HistoricalReadingInput(timestamp=_make_iso(24), weightGrams=4700.0),  # -300g (1 day)
            HistoricalReadingInput(timestamp=_make_iso(0), weightGrams=4400.0),   # -300g (1 day)
        ]
        req = DepletionRequest(
            containerId="container-01",
            currentQuantityGrams=4400.0,
            readings=readings,
        )
        res = predictor.predict(req)

        assert res.status == "success"
        # Total consumption is 200 + 300 + 300 = 800g over active days, not treating 5000 as negative consumption
        assert res.dailyConsumptionRateGrams is not None
        assert res.dailyConsumptionRateGrams > 0
        assert res.estimatedRemainingDays is not None
        assert res.estimatedRemainingDays > 5.0

    def test_insufficient_data(self):
        """Test 3: Fewer than 3 readings or too short span."""
        readings = [
            HistoricalReadingInput(timestamp=_make_iso(0.1), weightGrams=2500.0),
            HistoricalReadingInput(timestamp=_make_iso(0), weightGrams=2400.0),
        ]
        req = DepletionRequest(
            containerId="container-01",
            currentQuantityGrams=2400.0,
            readings=readings,
        )
        res = predictor.predict(req)
        assert res.status == "insufficient_data"
        assert res.confidence == "insufficient"
        assert "Not enough consumption data yet" in res.dataQualityMessage

    def test_zero_quantity(self):
        """Test 4: Empty container."""
        readings = [
            HistoricalReadingInput(timestamp=_make_iso(24), weightGrams=500.0),
            HistoricalReadingInput(timestamp=_make_iso(12), weightGrams=200.0),
            HistoricalReadingInput(timestamp=_make_iso(0), weightGrams=0.0),
        ]
        req = DepletionRequest(
            containerId="container-01",
            currentQuantityGrams=0.0,
            readings=readings,
        )
        res = predictor.predict(req)
        assert res.status == "empty_container"
        assert res.estimatedRemainingDays == 0.0

    def test_stable_quantity_sensor_noise(self):
        """Test 6: Sensor noise (2500 -> 2498 -> 2501 -> 2499)."""
        readings = [
            HistoricalReadingInput(timestamp=_make_iso(48), weightGrams=2500.0),
            HistoricalReadingInput(timestamp=_make_iso(36), weightGrams=2498.0),
            HistoricalReadingInput(timestamp=_make_iso(24), weightGrams=2501.0),
            HistoricalReadingInput(timestamp=_make_iso(0), weightGrams=2499.0),
        ]
        req = DepletionRequest(
            containerId="container-01",
            currentQuantityGrams=2499.0,
            readings=readings,
        )
        res = predictor.predict(req)
        assert res.status == "stable"
        assert res.confidence == "insufficient"
        assert res.dailyConsumptionRateGrams == 0.0

    def test_fastapi_endpoint_post(self):
        """Test 8: API HTTP POST validation."""
        payload = {
            "containerId": "container-01",
            "currentQuantityGrams": 2000.0,
            "readings": [
                {"timestamp": _make_iso(48), "weightGrams": 2400.0},
                {"timestamp": _make_iso(24), "weightGrams": 2200.0},
                {"timestamp": _make_iso(0), "weightGrams": 2000.0},
            ],
        }
        res = client.post("/predict/depletion", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert data["estimatedRemainingDays"] is not None
        assert data["confidence"] in ["low", "moderate", "good"]
