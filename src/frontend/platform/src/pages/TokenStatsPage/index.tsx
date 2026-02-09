import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/bs-ui/button";
import { Input } from "@/components/bs-ui/input";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/bs-ui/table";
import { LoadingIcon } from "@/components/bs-icons/loading";
import {
    getTokenStatsByUser, getTokenStatsByApp,
    getTokenStatsUserDetail, getTokenStatsAppDetail,
    TokenByUserItem, TokenByAppItem, UserDetailAppItem, AppDailyItem,
} from "@/controllers/API/token_stats";
import { ChevronDown, ChevronLeft, ArrowUpDown, Search, User, Layers, BarChart3, Calendar } from "lucide-react";

// 格式化 token 数量
function formatTokens(n: number): string {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
}

// 简易条形图
function BarCell({ value, max }: { value: number; max: number }) {
    const pct = max > 0 ? Math.max((value / max) * 100, 1) : 0;
    return (
        <div className="flex items-center gap-2 min-w-[140px]">
            <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                <div className="h-full bg-blue-500 dark:bg-blue-600 rounded transition-all"
                    style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-mono whitespace-nowrap w-16 text-right">{formatTokens(value)}</span>
        </div>
    );
}

// ======================== 用户 Token 消耗报表 ========================
function UserTokenReport() {
    const { t } = useTranslation();
    const [data, setData] = useState<TokenByUserItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // 用户明细
    const [detailUser, setDetailUser] = useState<string | null>(null);
    const [detailData, setDetailData] = useState<UserDetailAppItem[]>([]);
    const [detailTotal, setDetailTotal] = useState(0);
    const [detailPage, setDetailPage] = useState(1);
    const [detailLoading, setDetailLoading] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getTokenStatsByUser({
                page, page_size: pageSize,
                user_name: search || undefined,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
            });
            setData(res.list);
            setTotal(res.total);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, search, startDate, endDate]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const fetchDetail = useCallback(async () => {
        if (!detailUser) return;
        setDetailLoading(true);
        try {
            const res = await getTokenStatsUserDetail({
                user_name: detailUser,
                page: detailPage,
                page_size: 10,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
            });
            setDetailData(res.list);
            setDetailTotal(res.total);
        } finally {
            setDetailLoading(false);
        }
    }, [detailUser, detailPage, startDate, endDate]);

    useEffect(() => { fetchDetail(); }, [fetchDetail]);

    const maxToken = data.length > 0 ? Math.max(...data.map(d => d.total_tokens)) : 0;
    const detailMaxToken = detailData.length > 0 ? Math.max(...detailData.map(d => d.total_tokens)) : 0;

    const handleSearch = () => {
        setPage(1);
        setSearch(searchInput);
    };

    if (detailUser) {
        return (
            <div>
                <div className="flex items-center gap-3 mb-4">
                    <Button variant="ghost" size="sm" onClick={() => { setDetailUser(null); setDetailPage(1); }}>
                        <ChevronLeft className="w-4 h-4 mr-1" /> {t('tokenStats.backToList')}
                    </Button>
                    <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-500" />
                        <span className="font-semibold text-lg">{detailUser}</span>
                        <span className="text-sm text-gray-500">- {t('tokenStats.appBreakdown')}</span>
                    </div>
                </div>
                {detailLoading ? (
                    <div className="flex justify-center py-20"><LoadingIcon /></div>
                ) : (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('tokenStats.appName')}</TableHead>
                                    <TableHead>{t('tokenStats.appType')}</TableHead>
                                    <TableHead>{t('tokenStats.totalTokens')}</TableHead>
                                    <TableHead className="text-right">{t('tokenStats.inputTokens')}</TableHead>
                                    <TableHead className="text-right">{t('tokenStats.outputTokens')}</TableHead>
                                    <TableHead className="text-right">{t('tokenStats.invokeCount')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {detailData.map((item, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="font-medium">{item.app_name || '-'}</TableCell>
                                        <TableCell>
                                            <span className="px-2 py-0.5 text-xs rounded bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                                                {item.app_type || '-'}
                                            </span>
                                        </TableCell>
                                        <TableCell><BarCell value={item.total_tokens} max={detailMaxToken} /></TableCell>
                                        <TableCell className="text-right font-mono text-sm">{formatTokens(item.input_tokens)}</TableCell>
                                        <TableCell className="text-right font-mono text-sm">{formatTokens(item.output_tokens)}</TableCell>
                                        <TableCell className="text-right font-mono text-sm">{item.invoke_count.toLocaleString()}</TableCell>
                                    </TableRow>
                                ))}
                                {detailData.length === 0 && (
                                    <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-10">{t('tokenStats.noData')}</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                        {detailTotal > 10 && detailPage * 10 < detailTotal && (
                            <div className="flex justify-center mt-4">
                                <Button variant="outline" size="sm" onClick={() => setDetailPage(p => p + 1)}>
                                    <ChevronDown className="w-4 h-4 mr-1" /> {t('tokenStats.loadMore')}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }

    return (
        <div>
            {/* 搜索和筛选栏 */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-1">
                    <Input
                        placeholder={t('tokenStats.searchUser')}
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="w-48 h-8"
                    />
                    <Button variant="outline" size="sm" className="h-8" onClick={handleSearch}>
                        <Search className="w-3.5 h-3.5" />
                    </Button>
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }}
                        className="border rounded px-2 py-1 h-8 text-xs bg-background" />
                    <span>~</span>
                    <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }}
                        className="border rounded px-2 py-1 h-8 text-xs bg-background" />
                </div>
                <span className="text-xs text-gray-400 ml-auto">
                    {t('tokenStats.totalUsers')}: {total}
                </span>
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><LoadingIcon /></div>
            ) : (
                <>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]">#</TableHead>
                                <TableHead>{t('tokenStats.userName')}</TableHead>
                                <TableHead>{t('tokenStats.totalTokens')}</TableHead>
                                <TableHead className="text-right">{t('tokenStats.inputTokens')}</TableHead>
                                <TableHead className="text-right">{t('tokenStats.outputTokens')}</TableHead>
                                <TableHead className="text-right">{t('tokenStats.invokeCount')}</TableHead>
                                <TableHead className="text-right">{t('tokenStats.actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.map((item, i) => (
                                <TableRow key={item.user_name} className="cursor-pointer hover:bg-muted/50"
                                    onClick={() => { setDetailUser(item.user_name); setDetailPage(1); }}>
                                    <TableCell className="font-mono text-gray-400">{(page - 1) * pageSize + i + 1}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                                                <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <span className="font-medium">{item.user_name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell><BarCell value={item.total_tokens} max={maxToken} /></TableCell>
                                    <TableCell className="text-right font-mono text-sm">{formatTokens(item.input_tokens)}</TableCell>
                                    <TableCell className="text-right font-mono text-sm">{formatTokens(item.output_tokens)}</TableCell>
                                    <TableCell className="text-right font-mono text-sm">{item.invoke_count.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDetailUser(item.user_name); setDetailPage(1); }}>
                                            {t('tokenStats.viewDetail')}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {data.length === 0 && (
                                <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-10">{t('tokenStats.noData')}</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>

                    {total > page * pageSize && (
                        <div className="flex justify-center mt-4">
                            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>
                                <ChevronDown className="w-4 h-4 mr-1" /> {t('tokenStats.loadMore')}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ======================== 应用 Token 消耗报表 ========================
function AppTokenReport() {
    const { t } = useTranslation();
    const [data, setData] = useState<TokenByAppItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // 应用明细
    const [detailApp, setDetailApp] = useState<string | null>(null);
    const [detailDaily, setDetailDaily] = useState<AppDailyItem[]>([]);
    const [detailUsers, setDetailUsers] = useState<{ user_name: string; total_tokens: number; invoke_count: number }[]>([]);
    const [detailTotalTokens, setDetailTotalTokens] = useState(0);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailStartDate, setDetailStartDate] = useState('');
    const [detailEndDate, setDetailEndDate] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getTokenStatsByApp({
                page, page_size: pageSize,
                app_name: search || undefined,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
            });
            setData(res.list);
            setTotal(res.total);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, search, startDate, endDate]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const fetchDetail = useCallback(async () => {
        if (!detailApp) return;
        setDetailLoading(true);
        try {
            const res = await getTokenStatsAppDetail({
                app_name: detailApp,
                start_date: detailStartDate || undefined,
                end_date: detailEndDate || undefined,
            });
            setDetailDaily(res.daily);
            setDetailUsers(res.users);
            setDetailTotalTokens(res.total_tokens);
        } finally {
            setDetailLoading(false);
        }
    }, [detailApp, detailStartDate, detailEndDate]);

    useEffect(() => { fetchDetail(); }, [fetchDetail]);

    const maxToken = data.length > 0 ? Math.max(...data.map(d => d.total_tokens)) : 0;
    const dailyMaxToken = detailDaily.length > 0 ? Math.max(...detailDaily.map(d => d.total_tokens)) : 0;

    const handleSearch = () => {
        setPage(1);
        setSearch(searchInput);
    };

    if (detailApp) {
        return (
            <div>
                <div className="flex items-center gap-3 mb-4">
                    <Button variant="ghost" size="sm" onClick={() => { setDetailApp(null); }}>
                        <ChevronLeft className="w-4 h-4 mr-1" /> {t('tokenStats.backToList')}
                    </Button>
                    <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-green-500" />
                        <span className="font-semibold text-lg">{detailApp}</span>
                        <span className="text-sm text-gray-500">- {t('tokenStats.dailyBreakdown')}</span>
                    </div>
                </div>

                {/* 日期筛选 */}
                <div className="flex items-center gap-2 mb-4 text-sm">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    <input type="date" value={detailStartDate} onChange={e => setDetailStartDate(e.target.value)}
                        className="border rounded px-2 py-1 h-8 text-xs bg-background" />
                    <span className="text-gray-400">~</span>
                    <input type="date" value={detailEndDate} onChange={e => setDetailEndDate(e.target.value)}
                        className="border rounded px-2 py-1 h-8 text-xs bg-background" />
                    <span className="ml-4 text-gray-500">{t('tokenStats.periodTotal')}: <b className="text-blue-600">{formatTokens(detailTotalTokens)}</b></span>
                </div>

                {detailLoading ? (
                    <div className="flex justify-center py-20"><LoadingIcon /></div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* 每日趋势表 */}
                        <div>
                            <h4 className="font-medium mb-3 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4" /> {t('tokenStats.dailyTrend')}
                            </h4>
                            <div className="max-h-[400px] overflow-y-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t('tokenStats.date')}</TableHead>
                                            <TableHead>{t('tokenStats.totalTokens')}</TableHead>
                                            <TableHead className="text-right">{t('tokenStats.invokeCount')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {detailDaily.filter(d => d.total_tokens > 0).map((item) => (
                                            <TableRow key={item.date}>
                                                <TableCell className="font-mono text-sm">{item.date}</TableCell>
                                                <TableCell><BarCell value={item.total_tokens} max={dailyMaxToken} /></TableCell>
                                                <TableCell className="text-right font-mono text-sm">{item.invoke_count.toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                        {detailDaily.filter(d => d.total_tokens > 0).length === 0 && (
                                            <TableRow><TableCell colSpan={3} className="text-center text-gray-400 py-10">{t('tokenStats.noData')}</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                        {/* 用户消耗排行 */}
                        <div>
                            <h4 className="font-medium mb-3 flex items-center gap-2">
                                <User className="w-4 h-4" /> {t('tokenStats.userRanking')}
                            </h4>
                            <div className="max-h-[400px] overflow-y-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t('tokenStats.userName')}</TableHead>
                                            <TableHead>{t('tokenStats.totalTokens')}</TableHead>
                                            <TableHead className="text-right">{t('tokenStats.invokeCount')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {detailUsers.map((item) => (
                                            <TableRow key={item.user_name}>
                                                <TableCell className="font-medium">{item.user_name}</TableCell>
                                                <TableCell>
                                                    <BarCell value={item.total_tokens}
                                                        max={detailUsers.length > 0 ? detailUsers[0].total_tokens : 0} />
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-sm">{item.invoke_count.toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                        {detailUsers.length === 0 && (
                                            <TableRow><TableCell colSpan={3} className="text-center text-gray-400 py-10">{t('tokenStats.noData')}</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-1">
                    <Input
                        placeholder={t('tokenStats.searchApp')}
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="w-48 h-8"
                    />
                    <Button variant="outline" size="sm" className="h-8" onClick={handleSearch}>
                        <Search className="w-3.5 h-3.5" />
                    </Button>
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }}
                        className="border rounded px-2 py-1 h-8 text-xs bg-background" />
                    <span>~</span>
                    <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }}
                        className="border rounded px-2 py-1 h-8 text-xs bg-background" />
                </div>
                <span className="text-xs text-gray-400 ml-auto">
                    {t('tokenStats.totalApps')}: {total}
                </span>
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><LoadingIcon /></div>
            ) : (
                <>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]">#</TableHead>
                                <TableHead>{t('tokenStats.appName')}</TableHead>
                                <TableHead>{t('tokenStats.appType')}</TableHead>
                                <TableHead>{t('tokenStats.totalTokens')}</TableHead>
                                <TableHead className="text-right">{t('tokenStats.inputTokens')}</TableHead>
                                <TableHead className="text-right">{t('tokenStats.outputTokens')}</TableHead>
                                <TableHead className="text-right">{t('tokenStats.invokeCount')}</TableHead>
                                <TableHead className="text-right">{t('tokenStats.actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.map((item, i) => (
                                <TableRow key={item.app_name + i} className="cursor-pointer hover:bg-muted/50"
                                    onClick={() => { setDetailApp(item.app_name); setDetailStartDate(''); setDetailEndDate(''); }}>
                                    <TableCell className="font-mono text-gray-400">{(page - 1) * pageSize + i + 1}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                                                <Layers className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                                            </div>
                                            <span className="font-medium">{item.app_name || '-'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="px-2 py-0.5 text-xs rounded bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                                            {item.app_type || '-'}
                                        </span>
                                    </TableCell>
                                    <TableCell><BarCell value={item.total_tokens} max={maxToken} /></TableCell>
                                    <TableCell className="text-right font-mono text-sm">{formatTokens(item.input_tokens)}</TableCell>
                                    <TableCell className="text-right font-mono text-sm">{formatTokens(item.output_tokens)}</TableCell>
                                    <TableCell className="text-right font-mono text-sm">{item.invoke_count.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDetailApp(item.app_name); setDetailStartDate(''); setDetailEndDate(''); }}>
                                            {t('tokenStats.viewDetail')}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {data.length === 0 && (
                                <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-10">{t('tokenStats.noData')}</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>

                    {total > page * pageSize && (
                        <div className="flex justify-center mt-4">
                            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>
                                <ChevronDown className="w-4 h-4 mr-1" /> {t('tokenStats.loadMore')}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ======================== 主页面 ========================
export default function TokenStatsPage() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'user' | 'app'>('user');

    return (
        <div className="h-full overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 pt-5 pb-3">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <BarChart3 className="w-6 h-6 text-blue-500" />
                    {t('tokenStats.title')}
                </h1>
                <p className="text-sm text-gray-500 mt-1">{t('tokenStats.subtitle')}</p>
            </div>

            {/* Tabs */}
            <div className="px-6 flex gap-1 border-b">
                <button
                    className={`px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'user' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setActiveTab('user')}>
                    <User className="w-4 h-4" /> {t('tokenStats.userReport')}
                </button>
                <button
                    className={`px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'app' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setActiveTab('app')}>
                    <Layers className="w-4 h-4" /> {t('tokenStats.appReport')}
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
                {activeTab === 'user' ? <UserTokenReport /> : <AppTokenReport />}
            </div>
        </div>
    );
}
