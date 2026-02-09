"""
企业微信 (WeCom) 扫码登录 SSO OAuth2 集成模块

企业微信 OAuth2 扫码登录流程:
1. 前端跳转到企业微信扫码页面 (构造二维码 URL)
2. 用户扫码授权后，企业微信重定向回 callback 携带 code
3. 后端用 corpid + corpsecret 获取 access_token
4. 用 access_token + code 获取用户身份 (userid)
5. 用 access_token + userid 获取用户详细信息
6. 创建/登录用户

提供以下端点:
- GET /oauth2/wecom/qr-params: 返回嵌入式扫码二维码所需的参数
- GET /oauth2/wecom/login: 重定向到企业微信扫码页面 (备用)
- GET /oauth2/wecom/callback: 处理企业微信登录回调
- GET /oauth2/wecom/config: 获取企业微信 SSO 配置 (管理员)
- POST /oauth2/wecom/config: 保存企业微信 SSO 配置 (管理员)
"""
import hashlib
import secrets
from urllib.parse import urlencode, quote

import httpx
import yaml
from fastapi import APIRouter, Depends, HTTPException, Request
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

router = APIRouter(prefix='', tags=['WeComOAuth2'])

# 企业微信 OAuth2 端点
# 企业微信扫码登录页面 (新版 SSO 登录)
WECOM_QR_AUTHORIZE_URL = 'https://login.work.weixin.qq.com/wwlogin/sso/login'
# 获取 access_token
WECOM_TOKEN_URL = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken'
# 用 code 获取用户身份
WECOM_USER_INFO_URL = 'https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo'
# 获取用户详细信息
WECOM_USER_DETAIL_URL = 'https://qyapi.weixin.qq.com/cgi-bin/user/get'

# Redis key prefix
WECOM_OAUTH_STATE_PREFIX = 'wecom_oauth_state:'
WECOM_TOKEN_CACHE_KEY = 'wecom_access_token'


def _get_wecom_config():
    """获取企业微信 SSO 配置"""
    login_method = settings.get_system_login_method()
    return login_method.wecom_sso


# ========== 扫码登录流程 ==========

@router.get('/oauth2/wecom/qr-params')
async def wecom_qr_params():
    """
    返回嵌入式企业微信扫码二维码所需的参数
    前端使用这些参数调用企业微信 JS SDK (WwLogin) 渲染二维码
    无需鉴权 - 登录页面使用
    """
    wecom_config = _get_wecom_config()
    if not wecom_config.enabled:
        raise HTTPException(status_code=400, detail='企业微信扫码登录未启用')

    if not all([wecom_config.corp_id, wecom_config.agent_id, wecom_config.secret, wecom_config.redirect_uri]):
        raise HTTPException(status_code=400, detail='企业微信 SSO 配置不完整')

    # 生成 state 参数防止 CSRF
    state = secrets.token_urlsafe(32)
    redis_client = await get_redis_client()
    await redis_client.aset(f'{WECOM_OAUTH_STATE_PREFIX}{state}', '1', expiration=600)

    return resp_200({
        'appid': wecom_config.corp_id,
        'agentid': wecom_config.agent_id,
        'redirect_uri': wecom_config.redirect_uri,
        'state': state,
    })


@router.get('/oauth2/wecom/login')
async def wecom_login():
    """
    重定向用户到企业微信扫码登录页面
    使用企业微信新版 SSO 扫码登录
    """
    wecom_config = _get_wecom_config()
    if not wecom_config.enabled:
        raise HTTPException(status_code=400, detail='企业微信扫码登录未启用')

    if not all([wecom_config.corp_id, wecom_config.agent_id, wecom_config.secret, wecom_config.redirect_uri]):
        raise HTTPException(status_code=400, detail='企业微信 SSO 配置不完整，请联系管理员')

    # 生成 state 参数防止 CSRF
    state = secrets.token_urlsafe(32)
    redis_client = await get_redis_client()
    await redis_client.aset(f'{WECOM_OAUTH_STATE_PREFIX}{state}', '1', expiration=600)

    # 构建企业微信扫码登录 URL
    params = {
        'login_type': 'CorpApp',
        'appid': wecom_config.corp_id,
        'agentid': wecom_config.agent_id,
        'redirect_uri': wecom_config.redirect_uri,
        'state': state,
    }

    redirect_url = f'{WECOM_QR_AUTHORIZE_URL}?{urlencode(params)}'
    return RedirectResponse(url=redirect_url)


@router.get('/oauth2/wecom/callback')
async def wecom_callback(request: Request, code: str = None, state: str = None,
                         appid: str = None):
    """
    处理企业微信扫码登录回调
    1. 验证 state 防止 CSRF
    2. 用 corpid + corpsecret 获取 access_token
    3. 用 access_token + code 获取用户 userid
    4. 用 access_token + userid 获取用户详细信息
    5. 自动创建/登录用户
    6. 设置 token 并重定向到首页
    """
    base_url = _get_frontend_base_url(request)

    if not code:
        return RedirectResponse(url=f'{base_url}?error=企业微信登录参数缺失')

    if not state:
        return RedirectResponse(url=f'{base_url}?error=企业微信登录状态参数缺失')

    # 验证 state
    redis_client = await get_redis_client()
    state_valid = await redis_client.aget(f'{WECOM_OAUTH_STATE_PREFIX}{state}')
    if not state_valid:
        return RedirectResponse(url=f'{base_url}?error=企业微信登录状态验证失败，请重试')

    # 清除已使用的 state
    await redis_client.delete(f'{WECOM_OAUTH_STATE_PREFIX}{state}')

    wecom_config = _get_wecom_config()

    try:
        # 1. 获取 access_token
        access_token = await _get_wecom_access_token(wecom_config)
        if not access_token:
            return RedirectResponse(url=f'{base_url}?error=企业微信access_token获取失败')

        # 2. 用 code 获取用户身份 (userid)
        user_identity = await _get_user_identity(access_token, code)
        if not user_identity:
            return RedirectResponse(url=f'{base_url}?error=企业微信用户身份获取失败')

        userid = user_identity.get('userid') or user_identity.get('UserId')
        if not userid:
            # 可能是外部联系人
            open_userid = user_identity.get('open_userid')
            if open_userid:
                return RedirectResponse(url=f'{base_url}?error=暂不支持外部联系人登录')
            return RedirectResponse(url=f'{base_url}?error=无法获取企业微信用户ID')

        # 3. 获取用户详细信息
        user_detail = await _get_user_detail(access_token, userid)

        logger.info(f'WeCom user info: userid={userid}, '
                     f'name={user_detail.get("name")}, '
                     f'email={user_detail.get("email")}, '
                     f'mobile={user_detail.get("mobile")}')

        # 4. 创建或获取用户
        user_exist = await _get_or_create_wecom_user(userid, user_detail)
        if not user_exist:
            return RedirectResponse(url=f'{base_url}?error=用户创建失败')

        # 检查用户是否被禁用
        if user_exist.delete == 1:
            return RedirectResponse(url=f'{base_url}?error=用户已被禁用，请联系管理员')

        # 5. 创建 JWT token
        auth_jwt = AuthJwt(req=request, res=None)
        jwt_access_token = LoginUser.create_access_token(user_exist, auth_jwt=auth_jwt)

        # 在 Redis 中记录登录会话
        await redis_client.aset(
            USER_CURRENT_SESSION.format(user_exist.user_id),
            jwt_access_token,
            settings.cookie_conf.jwt_token_expire_time + 3600
        )

        # 记录审计日志
        try:
            login_user = await LoginUser.init_login_user(
                user_id=user_exist.user_id, user_name=user_exist.user_name)
            AuditLogService.user_login(login_user, get_request_ip(request))
        except Exception as e:
            logger.warning(f'Failed to log WeCom login audit: {e}')

        # 重定向到前端页面，携带 token
        redirect_url = f'{base_url}?token={jwt_access_token}'
        return RedirectResponse(url=redirect_url)

    except Exception as e:
        logger.exception(f'WeCom OAuth callback error: {e}')
        return RedirectResponse(url=f'{base_url}?error=企业微信登录处理异常')


async def _get_wecom_access_token(wecom_config) -> str:
    """
    获取企业微信 access_token
    先从 Redis 缓存获取，未命中则从 API 获取并缓存
    """
    redis_client = await get_redis_client()
    cached_token = await redis_client.aget(WECOM_TOKEN_CACHE_KEY)
    if cached_token:
        return cached_token

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(WECOM_TOKEN_URL, params={
            'corpid': wecom_config.corp_id,
            'corpsecret': wecom_config.secret,
        })
        response.raise_for_status()
        data = response.json()

    if data.get('errcode') != 0:
        logger.error(f'WeCom get access_token failed: {data}')
        return None

    token = data.get('access_token')
    expires_in = data.get('expires_in', 7200)

    # 缓存 token，提前 300 秒过期避免边界问题
    await redis_client.aset(WECOM_TOKEN_CACHE_KEY, token, expiration=max(expires_in - 300, 60))

    return token


async def _get_user_identity(access_token: str, code: str) -> dict:
    """用 code 获取企业微信用户身份信息"""
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(WECOM_USER_INFO_URL, params={
            'access_token': access_token,
            'code': code,
        })
        response.raise_for_status()
        data = response.json()

    if data.get('errcode') != 0:
        logger.error(f'WeCom get user identity failed: {data}')
        return None

    return data


async def _get_user_detail(access_token: str, userid: str) -> dict:
    """获取企业微信用户详细信息"""
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(WECOM_USER_DETAIL_URL, params={
            'access_token': access_token,
            'userid': userid,
        })
        response.raise_for_status()
        data = response.json()

    if data.get('errcode') != 0:
        logger.warning(f'WeCom get user detail failed: {data}, fallback to userid only')
        return {'userid': userid}

    return data


async def _get_or_create_wecom_user(userid: str, user_detail: dict) -> User:
    """
    获取或创建企业微信用户
    企业微信 userid 作为系统用户名
    """
    # 优先使用 name (中文名) 作为账号显示，但 userid 作为唯一标识
    display_name = user_detail.get('name', userid)
    # 使用 userid 作为系统用户名 (保证唯一性)
    account_name = f'wecom_{userid}'

    user_exist = UserDao.get_unique_user_by_name(account_name)
    if not user_exist:
        logger.info(f'act=wecom_create_user account={account_name} name={display_name}')

        # 创建新用户，使用随机密码 (企业微信用户不需要密码登录)
        random_password = hashlib.md5(secrets.token_bytes(32)).hexdigest()
        user_exist = User(
            user_name=account_name,
            password=random_password,
            email=user_detail.get('email', '') or user_detail.get('biz_mail', ''),
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
        # 更新已有用户的邮箱信息 (如果为空)
        email = user_detail.get('email', '') or user_detail.get('biz_mail', '')
        if not user_exist.email and email:
            user_exist.email = email
            UserDao.update_user(user_exist)

    return user_exist


def _get_frontend_base_url(request: Request) -> str:
    """获取前端基础 URL，用于重定向"""
    origin = request.headers.get('origin', '')
    if origin:
        return origin

    scheme = request.url.scheme
    host = request.headers.get('host', request.url.hostname)
    return f'{scheme}://{host}'


# ========== 企业微信 SSO 配置管理 API ==========

class WecomSsoConfigRequest(BaseModel):
    """企业微信 SSO 配置请求模型"""
    enabled: bool = Field(default=False, description='是否启用企业微信扫码登录')
    corp_id: str = Field(default='', description='企业微信 CorpID')
    agent_id: str = Field(default='', description='企业微信应用 AgentId')
    secret: str = Field(default='', description='企业微信应用 Secret')
    redirect_uri: str = Field(default='', description='企业微信登录回调地址')


@router.get('/oauth2/wecom/config')
async def get_wecom_config_api(admin_user: UserPayload = Depends(UserPayload.get_admin_user)):
    """获取企业微信 SSO 配置 (仅管理员)"""
    wecom_config = _get_wecom_config()
    return resp_200({
        'enabled': wecom_config.enabled,
        'corp_id': wecom_config.corp_id or '',
        'agent_id': wecom_config.agent_id or '',
        'secret': _mask_secret(wecom_config.secret) if wecom_config.secret else '',
        'redirect_uri': wecom_config.redirect_uri or '',
    })


@router.post('/oauth2/wecom/config')
async def save_wecom_config_api(config: WecomSsoConfigRequest,
                                admin_user: UserPayload = Depends(UserPayload.get_admin_user)):
    """保存企业微信 SSO 配置 (仅管理员)"""
    try:
        # 从数据库获取当前完整配置
        db_config = ConfigDao.get_config(ConfigKeyEnum.INIT_DB)
        if not db_config:
            raise HTTPException(status_code=500, detail='系统配置未找到')

        config_dict = yaml.safe_load(db_config.value)
        if not isinstance(config_dict, dict):
            raise HTTPException(status_code=500, detail='系统配置格式错误')

        # 获取当前的 wecom_sso 配置
        system_login = config_dict.get('system_login_method', {})
        old_wecom = system_login.get('wecom_sso', {})

        # 如果 secret 是掩码值（包含•），则保留原值
        new_secret = config.secret
        if new_secret and '•' in new_secret:
            new_secret = old_wecom.get('secret', '')

        # 更新 wecom_sso 配置
        system_login['wecom_sso'] = {
            'enabled': config.enabled,
            'corp_id': config.corp_id,
            'agent_id': config.agent_id,
            'secret': new_secret,
            'redirect_uri': config.redirect_uri,
        }
        config_dict['system_login_method'] = system_login

        # 保存回数据库
        db_config.value = yaml.dump(config_dict, allow_unicode=True, default_flow_style=False)
        ConfigDao.insert_config(db_config)

        # 清除 Redis 缓存使配置立即生效
        redis_sync = get_redis_client_sync()
        redis_sync.delete('config:initdb_config')
        # 同时清除企业微信 access_token 缓存 (secret 可能已更改)
        redis_sync.delete(WECOM_TOKEN_CACHE_KEY)

        logger.info(f'WeCom SSO config updated by admin: {admin_user.user_name}, enabled={config.enabled}')
        return resp_200(message='企业微信 SSO 配置保存成功')
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f'Failed to save WeCom SSO config: {e}')
        raise HTTPException(status_code=500, detail=f'保存配置失败: {str(e)}')


def _mask_secret(secret: str) -> str:
    """掩码敏感信息，仅显示前4位和后4位"""
    if not secret or len(secret) <= 8:
        return '•' * len(secret) if secret else ''
    return secret[:4] + '•' * (len(secret) - 8) + secret[-4:]
