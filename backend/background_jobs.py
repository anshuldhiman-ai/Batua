"""Background job processing using RQ (Redis Queue).

This module provides a simple background job system for long-running tasks
like Excel imports, ML retraining, and data exports.
"""
import os
import logging
from typing import Optional, Dict, Any
from functools import wraps
import redis
from rq import Queue, Worker, job
from rq.job import Job

logger = logging.getLogger("batua.background_jobs")

# Redis connection for RQ
def get_redis_connection():
    """Get Redis connection for RQ."""
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    return redis.from_url(redis_url, decode_responses=True)

# Initialize RQ queue
def get_queue(name: str = "default") -> Queue:
    """Get or create an RQ queue."""
    redis_conn = get_redis_connection()
    return Queue(name, connection=redis_conn, is_async=True)

# Job decorator for easier job creation
def background_job(queue_name: str = "default", timeout: int = 3600):
    """Decorator to mark functions as background jobs."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        wrapper._is_background_job = True
        wrapper._queue_name = queue_name
        wrapper._timeout = timeout
        return wrapper
    return decorator

# Job management functions
def enqueue_job(func, *args, **kwargs) -> str:
    """Enqueue a background job and return job ID."""
    queue_name = getattr(func, '_queue_name', 'default')
    timeout = getattr(func, '_timeout', 3600)
    
    queue = get_queue(queue_name)
    job = queue.enqueue(func, *args, **kwargs, timeout=timeout)
    
    logger.info(f"Enqueued job {job.id} for function {func.__name__}")
    return job.id

def get_job_status(job_id: str) -> Optional[Dict[str, Any]]:
    """Get the status of a background job."""
    try:
        redis_conn = get_redis_connection()
        job = Job.fetch(job_id, connection=redis_conn)
        
        return {
            "id": job.id,
            "status": job.get_status(),
            "result": job.result,
            "error": job.exc_info if job.is_failed else None,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "ended_at": job.ended_at.isoformat() if job.ended_at else None,
            "meta": job.meta,
        }
    except Exception as e:
        logger.error(f"Failed to fetch job {job_id}: {e}")
        return None

def cancel_job(job_id: str) -> bool:
    """Cancel a background job."""
    try:
        redis_conn = get_redis_connection()
        job = Job.fetch(job_id, connection=redis_conn)
        job.cancel()
        logger.info(f"Cancelled job {job_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to cancel job {job_id}: {e}")
        return False

# Progress tracking helper
def update_job_progress(job_id: str, progress: float, message: str = ""):
    """Update job progress."""
    try:
        redis_conn = get_redis_connection()
        job = Job.fetch(job_id, connection=redis_conn)
        job.meta['progress'] = progress
        job.meta['message'] = message
        job.save_meta()
    except Exception as e:
        logger.error(f"Failed to update job progress: {e}")

# Example background jobs
@background_job(queue_name="excel_import", timeout=1800)
def process_excel_import(file_path: str, user_id: str = "default") -> Dict[str, Any]:
    """Background job for processing Excel imports (placeholder)."""
    job_id = job.get_current_job().id
    update_job_progress(job_id, 0.0, "Starting Excel import")
    
    try:
        # Placeholder for Excel import functionality
        # In production, this would use excel_loader and storage
        update_job_progress(job_id, 0.5, "Processing Excel file")
        update_job_progress(job_id, 1.0, "Excel import completed")
        
        return {
            "success": True,
            "message": "Excel import functionality placeholder",
            "user_id": user_id,
            "file_path": file_path
        }
    except Exception as e:
        update_job_progress(job_id, -1, f"Error: {str(e)}")
        raise

@background_job(queue_name="ml_training", timeout=3600)
def retrain_ml_model() -> Dict[str, Any]:
    """Background job for retraining ML models."""
    from scripts.train_classifier import main as train_main
    
    job_id = job.get_current_job().id
    update_job_progress(job_id, 0.0, "Starting ML model retraining")
    
    try:
        update_job_progress(job_id, 0.2, "Loading training data")
        # Call the training script
        result = train_main()
        
        update_job_progress(job_id, 1.0, "ML model retraining completed")
        
        return {
            "success": True,
            "metrics": result
        }
    except Exception as e:
        update_job_progress(job_id, -1, f"Error: {str(e)}")
        raise

@background_job(queue_name="export", timeout=1800)
def export_transactions(user_id: str = "default", format: str = "excel") -> Dict[str, Any]:
    """Background job for exporting transactions (simplified placeholder)."""
    job_id = job.get_current_job().id
    update_job_progress(job_id, 0.0, "Starting transaction export")
    
    try:
        # Placeholder for export functionality
        # In production, this would interact with storage and create export files
        update_job_progress(job_id, 0.5, "Processing export request")
        update_job_progress(job_id, 1.0, "Export completed")
        
        return {
            "success": True,
            "message": "Export functionality placeholder",
            "user_id": user_id,
            "format": format
        }
    except Exception as e:
        update_job_progress(job_id, -1, f"Error: {str(e)}")
        raise

# Worker startup function
def start_worker(queue_names: list = None):
    """Start RQ worker for processing background jobs."""
    if queue_names is None:
        queue_names = ['default', 'excel_import', 'ml_training', 'export']
    
    redis_conn = get_redis_connection()
    
    with Worker(queue_names, connection=redis_conn) as worker:
        logger.info(f"Starting RQ worker for queues: {queue_names}")
        worker.work()