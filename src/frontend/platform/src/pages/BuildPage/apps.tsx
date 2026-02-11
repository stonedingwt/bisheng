import CardComponent from "@/components/bs-comp/cardComponent";
import AppAvator from "@/components/bs-comp/cardComponent/avatar";
import LabelShow from "@/components/bs-comp/cardComponent/LabelShow";
import AppTempSheet from "@/components/bs-comp/sheets/AppTempSheet";
import { LoadingIcon } from "@/components/bs-icons/loading";
import { MoveOneIcon } from "@/components/bs-icons/moveOne";
import { bsConfirm } from "@/components/bs-ui/alertDialog/useConfirm";
import { Badge } from "@/components/bs-ui/badge";
import { Button } from "@/components/bs-ui/button";
import { SearchInput } from "@/components/bs-ui/input";
import AutoPagination from "@/components/bs-ui/pagination/autoPagination";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/bs-ui/select";
import SelectSearch from "@/components/bs-ui/select/select";
import { useToast } from "@/components/bs-ui/toast/use-toast";
import { userContext } from "@/contexts/userContext";
import { readTempsDatabase } from "@/controllers/API";
import { changeAssistantStatusApi, deleteAssistantApi } from "@/controllers/API/assistant";
import { deleteFlowFromDatabase, getAppsApi, saveFlowToDatabase, updataOnlineState } from "@/controllers/API/flow";
import { onlineWorkflow } from "@/controllers/API/workflow";
import { getSpacesApi, moveFlowToSpaceApi } from "@/controllers/API/workspace_space";
import { captureAndAlertRequestErrorHoc } from "@/controllers/request";
import { AppNumType, AppType } from "@/types/app";
import { FlowType } from "@/types/flow";
import { useTable } from "@/util/hook";
import { generateUUID } from "@/utils";
import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import CreateApp from "./CreateApp";
import { useCreateTemp, useErrorPrompt, useQueryLabels } from "./hook";
import CardSelectVersion from "./skills/CardSelectVersion";
import CreateTemp from "./skills/CreateTemp";
import SpaceManager from "./SpaceManager";
import { Settings } from "lucide-react";

export const SelectType = ({ all = false, defaultValue = 'all', onChange }) => {
    const [value, setValue] = useState<string>(defaultValue)
    const { t } = useTranslation();

    const options: any = [
        { label: t('build.workflow'), value: AppType.FLOW },
        { label: t('build.assistant'), value: AppType.ASSISTANT },
        { label: t('build.skill'), value: AppType.SKILL },
        { label: t('build.langgraph'), value: AppType.LANGGRAPH },
    ];

    if (all) {
        options.unshift({ label: t('build.allAppTypes'), value: 'all' });
    }


    return <Select value={value} onValueChange={(v) => { onChange(v); setValue(v) }}>
        <SelectTrigger className="max-w-32">
            <SelectValue placeholder={t('build.allAppTypes')} />
        </SelectTrigger>
        <SelectContent>
            <SelectGroup>
                {options.map(el => (
                    <SelectItem key={el.value} value={el.value}>{el.label}</SelectItem>
                ))}
            </SelectGroup>
        </SelectContent>
    </Select>
}

const TypeNames = {
    5: AppType.ASSISTANT,
    1: AppType.SKILL,
    10: AppType.FLOW,
    25: AppType.LANGGRAPH
}
export default function apps() {
    const { t, i18n } = useTranslation()
    // useErrorPrompt();

    useEffect(() => {
        i18n.loadNamespaces('flow');
    }, [i18n]);
    const { user } = useContext(userContext);
    const { message } = useToast()
    const navigate = useNavigate()

    // Space 相关状态
    const [spaces, setSpaces] = useState<any[]>([]);
    const [activeSpaceId, setActiveSpaceId] = useState<number | null>(null);
    const [spaceManagerOpen, setSpaceManagerOpen] = useState(false);
    const [spacesLoaded, setSpacesLoaded] = useState(false);

    // 延迟初始化表格: 等 space 加载完成后再发起第一次请求
    const { page, pageSize, data: dataSource, total, loading, setPage, search, reload, refreshData, filterData } = useTable<FlowType>({ pageSize: 14, managed: true, unInitData: true }, (param) =>
        getAppsApi(param)
    )

    const loadSpaces = (isRefresh = false) => {
        getSpacesApi().then(res => {
            const spaceList = res || [];
            setSpaces(spaceList);
            if (spaceList.length > 0 && !isRefresh) {
                // 首次加载: 默认选中第一个空间并触发数据请求
                setActiveSpaceId(spaceList[0].id);
                filterData({ space_id: spaceList[0].id });
            }
            setSpacesLoaded(true);
        }).catch(() => { setSpacesLoaded(true); });
    };

    useEffect(() => {
        loadSpaces();
    }, []);

    const handleSpaceChange = (spaceId: number) => {
        setActiveSpaceId(spaceId);
        filterData({ space_id: spaceId });
    };

    const handleMoveToSpace = (item: any, targetSpaceId: number) => {
        moveFlowToSpaceApi(item.id, targetSpaceId).then(() => {
            reload();
        });
    };

    const { open: tempOpen, tempType, flowRef, toggleTempModal } = useCreateTemp()

    // on/off line
    const handleCheckedChange = (checked, data) => {
        if (data.flow_type === 1) {
            return captureAndAlertRequestErrorHoc(updataOnlineState(data.id, data, checked).then(res => {
                if (res) {
                    refreshData((item) => item.id === data.id, { status: checked ? 2 : 1 })
                }
                return res
            }))
        } else if (data.flow_type === 5) {
            return captureAndAlertRequestErrorHoc(changeAssistantStatusApi(data.id, checked ? 2 : 1)).then(res => {
                if (res === null) {
                    refreshData((item) => item.id === data.id, { status: checked ? 2 : 1 })
                }
                return res
            })
        } else if (data.flow_type === 10 || data.flow_type === 25) {
            return captureAndAlertRequestErrorHoc(onlineWorkflow(data, checked ? 2 : 1)).then(res => {
                if (res) {
                    refreshData((item) => item.id === data.id, { status: checked ? 2 : 1 })
                }
                return res
            })
        }
    }

    const typeCnNames = {
        1: t('build.skill'),
        5: t('build.assistant'),
        10: t('build.workflow'),
        25: t('build.langgraph')
    }

    const handleDelete = (data) => {
        const descMap = {
            1: t('build.confirmDeleteSkill'),
            10: t('build.confirmDeleteFlow'),
            5: t('build.confirmDeleteAssistant'),
            25: t('build.confirmDeleteFlow')
        }
        bsConfirm({
            desc: descMap[data.flow_type],
            okTxt: t('delete'),
            onOk(next) {
                const promise = data.flow_type == 5 ? deleteAssistantApi(data.id) : deleteFlowFromDatabase(data.id)
                captureAndAlertRequestErrorHoc(promise.then(reload));
                next()
            }
        })
    }

    const { toast } = useToast()
    const handleSetting = (data) => {
        if (!data.write) {
            return toast({ variant: 'warning', description: '无编辑权限' })
        }
        if (data.flow_type === 5) {
            navigate(`/assistant/${data.id}`, { state: { flow: data } })
        } else if (data.flow_type === 1) {
            const vid = data.version_list.find(item => item.is_current === 1)?.id
            navigate(`/build/skill/${data.id}/${vid}`, { state: { flow: data } })
        } else if (data.flow_type === 25) {
            navigate(`/langgraph/${data.id}`, { state: { flow: data } })
        } else {
            navigate(`/flow/${data.id}`, { state: { flow: data } })
        }
    }

    const createAppModalRef = useRef(null)
    const handleCreateApp = async (type, tempId = 0, item?: any) => {
        if (type === AppType.LANGGRAPH) {
            if (tempId && typeof tempId === 'string' && item?._isLgTemplate) {
                // Create from LangGraph preset template
                const { createFromTemplate } = await import('@/controllers/API/langgraph');
                const res = await captureAndAlertRequestErrorHoc(createFromTemplate(tempId, '', activeSpaceId || undefined));
                // axios interceptor auto-unwraps: res is {id, name} directly
                if (res?.id) {
                    navigate('/langgraph/' + res.id);
                }
            } else {
                // Blank LangGraph workflow: open CreateApp modal
                createAppModalRef.current.open(type, 0, activeSpaceId);
            }
            return;
        }
        if (type === AppType.SKILL) {
            if (!tempId) return navigate('/build/skill')
            // select template
            const [flow] = await readTempsDatabase(type, tempId)

            flow.name = `${flow.name}-${generateUUID(5)}`
            // @ts-ignore
            captureAndAlertRequestErrorHoc(saveFlowToDatabase({ ...flow, id: flow.flow_id, space_id: activeSpaceId }).then((res: any) => {
                res.user_name = user.user_name
                res.write = true
                // setOpen(false)
                navigate(`/build/skill/${res.id}/${res.version_id}`)
            }))
        } else {
            createAppModalRef.current.open(
                type,
                tempId,
                activeSpaceId
            );
        }
    }

    const { selectLabel, setSelectLabel, setSearchKey, filteredOptions, allOptions, refetchLabels } = useQueryLabels(t)
    const handleLabelSearch = (id) => {
        setSelectLabel(allOptions.find(l => l.value === id))
        filterData({ tag_id: id })
    }

    const tempTypeRef = useRef(null)
    return <div className="h-full relative">
        <div className="px-10 py-10 h-full overflow-y-scroll scrollbar-hide relative bg-background-main border-t">
            {/* Space 选择栏 - 无 "全部" 选项 */}
            {spaces.length > 0 && (
                <div className="flex items-center gap-1 mb-4 pb-3 border-b overflow-x-auto">
                    {spaces.map(space => (
                        <button
                            key={space.id}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors inline-flex items-center gap-1.5 ${activeSpaceId === space.id ? 'text-white' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                            style={activeSpaceId === space.id ? { backgroundColor: space.color || '#3B82F6' } : {}}
                            onClick={() => handleSpaceChange(space.id)}
                        >
                            <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: space.color || '#3B82F6' }} />
                            {space.name}
                        </button>
                    ))}
                    {user.role === 'admin' && (
                        <Button variant="ghost" size="icon" className="ml-1 flex-shrink-0 h-8 w-8"
                            title={t('space.manageSpaces')}
                            onClick={() => setSpaceManagerOpen(true)}>
                            <Settings className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            )}
            <div className="flex gap-4">
                <SearchInput className="w-64" placeholder={t('build.searchApp')} onChange={(e) => search(e.target.value)}></SearchInput>
                <SelectType all onChange={(v) => {
                    tempTypeRef.current = v
                    filterData({ type: v })
                }} />
                <SelectSearch
                    value={!selectLabel.value ? '' : selectLabel.value}
                    options={allOptions}
                    selectPlaceholder={t('chat.allLabels')}
                    inputPlaceholder={t('chat.searchLabels')}
                    selectClass="w-52"
                    onOpenChange={() => setSearchKey('')}
                    onChange={(e) => setSearchKey(e.target.value)}
                    onValueChange={handleLabelSearch}>
                </SelectSearch>
                {user.role === 'admin' && <Button
                    variant="ghost"
                    className="hover:bg-gray-50 flex gap-2 dark:hover:bg-[#34353A] ml-auto"
                    onClick={() => navigate(`/build/temps/${tempTypeRef.current && tempTypeRef.current !== AppType.ALL ? tempTypeRef.current : AppType.FLOW}`)}
                ><MoveOneIcon className="dark:text-slate-50" />{t('build.manageAppTemplates')}</Button>}
            </div>
            {/* list */}
            {
                loading
                    ? <div className="absolute w-full h-full top-0 left-0 flex justify-center items-center z-10 bg-[rgba(255,255,255,0.6)] dark:bg-blur-shared">
                        <LoadingIcon />
                    </div>
                    : <div className="mt-6 flex gap-2 flex-wrap pb-20 min-w-[980px]">
                        <AppTempSheet onSelect={handleCreateApp} onCustomCreate={handleCreateApp}>
                            <CardComponent<FlowType>
                                data={null}
                                type='assist'
                                title={t('log.createBuild')}
                                description={(<>
                                    <p><p>{t('build.provideSceneTemplates')}</p></p>
                                </>)}
                            ></CardComponent>
                        </AppTempSheet>
                        {
                            dataSource.map((item: any, i) => (
                                <CardComponent<FlowType>
                                    key={item.id}
                                    data={item}
                                    id={item.id}
                                    logo={<AppAvator id={item.name} flowType={item.flow_type} url={item.logo} />}
                                    type={TypeNames[item.flow_type]}
                                    edit
                                    // edit={item.write}
                                    title={item.name}
                                    isAdmin={user.role === 'admin'}
                                    description={item.description}
                                    checked={item.status === 2}
                                    user={item.user_name}
                                    currentUser={user}
                                    onClick={() => handleSetting(item)}
                                    onAddTemp={toggleTempModal}
                                    onCheckedChange={handleCheckedChange}
                                    onDelete={handleDelete}
                                    onSetting={(item) => handleSetting(item)}
                                    headSelecter={(
                                        // skills
                                        item.flow_type !== AppNumType.ASSISTANT ? <CardSelectVersion
                                            showPop={item.status !== 2}
                                            data={item}
                                        ></CardSelectVersion> : null)}
                                    labelPannel={
                                        <LabelShow
                                            data={item}
                                            user={user}
                                            type={item.flow_type}
                                            all={filteredOptions}
                                            onChange={refetchLabels}>
                                        </LabelShow>
                                    }
                                    footer={
                                        <div className="absolute right-0 bottom-0 flex items-center gap-0.5">
                                            {spaces.length > 1 && user.role === 'admin' && (
                                                <Select value={item.space_id ? String(item.space_id) : 'none'} onValueChange={(v) => {
                                                    handleMoveToSpace(item, Number(v));
                                                }}>
                                                    <SelectTrigger className="h-5 w-auto min-w-[60px] text-[10px] border-0 bg-transparent px-1 py-0 gap-0.5 rounded-none focus:ring-0" onClick={(e) => e.stopPropagation()}>
                                                        {(() => {
                                                            const sp = spaces.find(s => s.id === item.space_id);
                                                            return sp ? (
                                                                <span className="flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sp.color }} />
                                                                    {sp.name}
                                                                </span>
                                                            ) : <span className="text-gray-400">-</span>;
                                                        })()}
                                                    </SelectTrigger>
                                                    <SelectContent onClick={(e) => e.stopPropagation()}>
                                                        <SelectGroup>
                                                            {spaces.map(sp => (
                                                                <SelectItem key={sp.id} value={String(sp.id)}>
                                                                    <span className="flex items-center gap-1.5">
                                                                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: sp.color }} />
                                                                        {sp.name}
                                                                    </span>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                            )}
                                            <Badge className={`py-0 px-1 rounded-none rounded-br-md ${item.flow_type === AppNumType.SKILL && 'bg-gray-950'} ${item.flow_type === AppNumType.ASSISTANT && 'bg-[#fdb136]'} ${item.flow_type === AppNumType.LANGGRAPH && 'bg-purple-600'}`}>
                                                {typeCnNames[item.flow_type]}
                                            </Badge>
                                        </div>
                                    }
                                ></CardComponent>
                            ))
                        }
                    </div>
            }
        </div>
        {/* add template */}
        <CreateTemp flow={flowRef.current} type={tempType} open={tempOpen} setOpen={() => toggleTempModal()} onCreated={() => { }} ></CreateTemp>
        {/* footer */}
        <div className="flex justify-between absolute bottom-0 left-0 w-full bg-background-main h-16 items-center px-10">
            <p className="text-sm text-muted-foreground break-keep">{t('build.manageYourApplications')}</p>
            <AutoPagination className="m-0 w-auto justify-end" page={page} pageSize={pageSize} total={total} onChange={setPage}></AutoPagination>
        </div>
        {/* create flow&assistant */}
        <CreateApp ref={createAppModalRef} activeSpaceId={activeSpaceId} />
        {/* space manager */}
        <SpaceManager
            open={spaceManagerOpen}
            onClose={() => setSpaceManagerOpen(false)}
            onChanged={() => { loadSpaces(true); reload(); }}
        />
    </div>
};
