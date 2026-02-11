// 工作流、助手、技能、LangGraph工作流、全部
export enum AppType {
    ALL = 'all',
    FLOW = 'flow',
    ASSISTANT = 'assistant',
    SKILL = 'skill',
    LANGGRAPH = 'langgraph',
}


export enum AppNumType {
    FLOW = 10,
    ASSISTANT = 5,
    SKILL = 1,
    LANGGRAPH = 25,
}

// 在共享类型文件中定义
export const AppTypeToNum = {
  [AppType.SKILL]: AppNumType.SKILL,
  [AppType.ASSISTANT]: AppNumType.ASSISTANT,
  [AppType.FLOW]: AppNumType.FLOW,
  [AppType.LANGGRAPH]: AppNumType.LANGGRAPH,
};

export const AppNumToType = {
  [AppNumType.SKILL]: AppType.SKILL,
  [AppNumType.ASSISTANT]: AppType.ASSISTANT,
  [AppNumType.FLOW]: AppType.FLOW,
  [AppNumType.LANGGRAPH]: AppType.LANGGRAPH,
}