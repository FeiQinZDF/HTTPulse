import { defineStore } from "pinia";
import dayjs from "dayjs";

import {
  APISetting,
  listAPISetting,
  createAPISetting,
  updateAPISetting,
  deleteAPISettings,
} from "../commands/api_setting";
import { HTTPRequest } from "../commands/http_request";
import { getAPISettingStore } from "./local";
import { useEnvironmentsStore } from "./environments";
import { isWebMode, setAppTitle } from "../helpers/util";
export const ENVRegexp = /\{\{([\S\s]+?)\}\}/g;
import { useGlobalReqHeaderStore } from "./global_req_header";
import { cloneDeep } from "lodash-es";

const selectedIDKey = "selectedID";

export enum SettingType {
  HTTP = "http",
  Folder = "folder",
}

export const useAPISettingStore = defineStore("apiSettings", {
  state: () => {
    return {
      selectedID: "",
      apiSettings: [] as APISetting[],
      fetching: false,
      adding: false,
      updating: false,
      removing: false,
    };
  },
  actions: {
    async setWindowTitle(id: string) {
      if (isWebMode()) {
        return;
      }
      const result = this.findByID(id);
      if (!result) {
        return;
      }

      await setAppTitle(result.name);
    },
    select(id: string) {
      // 设置失败则忽略，仅输出日志
      getAPISettingStore().setItem(selectedIDKey, id).catch(console.error);
      this.selectedID = id;
      this.setWindowTitle(this.selectedID);
    },
    getHTTPRequest(id: string) {
      const setting = this.findByID(id);
      if (!setting) {
        return {} as HTTPRequest;
      }
      return JSON.parse(setting.setting || "{}") as HTTPRequest;
    },
    fillValues(req: HTTPRequest) {
      // 使用新环境系统替换 URI 中的环境变量
      const environmentsStore = useEnvironmentsStore();
      if (req.uri) {
        req.uri = environmentsStore.replaceVariables(req.uri);
      }
      // 替换请求头中的环境变量
      if (req.headers && req.headers.length > 0) {
        req.headers.forEach((h) => {
          if (h.value) {
            h.value = environmentsStore.replaceVariables(h.value);
          }
        });
      }
    },
    getHTTPRequestFillValues(id: string) {
      const req = this.getHTTPRequest(id);
      const originalReq = cloneDeep(req);
      if (!req.uri) {
        return {
          originalReq,
          req,
        };
      }
      this.fillValues(req);
      return {
        originalReq,
        req,
      };
    },
    findByID(id: string): APISetting {
      const index = this.apiSettings.findIndex((item) => item.id === id);
      return this.apiSettings[index];
    },
    async updateByID(id: string, data: unknown) {
      const index = this.apiSettings.findIndex((item) => item.id === id);
      const item = Object.assign(this.apiSettings[index], data);
      await this.update(item);
    },
    async add(data: APISetting) {
      if (this.adding) {
        return;
      }
      this.adding = true;
      try {
        await createAPISetting(data);
        const arr = this.apiSettings.slice(0);
        arr.push(data);
        this.apiSettings = arr;
      } finally {
        this.adding = false;
      }
    },
    async fetch(collection: string): Promise<void> {
      if (this.fetching) {
        return;
      }
      this.fetching = true;
      try {
        // 先获取所有api setting，再获取选中id
        this.apiSettings = await listAPISetting(collection);
        this.selectedID = (await getAPISettingStore().getItem(
          selectedIDKey,
        )) as string;
        this.setWindowTitle(this.selectedID);
      } finally {
        this.fetching = false;
      }
    },
    async update(data: APISetting) {
      if (this.updating) {
        return;
      }
      this.updating = true;
      try {
        data.updatedAt = dayjs().format();
        await updateAPISetting(data);
        const arr = this.apiSettings.slice(0);
        let found = -1;
        arr.forEach((item, index) => {
          if (item.id === data.id) {
            found = index;
          }
        });
        if (found !== -1) {
          arr[found] = data;
        }
        this.apiSettings = arr;
      } finally {
        this.updating = false;
      }
    },
    async remove(id: string) {
      if (this.removing) {
        return;
      }
      this.removing = true;
      try {
        // 先找到要删除的接口的位置
        const currentIndex = this.apiSettings.findIndex((item) => item.id === id);
        let nextSelectedId = "";
        
        // 如果删除的是当前选中的接口，需要选择下一个
        if (id === this.selectedID && currentIndex !== -1) {
          // 优先选择上一个接口
          if (currentIndex > 0) {
            nextSelectedId = this.apiSettings[currentIndex - 1].id;
          }
          // 如果是第一个，则选择下一个
          else if (currentIndex < this.apiSettings.length - 1) {
            nextSelectedId = this.apiSettings[currentIndex + 1].id;
          }
          // 如果只有一个接口，删除后就没有了，保持空
        }
        
        await deleteAPISettings([id]);
        this.apiSettings = this.apiSettings.filter((item) => item.id !== id);
        
        // 如果删除的是当前选中的接口
        if (id === this.selectedID) {
          if (nextSelectedId) {
            this.select(nextSelectedId);
            // 设置默认打开 HTTP tab
            const { useAPICollectionStore } = await import('./api_collection');
            const collectionStore = useAPICollectionStore();
            await collectionStore.updateActiveTab({
              id: nextSelectedId,
              activeTab: "Http",
            });
          } else {
            this.select("");
            // 如果没有其他接口，也设置默认tab为HTTP（但不选中任何接口）
            // 这里可以通过全局状态或事件通知UI组件默认显示HTTP tab
          }
        }
      } finally {
        this.removing = false;
      }
    },
  },
});
