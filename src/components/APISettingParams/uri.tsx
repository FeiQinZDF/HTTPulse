import { defineComponent, PropType, ref, watch, h } from "vue";
import { css } from "@linaria/core";
import {
  NButton,
  NInput,
  NInputGroup,
  NSelect,
  NIcon,
  NDropdown,
  NGradientText,
} from "naive-ui";
import { ulid } from "ulid";
import { storeToRefs } from "pinia";
import { CodeSlashOutline } from "@vicons/ionicons5";
import { debounce } from "lodash-es";

import { i18nCollection, i18nEnvironment, i18nCommon } from "../../i18n";
import { HTTPRequest, HTTPMethod } from "../../commands/http_request";
import { useEnvironmentsStore } from "../../stores/environments";
import { useDialogStore } from "../../stores/dialog";
import { useSettingStore } from "../../stores/setting";
export const ENVRegexp = /\{\{([\S\s]+)\}\}/;

const environmentSelectWidth = 50;
const wrapperClass = css`
  padding: 7px 4px 5px 0;
  overflow: hidden;
  
  .environmentSelect {
    width: ${environmentSelectWidth}px;
    float: left;
    .n-icon {
      font-size: 16px;
      font-weight: 900;
    }
  }
  .url {
    margin-left: ${environmentSelectWidth}px;
    .method {
      width: 100px;
      
      .n-base-selection {
        height: 36px;
        border-radius: 4px;
      }
      
      .n-base-selection-label {
        font-weight: 600;
        font-size: 13px;
        letter-spacing: 0.5px;
      }
      
      /* Method 颜色样式 */
      &.method-get .n-base-selection-label { color: #10b981 !important; }
      &.method-post .n-base-selection-label { color: #f59e0b !important; }
      &.method-put .n-base-selection-label { color: #3b82f6 !important; }
      &.method-patch .n-base-selection-label { color: #8b5cf6 !important; }
      &.method-delete .n-base-selection-label { color: #ef4444 !important; }
      &.method-options .n-base-selection-label { color: #6366f1 !important; }
      &.method-head .n-base-selection-label { color: #06b6d4 !important; }
    }
    .submit {
      width: 80px;
      height: 36px;
    }
    .save {
      width: 80px;
      height: 36px;
    }
  }
  .n-input,
  .n-base-selection-label {
    background-color: transparent !important;
    line-break: anywhere;
  }
  
  /* URI 输入框现代化样式 */
  .n-input {
    .n-input__textarea-el,
    .n-input__input-el {
      font-family: 'SF Mono', 'Monaco', 'Consolas', 'Roboto Mono', 'Liberation Mono', 'Courier New', monospace;
      font-size: 14px;
      line-height: 1.6;
      letter-spacing: 0.3px;
    }
  }
`;

const envLabelClass = css`
  padding: 0 5px;
  font-size: 13px;
  span {
    margin-left: 10px;
  }
  .n-icon {
    font-weight: 900;
    font-size: 16px;
  }
`;

const uriInputClass = css`
  .n-input__textarea-el {
    color: #0891b2 !important;
    font-weight: 600 !important;
  }
  
  /* 暗色主题 */
  .dark & .n-input__textarea-el {
    color: #67e8f9 !important;
    font-weight: 600 !important;
  }
`;

interface CuttingURIResult {
  env: string;
  uri: string;
}

function cuttingURI(uri: string): CuttingURIResult {
  const result = {
    env: "",
    uri,
  };
  // 只匹配URI开头的环境变量 {{xxx}}
  const envAtStartRegexp = /^\{\{([^\}]+)\}\}/;
  const arr = envAtStartRegexp.exec(uri);
  if (arr?.length === 2) {
    result.env = arr[1].trim();
    result.uri = uri.substring(arr[0].length);
  }
  return result;
}

export interface RequestURI {
  method: string;
  uri: string;
}

const addNewENVKey = ulid();
const clearENVKey = ulid();

export default defineComponent({
  name: "APISettingParamsURI",
  props: {
    params: {
      type: Object as PropType<HTTPRequest>,
      required: true,
    },
    onUpdateURI: {
      type: Function as PropType<(value: RequestURI) => void>,
      required: true,
    },
    onSubmit: {
      type: Function as PropType<(isAborted: boolean) => Promise<void>>,
      required: true,
    },
    onSave: {
      type: Function as PropType<() => void>,
      required: true,
    },
  },
  setup(props) {
    const dialogStore = useDialogStore();
    const environmentsStore = useEnvironmentsStore();
    const settingStore = useSettingStore();
    const { environments, activeEnvironment } = storeToRefs(environmentsStore);
    // 直接使用完整 URI，不拆分环境变量
    const currentURI = ref(props.params.uri);
    const method = ref(props.params.method);
    const sending = ref(false);
    const isUpdatingFromSelf = ref(false);
    
    // 保留 env 用于环境选择器显示
    const uriResult = cuttingURI(props.params.uri);
    const env = ref(uriResult.env);

    // Watch for changes from props (e.g., from HTTP text editor)
    watch(
      () => props.params.uri,
      (newUri, oldUri) => {
        // 如果新旧URI相同，不做任何处理
        if (newUri === oldUri) {
          return;
        }
        
        // 如果当前URI和新URI相同，也不更新（避免循环更新）
        if (currentURI.value === newUri) {
          console.log('[URI] Skip update - already in sync');
          return;
        }
        
        console.log('[URI] Props URI changed:', { 
          newUri, 
          oldUri, 
          prevURI: currentURI.value,
          isUpdatingFromSelf: isUpdatingFromSelf.value
        });
        
        // 直接使用完整 URI，不拆分
        currentURI.value = newUri;
        
        // 更新 env 用于环境选择器显示
        const result = cuttingURI(newUri);
        env.value = result.env;
      },
      { flush: 'post' }  // 在 DOM 更新后执行
    );

    // Watch for method changes from props
    watch(
      () => props.params.method,
      (newMethod, oldMethod) => {
        if (newMethod === oldMethod || newMethod === method.value) {
          return;
        }
        
        console.log('[URI] Props method changed:', { 
          newMethod, 
          oldMethod, 
          currentMethod: method.value,
          isUpdatingFromSelf: isUpdatingFromSelf.value 
        });
        
        // 直接更新，不设置标志
        method.value = newMethod;
      },
      { flush: 'post' }
    );

    const showEnvironment = () => {
      dialogStore.toggleEnvironmentDialog(true);
    };
    
    // 切换环境
    const handleSwitchEnvironment = async (envId: string) => {
      try {
        await environmentsStore.setActive(envId);
      } catch (err) {
        console.error('Failed to switch environment:', err);
      }
    };

    const handleUpdate = () => {
      // 直接使用 currentURI，已包含完整的环境变量前缀
      const uri = currentURI.value || "";
      const changed =
        uri !== props.params.uri || method.value !== props.params.method;

      if (changed && props.onUpdateURI) {
        console.log('[URI] Updating URI from user input:', { 
          method: method.value, 
          uri,
          prevMethod: props.params.method,
          prevUri: props.params.uri
        });
        props.onUpdateURI({
          method: method.value,
          uri,
        });
      }
      return changed;
    };

    // 创建防抖版本的 handleUpdate，用于实时输入
    const debouncedHandleUpdate = debounce(handleUpdate, 300);
    let currentID = "";
    const isCurrent = (id: string) => {
      return id === currentID;
    };
    let lastHandleSendAt = 0;
    const handleSend = async () => {
      if (!props.onSubmit) {
        return;
      }
      const now = Date.now();
      // 如果快速点击
      // 直接忽略第二次点击
      if (now - lastHandleSendAt < 200) {
        return;
      }
      lastHandleSendAt = now;

      // 如果发送中，则中止请求
      if (sending.value) {
        sending.value = false;
        currentID = "";
        await props.onSubmit(true);
        return;
      }
      
      // 发送前先取消防抖并立即同步最新的 URI
      debouncedHandleUpdate.cancel();
      const hasChanges = handleUpdate();
      
      // 如果有更新，等待一个 tick 确保 props 已更新
      if (hasChanges) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      const id = ulid();
      currentID = id;
      sending.value = true;
      try {
        await props.onSubmit(false);
      } finally {
        // 只有当前id才重置状态
        if (isCurrent(id)) {
          sending.value = false;
        }
      }
    };

    return {
      sending,
      handleSend,
      showEnvironment,
      handleSwitchEnvironment,
      handleUpdate,
      debouncedHandleUpdate,
      environments,
      activeEnvironment,
      method,
      env,
      currentURI,
      isDark: settingStore.isDark,
    };
  },
  render() {
    const { environments, activeEnvironment, currentURI, env, method } = this;
    
    // Method 颜色映射
    const methodColors: Record<string, string> = {
      GET: '#10b981',
      POST: '#f59e0b',
      PUT: '#3b82f6',
      PATCH: '#8b5cf6',
      DELETE: '#ef4444',
      OPTIONS: '#6366f1',
      HEAD: '#06b6d4',
    };
    
    const options = [
      HTTPMethod.GET,
      HTTPMethod.POST,
      HTTPMethod.PUT,
      HTTPMethod.PATCH,
      HTTPMethod.DELETE,
      HTTPMethod.OPTIONS,
      HTTPMethod.HEAD,
    ].map((item) => {
      return {
        label: item,
        value: item,
      };
    });
    // 获取启用的环境列表
    const envOptions = environments
      .filter((item) => item.enabled === '1')
      .map((item) => {
        const variableCount = item.variables?.length || 0;
        return {
          label: `${item.name} (${variableCount}个变量)`,
          key: item.id,
        };
      });
    // 环境名称前缀显示
    let envPrefix = "";
    if (activeEnvironment) {
      envPrefix = activeEnvironment.name.substring(0, 2).toUpperCase();
    }
    
    // 添加环境管理选项
    envOptions.push({
      label: i18nEnvironment("addNew"),
      key: addNewENVKey,
    });

    const autoSizeOption = { minRows: 1, maxRows: 3 };

    return (
      <div class={wrapperClass}>
        <div class="environmentSelect">
          <NDropdown
            trigger="click"
            options={envOptions}
            renderLabel={(option) => {
              const label = (option.label as string) || "";
              return (
                <span class={envLabelClass}>
                  {label}
                </span>
              );
            }}
            value={activeEnvironment?.id}
            onSelect={(value) => {
              if (value === addNewENVKey) {
                this.showEnvironment();
                return;
              }
              // 切换激活环境
              this.handleSwitchEnvironment(value);
            }}
          >
            <NButton quaternary>
              {!envPrefix && (
                <NIcon>
                  <CodeSlashOutline />
                </NIcon>
              )}
              {envPrefix && <NGradientText>{envPrefix}</NGradientText>}
            </NButton>
          </NDropdown>
        </div>
        <div class="url">
          <NInputGroup>
            <NSelect
              class={`method method-${(method || HTTPMethod.GET).toLowerCase()}`}
              consistentMenuWidth={false}
              options={options}
              placeholder={""}
              value={method || HTTPMethod.GET}
              renderLabel={(option: any) => {
                const methodName = option.label as string;
                const color = methodColors[methodName] || '#666';
                return (
                  <span style={{ color, fontWeight: '600' }}>
                    {methodName}
                  </span>
                );
              }}
              onUpdateValue={(value) => {
                this.method = value;
                this.handleUpdate();
              }}
            />

            <NInput
              value={currentURI}
              type="textarea"
              autosize={autoSizeOption}
              placeholder={"http://test.com/users/v1/me"}
              clearable
              inputProps={{
                style: {
                  fontFamily: 'SF Mono, Monaco, Consolas, Roboto Mono, monospace',
                  fontSize: '14px',
                  letterSpacing: '0.3px',
                }
              }}
              onBlur={() => {
                this.handleUpdate();
              }}
              onUpdateValue={(value) => {
                this.currentURI = value?.trim();
                // 实时更新（防抖）
                this.debouncedHandleUpdate();
              }}
              onKeydown={(e) => {
                if (e.key.toLowerCase() === "enter" && this.currentURI) {
                  this.handleSend();
                  e.preventDefault();
                }
              }}
            />
            <NButton
              type="primary"
              class="submit"
              // loading={this.sending}
              onClick={() => {
                this.handleSend();
              }}
            >
              {this.sending ? i18nCollection("abort") : i18nCollection("send")}
            </NButton>
            <NButton
              class="save"
              onClick={() => {
                this.$props.onSave();
              }}
            >
              {i18nCommon("save")}
            </NButton>
          </NInputGroup>
        </div>
      </div>
    );
  },
});
