from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
from typing import List, Dict
import time

app = FastAPI(title="SecureChat Pro API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        # Store connections by username: {username: WebSocket}
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        self.active_connections[username] = websocket

    def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]

    async def broadcast(self, message: dict):
        """Send a message to everyone except the sender"""
        for user, connection in self.active_connections.items():
            try:
                await connection.send_json(message)
            except Exception:
                # Handle stale connections
                pass

    async def send_personal_message(self, message: dict, username: str):
        if username in self.active_connections:
            await self.active_connections[username].send_json(message)

manager = ConnectionManager()

@app.get("/")
async def get():
    return {
        "status": "online",
        "protocol": "wss",
        "version": "1.0.4",
        "encryption_supported": ["RSA-OAEP", "AES-GCM-256"]
    }

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(websocket, username)
    
    # Notify others that a new user joined
    await manager.broadcast({
        "type": "system",
        "sender": "System",
        "content": f"User {username} established a secure link.",
        "timestamp": time.time()
    })
    
    try:
        while True:
            # Receive data from client
            data = await websocket.receive_text()
            
            # The client might send raw text or JSON
            # In a real app, it would be a JSON payload: { "recipient": "...", "payload": "encrypted_blob" }
            
            # For this demo, we broadcast the message
            await manager.broadcast({
                "type": "message",
                "sender": username,
                "content": data,
                "timestamp": time.time()
            })
            
    except WebSocketDisconnect:
        manager.disconnect(username)
        await manager.broadcast({
            "type": "system",
            "sender": "System",
            "content": f"User {username} disconnected.",
            "timestamp": time.time()
        })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
