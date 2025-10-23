import { APIFolder } from "../commands/api_folder";

/**
 * 构建文件夹的完整路径
 * @param folderId 文件夹 ID
 * @param folders 所有文件夹列表
 * @returns 完整路径，如 "用户管理/权限管理"
 */
export function buildFolderPath(
  folderId: string,
  folders: APIFolder[]
): string {
  const folderMap = new Map<string, APIFolder>();
  const childToParentMap = new Map<string, string>();
  
  // 构建映射表
  folders.forEach(folder => {
    folderMap.set(folder.id, folder);
    
    // 解析 children，建立子到父的映射
    if (folder.children) {
      const childIds = folder.children.split(',').filter(id => id.trim());
      childIds.forEach(childId => {
        childToParentMap.set(childId, folder.id);
      });
    }
  });
  
  // 从当前文件夹向上查找，构建路径
  const pathParts: string[] = [];
  let currentId: string | undefined = folderId;
  
  while (currentId) {
    const folder = folderMap.get(currentId);
    if (folder) {
      pathParts.unshift(folder.name);
    }
    currentId = childToParentMap.get(currentId);
  }
  
  return pathParts.join('/');
}

/**
 * 从 API 的文件夹 ID 获取其文件夹路径
 * @param apiId API ID
 * @param folders 所有文件夹列表
 * @returns 文件夹路径或 undefined
 */
export function getAPIFolderPath(
  apiId: string,
  folders: APIFolder[]
): string | undefined {
  // 找到包含此 API 的文件夹
  for (const folder of folders) {
    if (folder.children && folder.children.split(',').includes(apiId)) {
      return buildFolderPath(folder.id, folders);
    }
  }
  return undefined;
}

/**
 * 解析文件夹路径，返回路径中的各级文件夹名称
 * @param path 文件夹路径，如 "用户管理/权限管理"
 * @returns 文件夹名称数组 ["用户管理", "权限管理"]
 */
export function parseFolderPath(path: string): string[] {
  if (!path) return [];
  return path.split('/').map(name => name.trim()).filter(name => name);
}

/**
 * 根据路径查找或创建文件夹层级
 * @param path 文件夹路径
 * @param collection 集合 ID
 * @param folders 现有文件夹列表
 * @param createFolder 创建文件夹的回调函数
 * @returns 最深层文件夹的 ID
 */
export async function ensureFolderPath(
  path: string,
  collection: string,
  folders: APIFolder[],
  createFolder: (name: string, parentId?: string) => Promise<string>
): Promise<string | undefined> {
  const pathParts = parseFolderPath(path);
  if (pathParts.length === 0) return undefined;
  
  let currentParentId: string | undefined = undefined;
  
  for (const folderName of pathParts) {
    // 在当前层级查找同名文件夹
    let foundFolder: APIFolder | undefined;
    
    if (!currentParentId) {
      // 查找根级别的文件夹
      foundFolder = folders.find(f => 
        f.name === folderName && 
        !folders.some(parent => 
          parent.children && parent.children.split(',').includes(f.id)
        )
      );
    } else {
      // 查找指定父文件夹下的子文件夹
      const parent = folders.find(f => f.id === currentParentId);
      if (parent && parent.children) {
        const childIds = parent.children.split(',').filter(id => id.trim());
        foundFolder = folders.find(f => 
          childIds.includes(f.id) && f.name === folderName
        );
      }
    }
    
    if (foundFolder) {
      currentParentId = foundFolder.id;
    } else {
      // 创建新文件夹
      currentParentId = await createFolder(folderName, currentParentId);
    }
  }
  
  return currentParentId;
}
