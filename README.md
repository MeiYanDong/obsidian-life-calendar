# Life Calendar - Obsidian 插件

人生日历可视化插件 - 用格子可视化你的一生，每一天都是一个彩色方块。

## 功能

- 以 GitHub 贡献图风格展示你的人生日历
- 自动扫描每日笔记，识别日期和颜色标记
- 点击格子直接打开对应笔记，无笔记则自动创建
- 自定义调色板，为不同事件设置专属颜色
- **精彩程度**：通过不透明度区分日子的重要性（1-5 级）
- 自动跟随 Obsidian 主题（深色/浅色）
- 实时响应笔记变化

## 安装

### 手动安装

1. 下载 `main.js`、`manifest.json`、`styles.css`
2. 在 Obsidian 库中创建 `.obsidian/plugins/life-calendar/` 文件夹
3. 将下载的文件复制到该文件夹
4. 重启 Obsidian
5. 在设置 → 第三方插件中启用「Life Calendar」

### 从源码构建

```bash
cd obsidian-plugin
npm install
npm run build
```

## 使用

1. 点击左侧边栏的日历图标，或使用命令面板搜索「Life Calendar」
2. 在设置中配置：
   - **出生日期**：用于计算年龄
   - **预期寿命**：日历显示的年数
   - **每日笔记文件夹**：留空则扫描整个库
   - **调色板**：自定义颜色分类

## 每日笔记格式

插件识别以下格式的笔记：

### 文件名格式
- `YYYY-MM-DD.md`（如 `2025-12-19.md`）

### YAML 元数据（简化格式）

```yaml
---
date: 2025-12-19
lifeCalendar: 里程碑
---
```

直接填写颜色分类名：`里程碑`、`生日`、`成就`、`旅行`、`纪念日`、`庆祝`，不填则使用默认颜色。

### 带精彩程度

```yaml
---
date: 2025-12-19
lifeCalendar: 里程碑
lifeCalendarIntensity: 3
---
```

精彩程度 `lifeCalendarIntensity` 用于区分日子的重要性，数值越大颜色越深：
- 级别 1：20% 不透明度
- 级别 2：40% 不透明度
- 级别 3：60% 不透明度
- 级别 4：80% 不透明度
- 级别 5：100% 不透明度

可在设置中自定义级别数量和各级不透明度。

### 完整格式（可选）

```yaml
---
date: 2025-12-19
lifeCalendar:
  colorKey: 里程碑
  color: "#FF8A00"   # 自定义颜色（覆盖 colorKey）
  special: true      # 标记为特殊日
lifeCalendarIntensity: 5
---
```

## 默认调色板

| 分类 | 颜色 |
|------|------|
| 默认 | #D1D5DB |
| 里程碑 | #FF8A00 |
| 生日 | #F59E0B |
| 成就 | #10B981 |
| 旅行 | #3B82F6 |
| 纪念日 | #6366F1 |
| 庆祝 | #EC4899 |

可在设置中自定义添加或修改颜色。

## 开发

```bash
# 开发模式（监听文件变化）
npm run dev

# 生产构建
npm run build
```

## 许可证

MIT License
