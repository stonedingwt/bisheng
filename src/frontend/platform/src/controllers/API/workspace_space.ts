import axios from "../request";

/** 获取用户可见的空间列表 (后端根据权限过滤) */
export async function getSpacesApi(): Promise<any[]> {
  return await axios.get(`/api/v1/workspace-spaces`);
}

/** 创建空间 (仅管理员) */
export async function createSpaceApi(data: {
  name: string;
  description?: string;
  color?: string;
  sort_order?: number;
}): Promise<any> {
  return await axios.post(`/api/v1/workspace-spaces`, data);
}

/** 更新空间 (仅管理员) */
export async function updateSpaceApi(id: number, data: {
  name?: string;
  description?: string;
  color?: string;
  sort_order?: number;
}): Promise<any> {
  return await axios.put(`/api/v1/workspace-spaces/${id}`, data);
}

/** 删除空间 (仅管理员) */
export async function deleteSpaceApi(id: number): Promise<any> {
  return await axios.delete(`/api/v1/workspace-spaces/${id}`);
}

/** 移动应用到空间 */
export async function moveFlowToSpaceApi(flowId: string, spaceId: number): Promise<any> {
  return await axios.post(`/api/v1/workspace-spaces/move-flow`, {
    flow_id: flowId,
    space_id: spaceId
  });
}

/** 批量移动应用到空间 */
export async function batchMoveFlowsApi(flowIds: string[], spaceId: number): Promise<any> {
  return await axios.post(`/api/v1/workspace-spaces/batch-move`, {
    flow_ids: flowIds,
    space_id: spaceId
  });
}

/** 获取所有可用角色 (管理员) */
export async function getAllRolesApi(): Promise<any[]> {
  return await axios.get(`/api/v1/workspace-spaces/all-roles`);
}

/** 获取某空间被授权的角色ID列表 (管理员) */
export async function getSpaceRolesApi(spaceId: number): Promise<number[]> {
  return await axios.get(`/api/v1/workspace-spaces/${spaceId}/roles`);
}

/** 设置某空间授权的角色 (管理员) */
export async function setSpaceRolesApi(spaceId: number, roleIds: number[]): Promise<any> {
  return await axios.post(`/api/v1/workspace-spaces/${spaceId}/roles`, {
    role_ids: roleIds
  });
}
