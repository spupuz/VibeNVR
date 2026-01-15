from database import engine
from sqlalchemy import inspect

def inspect_db():
    inspector = inspect(engine)
    columns = inspector.get_columns('cameras')
    for column in columns:
        print(f"Column: {column['name']} - Type: {column['type']}")

if __name__ == "__main__":
    inspect_db()
