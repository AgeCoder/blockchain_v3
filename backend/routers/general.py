from fastapi import APIRouter, Depends, HTTPException
from dependencies import get_pubsub
from services.pubsub import PubSub

router = APIRouter()

PubSubDep = Depends(get_pubsub)

@router.get("/peers", status_code=200)
async def get_peers(pubsub: PubSub = PubSubDep):
    return list(pubsub.peer_nodes.keys())

@router.get("/", status_code=200)
async def get_status():
    return {"status": "ok"}

@router.get("/health")
async def health_check():
    return {"status": "healthy"}