import { defineComponent, ref, computed, watch, PropType, toRaw } from 'vue';
import {
  NModal,
  NCard,
  NSpace,
  NButton,
  NList,
  NListItem,
  NInput,
  NSwitch,
  NIcon,
  NPopconfirm,
  useMessage,
  NDataTable,
  NText,
} from 'naive-ui';
import { TrashOutline, AddOutline } from '@vicons/ionicons5';
import { css } from '@linaria/core';
import { storeToRefs } from 'pinia';
import { useEnvironmentsStore } from '../stores/environments';
import { showError } from '../helpers/util';
import {
  newDefaultEnvironment,
  newDefaultEnvironmentVariable,
  EnvironmentVariable,
} from '../commands/environment';

const modalClass = css`
  .n-card {
    width: 900px;
    max-width: 90vw;
    max-height: 85vh;
  }
`;

const envListClass = css`
  .env-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px;
    cursor: pointer;
    border-radius: 4px;
    
    &:hover {
      background-color: rgba(0, 0, 0, 0.05);
    }
    
    &.active {
      background-color: rgba(24, 160, 88, 0.1);
      border-left: 3px solid #18a058;
    }
  }
`;

const variableTableClass = css`
  margin-top: 16px;
`;

export default defineComponent({
  name: 'EnvironmentManager',
  props: {
    show: {
      type: Boolean,
      default: false,
    },
    onUpdateShow: {
      type: Function as PropType<(show: boolean) => void>,
      required: true,
    },
  },
  setup(props) {
    const message = useMessage();
    const environmentsStore = useEnvironmentsStore();
    const { environments, activeEnvironment } = storeToRefs(environmentsStore);

    const selectedEnvId = ref<string | null>(activeEnvironment.value?.id || null);
    const editingEnvName = ref<string>('');
    const isEditing = ref(false);
    // 使用ref存储编辑中的变量值
    const editingVariables = ref<Record<string, { key: string; value: string; description?: string }>>({}); 
    // 存储待添加的新变量（临时状态）
    const pendingNewVariables = ref<EnvironmentVariable[]>([]);

    const selectedEnv = computed(() => {
      return environments.value.find((env) => env.id === selectedEnvId.value);
    });
    
    // 当对话框打开时，初始化选中的环境
    watch(() => props.show, (show) => {
      if (show && environments.value.length > 0) {
        // 如果没有选中环境，优先选中激活环境，如果没有激活环境则选中第一个
        if (!selectedEnvId.value) {
          if (activeEnvironment.value) {
            selectedEnvId.value = activeEnvironment.value.id;
          } else {
            selectedEnvId.value = environments.value[0].id;
          }
        }
        const env = environments.value.find(e => e.id === selectedEnvId.value);
        if (env) {
          editingEnvName.value = env.name;
        }
      }
    });

    const variables = computed(() => {
      // 合并已保存的变量和待添加的新变量
      const saved = selectedEnv.value?.variables || [];
      return [...saved, ...pendingNewVariables.value];
    });

    // 选择环境
    const handleSelectEnv = (envId: string) => {
      selectedEnvId.value = envId;
      const env = environments.value.find((e) => e.id === envId);
      if (env) {
        editingEnvName.value = env.name;
        isEditing.value = false;
        // 清空编辑状态
        editingVariables.value = {};
        // 清空待添加的新变量
        pendingNewVariables.value = [];
      }
    };

    // 新建环境
    const handleAddEnv = async () => {
      try {
        const isFirstEnv = environments.value.length === 0;
        
        // 生成环境名称：dev, dev1, dev2, dev3...
        let envName = 'dev';
        const existingNames = environments.value.map(env => env.name);
        
        if (existingNames.includes(envName)) {
          let counter = 1;
          while (existingNames.includes(`dev${counter}`)) {
            counter++;
          }
          envName = `dev${counter}`;
        }
        
        const newEnv = newDefaultEnvironment(envName);
        await environmentsStore.add(newEnv);
        selectedEnvId.value = newEnv.id;
        editingEnvName.value = newEnv.name;
        
        // 如果是第一个环境或者没有激活环境，自动激活
        if (isFirstEnv || !activeEnvironment.value) {
          await environmentsStore.setActive(newEnv.id);
        }
        
        message.success('环境创建成功');
      } catch (err) {
        showError(message, err);
      }
    };

    // 删除环境
    const handleDeleteEnv = async (envId: string) => {
      try {
        await environmentsStore.remove(envId);
        if (selectedEnvId.value === envId) {
          selectedEnvId.value = environments.value[0]?.id || null;
        }
        message.success('环境删除成功');
      } catch (err) {
        showError(message, err);
      }
    };

    // 切换激活环境
    const handleToggleActive = async (envId: string, isCurrentlyActive: boolean) => {
      try {
        if (isCurrentlyActive) {
          // 如果当前环境已激活，则关闭它
          await environmentsStore.clearActive();
          message.success('已取消激活环境');
        } else {
          // 否则激活该环境
          await environmentsStore.setActive(envId);
          message.success('环境已激活');
        }
      } catch (err) {
        showError(message, err);
      }
    };

    // 更新环境名称
    const handleUpdateEnvName = async () => {
      if (!selectedEnv.value || !editingEnvName.value.trim()) {
        return;
      }

      try {
        // 使用 toRaw 获取原始对象，避免响应式代理
        const rawEnv = toRaw(selectedEnv.value);
        const updated = {
          ...rawEnv,
          name: editingEnvName.value.trim(),
          variables: rawEnv.variables.map(v => ({ ...toRaw(v) }))
        };
        await environmentsStore.update(updated);
        isEditing.value = false;
        message.success('环境名称已更新');
      } catch (err) {
        showError(message, err);
      }
    };

    // 添加变量
    const handleAddVariable = () => {
      if (!selectedEnv.value) return;

      const newVar = newDefaultEnvironmentVariable();
      
      // 生成不重复的key名（key1, key2, key3...）
      let keyIndex = 1;
      let newKey = `key${keyIndex}`;
      const allKeys = [
        ...selectedEnv.value.variables.map(v => v.key),
        ...pendingNewVariables.value.map(v => v.key)
      ];
      while (allKeys.includes(newKey)) {
        keyIndex++;
        newKey = `key${keyIndex}`;
      }
      
      newVar.key = newKey;
      newVar.value = '';
      newVar.description = '';
      
      // 添加到待添加列表，不立即保存
      pendingNewVariables.value.push(newVar);
    };

    // 更新变量
    const handleUpdateVariable = async (variable: EnvironmentVariable, originalKey: string) => {
      if (!selectedEnv.value) return;

      try {
        // 检查是否是新变量（在pendingNewVariables中）
        const isNewVariable = pendingNewVariables.value.some(v => v.key === originalKey);
        
        if (isNewVariable) {
          // 新变量：需要验证key是否有效
          const trimmedKey = variable.key.trim();
          
          if (!trimmedKey) {
            // key为空，不保存，保留编辑状态
            return;
          }
          
          // 检查key是否已存在（在已保存的变量中或者其他待添加的变量中）
          const existingInSaved = selectedEnv.value.variables.find(v => v.key === trimmedKey);
          const existingInPending = pendingNewVariables.value.find(v => v.key === trimmedKey && v.key !== originalKey);
          
          if (existingInSaved || existingInPending) {
            message.error('变量名已存在');
            return;
          }
          
          // key有效，保存到store
          const pureVariable = {
            key: trimmedKey,
            value: variable.value,
            description: variable.description || ''
          };
          await environmentsStore.addOrUpdateVariable(selectedEnv.value.id, pureVariable);
          
          // 从待添加列表中移除
          pendingNewVariables.value = pendingNewVariables.value.filter(v => v.key !== originalKey);
        } else {
          // 已存在的变量：直接更新
          const pureVariable = {
            key: variable.key,
            value: variable.value,
            description: variable.description || ''
          };
          await environmentsStore.addOrUpdateVariable(selectedEnv.value.id, pureVariable);
        }
      } catch (err) {
        showError(message, err);
      }
    };

    // 删除变量
    const handleDeleteVariable = async (variableKey: string) => {
      if (!selectedEnv.value) return;

      try {
        await environmentsStore.removeVariable(selectedEnv.value.id, variableKey);
      } catch (err) {
        showError(message, err);
      }
    };
    
    const columns = [
      {
        title: '变量名',
        key: 'key',
        render: (row: EnvironmentVariable, index: number) => {
          const rowKey = `${selectedEnvId.value}-${index}`;
          const originalKey = row.key; // 保存原始key
          return (
            <NInput
              value={editingVariables.value[rowKey]?.key ?? row.key}
              placeholder="请输入变量名"
              onUpdateValue={(value: string) => {
                if (!editingVariables.value[rowKey]) {
                  editingVariables.value[rowKey] = { ...row };
                }
                editingVariables.value[rowKey].key = value;
              }}
              onBlur={() => {
                const edited = editingVariables.value[rowKey];
                if (edited) {
                  handleUpdateVariable(edited, originalKey);
                  delete editingVariables.value[rowKey];
                }
              }}
            />
          );
        },
      },
      {
        title: '变量值',
        key: 'value',
        render: (row: EnvironmentVariable, index: number) => {
          const rowKey = `${selectedEnvId.value}-${index}`;
          const originalKey = row.key;
          return (
            <NInput
              value={editingVariables.value[rowKey]?.value ?? row.value}
              placeholder="请输入变量值"
              onUpdateValue={(value: string) => {
                if (!editingVariables.value[rowKey]) {
                  editingVariables.value[rowKey] = { ...row };
                }
                editingVariables.value[rowKey].value = value;
              }}
              onBlur={() => {
                const edited = editingVariables.value[rowKey];
                if (edited) {
                  handleUpdateVariable(edited, originalKey);
                  delete editingVariables.value[rowKey];
                }
              }}
            />
          );
        },
      },
      {
        title: '说明',
        key: 'description',
        render: (row: EnvironmentVariable, index: number) => {
          const rowKey = `${selectedEnvId.value}-${index}`;
          const originalKey = row.key;
          return (
            <NInput
              value={editingVariables.value[rowKey]?.description ?? row.description}
              placeholder="请输入说明"
              onUpdateValue={(value: string) => {
                if (!editingVariables.value[rowKey]) {
                  editingVariables.value[rowKey] = { ...row };
                }
                editingVariables.value[rowKey].description = value;
              }}
              onBlur={() => {
                const edited = editingVariables.value[rowKey];
                if (edited) {
                  handleUpdateVariable(edited, originalKey);
                  delete editingVariables.value[rowKey];
                }
              }}
            />
          );
        },
      },
      {
        title: '操作',
        key: 'actions',
        width: 80,
        render: (row: EnvironmentVariable) => {
          // 如果是新变量，点击删除时直接从待添加列表移除
          const isNewVariable = pendingNewVariables.value.some(v => v.key === row.key);
          
          if (isNewVariable) {
            return (
              <NButton 
                size="small" 
                quaternary 
                type="error"
                onClick={() => {
                  pendingNewVariables.value = pendingNewVariables.value.filter(v => v.key !== row.key);
                }}
              >
                <NIcon>
                  <TrashOutline />
                </NIcon>
              </NButton>
            );
          }
          
          return (
            <NPopconfirm onPositiveClick={() => handleDeleteVariable(row.key)}>
              {{
                trigger: () => (
                  <NButton size="small" quaternary type="error">
                    <NIcon>
                      <TrashOutline />
                    </NIcon>
                  </NButton>
                ),
                default: () => '确认删除此变量？',
              }}
            </NPopconfirm>
          );
        },
      },
    ];

    return {
      environments,
      selectedEnvId,
      selectedEnv,
      editingEnvName,
      isEditing,
      variables,
      editingVariables,
      pendingNewVariables,
      columns,
      handleSelectEnv,
      handleAddEnv,
      handleDeleteEnv,
      handleToggleActive,
      handleUpdateEnvName,
      handleAddVariable,
    };
  },
  render() {
    const { environments, selectedEnv, editingEnvName, isEditing } = this;

    return (
      <NModal
        show={this.$props.show}
        class={modalClass}
        preset="card"
        style={{ width: '900px', maxWidth: '90vw' }}
        title="环境管理"
        closable
        maskClosable
        onUpdateShow={(show: boolean) => {
          this.$props.onUpdateShow(show);
        }}
      >
        <div style={{ display: 'flex', gap: '16px', minHeight: '500px' }}>
                {/* 左侧环境列表 */}
                <div style={{ width: '200px', borderRight: '1px solid #e0e0e0', paddingRight: '16px' }}>
                  <NSpace vertical style={{ width: '100%' }}>
                    <NButton block onClick={this.handleAddEnv}>
                      <NIcon>
                        <AddOutline />
                      </NIcon>
                      新建环境
                    </NButton>
                    <NList class={envListClass}>
                      {environments.map((env) => (
                        <NListItem key={env.id}>
                          <div
                            class={`env-item ${env.id === this.selectedEnvId ? 'active' : ''}`}
                            onClick={() => this.handleSelectEnv(env.id)}
                          >
                            <span>{env.name}</span>
                            <NPopconfirm onPositiveClick={() => this.handleDeleteEnv(env.id)}>
                              {{
                                trigger: () => (
                                  <NButton
                                    size="tiny"
                                    quaternary
                                    type="error"
                                    onClick={(e: Event) => e.stopPropagation()}
                                  >
                                    <NIcon>
                                      <TrashOutline />
                                    </NIcon>
                                  </NButton>
                                ),
                                default: () => '确认删除此环境？',
                              }}
                            </NPopconfirm>
                          </div>
                        </NListItem>
                      ))}
                    </NList>
                  </NSpace>
                </div>

                {/* 右侧环境详情 */}
                <div style={{ flex: 1 }}>
                  {selectedEnv ? (
                    <NSpace vertical style={{ width: '100%' }}>
                      <NSpace align="center">
                        {isEditing ? (
                          <NInput
                            value={editingEnvName}
                            placeholder="环境名称"
                            onUpdateValue={(value: string) => {
                              this.editingEnvName = value;
                            }}
                            onBlur={this.handleUpdateEnvName}
                            onKeydown={(e: KeyboardEvent) => {
                              if (e.key === 'Enter') {
                                this.handleUpdateEnvName();
                              }
                            }}
                            autofocus
                          />
                        ) : (
                          <span onClick={() => { this.isEditing = true; }} style={{ cursor: 'pointer' }}>
                            <NText strong>
                              {selectedEnv.name}
                            </NText>
                          </span>
                        )}
                        <NSpace>
                          <span>激活：</span>
                          <NSwitch
                            value={selectedEnv.isActive}
                            onUpdateValue={() => this.handleToggleActive(selectedEnv.id, selectedEnv.isActive)}
                          />
                        </NSpace>
                      </NSpace>

                      <div class={variableTableClass}>
                        <NSpace vertical style={{ width: '100%' }}>
                          <NButton onClick={this.handleAddVariable}>
                            <NIcon>
                              <AddOutline />
                            </NIcon>
                            添加变量
                          </NButton>
                          <NDataTable 
                            columns={this.columns} 
                            data={this.variables || []}
                            rowKey={(row: any) => row.key || Math.random().toString()}
                            pagination={false}
                            bordered={false}
                            maxHeight={400}
                          />
                        </NSpace>
                      </div>
                    </NSpace>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
                      请选择或创建一个环境
                    </div>
                  )}
                </div>
        </div>
      </NModal>
    );
  },
});
