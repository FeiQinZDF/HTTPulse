import {
  defineComponent,
  watch,
  ref,
  onBeforeUnmount,
  PropType,
  VNode,
} from "vue";
import { css } from "@linaria/core";
import { NDivider, useMessage } from "naive-ui";
import { storeToRefs } from "pinia";
import { cloneDeep, debounce } from "lodash-es";

import { useAPISettingStore } from "../../stores/api_setting";
import { abortRequestID, HTTPRequest } from "../../commands/http_request";
import { useGlobalReqHeaderStore } from "../../stores/global_req_header";
import { showError } from "../../helpers/util";
import { i18nCollection, i18nCommon } from "../../i18n";
import { newDefaultAPISetting } from "../../commands/api_setting";
import { useRoute } from "vue-router";
import APISettingParamsURI, { RequestURI } from "./uri";
import APISettingParamsReqParams from "./req_params";
import { KVParam } from "../../commands/interface";
import { onSelectResponse } from "../../commands/http_response";

const wrapperClass = css`
  height: 100%;
  display: flex;
  flex-direction: column;
  margin-left: 5px;
  overflow: hidden;
  .n-divider {
    margin: 0;
    flex-shrink: 0;
  }
`;

export default defineComponent({
  name: "APISettingParams",
  props: {
    onSend: {
      type: Function as PropType<(id: string) => Promise<void>>,
      required: true,
    },
  },
  setup() {
    const message = useMessage();
    const route = useRoute();
    const apiSettingStore = useAPISettingStore();
    const { selectedID } = storeToRefs(apiSettingStore);

    const componentKey = ref(selectedID.value);
    const reqParams = ref({} as HTTPRequest);
    const interfaceName = ref("");
    const reqParamsStyle = ref({
      height: "0px",
    });
    const isSwitching = ref(false);

    const wrapper = ref<Element>();
    let uriNodeHeight = 0;
    const caclWrapperHeight = () => {
      const height = wrapper.value?.clientHeight || 0;
      if (!height) {
        return;
      }
      reqParamsStyle.value.height = `${height - uriNodeHeight}px`;
    };

    const updateURINodeHeight = (node: VNode) => {
      uriNodeHeight = node.el?.clientHeight || 0;
      caclWrapperHeight();
    };
    const updateReqParams = (id: string) => {
      try {
        if (id) {
          reqParams.value = apiSettingStore.getHTTPRequest(id);
          const data = apiSettingStore.findByID(id);
          interfaceName.value = data?.name || "";
          
          // 自动添加缺失的全局请求头
          const globalHeaders = useGlobalReqHeaderStore().listEnable();
          if (globalHeaders && globalHeaders.length > 0) {
            if (!reqParams.value.headers) {
              reqParams.value.headers = [];
            }
            // 构建已有请求头的集合（小写）
            const existingHeaderKeys = new Set<string>();
            reqParams.value.headers.forEach((h) => {
              if (h.key) {
                existingHeaderKeys.add(h.key.toLowerCase());
              }
            });
            
            // 只添加接口未配置的全局请求头
            globalHeaders.forEach((item) => {
              if (!existingHeaderKeys.has(item.name.toLowerCase())) {
                reqParams.value.headers.push({
                  key: item.name,
                  value: item.value,
                  enabled: true,
                });
              }
            });
          }
        } else {
          reqParams.value = {} as HTTPRequest;
          interfaceName.value = "";
        }
      } catch (err) {
        console.error(err);
      } finally {
        caclWrapperHeight();
      }
    };

    const stop = watch(selectedID, async (newId, oldId) => {
      // 设置切换状态，禁用更新
      isSwitching.value = true;

      // 先强制刷新所有待处理的更新，确保快照包含最新编辑
      try {
        handleUpdateQueryRef.value.flush?.();
        handleUpdateHeadersRef.value.flush?.();
        handleUpdateBodyRef.value.flush?.();
      } catch {}
      
      // 立即保存当前数据到临时变量，防止被后续操作改变
      const currentReqParams = JSON.parse(JSON.stringify(reqParams.value || {}));
      const currentInterfaceName = interfaceName.value;
      
      // 取消所有待处理的debounced更新（防止串染）
      handleUpdateQueryRef.value.cancel?.();
      handleUpdateHeadersRef.value.cancel?.();
      handleUpdateBodyRef.value.cancel?.();
      
      // 重新创建debounced函数，彻底避免数据串染
      handleUpdateQueryRef.value = debounce(newHandleUpdate("query"), 300);
      handleUpdateHeadersRef.value = debounce(newHandleUpdate("headers"), 300);
      handleUpdateBodyRef.value = debounce(newHandleUpdateBody(), 300);
      
      // 如果有旧的接口ID且不为空，保存旧接口的数据
      if (oldId && oldId !== newId) {
        try {
          const oldData = apiSettingStore.findByID(oldId);
          if (oldData) {
            // 保存接口名称（如果有变化）
            if (currentInterfaceName && currentInterfaceName !== oldData.name) {
              oldData.name = currentInterfaceName;
            }
            // 保存请求参数（使用快照数据）
            const value = JSON.stringify(currentReqParams);
            oldData.setting = value;
            await apiSettingStore.updateByID(oldId, oldData);
          }
        } catch (err) {
          console.error('Failed to save API before switching:', err);
          // 即使保存失败也继续切换，但可以考虑显示警告
        }
      }
      
      // 更新组件状态（先切换 key 触发子组件卸载，避免中间态清空影响编辑器）
      componentKey.value = newId;
      updateReqParams(newId);
      
      // 延迟启用更新，等待UI同步完成
      setTimeout(() => {
        isSwitching.value = false;
      }, 100);
    }, { flush: 'sync' });
    if (selectedID.value) {
      updateReqParams(selectedID.value);
    }

    const offListen = onSelectResponse((resp) => {
      // 不再覆盖请求参数，保持编辑器中的原始内容
      // reqParams.value = cloneDeep(resp.req);
      caclWrapperHeight();
      const id = resp.id || `${Date.now()}`;
      componentKey.value = `${selectedID.value}-${id}`;
    });

    onBeforeUnmount(async () => {
      // 组件卸载前保存当前接口的数据
      if (selectedID.value) {
        try {
          // 强制执行所有待处理的debounced更新
          handleUpdateQueryRef.value.flush?.();
          handleUpdateHeadersRef.value.flush?.();
          handleUpdateBodyRef.value.flush?.();
          
          const currentData = apiSettingStore.findByID(selectedID.value);
          if (currentData) {
            // 保存接口名称（如果有变化）
            if (interfaceName.value && interfaceName.value !== currentData.name) {
              currentData.name = interfaceName.value;
            }
            // 保存请求参数
            const value = JSON.stringify(reqParams.value || {});
            currentData.setting = value;
            await apiSettingStore.updateByID(selectedID.value, currentData);
          }
        } catch (err) {
          console.error('Failed to save API before unmounting:', err);
        }
      }
      
      offListen();
      stop();
    });
    const update = async () => {
      const id = selectedID.value;
      // 允许未选择接口时编辑，但不保存
      if (!id) {
        return;
      }
      const data = apiSettingStore.findByID(id);
      if (!data) {
        return;
      }
      try {
        let value = "";
        if (reqParams.value) {
          value = JSON.stringify(reqParams.value);
        }
        data.setting = value;
        await apiSettingStore.updateByID(id, data);
      } catch (err) {
        showError(message, err);
      }
    };
    const handleUpdateURI = async (data: RequestURI) => {
      Object.assign(reqParams.value, data);
      // 移除自动保存，仅更新本地状态
    };


    const newHandleUpdate = (key: string) => {
      return async (id: string, data: KVParam[]) => {
        // 因为是延时执行，如果已经切换，则不更新
        // 避免更新了其它接口的数据
        if (id !== selectedID.value) {
          return;
        }
        
        if (isSwitching.value) {
          return;
        }
        reqParams.value[key] = data;
        // 移除自动保存
      };
    };

    const newHandleUpdateBody = () => {
      return async (id: string, params: { body: string; contentType: string }) => {
        if (id !== selectedID.value) {
          return;
        }
        if (isSwitching.value) {
          return;
        }
        reqParams.value.contentType = params.contentType;
        reqParams.value.body = params.body;
        // 移除自动保存
      };
    };

    // 使用ref包装debounced函数，支持动态更新
    const handleUpdateQueryRef = ref(debounce(newHandleUpdate("query"), 300));
    const handleUpdateHeadersRef = ref(debounce(newHandleUpdate("headers"), 300));
    const handleUpdateBodyRef = ref(debounce(newHandleUpdateBody(), 300));
    
    // 包装函数，始终调用最新的debounced函数（避免 TS 对不定长参数的限制）
    const handleUpdateQuery = (id: string, data: KVParam[]) => {
      return handleUpdateQueryRef.value(id, data);
    };
    const handleUpdateHeaders = (id: string, data: KVParam[]) => {
      return handleUpdateHeadersRef.value(id, data);
    };
    const handleUpdateBody = (id: string, params: { body: string; contentType: string }) => {
      return handleUpdateBodyRef.value(id, params);
    };

    const handleUpdateMethod = async (method: string) => {
      reqParams.value.method = method;
      // 移除自动保存
    };

    const handleUpdateUri = async (uri: string) => {
      reqParams.value.uri = uri;
      // 移除自动保存
    };
    
    const handleUpdateName = async (name: string) => {
      interfaceName.value = name;
      // 移除自动保存
    };
    
    const handleUpdateResponseHandler = async (handler: string) => {
      reqParams.value.responseHandler = handler;
      // 移除自动保存
    };

    // 手动保存函数
    const handleSave = async () => {
      // 如果没有选择接口,自动创建一个新接口
      if (!selectedID.value) {
        try {
          // 尝试从路由参数获取集合ID
          let collection = route.params.collection as string;
          
          // 如果路由参数没有，尝试从现有的API设置列表中获取
          if (!collection && apiSettingStore.apiSettings.length > 0) {
            collection = apiSettingStore.apiSettings[0].collection;
          }
          
          // 如果还是没有，提示错误
          if (!collection) {
            message.error('无法获取当前集合，请先在左侧目录中选择或创建一个接口');
            return;
          }
          
          // 创建新接口，使用解析出的名称或默认名称
          const newAPI = newDefaultAPISetting();
          newAPI.name = interfaceName.value || i18nCommon('newAPI');
          newAPI.collection = collection;
          newAPI.category = 'http';
          newAPI.setting = JSON.stringify(reqParams.value);
          
          await apiSettingStore.add(newAPI);
          
          // 选中新创建的接口
          apiSettingStore.select(newAPI.id);
          
          message.success(i18nCommon('createAndSaveSuccess'));
        } catch (err) {
          showError(message, err);
        }
        return;
      }
      
      // 已选择接口，执行更新
      const data = apiSettingStore.findByID(selectedID.value);
      if (data) {
        // 更新接口名称（如果有变化）
        if (interfaceName.value && interfaceName.value !== data.name) {
          data.name = interfaceName.value;
        }
      }

      await update();
      if (selectedID.value) {
        message.success(i18nCommon('saveSuccess'));
      }
    };

    return {
      componentKey,
      reqParamsStyle,
      updateURINodeHeight,
      wrapper,
      selectedID,
      reqParams,
      interfaceName,
      // 避免频繁重复触发，不能设置过长
      // 如果设置过长容易导致更新了还没生效
      handleUpdateBody,
      handleUpdateURI,
      handleUpdateQuery,
      handleUpdateHeaders,
      handleUpdateMethod: debounce(handleUpdateMethod, 300),
      handleUpdateUri: debounce(handleUpdateUri, 300),
      handleUpdateName: debounce(handleUpdateName, 300),
      handleUpdateResponseHandler: debounce(handleUpdateResponseHandler, 300),
      handleSave,
      update,
    };
  },
  render() {
    const { reqParams, selectedID, componentKey, interfaceName } = this;

    // 在渲染阶段捕获稳定的接口ID，避免切换后异步回调写入到新接口导致串染
    const stableSelectedId = String(this.selectedID || "");

    return (
      <div class={wrapperClass} key={`uri-${componentKey}`} ref="wrapper">
        <APISettingParamsURI
          onVnodeMounted={(node) => {
            this.updateURINodeHeight(node);
          }}
          onVnodeUpdated={(node) => {
            this.updateURINodeHeight(node);
          }}
          params={reqParams}
          onUpdateURI={(data) => {
            this.handleUpdateURI(data);
          }}
          onSubmit={async (isAborted: boolean) => {
            if (isAborted) {
              return this.$props.onSend(abortRequestID);
            }
            // 发送前先强制更新 store，确保使用最新数据
            if (selectedID) {
              await this.update();
            }
            return this.$props.onSend(selectedID);
          }}
          onSave={() => {
            this.handleSave();
          }}
        />
        <NDivider />
        <APISettingParamsReqParams
          key={`params-${componentKey}`}
          style={{ flex: 1, minHeight: 0 }}
          id={selectedID}
          params={reqParams}
          interfaceName={interfaceName}
          onUpdateBody={(value) => {
            const id = stableSelectedId;
            this.handleUpdateBody(id, value);
          }}
          onUpdateQuery={(value) => {
            const id = stableSelectedId;
            this.handleUpdateQuery(id, value);
          }}
          onUpdateHeaders={(value) => {
            const id = stableSelectedId;
            this.handleUpdateHeaders(id, value);
          }}
          onUpdateMethod={(value) => {
            this.handleUpdateMethod(value);
          }}
          onUpdateUri={(value) => {
            this.handleUpdateUri(value);
          }}
          onUpdateName={(value) => {
            this.handleUpdateName(value);
          }}
          onUpdateResponseHandler={(value) => {
            this.handleUpdateResponseHandler(value);
          }}
        />
      </div>
    );
  },
});
