"""
工作空间 (Space) 模型 - 用于将工作流/技能/助手按环境分组

WorkspaceSpace: 空间定义 (如: 生产、测试、开发)
"""
from datetime import datetime
from typing import List, Optional

from sqlmodel import Field, select, Column, DateTime, text, func, desc
from sqlalchemy import Integer

from bisheng.common.models.base import SQLModelSerializable
from bisheng.core.database import get_sync_db_session


class WorkspaceSpaceBase(SQLModelSerializable):
    name: str = Field(index=True, max_length=100, description='空间名称')
    description: Optional[str] = Field(default='', max_length=500, description='空间描述')
    color: Optional[str] = Field(default='#3B82F6', max_length=20, description='标识颜色')
    sort_order: Optional[int] = Field(default=0, description='排序顺序')
    is_default: bool = Field(default=False, description='是否为默认空间')
    created_by: Optional[int] = Field(default=None, index=True)
    create_time: Optional[datetime] = Field(
        sa_column=Column(DateTime, nullable=False, server_default=text('CURRENT_TIMESTAMP')))
    update_time: Optional[datetime] = Field(
        sa_column=Column(DateTime, nullable=False, server_default=text('CURRENT_TIMESTAMP'),
                         onupdate=text('CURRENT_TIMESTAMP')))


class WorkspaceSpace(WorkspaceSpaceBase, table=True):
    __tablename__ = 'workspace_space'
    id: Optional[int] = Field(default=None, primary_key=True)


class WorkspaceSpaceDao(WorkspaceSpaceBase):

    @classmethod
    def get_all_spaces(cls) -> List[WorkspaceSpace]:
        with get_sync_db_session() as session:
            statement = select(WorkspaceSpace).order_by(WorkspaceSpace.sort_order,
                                                         WorkspaceSpace.id)
            return session.exec(statement).all()

    @classmethod
    def get_space_by_id(cls, space_id: int) -> Optional[WorkspaceSpace]:
        with get_sync_db_session() as session:
            return session.get(WorkspaceSpace, space_id)

    @classmethod
    def create_space(cls, space: WorkspaceSpace) -> WorkspaceSpace:
        with get_sync_db_session() as session:
            session.add(space)
            session.commit()
            session.refresh(space)
            return space

    @classmethod
    def update_space(cls, space: WorkspaceSpace) -> WorkspaceSpace:
        with get_sync_db_session() as session:
            session.add(space)
            session.commit()
            session.refresh(space)
            return space

    @classmethod
    def delete_space(cls, space_id: int) -> bool:
        with get_sync_db_session() as session:
            space = session.get(WorkspaceSpace, space_id)
            if not space:
                return False
            if space.is_default:
                return False  # 不允许删除默认空间
            session.delete(space)
            session.commit()
            return True

    @classmethod
    def init_default_spaces(cls):
        """初始化默认空间（如果尚未创建）"""
        with get_sync_db_session() as session:
            count = session.scalar(select(func.count()).select_from(WorkspaceSpace))
            if count == 0:
                defaults = [
                    WorkspaceSpace(name='生产', description='生产环境空间', color='#22C55E',
                                    sort_order=1, is_default=True),
                    WorkspaceSpace(name='测试', description='测试环境空间', color='#F59E0B',
                                    sort_order=2, is_default=False),
                    WorkspaceSpace(name='开发', description='开发环境空间', color='#3B82F6',
                                    sort_order=3, is_default=False),
                ]
                for space in defaults:
                    session.add(space)
                session.commit()
