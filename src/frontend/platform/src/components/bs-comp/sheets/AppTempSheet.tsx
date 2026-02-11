import { AbilitiesIcon, FlowIcon, HelperIcon } from "@/components/bs-icons/app";
import { readTempsDatabase } from "@/controllers/API";
import { getLangGraphTemplates } from "@/controllers/API/langgraph";
import { AppType, AppTypeToNum } from "@/types/app";
import { GitFork } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchInput } from "../../bs-ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "../../bs-ui/sheet";
import CardComponent from "../cardComponent";
import AppAvator from "../cardComponent/avatar";

/** 应用模板选择 */
export default function AppTempSheet({ children, onCustomCreate, onSelect }) {
    const [open, setOpen] = useState(false)
    const [type, setType] = useState<AppType>(AppType.FLOW)
    const { t, i18n } = useTranslation('flow')
    const isZh = i18n.language?.startsWith('zh')
    const createDesc = useMemo(() => {
        const descs = {
            [AppType.ASSISTANT]: {
                title: t('customAssistant'),
                desc: <>
                    <p>{t('createAppWithNoCode')}</p>
                    <p>{t('assistantCanUseSkillsAndTools')}</p>
                </>
            },
            [AppType.FLOW]: {
                title: t('customWorkflow'),
                desc: t('simpleNodeOrchestration')
            },
            [AppType.SKILL]: {
                title: t('customSkill'),
                desc: t('richComponentsForBuildingApps')
            },
            [AppType.LANGGRAPH]: {
                title: isZh ? '自定义 LangGraph 工作流' : 'Custom LangGraph Workflow',
                desc: isZh ? '支持循环、子图、多Agent协作、人机协作等高级模式' : 'Support cycles, subgraphs, multi-agent collaboration, human-in-the-loop'
            }
        }
        return descs[type]
    }, [type, t, isZh])

    const [keyword, setKeyword] = useState(' ')
    const allDataRef = useRef([])

    useEffect(() => {
        setKeyword(' ')
        if (type === AppType.LANGGRAPH) {
            // Load LangGraph templates from API
            getLangGraphTemplates().then(res => {
                const templates = (res || []).map(tpl => ({
                    id: tpl.id,
                    name: isZh ? tpl.name_zh : tpl.name,
                    description: isZh ? tpl.description_zh : tpl.description,
                    logo: '',
                    _isLgTemplate: true,
                }))
                allDataRef.current = templates
                setKeyword('')
            }).catch(() => {
                allDataRef.current = []
                setKeyword('')
            })
        } else {
            readTempsDatabase(type).then(res => {
                allDataRef.current = res
                setKeyword('')
            })
        }
    }, [type, isZh])

    const options = useMemo(() => {
        return allDataRef.current.filter(el => el.name.toLowerCase().includes(keyword.toLowerCase()))
    }, [keyword])

    return <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
            {children}
        </SheetTrigger>
        <SheetContent className="sm:min-w-[966px] ">
            <div className="app-sheet flex h-full" onClick={e => e.stopPropagation()}>
                <div className="w-fit p-6">
                    <SheetTitle>{t('appTemplate')}</SheetTitle>
                    <SheetDescription>{t('chooseTemplateOrCreateBlank')}</SheetDescription>
                    <SearchInput value={keyword} placeholder={t('search')} className="my-6" onChange={(e) => setKeyword(e.target.value)} />
                    {/* type */}
                    <div className="mt-4">
                        <div
                            className={`flex items-center gap-2 px-4 py-2 rounded-md cursor-pointer hover:bg-muted-foreground/10 transition-all duration-200 mb-2 ${type === AppType.FLOW && 'bg-muted-foreground/10'}`}
                            onClick={() => setType(AppType.FLOW)}
                        >
                            <FlowIcon/>
                            <span>{t('workflow')}</span>
                        </div>
                        <div
                            className={`flex items-center gap-2 px-4 py-2 rounded-md cursor-pointer hover:bg-muted-foreground/10 transition-all duration-200 mb-2 ${type === AppType.ASSISTANT && 'bg-muted-foreground/10'}`}
                            onClick={() => setType(AppType.ASSISTANT)}
                        >
                            <HelperIcon />
                            <span>{t('assistant')}</span>
                        </div>
                        <div
                            className={`flex items-center gap-2 px-4 py-2 rounded-md cursor-pointer hover:bg-muted-foreground/10 transition-all duration-200 mb-2 ${type === AppType.SKILL && 'bg-muted-foreground/10'}`}
                            onClick={() => setType(AppType.SKILL)}
                        >
                            <AbilitiesIcon />
                            <span>{t('skill')}</span>
                        </div>
                        <div
                            className={`flex items-center gap-2 px-4 py-2 rounded-md cursor-pointer hover:bg-muted-foreground/10 transition-all duration-200 mb-2 ${type === AppType.LANGGRAPH && 'bg-muted-foreground/10'}`}
                            onClick={() => setType(AppType.LANGGRAPH)}
                        >
                            <GitFork className="w-5 h-5 text-purple-500" />
                            <span>{isZh ? 'LangGraph 工作流' : 'LangGraph Workflow'}</span>
                        </div>
                    </div>
                </div>
                <div className="flex-1 min-w-[696px] bg-[#fff] dark:bg-[#030712] p-5 pt-12 h-full flex flex-wrap gap-1.5 overflow-y-auto scrollbar-hide content-start">
                    <CardComponent
                        id={0}
                        type="sheet"
                        data={null}
                        title={createDesc.title}
                        description={createDesc.desc}
                        onClick={() => { onCustomCreate(type); setOpen(false) }}
                    ></CardComponent>
                    {
                        options.map((flow, i) => (
                            <CardComponent key={i}
                                id={i + 1}
                                data={flow}
                                logo={<AppAvator id={flow.name} flowType={AppTypeToNum[type]} url={flow.logo} />}
                                title={flow.name}
                                description={flow.description}
                                type="sheet"
                                footer={null}
                                onClick={() => {
                                    if (flow._isLgTemplate) {
                                        // LangGraph template: use template ID
                                        onSelect(AppType.LANGGRAPH, flow.id, flow)
                                    } else {
                                        onSelect(type, flow.id)
                                    }
                                    setOpen(false)
                                }}
                            />
                        ))
                    }
                </div>
            </div>
        </SheetContent>
    </Sheet>
};
