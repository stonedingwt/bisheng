"""
定时任务模型 - 用于定时调用工作流API

ScheduledTask: 定时任务配置
TaskExecutionLog: 任务执行日志
"""
from datetime import datetime
from enum import Enum
from typing import List, Optional

from sqlmodel import Field, select, Column, DateTime, text, Text, func, JSON, desc
from sqlalchemy import Integer

from bisheng.common.models.base import SQLModelSerializable
from bisheng.core.database import get_sync_db_session, get_async_db_session


class TaskStatus(str, Enum):
    ENABLED = 'enabled'
    DISABLED = 'disabled'


class ExecutionStatus(str, Enum):
    RUNNING = 'running'
    SUCCESS = 'success'
    FAILED = 'failed'


# ========== ScheduledTask ==========

class ScheduledTaskBase(SQLModelSerializable):
    name: str = Field(index=True, description='任务名称')
    description: Optional[str] = Field(default='', sa_column=Column(Text), description='任务描述')
    workflow_id: str = Field(index=True, description='要调用的工作流 ID')
    workflow_name: Optional[str] = Field(default='', description='工作流名称 (冗余)')
    # cron 表达式: 分 时 日 月 周  (例如 "0 9 * * 1-5" 表示工作日9点)
    cron_expression: str = Field(description='Cron 表达式')
    status: str = Field(default=TaskStatus.ENABLED.value, index=True, description='任务状态')
    # 失败通知配置
    notify_on_failure: bool = Field(default=False, description='失败时是否发送邮件')
    notify_email: Optional[str] = Field(default='', description='通知邮箱地址')
    # SMTP 配置 (可选, 覆盖默认)
    smtp_server: Optional[str] = Field(default='', description='SMTP 服务器')
    smtp_port: Optional[int] = Field(default=465, description='SMTP 端口')
    smtp_user: Optional[str] = Field(default='', description='SMTP 用户名')
    smtp_password: Optional[str] = Field(default='', description='SMTP 密码')
    # 调度信息
    last_run_time: Optional[datetime] = Field(default=None, sa_column=Column(DateTime, nullable=True))
    next_run_time: Optional[datetime] = Field(default=None, sa_column=Column(DateTime, nullable=True))
    # 创建信息
    created_by: Optional[int] = Field(default=None, index=True, description='创建者用户ID')
    created_by_name: Optional[str] = Field(default='', description='创建者用户名')
    create_time: Optional[datetime] = Field(
        sa_column=Column(DateTime, nullable=False, server_default=text('CURRENT_TIMESTAMP')))
    update_time: Optional[datetime] = Field(
        sa_column=Column(DateTime, nullable=False, server_default=text('CURRENT_TIMESTAMP'),
                         onupdate=text('CURRENT_TIMESTAMP')))


class ScheduledTask(ScheduledTaskBase, table=True):
    __tablename__ = 'scheduled_task'
    id: Optional[int] = Field(default=None, primary_key=True)


# ========== TaskExecutionLog ==========

class TaskExecutionLogBase(SQLModelSerializable):
    task_id: int = Field(index=True, description='关联的定时任务 ID')
    task_name: Optional[str] = Field(default='', description='任务名称 (冗余)')
    workflow_id: str = Field(index=True, description='工作流 ID')
    workflow_name: Optional[str] = Field(default='', description='工作流名称 (冗余)')
    status: str = Field(default=ExecutionStatus.RUNNING.value, index=True)
    started_at: Optional[datetime] = Field(
        sa_column=Column(DateTime, nullable=False, server_default=text('CURRENT_TIMESTAMP')))
    finished_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime, nullable=True))
    duration_seconds: Optional[int] = Field(default=None, description='执行耗时(秒)')
    result: Optional[str] = Field(default='', sa_column=Column(Text), description='执行结果摘要')
    error_message: Optional[str] = Field(default='', sa_column=Column(Text), description='错误信息')
    notified: bool = Field(default=False, description='是否已发送失败通知')


class TaskExecutionLog(TaskExecutionLogBase, table=True):
    __tablename__ = 'task_execution_log'
    id: Optional[int] = Field(default=None, primary_key=True)


# ========== DAO ==========

class ScheduledTaskDao(ScheduledTaskBase):

    @classmethod
    def get_all_tasks(cls, page: int = 1, limit: int = 20, status: str = None,
                      keyword: str = None) -> (List[ScheduledTask], int):
        with get_sync_db_session() as session:
            statement = select(ScheduledTask)
            count_stmt = select(func.count()).select_from(ScheduledTask)

            if status:
                statement = statement.where(ScheduledTask.status == status)
                count_stmt = count_stmt.where(ScheduledTask.status == status)
            if keyword:
                statement = statement.where(ScheduledTask.name.like(f'%{keyword}%'))
                count_stmt = count_stmt.where(ScheduledTask.name.like(f'%{keyword}%'))

            total = session.exec(count_stmt).one()
            statement = statement.order_by(desc(ScheduledTask.create_time))
            statement = statement.offset((page - 1) * limit).limit(limit)
            tasks = session.exec(statement).all()
            return tasks, total

    @classmethod
    def get_enabled_tasks(cls) -> List[ScheduledTask]:
        with get_sync_db_session() as session:
            statement = select(ScheduledTask).where(
                ScheduledTask.status == TaskStatus.ENABLED.value)
            return session.exec(statement).all()

    @classmethod
    def get_task_by_id(cls, task_id: int) -> Optional[ScheduledTask]:
        with get_sync_db_session() as session:
            return session.get(ScheduledTask, task_id)

    @classmethod
    def create_task(cls, task: ScheduledTask) -> ScheduledTask:
        with get_sync_db_session() as session:
            session.add(task)
            session.commit()
            session.refresh(task)
            return task

    @classmethod
    def update_task(cls, task: ScheduledTask) -> ScheduledTask:
        with get_sync_db_session() as session:
            session.add(task)
            session.commit()
            session.refresh(task)
            return task

    @classmethod
    def delete_task(cls, task_id: int) -> bool:
        with get_sync_db_session() as session:
            task = session.get(ScheduledTask, task_id)
            if task:
                session.delete(task)
                session.commit()
                return True
            return False

    @classmethod
    def update_run_times(cls, task_id: int, last_run: datetime, next_run: datetime):
        with get_sync_db_session() as session:
            task = session.get(ScheduledTask, task_id)
            if task:
                task.last_run_time = last_run
                task.next_run_time = next_run
                session.add(task)
                session.commit()


class TaskExecutionLogDao(TaskExecutionLogBase):

    @classmethod
    def create_log(cls, log: TaskExecutionLog) -> TaskExecutionLog:
        with get_sync_db_session() as session:
            session.add(log)
            session.commit()
            session.refresh(log)
            return log

    @classmethod
    def update_log(cls, log: TaskExecutionLog) -> TaskExecutionLog:
        with get_sync_db_session() as session:
            session.add(log)
            session.commit()
            session.refresh(log)
            return log

    @classmethod
    def get_logs_by_task(cls, task_id: int, page: int = 1, limit: int = 20,
                         status: str = None) -> (List[TaskExecutionLog], int):
        with get_sync_db_session() as session:
            statement = select(TaskExecutionLog).where(TaskExecutionLog.task_id == task_id)
            count_stmt = select(func.count()).select_from(TaskExecutionLog).where(
                TaskExecutionLog.task_id == task_id)

            if status:
                statement = statement.where(TaskExecutionLog.status == status)
                count_stmt = count_stmt.where(TaskExecutionLog.status == status)

            total = session.exec(count_stmt).one()
            statement = statement.order_by(desc(TaskExecutionLog.started_at))
            statement = statement.offset((page - 1) * limit).limit(limit)
            logs = session.exec(statement).all()
            return logs, total

    @classmethod
    def get_all_logs(cls, page: int = 1, limit: int = 20,
                     status: str = None) -> (List[TaskExecutionLog], int):
        with get_sync_db_session() as session:
            statement = select(TaskExecutionLog)
            count_stmt = select(func.count()).select_from(TaskExecutionLog)

            if status:
                statement = statement.where(TaskExecutionLog.status == status)
                count_stmt = count_stmt.where(TaskExecutionLog.status == status)

            total = session.exec(count_stmt).one()
            statement = statement.order_by(desc(TaskExecutionLog.started_at))
            statement = statement.offset((page - 1) * limit).limit(limit)
            logs = session.exec(statement).all()
            return logs, total
