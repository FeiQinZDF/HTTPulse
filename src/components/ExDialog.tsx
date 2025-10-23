import { editor } from "monaco-editor/esm/vs/editor/editor.api";
import { DialogApiInjection } from "naive-ui/es/dialog/src/DialogProvider";
import { defineComponent, onBeforeUnmount, ref, PropType } from "vue";
import { i18nCollection, i18nCommon } from "../i18n";
import { useSettingStore } from "../stores/setting";
import { useEnvironmentStore } from "../stores/environment";
import { useEnvironmentsStore } from "../stores/environments";
import ExForm, { ExFormItem, ExUpdateData } from "./ExForm";
import { createEditor } from "../helpers/editor";
import { css } from "@linaria/core";
import {
  NButton,
  NIcon,
  NTabPane,
  NTabs,
  NText,
  NUpload,
  NUploadDragger,
  UploadFileInfo,
  useMessage,
} from "naive-ui";
import { useAPISettingStore } from "../stores/api_setting";
import { useAPIFolderStore } from "../stores/api_folder";
import {
  getNormalDialogStyle,
  isJSON,
  jsonFormat,
  showError,
  delay,
} from "../helpers/util";
import { CloudUploadOutline } from "@vicons/ionicons5";
import { importAPI, ImportCategory } from "../commands/import_api";
import { isHTTPFormat } from "../helpers/import";
import { importFromSwaggerUI } from "../helpers/swagger_import";
import { createAPISetting } from "../commands/api_setting";
import { createAPIFolder } from "../commands/api_folder";
import { NInput } from "naive-ui";

interface OnConfirm {
  (data: ExUpdateData): Promise<void>;
}
interface DialogOption {
  dialog: DialogApiInjection;
  title: string;
  enterTriggerSubmit?: boolean;
  formItems: ExFormItem[];
  onConfirm: OnConfirm;
}

interface ImportDialogOption {
  dialog: DialogApiInjection;
  collection: string;
  folder?: string;
  data: string;
}
export default function newDialog(option: DialogOption) {
  const { dialog, formItems } = option;
  const d = dialog.info({
    title: option.title,
    autoFocus: true,
    closable: false,
    content: () => (
      <ExForm
        enterTriggerSubmit={option.enterTriggerSubmit}
        formItems={formItems}
        onSubmit={async (data) => {
          await option.onConfirm(data);
          d.destroy();
          // 增加延时，否则快速点击时会触发两次
          await delay(100);
        }}
      />
    ),
  });
}

const importWrapperHeight = 300;
const codeEditorClass = css`
  .codeEditor {
    height: ${importWrapperHeight}px;
    overflow-y: auto;
  }
`;

const ImportEditor = defineComponent({
  name: "ImportEditor",
  props: {
    data: {
      type: String,
      default: () => "",
    },
    collection: {
      type: String,
      required: true,
    },
    folder: {
      type: String,
      default: () => "",
    },
    onConfirm: {
      type: Function as PropType<() => void>,
      required: true,
    },
  },
  setup(props) {
    const settingStore = useSettingStore();
    const apiSettingStore = useAPISettingStore();
    const apiFolderStore = useAPIFolderStore();
    const message = useMessage();

    const currentTab = ref(ImportCategory.Text);
    const fileData = ref("");
    const swaggerUrl = ref("");

    let editorIns: editor.IStandaloneCodeEditor | null;
    const destroyEditor = () => {
      if (editorIns) {
        editorIns = null;
      }
    };

    const codeEditor = ref<HTMLElement>();
    const initEditor = () => {
      if (editorIns) {
        return;
      }
      if (codeEditor.value) {
        const initial = props.data?.trim() || "";
        const language = initial.startsWith("curl") || isHTTPFormat(initial) ? "plaintext" : "json";
        editorIns = createEditor({
          dom: codeEditor.value,
          isDark: settingStore.isDark,
          language,
        });
      }
      if (!editorIns) {
        return;
      }
      const data = isJSON(props.data) ? jsonFormat(props.data) : "";
      editorIns.setValue(data);

      const setFocus = () => {
        editorIns?.focus();
      };
      setTimeout(setFocus, 50);
    };
    const processing = ref(false);
    const handleImport = async () => {
      if (processing.value) {
        return;
      }
      processing.value = true;
      try {
        let topIDList: string[] = [];
        
        // Swagger URL 导入
        if (currentTab.value === "swagger_url") {
          if (!swaggerUrl.value.trim()) {
            throw new Error("请输入 Swagger UI 地址");
          }
          const result = await importFromSwaggerUI(swaggerUrl.value.trim(), props.collection);
          
          // 先创建文件夹
          for (const folder of result.folders) {
            await createAPIFolder(folder);
          }
          
          // 再创建接口
          for (const setting of result.settings) {
            await createAPISetting(setting);
          }
          
          // 返回文件夹 ID 列表
          topIDList = result.folders.map(f => f.id);
        } else {
          if (currentTab.value === ImportCategory.Text) {
            if (editorIns) {
              fileData.value = editorIns.getValue();
            } else {
              fileData.value = "";
            }
          }
          topIDList = await importAPI({
            category: currentTab.value,
            collection: props.collection,
            fileData: fileData.value.trim(),
          });
        }
        // 如果指定了目录
        if (props.folder && topIDList.length) {
          await apiFolderStore.addChild({
            id: props.folder,
            children: topIDList,
          });
        }

        // 重新加载数据，触发页面刷新
        await apiFolderStore.fetch(props.collection);
        await apiSettingStore.fetch(props.collection);
        await useEnvironmentStore().fetch(props.collection);
        
        // 刷新新的环境系统
        const environmentsStore = useEnvironmentsStore();
        await environmentsStore.fetch();
        // 重新加载激活的环境（可能已经被切换）
        await environmentsStore.loadActiveEnvironment();
        
        message.info(i18nCollection("importSuccess"));

        if (props.onConfirm) {
          props.onConfirm();
        }
      } catch (err) {
        showError(message, err);
      } finally {
        processing.value = false;
      }
    };

    const handleReadFile = (blob: Blob) => {
      const r = new FileReader();
      r.onload = () => {
        fileData.value = r.result as string;
      };
      r.onerror = () => {
        fileData.value = "";
        showError(message, new Error("read file fail"));
      };
      r.readAsText(blob);
    };
    onBeforeUnmount(() => {
      destroyEditor();
    });
    return {
      currentTab,
      fileData,
      destroyEditor,
      initEditor,
      handleReadFile,
      handleImport,
      processing,
      codeEditor,
      swaggerUrl,
    };
  },
  render() {
    const { currentTab } = this;
    const uploadWrapper = (
      <NUpload
        style={{
          height: `${importWrapperHeight}px`,
        }}
        onChange={(data: {
          file: UploadFileInfo;
          fileList: UploadFileInfo[];
        }) => {
          this.handleReadFile(data.fileList[0].file as Blob);
        }}
      >
        <NUploadDragger>
          <div
            style={{
              marginBottom: "10px",
            }}
          >
            <NIcon size="48">
              <CloudUploadOutline />
            </NIcon>
          </div>
          <NText>{i18nCollection("dragUploadTips")}</NText>
        </NUploadDragger>
      </NUpload>
    );
    return (
      <div>
        <NTabs
          defaultValue={currentTab}
          onUpdateValue={(value) => {
            this.fileData = "";
            this.currentTab = value;
          }}
        >
          <NTabPane
            name={ImportCategory.Text}
            tab="JSON / curl / http"
            onVnodeMounted={() => {
              this.initEditor();
            }}
            onVnodeUnmounted={() => {
              this.destroyEditor();
            }}
          >
            <div class={codeEditorClass}>
              <div ref="codeEditor" class="codeEditor"></div>
            </div>
          </NTabPane>
          <NTabPane
            name={ImportCategory.File}
            tab="File/Postman/Insonmia/Swagger"
          >
            {uploadWrapper}
          </NTabPane>
          <NTabPane
            name="swagger_url"
            tab="Swagger URL"
          >
            <div style={{ padding: "20px" }}>
              <div style={{ marginBottom: "10px" }}>
                <NText>请输入 Swagger UI 地址:</NText>
              </div>
              <NInput
                v-model:value={this.swaggerUrl}
                placeholder="例如: http://192.168.1.8:20256/doc.html"
                clearable
              />
              <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--n-text-color-disabled)" }}>
                <NText depth="3">
                  支持的格式: Swagger 2.0 / OpenAPI 3.0<br />
                  程序会自动尝试常见的 API 文档地址 (v3/api-docs, v2/api-docs 等)
                </NText>
              </div>
            </div>
          </NTabPane>
        </NTabs>
        <div class="tar">
          <NButton
            loading={this.processing}
            onClick={() => {
              this.handleImport();
            }}
          >
            {i18nCommon("confirm")}
          </NButton>
        </div>
      </div>
    );
  },
});

export function newImportDialog(option: ImportDialogOption) {
  const { dialog, data, collection, folder } = option;

  const d = dialog.info({
    title: i18nCollection("importSettings"),
    closable: false,
    style: getNormalDialogStyle(),
    content: () => (
      <ImportEditor
        data={data}
        collection={collection}
        folder={folder}
        onConfirm={() => {
          d.destroy();
        }}
      />
    ),
  });
}
