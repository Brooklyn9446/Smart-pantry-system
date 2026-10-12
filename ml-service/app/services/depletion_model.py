from datetime import datetime, timezone, timedelta
from typing import List, Tuple
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score, mean_absolute_error

from ..schemas.prediction import (
    DepletionRequest,
    DepletionResponse,
    ProjectionPoint,
    HistoricalReadingInput,
)

REFILL_THRESHOLD_GRAMS = 50.0
MIN_READINGS_COUNT = 3
MIN_SPAN_HOURS = 0.5  # Minimum 30 minutes span for preliminary calculations

class DepletionPredictor:
    @staticmethod
    def _parse_timestamp(iso_str: str) -> float:
        """Parses ISO timestamp into epoch seconds (UTC)."""
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.timestamp()

    @staticmethod
    def _format_timestamp(epoch_sec: float) -> str:
        """Formats epoch seconds into ISO 8601 string."""
        dt = datetime.fromtimestamp(epoch_sec, tz=timezone.utc)
        return dt.isoformat()

    def predict(self, request: DepletionRequest) -> DepletionResponse:
        now_dt = datetime.now(timezone.utc)
        now_epoch = now_dt.timestamp()
        now_iso = now_dt.isoformat()

        # Edge Case 1: Empty Container
        if request.currentQuantityGrams <= 0:
            return DepletionResponse(
                status="empty_container",
                containerId=request.containerId,
                currentQuantityGrams=0.0,
                dailyConsumptionRateGrams=0.0,
                estimatedRemainingDays=0.0,
                estimatedDepletionDate=now_iso,
                confidence="insufficient",
                dataQualityMessage="Pantry container is empty (0 g). No remaining days.",
                projections=[],
                lastCalculated=now_iso,
            )

        # 1. Filter and sort readings
        valid_readings: List[Tuple[float, float]] = []
        for r in request.readings:
            try:
                t = self._parse_timestamp(r.timestamp)
                w = float(r.weightGrams)
                if not np.isnan(w) and not np.isinf(w) and w >= 0:
                    valid_readings.append((t, w))
            except Exception:
                continue

        valid_readings.sort(key=lambda x: x[0])

        # Edge Case 2: Insufficient observation count
        if len(valid_readings) < MIN_READINGS_COUNT:
            return DepletionResponse(
                status="insufficient_data",
                containerId=request.containerId,
                currentQuantityGrams=round(request.currentQuantityGrams, 1),
                confidence="insufficient",
                dataQualityMessage=(
                    f"Not enough consumption data yet ({len(valid_readings)}/{MIN_READINGS_COUNT} readings). "
                    "Keep monitoring the item to generate a reliable depletion prediction."
                ),
                projections=[],
                lastCalculated=now_iso,
            )

        # 2. Check time span
        min_time = valid_readings[0][0]
        max_time = valid_readings[-1][0]
        span_hours = (max_time - min_time) / 3600.0

        if span_hours < MIN_SPAN_HOURS:
            return DepletionResponse(
                status="insufficient_data",
                containerId=request.containerId,
                currentQuantityGrams=round(request.currentQuantityGrams, 1),
                confidence="insufficient",
                dataQualityMessage=(
                    "Observation window is too short. Please allow more time for pantry consumption patterns to register."
                ),
                projections=[],
                lastCalculated=now_iso,
            )

        # 3. Refill-aware segmentation
        # Segment the data into continuous depletion segments where weight decreases or stays flat.
        segments: List[List[Tuple[float, float]]] = []
        current_segment = [valid_readings[0]]

        for i in range(1, len(valid_readings)):
            prev_t, prev_w = valid_readings[i - 1]
            curr_t, curr_w = valid_readings[i]

            # Detect refill boundary
            if curr_w - prev_w >= REFILL_THRESHOLD_GRAMS:
                if len(current_segment) > 0:
                    segments.append(current_segment)
                current_segment = [(curr_t, curr_w)]
            else:
                current_segment.append((curr_t, curr_w))

        if len(current_segment) > 0:
            segments.append(current_segment)

        # 4. Construct cumulative consumption series X (elapsed active days) vs Y (grams consumed)
        x_days: List[float] = []
        y_consumed: List[float] = []
        cumulative_consumed = 0.0
        cumulative_time_sec = 0.0

        for seg in segments:
            if len(seg) < 2:
                continue
            seg_start_t = seg[0][0]
            seg_start_w = seg[0][1]

            for t, w in seg:
                dt = t - seg_start_t
                dw = max(0.0, seg_start_w - w)
                total_t_days = (cumulative_time_sec + dt) / 86400.0
                total_w_grams = cumulative_consumed + dw
                x_days.append(total_t_days)
                y_consumed.append(total_w_grams)

            cumulative_time_sec += seg[-1][0] - seg_start_t
            cumulative_consumed += max(0.0, seg_start_w - seg[-1][1])

        # If after segmentation no cumulative consumption was recorded
        if len(x_days) < 2 or cumulative_consumed < 10.0:
            return DepletionResponse(
                status="stable",
                containerId=request.containerId,
                currentQuantityGrams=round(request.currentQuantityGrams, 1),
                dailyConsumptionRateGrams=0.0,
                confidence="insufficient",
                dataQualityMessage="Stable quantity: No measurable food consumption detected across the monitored period.",
                projections=[],
                lastCalculated=now_iso,
            )

        # 5. Fit Scikit-Learn Linear Regression model
        X_arr = np.array(x_days).reshape(-1, 1)
        Y_arr = np.array(y_consumed)

        model = LinearRegression(fit_intercept=False)  # Cumulative consumption starts at 0 at t=0
        model.fit(X_arr, Y_arr)

        slope_daily_grams = float(model.coef_[0])  # Grams consumed per day

        # If slope is negative or virtually zero
        if slope_daily_grams <= 0.1:
            return DepletionResponse(
                status="stable",
                containerId=request.containerId,
                currentQuantityGrams=round(request.currentQuantityGrams, 1),
                dailyConsumptionRateGrams=0.0,
                confidence="insufficient",
                dataQualityMessage="Consumption rate is negligible or stable.",
                projections=[],
                lastCalculated=now_iso,
            )

        # Model evaluation
        y_pred = model.predict(X_arr)
        r2 = None
        mae = None
        if len(Y_arr) >= 3 and np.var(Y_arr) > 1e-4:
            r2 = float(np.clip(r2_score(Y_arr, y_pred), -1.0, 1.0))
            mae = float(mean_absolute_error(Y_arr, y_pred))

        # 6. Depletion estimation
        remaining_days = float(request.currentQuantityGrams / slope_daily_grams)
        depletion_epoch = now_epoch + remaining_days * 86400.0
        depletion_iso = self._format_timestamp(depletion_epoch)

        # 7. Confidence & Data Quality Classification
        confidence = "low"
        if span_hours >= 48.0 and len(valid_readings) >= 6 and (r2 is not None and r2 >= 0.70):
            confidence = "good"
            quality_msg = "High confidence: Multi-day linear depletion trend with strong statistical fit."
        elif span_hours >= 12.0 and len(valid_readings) >= 4 and (r2 is None or r2 >= 0.40):
            confidence = "moderate"
            quality_msg = "Moderate confidence: Stable consumption rate observed across multiple hours."
        else:
            confidence = "low"
            quality_msg = "Preliminary estimate with limited observation span. Accuracy will improve with further data."

        # 8. Generate future projection trajectory points (5 points from now to depletion)
        projections: List[ProjectionPoint] = []
        steps = 5
        for s in range(steps + 1):
            fraction = s / steps
            proj_t_epoch = now_epoch + fraction * (remaining_days * 86400.0)
            proj_w = max(0.0, round(request.currentQuantityGrams * (1.0 - fraction), 1))
            projections.append(
                ProjectionPoint(
                    timestamp=self._format_timestamp(proj_t_epoch),
                    weightGrams=proj_w,
                    isProjection=True,
                )
            )

        return DepletionResponse(
            status="success",
            containerId=request.containerId,
            currentQuantityGrams=round(request.currentQuantityGrams, 1),
            dailyConsumptionRateGrams=round(slope_daily_grams, 1),
            estimatedRemainingDays=round(remaining_days, 1),
            estimatedDepletionDate=depletion_iso,
            confidence=confidence,
            r2Score=round(r2, 3) if r2 is not None else None,
            maeGrams=round(mae, 1) if mae is not None else None,
            dataQualityMessage=quality_msg,
            projections=projections,
            lastCalculated=now_iso,
        )

predictor = DepletionPredictor()
