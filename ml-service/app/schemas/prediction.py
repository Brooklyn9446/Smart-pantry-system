from typing import List, Optional, Literal
from pydantic import BaseModel, Field

class HistoricalReadingInput(BaseModel):
    timestamp: str = Field(..., description="ISO 8601 timestamp string")
    weightGrams: float = Field(..., ge=0, description="Measured weight in grams")

class QuantityEventInput(BaseModel):
    id: Optional[str] = None
    type: Literal["consumption", "refill"]
    amountGrams: float = Field(..., gt=0)
    previousWeightGrams: float = Field(..., ge=0)
    newWeightGrams: float = Field(..., ge=0)
    timestamp: str

class DepletionRequest(BaseModel):
    containerId: str = Field(default="container-01")
    currentQuantityGrams: float = Field(..., ge=0, description="Current net food quantity in grams")
    readings: List[HistoricalReadingInput] = Field(default_factory=list)
    events: Optional[List[QuantityEventInput]] = Field(default_factory=list)

class ProjectionPoint(BaseModel):
    timestamp: str
    weightGrams: float
    isProjection: bool = True

class DepletionResponse(BaseModel):
    status: Literal["success", "insufficient_data", "empty_container", "stable", "error"]
    containerId: str
    currentQuantityGrams: float
    dailyConsumptionRateGrams: Optional[float] = None
    estimatedRemainingDays: Optional[float] = None
    estimatedDepletionDate: Optional[str] = None
    confidence: Literal["insufficient", "low", "moderate", "good"]
    r2Score: Optional[float] = None
    maeGrams: Optional[float] = None
    dataQualityMessage: str
    projections: List[ProjectionPoint] = Field(default_factory=list)
    lastCalculated: str
