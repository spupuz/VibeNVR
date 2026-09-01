from sqlalchemy.orm import Session
from datetime import datetime, timezone
import models
import schemas

def get_node(db: Session, node_id: int):
    return db.query(models.FederatedNode).filter(models.FederatedNode.id == node_id).first()

def get_nodes(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.FederatedNode).offset(skip).limit(limit).all()

def create_node(db: Session, node: schemas.FederatedNodeCreate):
    db_node = models.FederatedNode(
        name=node.name,
        url=node.url,
        api_token=node.api_token,
        status="offline"
    )
    db.add(db_node)
    db.commit()
    db.refresh(db_node)
    return db_node

def update_node(db: Session, node_id: int, node: schemas.FederatedNodeUpdate):
    db_node = get_node(db, node_id)
    if db_node:
        if node.name is not None:
            db_node.name = node.name
        if node.url is not None:
            db_node.url = node.url
        if node.api_token is not None:
            db_node.api_token = node.api_token
        db.commit()
        db.refresh(db_node)
    return db_node

def delete_node(db: Session, node_id: int):
    db_node = get_node(db, node_id)
    if db_node:
        db.delete(db_node)
        db.commit()
    return db_node

def update_node_status(db: Session, node_id: int, status: str):
    db_node = get_node(db, node_id)
    if db_node:
        db_node.status = status
        db_node.last_seen = datetime.now(timezone.utc)
        db.commit()
        db.refresh(db_node)
    return db_node

