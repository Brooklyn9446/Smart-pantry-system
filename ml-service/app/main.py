import os
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .schemas.prediction import DepletionRequest, DepletionResponse
from .services.depletion_model import predictor

app = FastAPI(
    title="Smart Pantry ML Depletion Prediction API",
    description="Refill-aware Linear Regression depletion and shelf-life prediction service.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "smart-pantry-ml-prediction",
        "model": "linear-regression-refill-aware",
    }

@app.get("/", tags=["Info"])
def root_info():
    return {
        "name": "Smart Pantry ML Depletion Prediction API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "prediction_endpoint": "/predict/depletion",
    }

@app.post("/predict/depletion", response_model=DepletionResponse, tags=["Prediction"])
def predict_depletion(request: DepletionRequest):
    try:
        response = predictor.predict(request)
        return response
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction calculation failed: {str(e)}",
        )

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
