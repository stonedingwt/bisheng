import axios from "../request";

/** 获取定时任务列表 */
export async function getScheduledTasksApi(params: {
  page: number;
  pageSize: number;
  status?: string;
  keyword?: string;
}): Promise<any> {
  const res = await axios.get(`/api/v1/scheduled-tasks`, { params: { page: params.page, limit: params.pageSize, status: params.status, keyword: params.keyword } });
  return { data: res.list, total: res.total };
}

/** 创建定时任务 */
export async function createScheduledTaskApi(data: any): Promise<any> {
  return await axios.post(`/api/v1/scheduled-tasks`, data);
}

/** 更新定时任务 */
export async function updateScheduledTaskApi(id: number, data: any): Promise<any> {
  return await axios.put(`/api/v1/scheduled-tasks/${id}`, data);
}

/** 删除定时任务 */
export async function deleteScheduledTaskApi(id: number): Promise<any> {
  return await axios.delete(`/api/v1/scheduled-tasks/${id}`);
}

/** 启用/禁用任务 */
export async function toggleScheduledTaskApi(id: number): Promise<any> {
  return await axios.post(`/api/v1/scheduled-tasks/${id}/toggle`);
}

/** 手动执行任务 */
export async function runScheduledTaskApi(id: number): Promise<any> {
  return await axios.post(`/api/v1/scheduled-tasks/${id}/run`);
}

/** 获取任务执行日志 */
export async function getTaskLogsApi(taskId: number, params: {
  page: number;
  pageSize: number;
  status?: string;
}): Promise<any> {
  const res = await axios.get(`/api/v1/scheduled-tasks/${taskId}/logs`, { params: { page: params.page, limit: params.pageSize, status: params.status } });
  return { data: res.list, total: res.total };
}

/** 获取所有执行日志 */
export async function getAllTaskLogsApi(params: {
  page: number;
  pageSize: number;
  status?: string;
}): Promise<any> {
  const res = await axios.get(`/api/v1/scheduled-tasks/logs/all`, { params: { page: params.page, limit: params.pageSize, status: params.status } });
  return { data: res.list, total: res.total };
}

/** 获取可选工作流列表 */
export async function getWorkflowsForTaskApi(): Promise<any> {
  return await axios.get(`/api/v1/scheduled-tasks/workflows`);
}
