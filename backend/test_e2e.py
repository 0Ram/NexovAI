import asyncio
import json
import websockets
import urllib.request

BASE_HTTP = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/ws/call"

def http_get(endpoint):
    req = urllib.request.Request(f"{BASE_HTTP}{endpoint}")
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())

def http_post(endpoint):
    req = urllib.request.Request(f"{BASE_HTTP}{endpoint}", data=b"", method="POST")
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())

async def run_e2e_verification():
    print("=== Step 1: Healthcheck and DB Reset ===")
    health = http_get("/api/health")
    print("Health:", health)
    reset = http_post("/api/reset")
    print("Reset:", reset)

    doctors = http_get("/api/doctors")
    print(f"Loaded {len(doctors['doctors'])} doctors.")
    slots = http_get("/api/slots")
    open_slots = [s for s in slots["slots"] if s["is_booked"] == 0]
    print(f"Total open slots: {len(open_slots)}")

    print("\n=== Step 2: Connect WebSocket Voice Session ===")
    async with websockets.connect(WS_URL) as ws:
        # Receive connection and greeting messages
        msg1 = json.loads(await ws.recv())
        print("Received 1:", msg1)
        msg2 = json.loads(await ws.recv())
        print("Received 2 (Greeting):", msg2["text"])
        assert "Nexa" in msg2["text"], "Expected Nexa greeting"

        # Inquiry 1: Availability
        print("\n=== Step 3: Checking Doctor Availability ===")
        await ws.send(json.dumps({
            "type": "text_message",
            "text": "What slots are available for Dr. Michael Chen?"
        }))
        user_echo = json.loads(await ws.recv())
        print("Caller Echo:", user_echo["text"])
        agent_reply1 = json.loads(await ws.recv())
        print("Nexa Reply:", agent_reply1["text"])
        assert "open slots" in agent_reply1["text"].lower() or "chen" in agent_reply1["text"].lower()

        # Inquiry 2: Booking with phone number
        print("\n=== Step 4: Requesting Booking with Phone Number ===")
        await ws.send(json.dumps({
            "type": "text_message",
            "text": "Please book Dr. Chen tomorrow at 10:30 AM, my phone number is 9876543210"
        }))
        user_echo2 = json.loads(await ws.recv())
        print("Caller Echo:", user_echo2["text"])
        agent_reply2 = json.loads(await ws.recv())
        print("Nexa Reply (Read-back confirmation):", agent_reply2["text"])
        assert "9 8 7 6 5 4 3 2 1 0" in agent_reply2["text"], "Agent MUST read back phone number!"

        # Inquiry 3: Confirm phone number
        print("\n=== Step 5: Confirming Phone Number ===")
        await ws.send(json.dumps({
            "type": "text_message",
            "text": "Yes, that is correct"
        }))
        user_echo3 = json.loads(await ws.recv())
        print("Caller Echo:", user_echo3["text"])
        agent_reply3 = json.loads(await ws.recv())
        print("Nexa Reply (Booking confirmed):", agent_reply3["text"])
        assert "confirmed" in agent_reply3["text"].lower()

        # Check broadcasted appointment event
        event1 = json.loads(await ws.recv())
        print("Broadcast Event received:", event1)
        assert event1["type"] == "appointment_updated" and event1["action"] == "booked"
        appt_id = event1["data"]["appointment_id"]
        print(f"Appointment #{appt_id} booked successfully!")

        # Verify against REST API
        appts = http_get("/api/appointments")
        matching = [a for a in appts["appointments"] if a["id"] == appt_id]
        assert len(matching) == 1 and matching[0]["status"] == "booked"
        print(f"Verified in DB: Appointment #{appt_id} is 'booked' for phone {matching[0]['patient_phone']}")

        # Inquiry 4: Cancellation request
        print("\n=== Step 6: Requesting Cancellation ===")
        await ws.send(json.dumps({
            "type": "text_message",
            "text": "I need to cancel my appointment for 9876543210"
        }))
        user_echo4 = json.loads(await ws.recv())
        print("Caller Echo:", user_echo4["text"])
        agent_reply4 = json.loads(await ws.recv())
        print("Nexa Reply (Cancel confirmation read-back):", agent_reply4["text"])
        assert "9 8 7 6 5 4 3 2 1 0" in agent_reply4["text"], "Agent MUST read back phone number on cancellation!"

        # Inquiry 5: Confirm cancellation
        print("\n=== Step 7: Confirming Cancellation ===")
        await ws.send(json.dumps({
            "type": "text_message",
            "text": "Yes please cancel it"
        }))
        user_echo5 = json.loads(await ws.recv())
        print("Caller Echo:", user_echo5["text"])
        agent_reply5 = json.loads(await ws.recv())
        print("Nexa Reply (Cancelled):", agent_reply5["text"])
        assert "cancelled" in agent_reply5["text"].lower()

        event2 = json.loads(await ws.recv())
        print("Broadcast Event received:", event2)
        assert event2["type"] == "appointment_updated" and event2["action"] == "cancelled"

        # Verify against REST API
        appts_after = http_get("/api/appointments")
        matching_after = [a for a in appts_after["appointments"] if a["id"] == appt_id]
        assert len(matching_after) == 1 and matching_after[0]["status"] == "cancelled"
        print(f"Verified in DB: Appointment #{appt_id} is now 'cancelled'!")

        # Close session
        await ws.send(json.dumps({"type": "end_call"}))
        print("\n=== ALL END-TO-END FLOW TESTS PASSED WITH 100% SUCCESS ===")

if __name__ == "__main__":
    asyncio.run(run_e2e_verification())
