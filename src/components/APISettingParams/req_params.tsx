import {
  NBadge,
  NButton,
  NButtonGroup,
  NDropdown,
  NIcon,
  NTab,
  NTabs,
  useDialog,
  useMessage,
} from "naive-ui";
import { css } from "@linaria/core";
import {
  defineComponent,
  onBeforeUnmount,
  onMounted,
  PropType,
  ref,
  watch,
} from "vue";
import { editor } from "monaco-editor/esm/vs/editor/editor.api";

import {
  HTTPMethod,
  HTTPRequest,
  ContentType,
} from "../../commands/http_request";
import { useSettingStore } from "../../stores/setting";
import { i18nCollection, i18nCommon } from "../../i18n";
import { CaretDownOutline, CodeSlashOutline } from "@vicons/ionicons5";
import { showError, tryToParseArray } from "../../helpers/util";
import ExKeyValue, { HandleOption } from "../ExKeyValue";
import { KVParam } from "../../commands/interface";
import { padding } from "../../constants/style";
import { useAPICollectionStore } from "../../stores/api_collection";
import { replaceContent, createEditor } from "../../helpers/editor";
import HttpEditor from "./http_editor";
import { requestToHttpText, httpTextToRequest } from "../../helpers/http_converter";
import { debounce } from "lodash-es";

enum TabItem {
  Body = "Body",
  Query = "Query",
  Header = "Header",
  Http = "Http",
}

const tabClass = css`
  height: 100%;
  display: flex;
  flex-direction: column;
  
  /* 自定义滚动条样式 */
  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(144, 147, 153, 0.3) transparent;
  }
  *::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  *::-webkit-scrollbar-track {
    background: transparent;
  }
  *::-webkit-scrollbar-thumb {
    background-color: rgba(144, 147, 153, 0.3);
    border-radius: 4px;
  }
  *::-webkit-scrollbar-thumb:hover {
    background-color: rgba(144, 147, 153, 0.5);
  }
  
  .expandSelect {
    visibility: hidden;
  }
  .n-tabs:hover .expandSelect {
    visibility: visible;
  }
  .n-tabs-tab__label {
    .n-icon {
      margin-left: 5px;
    }
    .contentType {
      width: 60px;
      text-align: center;
    }
  }
  .badgeTab {
    position: relative;
    .badge {
      position: absolute;
      right: -15px;
      top: 8px;
      .n-badge-sup {
        padding: 0 3px !important;
        border-radius: 3px !important;
      }
    }
  }
  .hidden {
    display: none;
  }
  .format {
    position: fixed;
    bottom: 2px;
    .n-icon {
      font-size: 16px;
      font-weight: 900;
      margin-right: 5px;
    }
  }
  .content {
    flex: 1;
    min-height: 0;
    max-height: 100%;
    overflow: hidden;
    position: relative;
  }
  .codeEditorWrapper {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    max-height: 100%;
    max-width: 100%;
  }
  .keyValue {
    margin: ${padding}px;
  }
  .httpEditor {
    height: 100%;
    width: 100%;
  }
`;

function shouldHaveBody(method: string) {
  return [HTTPMethod.POST, HTTPMethod.PUT, HTTPMethod.PATCH].includes(
    method as HTTPMethod,
  );
}

function shouldShowEditor(contentType: string) {
  return [ContentType.JSON, ContentType.XML, ContentType.Plain].includes(
    contentType as ContentType,
  );
}

function createBadgeTab(params: {
  tab: string;
  value: number;
  activeTab: string;
}) {
  const { value, tab, activeTab } = params;
  const badge =
    value && tab !== activeTab ? (
      <NBadge class="badge" color="grey" value={value} />
    ) : null;
  return (
    <NTab class="badgeTab" name={tab}>
      {tab}
      {badge}
    </NTab>
  );
}

function createBodyBadge(params: { contentType: string; body: string }) {
  const { contentType, body } = params;
  if (
    ![ContentType.Multipart, ContentType.Form].includes(
      contentType as ContentType,
    )
  ) {
    return;
  }
  const arr = tryToParseArray(body);
  if (arr.length === 0) {
    return;
  }
  return <NBadge class="badge" color="grey" value={arr.length} />;
}

export default defineComponent({
  name: "APISettingParamsReqParams",
  props: {
    id: {
      type: String,
      default: () => "",
    },
    params: {
      type: Object as PropType<HTTPRequest>,
      required: true,
    },
    interfaceName: {
      type: String,
      default: "",
    },
    onUpdateBody: {
      type: Function as PropType<
        (params: { body: string; contentType: string }) => void
      >,
      required: true,
    },
    onUpdateQuery: {
      type: Function as PropType<(query: KVParam[]) => void>,
      required: true,
    },
    onUpdateHeaders: {
      type: Function as PropType<(headers: KVParam[]) => void>,
      required: true,
    },
    onUpdateMethod: {
      type: Function as PropType<(method: string) => void>,
      required: false,
    },
    onUpdateUri: {
      type: Function as PropType<(uri: string) => void>,
      required: false,
    },
    onUpdateName: {
      type: Function as PropType<(name: string) => void>,
      required: false,
    },
    onUpdateResponseHandler: {
      type: Function as PropType<(handler: string) => void>,
      required: false,
    },
  },
  setup(props) {
    const settingStore = useSettingStore();
    const message = useMessage();
    const dialog = useDialog();
    const collectionStore = useAPICollectionStore();
    const codeEditor = ref<HTMLElement>();
    const contentType = ref(props.params.contentType || ContentType.JSON);
    const httpText = ref("");
    const isUpdatingFromHttp = ref(false);
    const isUpdatingFromEditor = ref(false);

    let tab = collectionStore.getActiveTab(props.id);
    if (!tab) {
      // 默认选择HTTP tab，而不是Query tab
      tab = TabItem.Http;
    }
    const activeTab = ref(tab as TabItem);

    let editorIns: editor.IStandaloneCodeEditor | null;
    const destroy = () => {
      if (editorIns) {
        editorIns = null;
      }
    };
    const handleEditorUpdate = () => {
      if (props.onUpdateBody && editorIns) {
        isUpdatingFromEditor.value = true;
        props.onUpdateBody({
          body: editorIns.getValue().trim(),
          contentType: contentType.value,
        });
        setTimeout(() => {
          isUpdatingFromEditor.value = false;
        }, 100);
      }
    };
    const initEditor = () => {
      if (editorIns) {
        editorIns.setValue(props.params.body);
        return;
      }
      if (codeEditor.value) {
        editorIns = createEditor({
          dom: codeEditor.value,
          isDark: settingStore.isDark,
        });
        editorIns.setValue(props.params.body || "");
        editorIns.onDidChangeModelContent(handleEditorUpdate);
      }
    };

    const handleChangeContentType = (newContentType: string) => {
      // 如果无数据，直接切换
      const changeContentType = () => {
        // 清空
        replaceContent(editorIns, "");
        if (props.onUpdateBody) {
          props.onUpdateBody({
            body: "",
            contentType: newContentType,
          });
        }
        contentType.value = newContentType;
      };
      if (!props.params.body) {
        changeContentType();
        return;
      }
      dialog.warning({
        title: i18nCollection("changeContentType"),
        content: i18nCollection("changeContentTypeContent"),
        positiveText: i18nCommon("confirm"),
        onPositiveClick: async () => {
          changeContentType();
        },
      });
    };

    const getParamsFromHandleOption = (opt: HandleOption) => {
      const arr = [] as KVParam[];
      opt.params.forEach((item) => {
        const { key, value } = item;
        if (!key && !value) {
          return;
        }
        arr.push({
          key,
          value,
          enabled: item.enabled,
        });
      });
      return arr;
    };

    const handleBodyParams = (opt: HandleOption) => {
      const arr = getParamsFromHandleOption(opt);
      if (props.onUpdateBody) {
        props.onUpdateBody({
          body: JSON.stringify(arr),
          contentType: contentType.value,
        });
      }
    };
    const handleQueryParams = (opt: HandleOption) => {
      const arr = getParamsFromHandleOption(opt);
      if (props.onUpdateQuery) {
        props.onUpdateQuery(arr);
      }
    };

    const handleHeaders = (opt: HandleOption) => {
      const arr = getParamsFromHandleOption(opt);
      if (props.onUpdateHeaders) {
        props.onUpdateHeaders(arr);
      }
    };


    const updateParamsColumnWidth = (width: number) => {
      settingStore.updateParamsColumnWidth(width);
    };

    // Debounce 同步到 Http 文本，减少每次键入导致的视口重绘
    const syncParamsToHttpDebounced = debounce((payload: { newText: string; oldText: string }) => {
      const { newText, oldText } = payload;
      if (newText === oldText) return;
      const findRequestLineIndex = (text: string) => {
        const lines = (text || '').split('\n');
        for (let i = 0; i < lines.length; i++) {
          const t = lines[i].trim();
          if (!t) continue;
          if (t.startsWith('#')) continue;
          return i;
        }
        return -1;
      };
      const oldIdx = findRequestLineIndex(oldText);
      const newIdx = findRequestLineIndex(newText);
      if (oldIdx !== -1 && newIdx !== -1) {
        const oldLines = oldText.split('\n');
        const newLines = newText.split('\n');
        const oldTail = oldLines.slice(oldIdx + 1).join('\n');
        const newTail = newLines.slice(newIdx + 1).join('\n');
        if (oldTail === newTail) {
          oldLines[oldIdx] = newLines[newIdx];
          httpText.value = oldLines.join('\n');
          return;
        }
      }
      httpText.value = newText;
    }, 250);

    // 当params或interfaceName变化时，同步更新httpText（如果不是从Http tab触发的更新）
    watch(
      () => [props.params.method, props.params.uri, props.params.query, props.params.headers, props.params.body, props.params.responseHandler, props.interfaceName],
      () => {
        if (isUpdatingFromHttp.value) return;
        const newText = requestToHttpText(props.params, props.interfaceName);
        const oldText = httpText.value || '';
        syncParamsToHttpDebounced({ newText, oldText });
      },
      { deep: true }
    );

    onBeforeUnmount(() => {
      syncParamsToHttpDebounced.cancel();
    });

    // 当body变化时，同步更新JSON/XML/Plain编辑器（如果不是编辑器自己触发的更新）
    watch(
      () => props.params.body,
      (newBody) => {
        if (editorIns && !isUpdatingFromHttp.value && !isUpdatingFromEditor.value) {
          const currentValue = editorIns.getValue();
          if (currentValue !== newBody) {
            console.log('[Body Sync] Updating editor from props.params.body');
            const position = editorIns.getPosition();
            editorIns.setValue(newBody || "");
            if (position) {
              editorIns.setPosition(position);
            }
          }
        }
      }
    );

    // method变化时要选定对应的tab（但不在Http标签页时才自动切换）
    const stop = watch(
      () => props.params.method,
      (method) => {
        // 如果当前在Http标签页，不自动切换
        if (activeTab.value === TabItem.Http) {
          return;
        }
        // 如果是从Http标签页更新的，不自动切换
        if (isUpdatingFromHttp.value) {
          return;
        }
        if (shouldHaveBody(method)) {
          activeTab.value = TabItem.Body;
        } else {
          activeTab.value = TabItem.Query;
        }
      },
    );
    const handleUpdateActiveTab = async (activeTab: string) => {
      try {
        await collectionStore.updateActiveTab({
          id: props.id,
          activeTab,
        });
      } catch (err) {
        showError(message, err);
      }
    };
    const handleFormat = () => {
      if (editorIns) {
        editorIns.getAction("editor.action.formatDocument")?.run();
      }
    };


    const handleHttpTextUpdate = debounce((text: string) => {
      httpText.value = text;
      isUpdatingFromHttp.value = true;
      
      try {
        // 解析HTTP文本并更新params
        const parsed = httpTextToRequest(text);
        console.log('[HTTP Sync] HTTP text -> Params', { parsed });
        
        // 如果解析出了接口名称，并且与当前不同，则更新
        if (parsed.name && parsed.name !== props.interfaceName) {
          console.log('[HTTP Sync] Updating name:', parsed.name);
          props.onUpdateName?.(parsed.name);
        }
        
        // 调用更新回调函数来触发父组件更新
        if (parsed.method && parsed.method !== props.params.method) {
          console.log('[HTTP Sync] Updating method:', parsed.method);
          props.onUpdateMethod?.(parsed.method);
        }
        
        if (parsed.uri && parsed.uri !== props.params.uri) {
          console.log('[HTTP Sync] Updating uri:', parsed.uri);
          props.onUpdateUri?.(parsed.uri);
        }
        
        if (parsed.query && Array.isArray(parsed.query)) {
          console.log('[HTTP Sync] Updating query:', parsed.query);
          props.onUpdateQuery?.(parsed.query);
        }
        
        if (parsed.headers && Array.isArray(parsed.headers)) {
          console.log('[HTTP Sync] Updating headers:', parsed.headers);
          props.onUpdateHeaders?.(parsed.headers);
        }

        
        if (parsed.body !== undefined && parsed.body !== props.params.body) {
          console.log('[HTTP Sync] Updating body:', parsed.body.substring(0, 50));
          props.onUpdateBody?.({
            body: parsed.body,
            contentType: parsed.contentType || props.params.contentType || "application/json",
          });
        }
        
        if (parsed.contentType && parsed.contentType !== contentType.value) {
          contentType.value = parsed.contentType;
        }
        
        // 处理响应处理脚本
        if (parsed.responseHandler !== undefined) {
          console.log('[HTTP Sync] Updating responseHandler:', parsed.responseHandler);
          if (props.onUpdateResponseHandler) {
            props.onUpdateResponseHandler(parsed.responseHandler || '');
          }
        }
      } catch (err) {
        console.error("Failed to parse HTTP text:", err);
      } finally {
        setTimeout(() => {
          isUpdatingFromHttp.value = false;
        }, 100);
      }
    }, 300);

    onMounted(() => {
      initEditor();
      // 初始化httpText
      httpText.value = requestToHttpText(props.params, props.interfaceName);
    });
    onBeforeUnmount(() => {
      stop();
      destroy();
    });
    return {
      contentType,
      handleBodyParams,
      handleQueryParams,
      handleHeaders,
      handleChangeContentType,
      handleUpdateActiveTab,
      handleFormat,
      activeTab,
      codeEditor,
      updateParamsColumnWidth,
      httpText,
      handleHttpTextUpdate,
    };
  },
  render() {
    const { params } = this.$props;
    const { method } = params;
    const { activeTab, contentType } = this;
    // Http 标签页放在最左边
    const tabs = [TabItem.Http, TabItem.Query, TabItem.Header];
    if (shouldHaveBody(method)) {
      // Body 标签页放在 Http 之后
      tabs.splice(1, 0, TabItem.Body);
    }
    let activeIndex = tabs.indexOf(activeTab);
    if (activeIndex < 0) {
      activeIndex = 0;
    }

    const contentTypeOptions = [
      {
        label: "JSON",
        key: ContentType.JSON,
      },
      {
        label: "Form",
        key: ContentType.Form,
      },
      {
        label: "Multipart",
        key: ContentType.Multipart,
      },
      {
        label: "XML",
        key: ContentType.XML,
      },
      {
        label: "Plain",
        key: ContentType.Plain,
      },
    ];
    const list = tabs.map((item) => {
      switch (item) {
        case TabItem.Body:
          {
            const label = contentTypeOptions.find(
              (opt) => opt.key === contentType,
            );
            if (activeTab !== TabItem.Body) {
              const badge = createBodyBadge({
                contentType,
                body: params.body,
              });
              return (
                <NTab name={item} class="badgeTab">
                  <div class="contentType">
                    {label?.label}
                    <NIcon>
                      <CaretDownOutline />
                    </NIcon>
                  </div>
                  {badge}
                </NTab>
              );
            }
            return (
              <NTab name={item}>
                <NDropdown
                  options={contentTypeOptions}
                  trigger="click"
                  value={contentType}
                  onSelect={(value) => {
                    this.handleChangeContentType(value);
                  }}
                >
                  <div class="contentType">
                    {label?.label}
                    <NIcon>
                      <CaretDownOutline />
                    </NIcon>
                  </div>
                </NDropdown>
              </NTab>
            );
          }
          break;
        case TabItem.Query:
          return createBadgeTab({
            activeTab,
            tab: item,
            value: params.query?.length,
          });
          break;
        case TabItem.Header:
          {
            return createBadgeTab({
              activeTab,
              tab: item,
              value: params.headers?.length,
            });
          }
          break;

        case TabItem.Http:
          return <NTab name={item}>Http</NTab>;
          break;
        default:
          return <NTab name={item}>{item}</NTab>;
          break;
      }
    });

    let codeEditorClass = "";
    if (activeTab !== TabItem.Body || !shouldShowEditor(contentType)) {
      codeEditorClass = "hidden";
    }
    let showBodyKeyValue = false;
    let keyValues = [];

    switch (activeTab) {
      case TabItem.Body:
        {
          if (!shouldShowEditor(contentType)) {
            showBodyKeyValue = true;
            try {
              keyValues = tryToParseArray(this.params.body);
            } catch (err) {
              // 忽略parse出错
              console.error(err);
            }
          }
        }
        break;
      case TabItem.Query:
        {
          keyValues = this.params.query || [];
        }
        break;
      case TabItem.Header:
        {
          keyValues = this.params.headers || [];
        }
        break;

    }

    const keyValueSpans = [8, 16];

    const tabSlots = {
      suffix: () => (
        <NButtonGroup class="expandSelect">
          <NButton
            onClick={() => {
              this.updateParamsColumnWidth(0.3);
            }}
          >
            30%
          </NButton>
          <NButton
            onClick={() => {
              this.updateParamsColumnWidth(0.5);
            }}
          >
            50%
          </NButton>
          <NButton
            onClick={() => {
              this.updateParamsColumnWidth(0.7);
            }}
          >
            70%
          </NButton>
        </NButtonGroup>
      ),
    };

    return (
      <div class={tabClass}>
        <NTabs
          v-slots={tabSlots}
          tabsPadding={15}
          key={method}
          type="line"
          defaultValue={tabs[activeIndex]}
          onUpdateValue={(value) => {
            let activeTab = value as string;
            if (shouldHaveBody(method)) {
              if (value === TabItem.Body) {
                activeTab = "";
              }
            } else {
              if (value === TabItem.Query) {
                activeTab = "";
              }
            }
            this.handleUpdateActiveTab(activeTab);
            this.activeTab = value;
          }}
        >
          {list}
        </NTabs>
        <div class="content">
          {/* json, xml, text */}
          <div
            ref="codeEditor"
            class={`codeEditorWrapper ${codeEditorClass}`}
          ></div>
          {activeTab === TabItem.Body && contentType === ContentType.JSON && (
            <NButton
              class="format"
              quaternary
              onClick={() => {
                this.handleFormat();
              }}
            >
              <NIcon>
                <CodeSlashOutline />
              </NIcon>
              {i18nCollection("format")}
            </NButton>
          )}
          {/* body form/multipart */}
          {showBodyKeyValue && (
            <ExKeyValue
              key="form/multipart"
              class="keyValue"
              spans={keyValueSpans}
              params={keyValues}
              supportFileSelect={contentType === ContentType.Multipart}
              onHandleParam={(opt) => {
                this.handleBodyParams(opt);
              }}
            />
          )}
          {activeTab === TabItem.Query && (
            <ExKeyValue
              key="query"
              class="keyValue"
              spans={keyValueSpans}
              params={keyValues}
              onHandleParam={(opt) => {
                this.handleQueryParams(opt);
              }}
            />
          )}
          {activeTab === TabItem.Header && (
            <ExKeyValue
              key="header"
              class="keyValue"
              spans={[12, 12]}
              params={keyValues}
              onHandleParam={(opt) => {
                this.handleHeaders(opt);
              }}
            />
          )}

          {activeTab === TabItem.Http && (
            <HttpEditor
              key="http"
              class="httpEditor"
              content={this.httpText || requestToHttpText(this.$props.params, this.$props.interfaceName)}
              onUpdate={(content) => {
                this.handleHttpTextUpdate(content);
              }}
            />
          )}
        </div>
      </div>
    );
  },
});
