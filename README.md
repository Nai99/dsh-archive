# dsh-archive

DeepSeek Harness (dsh) 侧边栏归档切换插件 —— 在官方侧边栏会话列表的搜索按钮旁新增一个归档按钮:

- **点击** → 会话列表切换为**归档会话列表**;再次点击 → 恢复普通列表
- 归档模式下**复用官方搜索框**输入即可过滤归档会话
- 每个归档会话右侧有 ⋯ 菜单:**恢复** / **删除**

## 功能

- **归档按钮**:与搜索按钮并排、同尺寸(实测跟随),官方图标按钮样式,带归档数量提示
- **归档视图**:归档会话列表(标题 + 更新时间),点击行直接打开会话;顶部显示归档数量
- **复用官方搜索**:归档模式下官方搜索框输入实时过滤归档列表(按标题匹配),退出归档模式后恢复官方搜索行为
- **⋯ 菜单**:每行右侧悬停显示横排三点,弹窗含:
  - **恢复**:取消归档,会话立即回到正常列表(官方 state 通道 + host 广播,所有端即时同步)
  - **删除**:运行中的会话拒绝删除;持久化文件移入 `~/.dsh/dsh-archive-trash/` 回收站(可手动找回)
- **官方样式**:全部使用 dsh 官方 CSS 变量(按钮/列表/弹窗),随日间/深色主题自适应;图标字体本地托管,无 CDN
- **性能**:MutationObserver 忽略自身变更 + 列表签名守卫,无自触发循环

## 安装

前置:已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(`dsh web` 可运行)。

### 方式一:GitHub 源

```sh
dsh plugin --profile web add github:Nai99/dsh-archive#main
```

> pnpm 11 的 release-age 门禁可能拦截刚发布的版本,如遇 `declares no dsh.bundle` 报错,在 `~/.dsh/profiles/web/pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 中加入 `dsh-archive@0.1.0` 后重试。

### 方式二:本地目录(开发调试)

```sh
git clone https://github.com/Nai99/dsh-archive.git
dsh plugin --profile web add /path/to/dsh-archive
```

安装后**重启 `dsh web`**,刷新浏览器。

## 使用

1. 打开侧边栏(展开状态),会话列表标题行出现归档按钮(📦,搜索按钮左侧);
2. 点击进入归档视图,再次点击恢复;
3. 归档模式下用官方搜索框过滤;点行打开会话,悬停行尾 ⋯ 选择恢复或删除。

## 说明

- dsh 官方目前**只有归档(archiveSession)API,没有取消归档接口**;本插件的「恢复」通过 workspace 存储域 global 更新 + registry 内存同步实现(与 dsh-delete-session 插件的 unarchive 同一官方通道),host 会广播归档集合变更,所有客户端即时同步
- 「删除」将会话归档标记清除后,把持久化产物移入 `~/.dsh/dsh-archive-trash/` 回收站目录,而非直接删除,可手动找回

## 项目结构

```
lib/
  client.js  客户端:归档按钮注入、归档视图、官方搜索复用、⋯ 菜单(恢复/删除)
  index.js   Node 半侧:/dsh-archive/restore|delete 路由 + remixicon 静态资源
  remixicon/ 图标字体资源
cordis.patch.yml  打包挂载配置
```

## 许可证

[MIT](LICENSE)
