import axios from "../request";

export interface TokenByUserItem {
    user_name: string;
    user_id: number | null;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    invoke_count: number;
}

export interface TokenByAppItem {
    app_name: string;
    app_id: string | null;
    app_type: string | null;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    invoke_count: number;
}

export interface UserDetailAppItem {
    app_name: string;
    app_id: string | null;
    app_type: string | null;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    invoke_count: number;
}

export interface AppDailyItem {
    date: string;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    invoke_count: number;
}

export interface PaginatedResult<T> {
    list: T[];
    total: number;
    page: number;
    page_size: number;
}

export interface AppDetailResult {
    app_name: string;
    total_tokens: number;
    daily: AppDailyItem[];
    users: { user_name: string; total_tokens: number; invoke_count: number }[];
    start_date: string;
    end_date: string;
}

// 按用户统计 token 消耗
export async function getTokenStatsByUser(params: {
    page?: number;
    page_size?: number;
    user_name?: string;
    start_date?: string;
    end_date?: string;
}): Promise<PaginatedResult<TokenByUserItem>> {
    const res = await axios.get('/api/v1/token-stats/by-user', { params });
    return res.data?.data || { list: [], total: 0, page: 1, page_size: 10 };
}

// 查询某个用户的应用消耗明细
export async function getTokenStatsUserDetail(params: {
    user_name: string;
    page?: number;
    page_size?: number;
    start_date?: string;
    end_date?: string;
}): Promise<PaginatedResult<UserDetailAppItem>> {
    const res = await axios.get('/api/v1/token-stats/user-detail', { params });
    return res.data?.data || { list: [], total: 0, page: 1, page_size: 10 };
}

// 按应用统计 token 消耗
export async function getTokenStatsByApp(params: {
    page?: number;
    page_size?: number;
    app_name?: string;
    start_date?: string;
    end_date?: string;
}): Promise<PaginatedResult<TokenByAppItem>> {
    const res = await axios.get('/api/v1/token-stats/by-app', { params });
    return res.data?.data || { list: [], total: 0, page: 1, page_size: 10 };
}

// 查询某个应用的每日消耗明细
export async function getTokenStatsAppDetail(params: {
    app_name: string;
    start_date?: string;
    end_date?: string;
}): Promise<AppDetailResult> {
    const res = await axios.get('/api/v1/token-stats/app-detail', { params });
    return res.data?.data || { app_name: '', total_tokens: 0, daily: [], users: [] };
}
