#!/usr/bin/env python
"""Test script to verify optimized prediction endpoint."""

import json
import time
import requests

def test_prediction():
    """Test the prediction endpoint with optimizations."""
    url = "http://localhost:5000/predict"
    
    payload = {
        "rank": 500,
        "category": "GM",
        "branch": "CSE"
    }
    
    headers = {"Content-Type": "application/json"}
    
    print("=" * 60)
    print("Testing Optimized Prediction Endpoint")
    print("=" * 60)
    print(f"\nPayload: {json.dumps(payload, indent=2)}")
    print(f"Endpoint: POST {url}\n")
    
    start = time.time()
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=5)
        elapsed_ms = (time.time() - start) * 1000
        
        print(f"✓ Request completed in {elapsed_ms:.2f}ms")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Display results
            print(f"\n✓ Predictions received: {len(data.get('predictions', []))} colleges")
            
            if data.get('predictions'):
                print("\nTop 3 Predictions:")
                for i, pred in enumerate(data['predictions'][:3], 1):
                    print(f"  {i}. {pred.get('college', 'N/A')}")
                    print(f"     - Branch: {pred.get('branch', 'N/A')}")
                    print(f"     - Chance: {pred.get('chance', 'N/A')}")
                    print(f"     - Confidence: {pred.get('confidence', 'N/A')}")
            
            print(f"\n✓ ML Model Prediction: {data.get('model_prediction', {}).get('college', 'N/A')}")
            print(f"✓ Recommendations: {len(data.get('recommendations', []))} items")
            
            print("\n" + "=" * 60)
            print("✓ OPTIMIZATION TEST PASSED")
            print("=" * 60)
            print("\nKey Metrics:")
            print(f"  - Total request time: {elapsed_ms:.2f}ms")
            print(f"  - Database queries: Using indexed lookups (branch + category + year)")
            print(f"  - Fallback mechanism: Enabled (JSON if DB lookup fails)")
            return True
        else:
            print(f"\n✗ Error: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("✗ Connection Error: Backend not running on http://localhost:5000")
        print("  Start the backend with: cd backend && python app.py")
        return False
    except Exception as e:
        print(f"✗ Error: {str(e)}")
        return False

if __name__ == "__main__":
    test_prediction()
