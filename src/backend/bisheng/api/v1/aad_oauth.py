"""
Azure Active Directory (AAD) SSO OAuth2 集成模块

提供以下端点:
- GET /oauth2/list: 返回可用的 SSO 登录方式列表
- GET /oauth2/aad/login: 重定向到 AAD 登录页面
- GET /oauth2/aad/callback: 处理 AAD 登录回调，完成用户认证
- GET /oauth2/aad/config: 获取 AAD SSO 配置 (管理员)
- POST /oauth2/aad/config: 保存 AAD SSO 配置 (管理员)
"""
import hashlib
import secrets
from urllib.parse import urlencode

import httpx
import yaml
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from loguru import logger
from pydantic import BaseModel, Field

from bisheng.api.services.audit_log import AuditLogService
from bisheng.api.v1.schemas import resp_200
from bisheng.common.dependencies.user_deps import UserPayload
from bisheng.common.models.config import Config, ConfigDao, ConfigKeyEnum
from bisheng.common.services.config_service import settings
from bisheng.core.cache.redis_manager import get_redis_client, get_redis_client_sync
from bisheng.database.models.user_group import UserGroupDao
from bisheng.user.domain.models.user import User, UserDao
from bisheng.user.domain.services.auth import AuthJwt, LoginUser
from bisheng.utils import get_request_ip
from bisheng.utils.constants import USER_CURRENT_SESSION

router = APIRouter(prefix='', tags=['OAuth2'])

# AAD OAuth2 端点
AAD_AUTHORIZE_URL = 'https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize'
AAD_TOKEN_URL = 'https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token'
AAD_USER_INFO_URL = 'https://graph.microsoft.com/v1.0/me'

# Redis key for AAD OAuth state
AAD_OAUTH_STATE_PREFIX = 'aad_oauth_state:'


def _get_aad_config():
    """获取 AAD SSO 配置"""
    login_method = settings.get_system_login_method()
    return login_method.aad_sso


@router.get('/oauth2/list')
async def get_sso_list():
    """
    返回可用的 SSO 登录方式列表
    前端通过此接口判断展示哪些第三方登录按钮
    """
    result = {
        'sso': '',
        'wx': '',
        'ldap': False,
        'aad': False,
        'wecom': False,
    }

    login_method = settings.get_system_login_method()

    # 检查 AAD SSO 配置
    aad_config = login_method.aad_sso
    if aad_config.enabled and aad_config.client_id and aad_config.tenant_id:
        result['aad'] = True

    # 检查企业微信 SSO 配置
    wecom_config = login_method.wecom_sso
    if wecom_config.enabled and wecom_config.corp_id and wecom_config.agent_id and wecom_config.secret:
        result['wecom'] = True

    # 兼容已有的商业版SSO逻辑
    if login_method.bisheng_pro:
        result['sso'] = ''  # 商业版SSO URL由网关提供

    return resp_200(result)


@router.get('/oauth2/aad/login')
async def aad_login():
    """
    重定向用户到 AAD 登录页面
    """
    aad_config = _get_aad_config()
    if not aad_config.enabled:
        raise HTTPException(status_code=400, detail='AAD SSO 登录未启用')

    if not all([aad_config.client_id, aad_config.tenant_id, aad_config.redirect_uri]):
        raise HTTPException(status_code=400, detail='AAD SSO 配置不完整，请联系管理员')

    # 生成 state 参数防止 CSRF
    state = secrets.token_urlsafe(32)
    redis_client = await get_redis_client()
    await redis_client.aset(f'{AAD_OAUTH_STATE_PREFIX}{state}', '1', expiration=600)

    # 构建 AAD 授权 URL
    authorize_url = AAD_AUTHORIZE_URL.format(tenant_id=aad_config.tenant_id)
    params = {
        'client_id': aad_config.client_id,
        'response_type': 'code',
        'redirect_uri': aad_config.redirect_uri,
        'response_mode': 'query',
        'scope': 'openid profile email User.Read',
        'state': state,
    }

    redirect_url = f'{authorize_url}?{urlencode(params)}'
    return RedirectResponse(url=redirect_url)


@router.get('/oauth2/aad/callback')
async def aad_callback(request: Request, code: str = None, state: str = None,
                       error: str = None, error_description: str = None):
    """
    处理 AAD 登录回调
    1. 验证 state 防止 CSRF
    2. 使用 code 换取 access_token
    3. 使用 access_token 获取用户信息
    4. 自动创建/登录用户
    5. 设置 cookie 并重定向到首页
    """
    # 获取前端重定向基础URL
    base_url = _get_frontend_base_url(request)

    # 检查 AAD 返回的错误
    if error:
        logger.error(f'AAD OAuth error: {error}, description: {error_description}')
        return RedirectResponse(url=f'{base_url}?error=AAD登录失败: {error_description}')

    if not code or not state:
        return RedirectResponse(url=f'{base_url}?error=AAD登录参数缺失')

    # 验证 state
    redis_client = await get_redis_client()
    state_valid = await redis_client.aget(f'{AAD_OAUTH_STATE_PREFIX}{state}')
    if not state_valid:
        return RedirectResponse(url=f'{base_url}?error=AAD登录状态验证失败，请重试')

    # 清除已使用的 state
    await redis_client.delete(f'{AAD_OAUTH_STATE_PREFIX}{state}')

    aad_config = _get_aad_config()

    try:
        # 使用授权码换取 access_token
        token_data = await _exchange_code_for_token(aad_config, code)
        aad_access_token = token_data.get('access_token')
        if not aad_access_token:
            logger.error(f'AAD token exchange failed: {token_data}')
            return RedirectResponse(url=f'{base_url}?error=AAD令牌获取失败')

        # 使用 access_token 获取用户信息
        user_info = await _get_aad_user_info(aad_access_token)
        if not user_info:
            return RedirectResponse(url=f'{base_url}?error=AAD用户信息获取失败')

        logger.info(f'AAD user info: id={user_info.get("id")}, '
                     f'displayName={user_info.get("displayName")}, '
                     f'mail={user_info.get("mail")}, '
                     f'userPrincipalName={user_info.get("userPrincipalName")}')

        # 确定用户名: 优先使用 mail，否则使用 userPrincipalName
        account_name = (user_info.get('mail')
                        or user_info.get('userPrincipalName')
                        or user_info.get('displayName'))
        if not account_name:
            return RedirectResponse(url=f'{base_url}?error=无法从AAD获取用户名')

        # 创建或获取用户
        user_exist = await _get_or_create_user(account_name, user_info)
        if not user_exist:
            return RedirectResponse(url=f'{base_url}?error=用户创建失败')

        # 检查用户是否被禁用
        if user_exist.delete == 1:
            return RedirectResponse(url=f'{base_url}?error=用户已被禁用，请联系管理员')

        # 创建 JWT token
        auth_jwt = AuthJwt(req=request, res=None)
        access_token = LoginUser.create_access_token(user_exist, auth_jwt=auth_jwt)

        # 在 Redis 中记录登录会话
        await redis_client.aset(
            USER_CURRENT_SESSION.format(user_exist.user_id),
            access_token,
            settings.cookie_conf.jwt_token_expire_time + 3600
        )

        # 记录审计日志
        try:
            login_user = await LoginUser.init_login_user(
                user_id=user_exist.user_id, user_name=user_exist.user_name)
            AuditLogService.user_login(login_user, get_request_ip(request))
        except Exception as e:
            logger.warning(f'Failed to log AAD login audit: {e}')

        # 重定向到前端页面，携带 token
        redirect_url = f'{base_url}?token={access_token}'
        return RedirectResponse(url=redirect_url)

    except Exception as e:
        logger.exception(f'AAD OAuth callback error: {e}')
        return RedirectResponse(url=f'{base_url}?error=AAD登录处理异常')


async def _exchange_code_for_token(aad_config, code: str) -> dict:
    """使用授权码换取 access_token"""
    token_url = AAD_TOKEN_URL.format(tenant_id=aad_config.tenant_id)
    data = {
        'client_id': aad_config.client_id,
        'client_secret': aad_config.client_secret,
        'code': code,
        'redirect_uri': aad_config.redirect_uri,
        'grant_type': 'authorization_code',
        'scope': 'openid profile email User.Read',
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(token_url, data=data)
        response.raise_for_status()
        return response.json()


async def _get_aad_user_info(access_token: str) -> dict:
    """使用 access_token 获取 AAD 用户信息"""
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            AAD_USER_INFO_URL,
            headers={'Authorization': f'Bearer {access_token}'}
        )
        response.raise_for_status()
        return response.json()


async def _get_or_create_user(account_name: str, user_info: dict) -> User:
    """
    获取或创建用户
    如果用户不存在则自动创建
    """
    user_exist = UserDao.get_unique_user_by_name(account_name)
    if not user_exist:
        logger.info(f'act=aad_create_user account={account_name}')

        # 创建新用户, 使用随机密码(AAD SSO用户不需要密码登录)
        random_password = hashlib.md5(secrets.token_bytes(32)).hexdigest()
        user_exist = User(
            user_name=account_name,
            password=random_password,
            email=user_info.get('mail', ''),
        )

        # 检查是否需要设置为管理员
        default_admin = settings.get_system_login_method().admin_username
        user_all = UserDao.get_all_users(page=1, limit=1)

        if len(user_all) == 0 or (default_admin and default_admin == account_name):
            user_exist = await UserDao.add_user_and_admin_role(user_exist)
        else:
            user_exist = await UserDao.add_user_and_default_role(user_exist)

        # 添加到默认用户组
        await UserGroupDao.add_default_user_group(user_exist.user_id)
    else:
        # 更新已有用户的邮箱信息(如果为空)
        if not user_exist.email and user_info.get('mail'):
            user_exist.email = user_info.get('mail')
            UserDao.update_user(user_exist)

    return user_exist


def _get_frontend_base_url(request: Request) -> str:
    """
    获取前端基础 URL，用于重定向
    优先使用 Origin/Referer header，否则构造默认URL
    """
    origin = request.headers.get('origin', '')
    if origin:
        return origin

    # 从请求 URL 构造
    scheme = request.url.scheme
    host = request.headers.get('host', request.url.hostname)
    return f'{scheme}://{host}'


# ========== AAD SSO 配置管理 API ==========

class AadSsoConfigRequest(BaseModel):
    """AAD SSO 配置请求模型"""
    enabled: bool = Field(default=False, description='是否启用AAD SSO登录')
    client_id: str = Field(default='', description='AAD 应用的 Client ID')
    client_secret: str = Field(default='', description='AAD 应用的 Client Secret')
    tenant_id: str = Field(default='', description='AAD 租户 ID')
    redirect_uri: str = Field(default='', description='AAD 登录回调地址')


@router.get('/oauth2/aad/config')
async def get_aad_config(admin_user: UserPayload = Depends(UserPayload.get_admin_user)):
    """获取 AAD SSO 配置 (仅管理员)"""
    aad_config = _get_aad_config()
    return resp_200({
        'enabled': aad_config.enabled,
        'client_id': aad_config.client_id or '',
        'client_secret': _mask_secret(aad_config.client_secret) if aad_config.client_secret else '',
        'tenant_id': aad_config.tenant_id or '',
        'redirect_uri': aad_config.redirect_uri or '',
    })


@router.post('/oauth2/aad/config')
async def save_aad_config(config: AadSsoConfigRequest,
                          admin_user: UserPayload = Depends(UserPayload.get_admin_user)):
    """保存 AAD SSO 配置 (仅管理员)"""
    try:
        # 从数据库获取当前完整配置
        db_config = ConfigDao.get_config(ConfigKeyEnum.INIT_DB)
        if not db_config:
            raise HTTPException(status_code=500, detail='系统配置未找到')

        config_dict = yaml.safe_load(db_config.value)
        if not isinstance(config_dict, dict):
            raise HTTPException(status_code=500, detail='系统配置格式错误')

        # 获取当前的 aad_sso 配置
        system_login = config_dict.get('system_login_method', {})
        old_aad = system_login.get('aad_sso', {})

        # 如果 client_secret 是掩码值（包含*），则保留原值
        new_secret = config.client_secret
        if new_secret and '•' in new_secret:
            new_secret = old_aad.get('client_secret', '')

        # 更新 aad_sso 配置
        system_login['aad_sso'] = {
            'enabled': config.enabled,
            'client_id': config.client_id,
            'client_secret': new_secret,
            'tenant_id': config.tenant_id,
            'redirect_uri': config.redirect_uri,
        }
        config_dict['system_login_method'] = system_login

        # 保存回数据库 (保持 YAML 格式)
        db_config.value = yaml.dump(config_dict, allow_unicode=True, default_flow_style=False)
        ConfigDao.insert_config(db_config)

        # 清除 Redis 缓存使配置立即生效
        get_redis_client_sync().delete('config:initdb_config')

        logger.info(f'AAD SSO config updated by admin: {admin_user.user_name}, enabled={config.enabled}')
        return resp_200(message='AAD SSO 配置保存成功')
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f'Failed to save AAD SSO config: {e}')
        raise HTTPException(status_code=500, detail=f'保存配置失败: {str(e)}')


def _mask_secret(secret: str) -> str:
    """掩码敏感信息，仅显示前4位和后4位"""
    if not secret or len(secret) <= 8:
        return '•' * len(secret) if secret else ''
    return secret[:4] + '•' * (len(secret) - 8) + secret[-4:]
