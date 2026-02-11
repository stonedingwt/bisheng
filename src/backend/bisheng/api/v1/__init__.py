from bisheng.api.v1.aad_oauth import router as aad_oauth_router
from bisheng.api.v1.wecom_oauth import router as wecom_oauth_router
from bisheng.api.v1.scheduled_task import router as scheduled_task_router
from bisheng.api.v1.workspace_space import router as workspace_space_router
from bisheng.api.v1.token_stats import router as token_stats_router
from bisheng.api.v1.assistant import router as assistant_router
from bisheng.api.v1.audit import router as audit_router
from bisheng.api.v1.chat import router as chat_router
from bisheng.api.v1.component import router as component_router
from bisheng.api.v1.endpoints import router as endpoints_router
from bisheng.api.v1.evaluation import router as evaluation_router
from bisheng.api.v1.flows import router as flows_router
from bisheng.api.v1.invite_code import router as invite_code_router
from bisheng.api.v1.mark_task import router as mark_router
from bisheng.api.v1.report import router as report_router
from bisheng.api.v1.skillcenter import router as skillcenter_router
from bisheng.api.v1.tag import router as tag_router
from bisheng.api.v1.usergroup import router as group_router
from bisheng.api.v1.validate import router as validate_router
from bisheng.api.v1.variable import router as variable_router
from bisheng.api.v1.workflow import router as workflow_router
from bisheng.api.v1.workstation import router as workstation_router
from bisheng.tool.api.tool import router as tool_router
from bisheng.user.api.user import router as user_router

from bisheng.langgraph.api import langgraph_router

__all__ = [
    'aad_oauth_router',
    'wecom_oauth_router',
    'scheduled_task_router',
    'workspace_space_router',
    'chat_router',
    'endpoints_router',
    'validate_router',
    'flows_router',
    'skillcenter_router',
    'user_router',
    'variable_router',
    'report_router',
    'component_router',
    'assistant_router',
    'evaluation_router',
    'group_router',
    'audit_router',
    'tag_router',
    'workflow_router',
    'mark_router',
    'workstation_router',
    "tool_router",
    "invite_code_router",
    "token_stats_router",
    "langgraph_router",
]
