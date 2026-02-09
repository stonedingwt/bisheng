"""
定时任务调度 Celery 任务

check_tasks: 每分钟执行一次，检查数据库中到期的定时任务并触发执行
"""
from loguru import logger

from bisheng.worker.main import bisheng_celery


@bisheng_celery.task(name='bisheng.worker.scheduled.check_tasks')
def check_tasks():
    """每分钟检查并执行到期的定时任务"""
    try:
        from bisheng.api.v1.scheduled_task import check_and_run_due_tasks
        check_and_run_due_tasks()
    except Exception as e:
        logger.error(f'Error in check_tasks: {e}')
