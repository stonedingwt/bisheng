"""
工作空间 (Space) 管理 API - 带角色权限控制

- GET /workspace-spaces: 获取用户可见的空间列表 (管理员看所有, 普通用户看已授权的)
- POST /workspace-spaces: 创建空间 (仅管理员)
- PUT /workspace-spaces/{space_id}: 更新空间 (仅管理员)
- DELETE /workspace-spaces/{space_id}: 删除空间 (仅管理员)
- POST /workspace-spaces/move-flow: 移动应用到指定空间 (管理员 + 有空间写权限的用户)
- POST /workspace-spaces/batch-move: 批量移动
- GET /workspace-spaces/{space_id}/roles: 获取空间授权的角色列表 (管理员)
- POST /workspace-spaces/{space_id}/roles: 设置空间授权的角色 (管理员)
- GET /workspace-spaces/all-roles: 获取所有可用角色 (管理员)
"""
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from pydantic import BaseModel, Field

from bisheng.api.v1.schemas import resp_200
from bisheng.common.dependencies.user_deps import UserPayload
from bisheng.database.models.role_access import AccessType, RoleAccess, RoleAccessDao
from bisheng.database.models.workspace_space import (
    WorkspaceSpace, WorkspaceSpaceDao
)

router = APIRouter(prefix='/workspace-spaces', tags=['WorkspaceSpace'])


class CreateSpaceRequest(BaseModel):
    name: str = Field(..., max_length=100, description='空间名称')
    description: str = Field(default='', max_length=500)
    color: str = Field(default='#3B82F6', max_length=20)
    sort_order: int = Field(default=0)


class UpdateSpaceRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


class MoveFlowRequest(BaseModel):
    flow_id: str = Field(..., description='应用 ID')
    space_id: int = Field(..., description='目标空间 ID')


class BatchMoveRequest(BaseModel):
    flow_ids: List[str] = Field(..., description='应用 ID 列表')
    space_id: int = Field(..., description='目标空间 ID')


class SpaceRolesRequest(BaseModel):
    role_ids: List[int] = Field(..., description='要授权的角色 ID 列表')


def get_user_authorized_space_ids(user: UserPayload) -> List[int]:
    """获取用户被授权的空间 ID 列表"""
    role_access_list = RoleAccessDao.get_role_access_batch(
        user.user_role, [AccessType.SPACE_READ])
    return list(set([int(ra.third_id) for ra in role_access_list]))


@router.get('')
async def list_spaces(
    login_user: UserPayload = Depends(UserPayload.get_login_user),
):
    """获取用户可见的空间列表: 管理员看所有, 普通用户仅看被授权的空间"""
    all_spaces = WorkspaceSpaceDao.get_all_spaces()

    if login_user.is_admin():
        return resp_200(data=[s.model_dump() for s in all_spaces])

    # 普通用户: 只返回被授权的空间
    authorized_ids = get_user_authorized_space_ids(login_user)
    visible_spaces = [s for s in all_spaces if s.id in authorized_ids]
    return resp_200(data=[s.model_dump() for s in visible_spaces])


@router.post('')
async def create_space(
    req: CreateSpaceRequest,
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """创建新空间 (仅管理员)"""
    space = WorkspaceSpace(
        name=req.name,
        description=req.description,
        color=req.color,
        sort_order=req.sort_order,
        created_by=admin_user.user_id,
    )
    space = WorkspaceSpaceDao.create_space(space)
    logger.info(f'Space created: id={space.id}, name={space.name}')
    return resp_200(data=space.model_dump())


@router.put('/{space_id}')
async def update_space(
    space_id: int,
    req: UpdateSpaceRequest,
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """更新空间 (仅管理员)"""
    space = WorkspaceSpaceDao.get_space_by_id(space_id)
    if not space:
        raise HTTPException(status_code=404, detail='空间不存在')

    if req.name is not None:
        space.name = req.name
    if req.description is not None:
        space.description = req.description
    if req.color is not None:
        space.color = req.color
    if req.sort_order is not None:
        space.sort_order = req.sort_order

    space = WorkspaceSpaceDao.update_space(space)
    return resp_200(data=space.model_dump())


@router.delete('/{space_id}')
async def delete_space(
    space_id: int,
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """删除空间 (仅管理员), 应用移至默认空间"""
    space = WorkspaceSpaceDao.get_space_by_id(space_id)
    if not space:
        raise HTTPException(status_code=404, detail='空间不存在')
    if space.is_default:
        raise HTTPException(status_code=400, detail='不能删除默认空间')

    from bisheng.database.models.flow import FlowDao
    all_spaces = WorkspaceSpaceDao.get_all_spaces()
    default_space = next((s for s in all_spaces if s.is_default), None)
    default_id = default_space.id if default_space else None

    FlowDao.batch_update_space(space_id, default_id)

    # 清除该空间的角色授权
    from bisheng.core.database import get_sync_db_session
    from sqlmodel import delete as sql_delete
    with get_sync_db_session() as session:
        stmt = sql_delete(RoleAccess).where(
            RoleAccess.type == AccessType.SPACE_READ.value,
            RoleAccess.third_id == str(space_id))
        session.exec(stmt)
        session.commit()

    ok = WorkspaceSpaceDao.delete_space(space_id)
    if not ok:
        raise HTTPException(status_code=400, detail='删除失败')
    return resp_200(message='删除成功')


@router.post('/move-flow')
async def move_flow_to_space(
    req: MoveFlowRequest,
    login_user: UserPayload = Depends(UserPayload.get_login_user),
):
    """移动应用到指定空间"""
    # 验证用户有目标空间权限
    if not login_user.is_admin():
        authorized_ids = get_user_authorized_space_ids(login_user)
        if req.space_id not in authorized_ids:
            raise HTTPException(status_code=403, detail='无权访问目标空间')

    from bisheng.database.models.flow import FlowDao
    flow = FlowDao.get_flow_by_id(req.flow_id)
    if flow:
        FlowDao.update_flow_space(req.flow_id, req.space_id)
        return resp_200(message='移动成功')

    raise HTTPException(status_code=404, detail='应用不存在')


@router.post('/batch-move')
async def batch_move_flows(
    req: BatchMoveRequest,
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """批量移动 (仅管理员)"""
    from bisheng.database.models.flow import FlowDao
    FlowDao.batch_update_space_by_ids(req.flow_ids, req.space_id)
    return resp_200(message='批量移动成功')


# ========== 空间角色授权管理 ==========

@router.get('/all-roles')
async def get_all_roles(
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """获取所有可用角色 (管理员用于授权管理)"""
    from bisheng.database.models.role import RoleDao
    roles = RoleDao.get_all_roles()
    return resp_200(data=[{'id': r.id, 'role_name': r.role_name, 'remark': r.remark or ''}
                          for r in roles])


@router.get('/{space_id}/roles')
async def get_space_roles(
    space_id: int,
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """获取被授权访问某空间的角色 ID 列表"""
    from bisheng.core.database import get_sync_db_session
    from sqlmodel import select
    with get_sync_db_session() as session:
        stmt = select(RoleAccess.role_id).where(
            RoleAccess.type == AccessType.SPACE_READ.value,
            RoleAccess.third_id == str(space_id))
        role_ids = session.exec(stmt).all()
    return resp_200(data=list(set(role_ids)))


@router.post('/{space_id}/roles')
async def set_space_roles(
    space_id: int,
    req: SpaceRolesRequest,
    admin_user: UserPayload = Depends(UserPayload.get_admin_user),
):
    """设置可以访问某空间的角色列表 (替换式更新)"""
    space = WorkspaceSpaceDao.get_space_by_id(space_id)
    if not space:
        raise HTTPException(status_code=404, detail='空间不存在')

    # 删除旧的授权记录
    from bisheng.core.database import get_sync_db_session
    from sqlmodel import delete as sql_delete
    with get_sync_db_session() as session:
        stmt = sql_delete(RoleAccess).where(
            RoleAccess.type == AccessType.SPACE_READ.value,
            RoleAccess.third_id == str(space_id))
        session.exec(stmt)

        # 添加新的授权记录
        for role_id in req.role_ids:
            ra = RoleAccess(role_id=role_id, third_id=str(space_id),
                            type=AccessType.SPACE_READ.value)
            session.add(ra)
        session.commit()

    logger.info(f'Space {space_id} roles updated: {req.role_ids}')
    return resp_200(message='授权更新成功')
