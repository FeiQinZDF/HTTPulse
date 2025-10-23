import { Promise } from "bluebird";
import { get, uniq, forEach, has } from "lodash-es";
import dayjs from "dayjs";
import { ulid } from "ulid";
import { SettingType } from "../stores/api_setting";
import { APIFolder, createAPIFolder, newDefaultAPIFolder, listAPIFolder, updateAPIFolder } from "./api_folder";
import {
  APISetting,
  createAPISetting,
  newDefaultAPISetting,
} from "./api_setting";
import { ContentType, HTTPRequest } from "./http_request";
import { KVParam } from "./interface";
import {
  createVariable,
  newDefaultVariable,
  Variable,
  VariableCategory,
} from "./variable";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import parseCurl from "../helpers/curl";
import { i18nCommon } from "../i18n";
import { parseHTTPFile, isHTTPFormat } from "../helpers/import";
import { newDefaultEnvironment, createEnvironment, getEnvironmentByName, updateEnvironment } from "./environment";
import { ensureFolderPath } from "../helpers/folder_path";

interface PostManSetting {
  name: string;
  item?: PostManSetting[];
  request?: {
    method: string;
    url: {
      raw: string;
    };
    query: {
      key: string;
      value: string;
    }[];
    body: {
      mode: string;
      raw: string;
    };
  };
}

interface InsomniaSetting {
  parentId: string;
  url: string;
  name: string;
  method: string;
  sort: number;
  data: Map<string, string>;
  body: {
    mimeType: string;
    text: string;
  };
  headers: {
    name: string;
    value: string;
  }[];
  parameters: {
    name: string;
    value: string;
  }[];
  _id: string;
  _type: string;
}

interface ImportData {
  settings: APISetting[];
  folders: APIFolder[];
}

export enum ImportCategory {
  PostMan = "postMan",
  Insomnia = "insomnia",
  Swagger = "swagger",
  File = "file",
  Text = "text",
}

function convertPostManAPISetting(item: PostManSetting, collection: string) {
  if (!item.request) {
    return;
  }
  const setting = newDefaultAPISetting();
  setting.category = SettingType.HTTP;
  setting.collection = collection;
  setting.name = item.name;
  let contentType = "";
  const body = item.request.body?.raw;
  if (body && body.startsWith("{") && body.endsWith("}")) {
    contentType = ContentType.JSON;
  }
  const query: KVParam[] = [];
  item.request.query?.forEach((q) => {
    query.push({
      key: q.key,
      value: q.value,
      enabled: true,
    });
  });
  // TODO headers的处理
  let uri = item.request.url?.raw || "";
  if (uri && uri.includes("?")) {
    const arr = uri.split("?");
    uri = arr[0];
    // 去除前面host+path部分
    arr.shift();
    const url = new URL(`http://localhost/?${arr.join("?")}`);
    url.searchParams.forEach((value, key) => {
      query.push({
        key,
        value,
        enabled: true,
      });
    });
  }

  const req: HTTPRequest = {
    headers: [],
    method: item.request.method,
    uri,
    contentType,
    query,
    body: body,
    auth: [],
  };
  setting.setting = JSON.stringify(req);
  return setting;
}

function convertSwaggerSetting(params: {
  result: ImportData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  json: any;
  collection: string;
  environments: Variable[];
}) {
  const { result, json, collection, environments } = params;
  const name = get(json, "info.title") || "basePath";
  const basePathENV = newDefaultVariable();
  basePathENV.category = VariableCategory.Environment;
  basePathENV.name = name.replace(/ /g, "");
  basePathENV.value = `${get(json, "schemes.0")}://${get(json, "host")}${get(
    json,
    "basePath",
  )}`;
  environments.push(basePathENV);
  const folderDict = new Map<string, APIFolder>();
  forEach(json.paths, (value, uri) => {
    forEach(value, (data, method) => {
      const setting = newDefaultAPISetting();
      setting.collection = collection;
      setting.category = SettingType.HTTP;
      setting.name = get(data, "summary") || get(data, "operationId");
      const query: KVParam[] = [];
      const headers: KVParam[] = [];
      let contentType = "";
      let body = "";

      forEach(get(data, "parameters"), (param) => {
        if (param.in === "query") {
          query.push({
            key: param.name,
            value: get(param, "example") || "",
            enabled: true,
          });
        } else if (param.in === "body") {
          contentType = ContentType.JSON;
          const defineKey: string = param.schema?.$ref?.substring(2);
          const bodyData: Record<string, unknown> = {};
          forEach(
            get(json, defineKey.replace(/\//g, ".") + ".properties"),
            (value, key) => {
              const v = value.example;
              if (value.type === "boolean") {
                bodyData[key] = v === "true";
              } else if (value.type !== "string") {
                bodyData[key] = Number(v || 0);
              } else {
                bodyData[key] = v || "";
              }
            },
          );
          body = JSON.stringify(bodyData, null, 4);
        }
      });
      const req: HTTPRequest = {
        headers,
        method: method.toUpperCase(),
        uri: `{{${basePathENV.name}}}${uri}`,
        contentType,
        query,
        body,
        auth: [],
      };
      setting.setting = JSON.stringify(req);
      result.settings.push(setting);

      const tag = get(data, "tags.0");
      if (tag) {
        let folder = folderDict.get(tag);
        if (!folder) {
          folder = newDefaultAPIFolder();
          folder.collection = collection;
          folder.name = tag;
          folderDict.set(tag, folder);
          result.folders.push(folder);
        }
        const children = folder.children.split(",");
        children.push(setting.id);
        folder.children = children.join(",");
      }
    });
  });
}

function convertPostManSetting(params: {
  result: ImportData;
  items: PostManSetting[];
  collection: string;
  parentChildren: string[];
}) {
  const { result, items, collection, parentChildren } = params;
  if (!items || items.length === 0) {
    return;
  }
  items.forEach((item) => {
    // api 接口
    if (item.request) {
      const setting = convertPostManAPISetting(item, collection);
      if (setting) {
        result.settings.push(setting);
        parentChildren.push(setting.id);
      }
    } else {
      // folder
      const folder = newDefaultAPIFolder();
      result.folders.push(folder);
      parentChildren.push(folder.id);
      folder.collection = collection;
      folder.name = item.name;
      const subChildren: string[] = [];
      convertPostManSetting({
        result,
        items: item.item || [],
        collection,
        parentChildren: subChildren,
      });
      folder.children = subChildren.join(",");
    }
  });
}

function convertInsomniaSetting(params: {
  result: ImportData;
  items: InsomniaSetting[];
  collection: string;
}) {
  const { result, collection, items } = params;
  const subChildrenMap: Map<string, string[]> = new Map();
  const parentIDMap: Map<string, string> = new Map();
  const addToParent = (id: string, parentID: string) => {
    const pid = parentIDMap.get(parentID);
    if (pid) {
      const arr = subChildrenMap.get(pid) || [];
      arr.push(id);
      subChildrenMap.set(pid, arr);
    }
  };
  items.forEach((item) => {
    if (item._type === "request_group") {
      // folder
      const folder = newDefaultAPIFolder();
      result.folders.push(folder);
      folder.collection = collection;
      folder.name = item.name;
      subChildrenMap.set(folder.id, []);
      parentIDMap.set(item._id, folder.id);
      addToParent(folder.id, item.parentId);
      return;
    }
    const setting = newDefaultAPISetting();
    setting.category = SettingType.HTTP;
    setting.collection = collection;
    setting.name = item.name;
    const body = item.body.text;
    let contentType = "";
    if (body && body.startsWith("{") && body.endsWith("}")) {
      contentType = ContentType.JSON;
    }
    const query: KVParam[] = [];
    item.parameters?.forEach((q) => {
      if (!q.value && !q.name) {
        return;
      }
      query.push({
        key: q.name,
        value: q.value,
        enabled: true,
      });
    });
    const headers: KVParam[] = [];
    item.headers?.forEach((q) => {
      if (!q.value && !q.name) {
        return;
      }
      headers.push({
        key: q.name,
        value: q.value,
        enabled: true,
      });
    });
    let uri = item.url || "";
    if (uri && uri.includes("?")) {
      const arr = uri.split("?");
      uri = arr[0];
      // 去除前面host+path部分
      arr.shift();
      const url = new URL(`http://localhost/?${arr.join("?")}`);
      url.searchParams.forEach((value, key) => {
        query.push({
          key,
          value,
          enabled: true,
        });
      });
    }
    const req: HTTPRequest = {
      headers: headers,
      method: item.method,
      uri,
      contentType,
      query,
      body: body,
      auth: [],
    };
    setting.setting = JSON.stringify(req);
    addToParent(setting.id, item.parentId);
    result.settings.push(setting);
  });

  result.folders.forEach((folder) => {
    const arr = subChildrenMap.get(folder.id);
    if (arr) {
      folder.children = arr.join(",");
    }
  });
}

export async function importAPI(params: {
  category: ImportCategory;
  collection: string;
  fileData: string;
}): Promise<string[]> {
  let category = params.category;
  const { collection } = params;
  const result: ImportData = {
    settings: [],
    folders: [],
  };
  
  // 处理 curl 格式
  if (params.fileData.startsWith("curl")) {
    const req = parseCurl(params.fileData);
    const id = ulid();

    await createAPISetting({
      category: SettingType.HTTP,
      collection: params.collection,
      name: i18nCommon("untitled"),
      id,
      setting: JSON.stringify(req),
      createdAt: dayjs().format(),
      updatedAt: dayjs().format(),
    });
    return [id];
  }
  
  // 处理 .http 格式
  if (isHTTPFormat(params.fileData)) {
    const parsed = parseHTTPFile(params.fileData);
    const topIDList: string[] = [];
    
    // 导入环境变量（如果有）
    if (parsed.environmentVariables.length > 0) {
      debugger
      // 从文件中提取环境名称，如果没有就用默认名
      const envName = parsed.environmentName || `Imported-${dayjs().format('YYYY-MM-DD-HH-mm-ss')}`;
      
      // 检查环境是否已存在
      let env = await getEnvironmentByName(envName);
      
      if (env) {
        // 环境已存在，增量更新环境变量
        const existingVarMap = new Map<string, number>();
        env.variables.forEach((v, index) => {
          existingVarMap.set(v.key, index);
        });
        
        // 合并或更新变量
        parsed.environmentVariables.forEach((newVar) => {
          const existingIndex = existingVarMap.get(newVar.key);
          if (existingIndex !== undefined) {
            // 更新现有变量
            env!.variables[existingIndex] = newVar;
          } else {
            // 添加新变量
            env!.variables.push(newVar);
          }
        });
        
        env.updatedAt = dayjs().format();
        await updateEnvironment(env);
      } else {
        // 环境不存在，创建新环境
        env = newDefaultEnvironment(envName);
        env.variables = parsed.environmentVariables;
        env.description = `导入自 .http 文件`;
        await createEnvironment(env);
      }
      
      // 激活该环境
      const { setActiveEnvironment } = await import('./environment');
      await setActiveEnvironment(env.id);
      
      // 也保存到旧的环境系统（保持向后兼容）
      for (const variable of parsed.environmentVariables) {
        const v = newDefaultVariable();
        v.category = VariableCategory.Environment;
        v.collection = collection;
        v.name = variable.key;
        v.value = variable.value;
        v.description = variable.description || '';
        await createVariable(v);
      }
    }
    
    // 加载现有文件夹
    const folders = await listAPIFolder(collection);
    
    // 用于维护文件夹 ID 到文件夹对象的映射
    const folderMap = new Map<string, APIFolder>();
    folders.forEach(f => folderMap.set(f.id, f));
    
    // 创建文件夹的回调函数
    const createFolderCallback = async (name: string, parentId?: string): Promise<string> => {
      const folder = newDefaultAPIFolder();
      folder.name = name;
      folder.collection = collection;
      folder.children = "";
      
      await createAPIFolder(folder);
      folders.push(folder);
      folderMap.set(folder.id, folder);
      
      // 如果有父文件夹，更新父文件夹的 children
      if (parentId) {
        const parent = folderMap.get(parentId);
        if (parent) {
          const childIds = parent.children ? parent.children.split(',') : [];
          childIds.push(folder.id);
          parent.children = childIds.filter(id => id).join(',');
          await updateAPIFolder(parent);
        }
      }
      
      return folder.id;
    };
    
    // 导入 API 请求
    for (const req of parsed.requests) {
      const setting = newDefaultAPISetting();
      setting.category = SettingType.HTTP;
      setting.collection = collection;
      setting.name = req.name;
      
      const httpRequest: HTTPRequest = {
        method: req.method,
        uri: req.url,
        headers: req.headers,
        query: req.query,
        body: req.body || '',
        contentType: req.contentType || '',
        auth: [],
      };
      
      setting.setting = JSON.stringify(httpRequest);
      await createAPISetting(setting);
      
      // 处理文件夹层级
      if (req.folder) {
        const folderId = await ensureFolderPath(
          req.folder,
          collection,
          folders,
          createFolderCallback
        );
        
        if (folderId) {
          // 将 API 添加到文件夹的 children 中
          const folder = folderMap.get(folderId);
          if (folder) {
            const childIds = folder.children ? folder.children.split(',') : [];
            if (!childIds.includes(setting.id)) {
              childIds.push(setting.id);
              folder.children = childIds.filter(id => id).join(',');
              await updateAPIFolder(folder);
            }
          }
        } else {
          // 没有文件夹，添加到顶层
          topIDList.push(setting.id);
        }
      } else {
        // 没有文件夹，添加到顶层
        topIDList.push(setting.id);
      }
    }
    
    // 返回顶层项目（没有父文件夹的文件夹和 API）
    const allChildIds = new Set<string>();
    folders.forEach(f => {
      if (f.children) {
        f.children.split(',').forEach(id => id && allChildIds.add(id));
      }
    });
    
    folders.forEach(f => {
      if (!allChildIds.has(f.id)) {
        topIDList.push(f.id);
      }
    });
    
    return topIDList;
  }
  
  const json = JSON.parse(params.fileData);
  const environments: Variable[] = [];
  if (has(json, "swagger")) {
    category = ImportCategory.Swagger;
  } else if (has(json, "item")) {
    category = ImportCategory.PostMan;
  } else if (has(json, "resources")) {
    category = ImportCategory.Insomnia;
  }

  switch (category) {
    case ImportCategory.Swagger: {
      convertSwaggerSetting({
        result,
        json,
        collection,
        environments,
      });
      break;
    }
    case ImportCategory.PostMan:
      {
        if (!Array.isArray(json.item)) {
          return [];
        }
        const arr = json.item as PostManSetting[];
        convertPostManSetting({
          result,
          items: arr,
          collection,
          parentChildren: [],
        });

        forEach(json.variable as [], (item: { key: string; value: string }) => {
          const env = newDefaultVariable();
          env.category = VariableCategory.Environment;
          env.name = item.key;
          env.value = item.value;
          environments.push(env);
        });
      }
      break;
    case ImportCategory.Insomnia:
      {
        const items = get(json, "resources");
        if (!Array.isArray(items)) {
          return [];
        }
        let arr = items as InsomniaSetting[];
        arr.forEach((item) => {
          if (item._type === "environment") {
            forEach(item.data, (value, key) => {
              const env = newDefaultVariable();
              env.category = VariableCategory.Environment;
              env.name = key;
              env.value = value as string;
              environments.push(env);
            });
            return;
          }
          if (item._type === "request_group") {
            if (item.parentId.startsWith("wrk_")) {
              item.sort = 0;
            } else {
              item.sort = 1;
            }
          } else {
            item.sort = 2;
          }
        });
        arr = arr.filter((item) =>
          ["request", "request_group"].includes(item._type),
        );

        arr.sort((item1, item2) => {
          return item1.sort - item2.sort;
        });
        convertInsomniaSetting({
          result,
          items: arr,
          collection,
        });
      }
      break;
    case ImportCategory.Text:
    case ImportCategory.File:
      {
        const arr = Array.isArray(json) ? json : [json];
        arr.forEach((item) => {
          item.collection = collection;
          if (item.category === SettingType.HTTP) {
            result.settings.push(item);
          } else {
            result.folders.push(item);
          }
        });
      }
      break;
    default:
      throw new Error(`${category} is not supported`);
      break;
  }

  const topIDList: string[] = [];
  const childrenIDMap: Map<string, boolean> = new Map();
  result.folders.forEach((item) => {
    const children = item.children?.split(",") || [];
    children.forEach((id) => {
      childrenIDMap.set(id, true);
    });
  });

  await Promise.each(result.folders, async (item) => {
    if (!childrenIDMap.has(item.id)) {
      topIDList.push(item.id);
    }
    await createAPIFolder(item);
  });
  await Promise.each(result.settings, async (item) => {
    if (!childrenIDMap.has(item.id)) {
      topIDList.push(item.id);
    }
    await createAPISetting(item);
  });
  await Promise.each(environments, async (item) => {
    if (!item.name && !item.value) {
      return;
    }
    item.collection = collection;
    await createVariable(item);
  });
  return uniq(topIDList);
}
