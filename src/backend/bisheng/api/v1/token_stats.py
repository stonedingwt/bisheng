"""Token consumption statistics API endpoints.

Provides aggregated token usage reports by user and by application,
querying data from the Elasticsearch telemetry index.
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query

from bisheng.common.dependencies.user_deps import UserPayload
from bisheng.api.v1.schemas import resp_200
from bisheng.core.search.elasticsearch.manager import get_statistics_es_connection

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/token-stats', tags=['TokenStats'])

INDEX_NAME = 'base_telemetry_events'


@router.get('/by-user')
async def token_stats_by_user(
        page: int = Query(1, ge=1),
        page_size: int = Query(10, ge=1, le=100),
        user_name: Optional[str] = Query(None, description='Filter by user name'),
        start_date: Optional[str] = Query(None, description='Start date (YYYY-MM-DD)'),
        end_date: Optional[str] = Query(None, description='End date (YYYY-MM-DD)'),
        login_user: UserPayload = Depends(UserPayload.get_login_user),
):
    """Get token consumption statistics aggregated by user.

    Returns total_token, input_token, output_token for each user,
    sorted by total_token descending.
    """
    try:
        es = await get_statistics_es_connection()

        # Build must clauses
        must_clauses = [{'term': {'event_type': 'model_invoke'}}]

        if user_name:
            must_clauses.append({'wildcard': {'user_context.user_name': f'*{user_name}*'}})

        if start_date or end_date:
            range_filter = {}
            if start_date:
                range_filter['gte'] = start_date
            if end_date:
                range_filter['lte'] = end_date + 'T23:59:59'
            must_clauses.append({'range': {'timestamp': range_filter}})

        query_body = {
            'size': 0,
            'query': {'bool': {'must': must_clauses}},
            'aggs': {
                'by_user': {
                    'terms': {
                        'field': 'user_context.user_name',
                        'size': 10000,
                        'order': {'total_tokens': 'desc'},
                    },
                    'aggs': {
                        'total_tokens': {'sum': {'field': 'event_data.model_invoke_total_token'}},
                        'input_tokens': {'sum': {'field': 'event_data.model_invoke_input_token'}},
                        'output_tokens': {'sum': {'field': 'event_data.model_invoke_output_token'}},
                        'user_id': {'terms': {'field': 'user_context.user_id', 'size': 1}},
                    }
                }
            }
        }

        result = await es.search(index=INDEX_NAME, body=query_body)
        buckets = result.get('aggregations', {}).get('by_user', {}).get('buckets', [])

        total = len(buckets)
        start = (page - 1) * page_size
        end = start + page_size
        page_buckets = buckets[start:end]

        data = []
        for b in page_buckets:
            user_id_buckets = b.get('user_id', {}).get('buckets', [])
            data.append({
                'user_name': b['key'],
                'user_id': user_id_buckets[0]['key'] if user_id_buckets else None,
                'total_tokens': int(b['total_tokens']['value']),
                'input_tokens': int(b['input_tokens']['value']),
                'output_tokens': int(b['output_tokens']['value']),
                'invoke_count': b['doc_count'],
            })

        return resp_200(data={'list': data, 'total': total, 'page': page, 'page_size': page_size})
    except Exception as e:
        logger.error(f'Error querying user token stats: {e}', exc_info=True)
        return resp_200(data={'list': [], 'total': 0, 'page': page, 'page_size': page_size})


@router.get('/user-detail')
async def token_stats_user_detail(
        user_name: str = Query(..., description='User name to query'),
        page: int = Query(1, ge=1),
        page_size: int = Query(10, ge=1, le=100),
        start_date: Optional[str] = Query(None),
        end_date: Optional[str] = Query(None),
        login_user: UserPayload = Depends(UserPayload.get_login_user),
):
    """Get token breakdown by app for a specific user."""
    try:
        es = await get_statistics_es_connection()

        must_clauses = [
            {'term': {'event_type': 'model_invoke'}},
            {'term': {'user_context.user_name': user_name}},
        ]

        if start_date or end_date:
            range_filter = {}
            if start_date:
                range_filter['gte'] = start_date
            if end_date:
                range_filter['lte'] = end_date + 'T23:59:59'
            must_clauses.append({'range': {'timestamp': range_filter}})

        query_body = {
            'size': 0,
            'query': {'bool': {'must': must_clauses}},
            'aggs': {
                'by_app': {
                    'terms': {
                        'field': 'event_data.model_invoke_app_name',
                        'size': 10000,
                        'order': {'total_tokens': 'desc'},
                    },
                    'aggs': {
                        'total_tokens': {'sum': {'field': 'event_data.model_invoke_total_token'}},
                        'input_tokens': {'sum': {'field': 'event_data.model_invoke_input_token'}},
                        'output_tokens': {'sum': {'field': 'event_data.model_invoke_output_token'}},
                        'app_id': {'terms': {'field': 'event_data.model_invoke_app_id', 'size': 1}},
                        'app_type': {'terms': {'field': 'event_data.model_invoke_app_type', 'size': 1}},
                    }
                }
            }
        }

        result = await es.search(index=INDEX_NAME, body=query_body)
        buckets = result.get('aggregations', {}).get('by_app', {}).get('buckets', [])

        total = len(buckets)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_buckets = buckets[start_idx:end_idx]

        data = []
        for b in page_buckets:
            app_id_buckets = b.get('app_id', {}).get('buckets', [])
            app_type_buckets = b.get('app_type', {}).get('buckets', [])
            data.append({
                'app_name': b['key'],
                'app_id': app_id_buckets[0]['key'] if app_id_buckets else None,
                'app_type': app_type_buckets[0]['key'] if app_type_buckets else None,
                'total_tokens': int(b['total_tokens']['value']),
                'input_tokens': int(b['input_tokens']['value']),
                'output_tokens': int(b['output_tokens']['value']),
                'invoke_count': b['doc_count'],
            })

        return resp_200(data={'list': data, 'total': total, 'page': page, 'page_size': page_size})
    except Exception as e:
        logger.error(f'Error querying user detail token stats: {e}', exc_info=True)
        return resp_200(data={'list': [], 'total': 0, 'page': page, 'page_size': page_size})


@router.get('/by-app')
async def token_stats_by_app(
        page: int = Query(1, ge=1),
        page_size: int = Query(10, ge=1, le=100),
        app_name: Optional[str] = Query(None, description='Filter by app name'),
        start_date: Optional[str] = Query(None),
        end_date: Optional[str] = Query(None),
        login_user: UserPayload = Depends(UserPayload.get_login_user),
):
    """Get token consumption statistics aggregated by application.

    Returns total_token, input_token, output_token for each app,
    sorted by total_token descending.
    """
    try:
        es = await get_statistics_es_connection()

        must_clauses = [{'term': {'event_type': 'model_invoke'}}]

        if app_name:
            must_clauses.append({'wildcard': {'event_data.model_invoke_app_name': f'*{app_name}*'}})

        if start_date or end_date:
            range_filter = {}
            if start_date:
                range_filter['gte'] = start_date
            if end_date:
                range_filter['lte'] = end_date + 'T23:59:59'
            must_clauses.append({'range': {'timestamp': range_filter}})

        query_body = {
            'size': 0,
            'query': {'bool': {'must': must_clauses}},
            'aggs': {
                'by_app': {
                    'terms': {
                        'field': 'event_data.model_invoke_app_name',
                        'size': 10000,
                        'order': {'total_tokens': 'desc'},
                    },
                    'aggs': {
                        'total_tokens': {'sum': {'field': 'event_data.model_invoke_total_token'}},
                        'input_tokens': {'sum': {'field': 'event_data.model_invoke_input_token'}},
                        'output_tokens': {'sum': {'field': 'event_data.model_invoke_output_token'}},
                        'app_id': {'terms': {'field': 'event_data.model_invoke_app_id', 'size': 1}},
                        'app_type': {'terms': {'field': 'event_data.model_invoke_app_type', 'size': 1}},
                    }
                }
            }
        }

        result = await es.search(index=INDEX_NAME, body=query_body)
        buckets = result.get('aggregations', {}).get('by_app', {}).get('buckets', [])

        total = len(buckets)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_buckets = buckets[start_idx:end_idx]

        data = []
        for b in page_buckets:
            app_id_buckets = b.get('app_id', {}).get('buckets', [])
            app_type_buckets = b.get('app_type', {}).get('buckets', [])
            data.append({
                'app_name': b['key'],
                'app_id': app_id_buckets[0]['key'] if app_id_buckets else None,
                'app_type': app_type_buckets[0]['key'] if app_type_buckets else None,
                'total_tokens': int(b['total_tokens']['value']),
                'input_tokens': int(b['input_tokens']['value']),
                'output_tokens': int(b['output_tokens']['value']),
                'invoke_count': b['doc_count'],
            })

        return resp_200(data={'list': data, 'total': total, 'page': page, 'page_size': page_size})
    except Exception as e:
        logger.error(f'Error querying app token stats: {e}', exc_info=True)
        return resp_200(data={'list': [], 'total': 0, 'page': page, 'page_size': page_size})


@router.get('/app-detail')
async def token_stats_app_detail(
        app_name: str = Query(..., description='App name to query'),
        start_date: Optional[str] = Query(None),
        end_date: Optional[str] = Query(None),
        login_user: UserPayload = Depends(UserPayload.get_login_user),
):
    """Get daily token breakdown for a specific application."""
    try:
        es = await get_statistics_es_connection()

        # Default to last 30 days if no date range
        if not start_date and not end_date:
            end_dt = datetime.now()
            start_dt = end_dt - timedelta(days=30)
            start_date = start_dt.strftime('%Y-%m-%d')
            end_date = end_dt.strftime('%Y-%m-%d')

        must_clauses = [
            {'term': {'event_type': 'model_invoke'}},
            {'term': {'event_data.model_invoke_app_name': app_name}},
        ]

        range_filter = {}
        if start_date:
            range_filter['gte'] = start_date
        if end_date:
            range_filter['lte'] = end_date + 'T23:59:59'
        if range_filter:
            must_clauses.append({'range': {'timestamp': range_filter}})

        query_body = {
            'size': 0,
            'query': {'bool': {'must': must_clauses}},
            'aggs': {
                'by_day': {
                    'date_histogram': {
                        'field': 'timestamp',
                        'calendar_interval': 'day',
                        'format': 'yyyy-MM-dd',
                        'min_doc_count': 0,
                        'extended_bounds': {
                            'min': start_date,
                            'max': end_date,
                        }
                    },
                    'aggs': {
                        'total_tokens': {'sum': {'field': 'event_data.model_invoke_total_token'}},
                        'input_tokens': {'sum': {'field': 'event_data.model_invoke_input_token'}},
                        'output_tokens': {'sum': {'field': 'event_data.model_invoke_output_token'}},
                    }
                },
                'total_sum': {'sum': {'field': 'event_data.model_invoke_total_token'}},
                'by_user': {
                    'terms': {
                        'field': 'user_context.user_name',
                        'size': 100,
                        'order': {'total_tokens': 'desc'},
                    },
                    'aggs': {
                        'total_tokens': {'sum': {'field': 'event_data.model_invoke_total_token'}},
                    }
                }
            }
        }

        result = await es.search(index=INDEX_NAME, body=query_body)
        aggs = result.get('aggregations', {})

        daily = []
        for b in aggs.get('by_day', {}).get('buckets', []):
            daily.append({
                'date': b['key_as_string'],
                'total_tokens': int(b['total_tokens']['value']),
                'input_tokens': int(b['input_tokens']['value']),
                'output_tokens': int(b['output_tokens']['value']),
                'invoke_count': b['doc_count'],
            })

        users = []
        for b in aggs.get('by_user', {}).get('buckets', []):
            users.append({
                'user_name': b['key'],
                'total_tokens': int(b['total_tokens']['value']),
                'invoke_count': b['doc_count'],
            })

        return resp_200(data={
            'app_name': app_name,
            'total_tokens': int(aggs.get('total_sum', {}).get('value', 0)),
            'daily': daily,
            'users': users,
            'start_date': start_date,
            'end_date': end_date,
        })
    except Exception as e:
        logger.error(f'Error querying app detail token stats: {e}', exc_info=True)
        return resp_200(data={
            'app_name': app_name,
            'total_tokens': 0,
            'daily': [],
            'users': [],
        })
