import { defineComponent, computed, ref, Ref } from 'vue';
import { NSelect, NSpace, NButton, NIcon, useMessage } from 'naive-ui';
import { SettingsOutline, AddOutline } from '@vicons/ionicons5';
import { css } from '@linaria/core';
import { storeToRefs } from 'pinia';
import { useEnvironmentsStore } from '../stores/environments';
import { showError } from '../helpers/util';
import { newDefaultEnvironment, Environment } from '../commands/environment';
import EnvironmentManager from './EnvironmentManager';

const selectorClass = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
`;

const selectClass = css`
  min-width: 150px;
`;

export default defineComponent({
  name: 'EnvironmentSelector',
  setup() {
    const message = useMessage();
    const showManager = ref(false);
    
    // 安全获取 store
    let environmentsStore: ReturnType<typeof useEnvironmentsStore> | undefined;
    let environments: Ref<Environment[]> = ref([]);
    let activeEnvironment: Ref<Environment | null> = ref(null);
    
    try {
      environmentsStore = useEnvironmentsStore();
      const refs = storeToRefs(environmentsStore);
      environments = refs.environments;
      activeEnvironment = refs.activeEnvironment;
    } catch (err) {
      console.warn('Environments store not ready yet:', err);
      // 返回空状态，不阻塞渲染
    }

    // 环境选项
    const environmentOptions = computed(() => {
      return environments.value.map((env) => ({
        label: env.name,
        value: env.id,
        disabled: env.enabled !== '1',
      }));
    });

    // 当前激活环境的 ID
    const activeEnvId = computed({
      get: () => activeEnvironment.value?.id || null,
      set: async (id: string | null) => {
        if (id && environmentsStore) {
          try {
            await environmentsStore.setActive(id);
            message.success(`切换到环境: ${activeEnvironment.value?.name}`);
          } catch (err) {
            showError(message, err);
          }
        }
      },
    });

    // 打开环境管理
    const handleManageEnvironments = () => {
      showManager.value = true;
    };

    // 新建环境
    const handleAddEnvironment = async () => {
      if (!environmentsStore) {
        message.warning('环境系统还未初始化');
        return;
      }
      try {
        const newEnv = newDefaultEnvironment('new_env');
        newEnv.name = `Environment ${environments.value.length + 1}`;
        await environmentsStore.add(newEnv);
        message.success(`创建环境: ${newEnv.name}`);
        // 切换到新创建的环境
        await environmentsStore.setActive(newEnv.id);
      } catch (err) {
        showError(message, err);
      }
    };

    return {
      environmentOptions,
      activeEnvId,
      showManager,
      handleManageEnvironments,
      handleAddEnvironment,
    };
  },
  render() {
    const { environmentOptions, activeEnvId } = this;

    return (
      <>
        <div class={selectorClass}>
          <NSelect
            class={selectClass}
            value={activeEnvId}
            options={environmentOptions}
            placeholder="选择环境"
            onUpdateValue={(value: string) => {
              this.activeEnvId = value;
            }}
          />
          <NSpace>
            <NButton
              size="small"
              circle
              quaternary
              onClick={this.handleAddEnvironment}
              v-slots={{
                icon: () => (
                  <NIcon>
                    <AddOutline />
                  </NIcon>
                ),
              }}
            />
            <NButton
              size="small"
              circle
              quaternary
              onClick={this.handleManageEnvironments}
              v-slots={{
                icon: () => (
                  <NIcon>
                    <SettingsOutline />
                  </NIcon>
                ),
              }}
            />
          </NSpace>
        </div>
        <EnvironmentManager
          show={this.showManager}
          onUpdateShow={(show: boolean) => {
            this.showManager = show;
          }}
        />
      </>
    );
  },
});
