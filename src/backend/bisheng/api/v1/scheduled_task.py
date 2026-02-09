"""
定时任务管理 API

提供以下端点:
- GET /scheduled-tasks: 获取任务列表
- POST /scheduled-tasks: 创建定时任务
- PUT /scheduled-tasks/{task_id}: 更新定时任务
- DELETE /scheduled-tasks/{task_id}: 删除定时任务
- POST /scheduled-tasks/{task_id}/toggle: 启用/禁用任务
- POST /scheduled-tasks/{task_id}/run: 手动触发执行
- GET /scheduled-tasks/{task_id}/logs: 获取执行日志
- GET /scheduled-tasks/logs/all: 获取所有执行日志
- GET /scheduled-tasks/workflows: 获取可选工作流列表
"""
import smtplib
import threading
import time
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional

from croniter import croniter
from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from pydantic import BaseModel, Field

from bisheng.api.v1.schemas import resp_200
from bisheng.common.dependencies.user_deps import UserPayload
from bisheng.database.models.flow import Flow, FlowDao, FlowType
from bisheng.database.models.scheduled_task import (
    ScheduledTask, ScheduledTaskDao, TaskExecutionLog, TaskExecutionLogDao,
    TaskStatus, ExecutionStatus
)

router = APIRouter(prefix='/scheduled-tasks', tags=['ScheduledTask'])


# ========== 请求模型 ==========

class CreateTaskRequest(BaseModel):
    name: str = Field(..., description='任务名称')
    description: str = Field(default='', description='任务描述')
    workflow_id: str = Field(..., description='工作流 ID')
    cron_expression: str = Field(..., description='Cron 表达式')
    notify_on_failure: bool = Field(default=False)
    notify_email: str = Field(default='')
    smtp_server: str = Field(default='')
    smtp_port: int = Field(default=465)
    smtp_user: str = Field(default='')
    smtp_password: str = Field(default='')


class UpdateTaskRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    workflow_id: Optional[str] = None
    cron_expression: Optional[str] = None
    notify_on_failure: Optional[bool] = None
    notify_email: Optional[str] = None
    smtp_server: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None


# ========== API 端点 ==========

@router.get('/workflows')
async def list_workflows(admin_user: UserPayload = Depends(UserPayload.get_admin_user)):
    """获取可选的工作流列表 (仅在线的工作流)"""
    workflows = FlowDao.get_all_online_flows(flow_type=FlowType.WORKFLOW.value)
    result = [{'id': w.id, 'name': w.name, 'description': w.description or ''}
              for w in workflows]
    return resp_200(data=result)


@router.get('')
async def list_tasks(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """获取定时任务列表"""
    tasks, total = ScheduledTaskDao.get_all_tasks(page, limit, status, keyword)
    return resp_200(data={'list': [t.model_dump() for t in tasks], 'total': total})


@router.post('')
async def create_task(
    req: CreateTaskRequest,
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """创建定时任务"""
    # 验证 cron 表达式
    try:
        cron = croniter(req.cron_expression)
        next_run = cron.get_next(datetime)
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=400, detail=f'Cron 表达式格式错误: {str(e)}')

    # 验证工作流存在
    workflow = FlowDao.get_flow_by_id(req.workflow_id)
    if not workflow:
        raise HTTPException(status_code=400, detail='工作流不存在')

    task = ScheduledTask(
        name=req.name,
        description=req.description,
        workflow_id=req.workflow_id,
        workflow_name=workflow.name,
        cron_expression=req.cron_expression,
        status=TaskStatus.ENABLED.value,
        notify_on_failure=req.notify_on_failure,
        notify_email=req.notify_email,
        smtp_server=req.smtp_server,
        smtp_port=req.smtp_port,
        smtp_user=req.smtp_user,
        smtp_password=req.smtp_password,
        next_run_time=next_run,
        created_by=admin_user.user_id,
        created_by_name=admin_user.user_name,
    )
    task = ScheduledTaskDao.create_task(task)
    logger.info(f'Scheduled task created: id={task.id}, name={task.name}, cron={task.cron_expression}')
    return resp_200(data=task.model_dump())


@router.put('/{task_id}')
async def update_task(
    task_id: int,
    req: UpdateTaskRequest,
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """更新定时任务"""
    task = ScheduledTaskDao.get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail='任务不存在')

    if req.name is not None:
        task.name = req.name
    if req.description is not None:
        task.description = req.description
    if req.workflow_id is not None:
        workflow = FlowDao.get_flow_by_id(req.workflow_id)
        if not workflow:
            raise HTTPException(status_code=400, detail='工作流不存在')
        task.workflow_id = req.workflow_id
        task.workflow_name = workflow.name
    if req.cron_expression is not None:
        try:
            cron = croniter(req.cron_expression)
            task.cron_expression = req.cron_expression
            task.next_run_time = cron.get_next(datetime)
        except (ValueError, KeyError) as e:
            raise HTTPException(status_code=400, detail=f'Cron 表达式格式错误: {str(e)}')
    if req.notify_on_failure is not None:
        task.notify_on_failure = req.notify_on_failure
    if req.notify_email is not None:
        task.notify_email = req.notify_email
    if req.smtp_server is not None:
        task.smtp_server = req.smtp_server
    if req.smtp_port is not None:
        task.smtp_port = req.smtp_port
    if req.smtp_user is not None:
        task.smtp_user = req.smtp_user
    if req.smtp_password is not None:
        task.smtp_password = req.smtp_password

    task = ScheduledTaskDao.update_task(task)
    return resp_200(data=task.model_dump())


@router.delete('/{task_id}')
async def delete_task(
    task_id: int,
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """删除定时任务"""
    ok = ScheduledTaskDao.delete_task(task_id)
    if not ok:
        raise HTTPException(status_code=404, detail='任务不存在')
    return resp_200(message='删除成功')


@router.post('/{task_id}/toggle')
async def toggle_task(
    task_id: int,
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """启用/禁用任务"""
    task = ScheduledTaskDao.get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail='任务不存在')

    if task.status == TaskStatus.ENABLED.value:
        task.status = TaskStatus.DISABLED.value
        task.next_run_time = None
    else:
        task.status = TaskStatus.ENABLED.value
        cron = croniter(task.cron_expression)
        task.next_run_time = cron.get_next(datetime)

    task = ScheduledTaskDao.update_task(task)
    return resp_200(data=task.model_dump())


@router.post('/{task_id}/run')
async def run_task_now(
    task_id: int,
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """手动触发执行"""
    task = ScheduledTaskDao.get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail='任务不存在')

    # 在后台线程中执行
    thread = threading.Thread(
        target=execute_scheduled_task,
        args=(task,),
        daemon=True
    )
    thread.start()

    return resp_200(message='任务已触发执行')


@router.get('/{task_id}/logs')
async def get_task_logs(
    task_id: int,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = None,
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """获取任务执行日志"""
    logs, total = TaskExecutionLogDao.get_logs_by_task(task_id, page, limit, status)
    return resp_200(data={'list': [l.model_dump() for l in logs], 'total': total})


@router.get('/logs/all')
async def get_all_logs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = None,
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """获取所有执行日志"""
    logs, total = TaskExecutionLogDao.get_all_logs(page, limit, status)
    return resp_200(data={'list': [l.model_dump() for l in logs], 'total': total})


# ========== 任务执行引擎 ==========

def execute_scheduled_task(task: ScheduledTask):
    """
    执行定时任务 - 调用工作流
    """
    from bisheng.worker.workflow.tasks import execute_workflow
    from bisheng.utils import generate_uuid

    log = TaskExecutionLog(
        task_id=task.id,
        task_name=task.name,
        workflow_id=task.workflow_id,
        workflow_name=task.workflow_name,
        status=ExecutionStatus.RUNNING.value,
    )
    log = TaskExecutionLogDao.create_log(log)

    start_time = time.time()
    try:
        # 准备工作流执行参数
        unique_id = generate_uuid()
        chat_id = generate_uuid()
        user_id = task.created_by or 1

        # 获取工作流数据
        from bisheng.database.models.flow import FlowDao

        workflow = FlowDao.get_flow_by_id(task.workflow_id)
        if not workflow:
            raise Exception(f'工作流 {task.workflow_id} 不存在')
        if not workflow.data:
            raise Exception(f'工作流 {task.workflow_id} 数据为空')

        # 通过 RedisCallback 将工作流数据存入 Redis
        from bisheng.worker.workflow.redis_callback import RedisCallback
        redis_callback = RedisCallback(unique_id, task.workflow_id, chat_id, user_id,
                                        source='scheduled_task')
        redis_callback.set_workflow_data(workflow.data)

        logger.info(f'Executing scheduled task: id={task.id}, name={task.name}, '
                     f'workflow_id={task.workflow_id}, unique_id={unique_id}')

        # 直接调用底层执行函数 (同步)
        from bisheng.worker.workflow.tasks import _execute_workflow
        _execute_workflow(unique_id, task.workflow_id, chat_id, user_id, source='scheduled_task')

        elapsed = int(time.time() - start_time)
        log.status = ExecutionStatus.SUCCESS.value
        log.finished_at = datetime.now()
        log.duration_seconds = elapsed
        log.result = f'工作流 {task.workflow_name} 执行成功'
        TaskExecutionLogDao.update_log(log)

        logger.info(f'Scheduled task completed: id={task.id}, duration={elapsed}s')

    except Exception as e:
        elapsed = int(time.time() - start_time)
        error_msg = str(e)[:500]
        log.status = ExecutionStatus.FAILED.value
        log.finished_at = datetime.now()
        log.duration_seconds = elapsed
        log.error_message = error_msg
        TaskExecutionLogDao.update_log(log)

        logger.error(f'Scheduled task failed: id={task.id}, error={error_msg}')

        # 发送失败通知邮件
        if task.notify_on_failure and task.notify_email:
            try:
                send_failure_notification(task, error_msg)
                log.notified = True
                TaskExecutionLogDao.update_log(log)
            except Exception as mail_err:
                logger.error(f'Failed to send notification email: {mail_err}')

    # 更新任务的 last_run_time 和 next_run_time
    try:
        now = datetime.now()
        cron = croniter(task.cron_expression, now)
        next_run = cron.get_next(datetime)
        ScheduledTaskDao.update_run_times(task.id, now, next_run)
    except Exception as e:
        logger.error(f'Failed to update task run times: {e}')


def send_failure_notification(task: ScheduledTask, error_msg: str):
    """发送失败通知邮件"""
    if not task.smtp_server or not task.smtp_user:
        logger.warning(f'SMTP not configured for task {task.id}, skipping notification')
        return

    subject = f'[Bisheng] 定时任务执行失败: {task.name}'
    body = f"""
    <html>
    <body>
    <h2>定时任务执行失败通知</h2>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><b>任务名称</b></td><td>{task.name}</td></tr>
        <tr><td><b>任务ID</b></td><td>{task.id}</td></tr>
        <tr><td><b>工作流</b></td><td>{task.workflow_name} ({task.workflow_id})</td></tr>
        <tr><td><b>Cron表达式</b></td><td>{task.cron_expression}</td></tr>
        <tr><td><b>失败时间</b></td><td>{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</td></tr>
        <tr><td><b>错误信息</b></td><td style="color:red;">{error_msg}</td></tr>
    </table>
    <p>请登录 Bisheng 管理后台检查任务配置和工作流状态。</p>
    </body>
    </html>
    """

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = task.smtp_user
    msg['To'] = task.notify_email
    msg.attach(MIMEText(body, 'html', 'utf-8'))

    try:
        if task.smtp_port == 465:
            server = smtplib.SMTP_SSL(task.smtp_server, task.smtp_port, timeout=30)
        else:
            server = smtplib.SMTP(task.smtp_server, task.smtp_port, timeout=30)
            server.starttls()

        server.login(task.smtp_user, task.smtp_password)
        server.sendmail(task.smtp_user, task.notify_email.split(','), msg.as_string())
        server.quit()
        logger.info(f'Failure notification sent for task {task.id} to {task.notify_email}')
    except Exception as e:
        logger.error(f'SMTP send failed: {e}')
        raise


# ========== 定时任务调度器 ==========

def check_and_run_due_tasks():
    """
    检查并执行到期的定时任务
    此函数应被定期调用 (例如每分钟一次)
    """
    try:
        tasks = ScheduledTaskDao.get_enabled_tasks()
        now = datetime.now()

        for task in tasks:
            if task.next_run_time and task.next_run_time <= now:
                logger.info(f'Task {task.id} ({task.name}) is due, executing...')
                # 在后台线程中执行避免阻塞调度器
                thread = threading.Thread(
                    target=execute_scheduled_task,
                    args=(task,),
                    daemon=True
                )
                thread.start()
    except Exception as e:
        logger.error(f'Error checking scheduled tasks: {e}')
