import os
import importlib

def test_cors_configuration():
    os.environ["ALLOWED_ORIGINS"] = "*"

    # Importing backend.main will trigger the CORS logic
    import backend.main

    # Find the CORSMiddleware instance
    middleware = None
    for mw in backend.main.app.user_middleware:
        if mw.cls.__name__ == "CORSMiddleware":
            middleware = mw
            break

    assert middleware is not None, "CORSMiddleware not found in app middlewares"

    # Check that '*' is not in the allow_origins
    allow_origins = middleware.kwargs.get("allow_origins", [])
    assert "*" not in allow_origins, "Security vulnerability: '*' is still allowed in CORS configuration with allow_credentials=True"

    # Check that we fell back to localhost defaults
    assert "http://localhost:5173" in allow_origins, "Fallback to localhost defaults failed"

    print("CORS security test passed successfully!")

if __name__ == "__main__":
    test_cors_configuration()
