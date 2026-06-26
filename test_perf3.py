import os
import sys
# Need to set pythonpath
sys.path.insert(0, os.path.abspath('backend'))

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
import models
import crud
import schemas

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
models.Base.metadata.create_all(bind=engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

db = SessionLocal()

# Create some test data
for i in range(5):
    group = models.CameraGroup(name=f"Group {i}")
    db.add(group)
    for j in range(3):
        camera = models.Camera(name=f"Camera {i}-{j}", rtsp_url=f"rtsp://cam{i}-{j}", ai_object_types='[]')
        group.cameras.append(camera)
        db.add(camera)
db.commit()

# Setup query counting
query_count = 0
@event.listens_for(engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    global query_count
    query_count += 1

db.close()
db = SessionLocal()

query_count = 0
groups = crud.get_groups(db)
res = [schemas.CameraGroup.model_validate(g) for g in groups]
print(f"Total queries for CameraGroup without optimization: {query_count}")
