import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  WorkspaceLeaf,
  ItemView,
  TFile,
  parseYaml,
  Notice,
} from "obsidian";

// ============ 类型定义 ============

interface DayTraceSettings {
  birthDate: string;
  lifeExpectancy: number;
  dailyNotesFolder: string;
  palette: Record<string, string>;
}

interface DayData {
  date: string;
  file: TFile;
  color?: string;
  colorKey?: string;
  special?: boolean;
}

const DEFAULT_SETTINGS: DayTraceSettings = {
  birthDate: "2000-01-01",
  lifeExpectancy: 90,
  dailyNotesFolder: "",
  palette: {
    默认: "#D1D5DB",
    里程碑: "#FF8A00",
    生日: "#F59E0B",
    成就: "#10B981",
    旅行: "#3B82F6",
    纪念日: "#6366F1",
    庆祝: "#EC4899",
  },
};

const VIEW_TYPE_DAYTRACE = "daytrace-view";

// ============ 主插件类 ============

export default class DayTracePlugin extends Plugin {
  settings: DayTraceSettings;

  async onload() {
    await this.loadSettings();

    // 注册视图
    this.registerView(VIEW_TYPE_DAYTRACE, (leaf) => new DayTraceView(leaf, this));

    // 添加侧边栏图标
    this.addRibbonIcon("calendar-days", "日迹 DayTrace", () => {
      this.activateView();
    });

    // 添加命令
    this.addCommand({
      id: "open-daytrace",
      name: "打开日迹人生日历",
      callback: () => {
        this.activateView();
      },
    });

    // 添加设置页
    this.addSettingTab(new DayTraceSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // 刷新视图
    this.app.workspace.getLeavesOfType(VIEW_TYPE_DAYTRACE).forEach((leaf) => {
      if (leaf.view instanceof DayTraceView) {
        leaf.view.refresh();
      }
    });
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_DAYTRACE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      await leaf?.setViewState({ type: VIEW_TYPE_DAYTRACE, active: true });
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}

// ============ 日历视图 ============

class DayTraceView extends ItemView {
  plugin: DayTracePlugin;
  dayDataMap: Map<string, DayData> = new Map();
  private calendarWrapper: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DayTracePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_DAYTRACE;
  }

  getDisplayText() {
    return "日迹";
  }

  getIcon() {
    return "calendar-days";
  }

  async onOpen() {
    await this.loadDayData();
    this.render();

    // 监听文件变化
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.onFileChange(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.onFileChange(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.loadDayData().then(() => this.render(true)); // 保持滚动位置
        }
      })
    );
  }

  async onClose() {}

  async refresh() {
    await this.loadDayData();
    this.render();
  }

  async onFileChange(file: TFile) {
    const dayData = await this.parseDayData(file);
    if (dayData) {
      this.dayDataMap.set(dayData.date, dayData);
      this.render(true); // 保持滚动位置
    }
  }

  // 解析单个文件的日数据
  async parseDayData(file: TFile): Promise<DayData | null> {
    const content = await this.app.vault.read(file);
    const frontMatter = this.parseFrontMatter(content);

    // 尝试从 frontmatter 获取日期
    let date = frontMatter?.date;

    // 尝试从文件名获取日期
    if (!date) {
      const match = file.basename.match(/^(\d{4}-\d{2}-\d{2})$/);
      if (match) {
        date = match[1];
      }
    }

    if (!date) return null;

    // 支持简化格式: lifeCalendar: 里程碑
    // 也支持完整格式: lifeCalendar: { colorKey, color, special }
    const lifeCalendar = frontMatter?.lifeCalendar;

    let colorKey: string | undefined;
    let color: string | undefined;
    let special: boolean | undefined;

    if (lifeCalendar) {
      if (typeof lifeCalendar === 'string') {
        // 简化格式: lifeCalendar: 里程碑
        colorKey = lifeCalendar;
        special = true;
      } else if (typeof lifeCalendar === 'object') {
        // 完整格式: lifeCalendar: { colorKey: 里程碑, color: "#FF0000" }
        colorKey = lifeCalendar.colorKey;
        color = lifeCalendar.color;
        special = lifeCalendar.special;
      }
    }

    return {
      date,
      file,
      color,
      colorKey,
      special,
    };
  }

  // 解析 YAML front matter
  parseFrontMatter(content: string): Record<string, any> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    try {
      return parseYaml(match[1]);
    } catch {
      return null;
    }
  }

  // 加载所有日数据
  async loadDayData() {
    this.dayDataMap.clear();

    const files = this.app.vault.getMarkdownFiles();
    const folder = this.plugin.settings.dailyNotesFolder;

    for (const file of files) {
      // 如果设置了文件夹，只扫描该文件夹
      if (folder && !file.path.startsWith(folder)) {
        continue;
      }

      const dayData = await this.parseDayData(file);
      if (dayData) {
        this.dayDataMap.set(dayData.date, dayData);
      }
    }
  }

  // 渲染日历
  render(preserveScroll = false) {
    // 保存滚动位置
    const scrollTop = preserveScroll && this.calendarWrapper ? this.calendarWrapper.scrollTop : 0;

    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("daytrace-container");

    const settings = this.plugin.settings;
    const birthDate = new Date(settings.birthDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 头部
    const header = container.createDiv({ cls: "daytrace-header" });
    header.createEl("h2", { text: "人生日历" });

    const stats = header.createDiv({ cls: "daytrace-stats" });
    const totalDays = settings.lifeExpectancy * 365;
    const livedDays = Math.floor((today.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
    const notesCount = this.dayDataMap.size;

    stats.createSpan({ text: `${notesCount} 篇日记`, cls: "stat-item" });
    stats.createSpan({ text: `${settings.lifeExpectancy} 年`, cls: "stat-item" });

    // 图例
    const legend = container.createDiv({ cls: "daytrace-legend" });
    for (const [key, color] of Object.entries(settings.palette)) {
      const item = legend.createDiv({ cls: "legend-item" });
      item.createDiv({ cls: "legend-color", attr: { style: `background-color: ${color}` } });
      item.createSpan({ text: key });
    }

    // 导航栏
    const nav = container.createDiv({ cls: "daytrace-nav" });

    // 跳转到年龄
    const ageSelect = nav.createEl("select", { cls: "age-select" });
    for (let age = 0; age <= settings.lifeExpectancy; age++) {
      const option = ageSelect.createEl("option", { value: String(age), text: `${age} 岁` });
      const currentAge = Math.floor(livedDays / 365);
      if (age === currentAge) {
        option.selected = true;
      }
    }
    ageSelect.addEventListener("change", () => {
      const targetAge = parseInt(ageSelect.value);
      const yearEl = container.querySelector(`[data-age="${targetAge}"]`);
      yearEl?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    // 今天按钮
    const todayBtn = nav.createEl("button", { text: "今天", cls: "today-btn" });
    todayBtn.addEventListener("click", () => {
      const todayEl = container.querySelector(".day-cell.today");
      todayEl?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    // 日历网格
    this.calendarWrapper = container.createDiv({ cls: "daytrace-calendar-wrapper" });
    const calendar = this.calendarWrapper.createDiv({ cls: "daytrace-calendar" });

    // 渲染每一年
    for (let age = 0; age <= settings.lifeExpectancy; age++) {
      const yearStart = new Date(birthDate);
      yearStart.setFullYear(birthDate.getFullYear() + age);
      const year = yearStart.getFullYear();

      const yearBlock = calendar.createDiv({ cls: "year-block", attr: { "data-age": String(age) } });

      // 年份标题
      const yearHeader = yearBlock.createDiv({ cls: "year-header" });
      yearHeader.createSpan({ text: `${year}`, cls: "year-label" });
      yearHeader.createSpan({ text: `${age} 岁`, cls: "age-label" });

      // 月份标签
      const monthLabels = yearBlock.createDiv({ cls: "month-labels" });
      const months = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
      for (const month of months) {
        monthLabels.createSpan({ text: month, cls: "month-label" });
      }

      // 日格子
      const daysGrid = yearBlock.createDiv({ cls: "days-grid" });

      // 获取该年第一天是周几 (0-6, 0是周日)
      const yearStartDay = new Date(year, 0, 1);
      const startDayOfWeek = yearStartDay.getDay();

      // 调整为周一开始 (0-6, 0是周一)
      const adjustedStart = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

      // 渲染7行（周一到周日）
      for (let weekday = 0; weekday < 7; weekday++) {
        const row = daysGrid.createDiv({ cls: "week-row" });

        // 53周
        for (let week = 0; week < 53; week++) {
          // 计算这一天在年初的偏移
          const dayOffset = week * 7 + weekday - adjustedStart;
          const cellDate = new Date(year, 0, 1 + dayOffset);

          const cell = row.createDiv({ cls: "day-cell" });

          // 检查日期是否有效（属于当年）
          if (cellDate.getFullYear() !== year) {
            cell.addClass("empty");
            continue;
          }

          // 检查是否在出生前
          if (cellDate < birthDate) {
            cell.addClass("before-birth");
            continue;
          }

          // 检查是否在未来
          if (cellDate > today) {
            cell.addClass("future");
            continue;
          }

          // 格式化日期
          const dateStr = this.formatDate(cellDate);
          cell.setAttribute("data-date", dateStr);

          // 检查是否是今天
          if (this.formatDate(today) === dateStr) {
            cell.addClass("today");
          }

          // 获取日数据
          const dayData = this.dayDataMap.get(dateStr);

          if (dayData) {
            cell.addClass("has-note");

            // 设置颜色
            let color = settings.palette["默认"];
            if (dayData.color) {
              color = dayData.color;
            } else if (dayData.colorKey && settings.palette[dayData.colorKey]) {
              color = settings.palette[dayData.colorKey];
            }
            cell.style.backgroundColor = color;

            if (dayData.special) {
              cell.addClass("special");
            }
          } else {
            cell.addClass("no-note");
          }

          // 点击事件
          cell.addEventListener("click", () => {
            if (dayData) {
              // 打开已有笔记
              this.app.workspace.getLeaf().openFile(dayData.file);
            } else {
              // 创建新笔记
              this.createDailyNote(dateStr);
            }
          });

          // 悬停提示
          cell.setAttribute("aria-label", dateStr);
        }
      }
    }

    // 恢复滚动位置
    if (preserveScroll && scrollTop > 0 && this.calendarWrapper) {
      this.calendarWrapper.scrollTop = scrollTop;
    }
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  async createDailyNote(dateStr: string) {
    const folder = this.plugin.settings.dailyNotesFolder;
    const fileName = `${dateStr}.md`;
    const filePath = folder ? `${folder}/${fileName}` : fileName;

    // 检查文件是否已存在
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) {
      this.app.workspace.getLeaf().openFile(existing);
      return;
    }

    // 创建新文件
    const content = `---
date: ${dateStr}
---

# ${dateStr}

`;

    try {
      // 确保文件夹存在
      if (folder) {
        const folderExists = this.app.vault.getAbstractFileByPath(folder);
        if (!folderExists) {
          await this.app.vault.createFolder(folder);
        }
      }

      const file = await this.app.vault.create(filePath, content);
      this.app.workspace.getLeaf().openFile(file);
      new Notice(`已创建: ${fileName}`);
    } catch (error) {
      new Notice(`创建失败: ${error}`);
    }
  }
}

// ============ 设置页 ============

class DayTraceSettingTab extends PluginSettingTab {
  plugin: DayTracePlugin;

  constructor(app: App, plugin: DayTracePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "日迹 DayTrace 设置" });

    // 出生日期
    new Setting(containerEl)
      .setName("出生日期")
      .setDesc("用于计算年龄和生成日历")
      .addText((text) =>
        text
          .setPlaceholder("YYYY-MM-DD")
          .setValue(this.plugin.settings.birthDate)
          .onChange(async (value) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              this.plugin.settings.birthDate = value;
              await this.plugin.saveSettings();
            }
          })
      );

    // 预期寿命
    new Setting(containerEl)
      .setName("预期寿命")
      .setDesc("日历显示的年数")
      .addSlider((slider) =>
        slider
          .setLimits(50, 120, 1)
          .setValue(this.plugin.settings.lifeExpectancy)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.lifeExpectancy = value;
            await this.plugin.saveSettings();
          })
      );

    // 每日笔记文件夹
    new Setting(containerEl)
      .setName("每日笔记文件夹")
      .setDesc("留空则扫描整个库")
      .addText((text) =>
        text
          .setPlaceholder("Daily Notes")
          .setValue(this.plugin.settings.dailyNotesFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNotesFolder = value;
            await this.plugin.saveSettings();
          })
      );

    // 调色板
    containerEl.createEl("h3", { text: "调色板" });

    for (const [key, color] of Object.entries(this.plugin.settings.palette)) {
      new Setting(containerEl)
        .setName(key)
        .addColorPicker((picker) =>
          picker.setValue(color).onChange(async (value) => {
            this.plugin.settings.palette[key] = value;
            await this.plugin.saveSettings();
          })
        )
        .addExtraButton((btn) =>
          btn
            .setIcon("trash")
            .setTooltip("删除")
            .onClick(async () => {
              if (key === "默认") {
                new Notice("无法删除默认颜色");
                return;
              }
              delete this.plugin.settings.palette[key];
              await this.plugin.saveSettings();
              this.display();
            })
        );
    }

    // 添加新颜色
    new Setting(containerEl)
      .setName("添加新颜色")
      .addText((text) => text.setPlaceholder("颜色名称").onChange(() => {}))
      .addColorPicker((picker) => picker.setValue("#3B82F6"))
      .addButton((btn) =>
        btn.setButtonText("添加").onClick(async () => {
          const nameInput = containerEl.querySelector(
            ".setting-item:last-child input[type='text']"
          ) as HTMLInputElement;
          const colorInput = containerEl.querySelector(
            ".setting-item:last-child input[type='color']"
          ) as HTMLInputElement;

          if (nameInput && colorInput && nameInput.value) {
            this.plugin.settings.palette[nameInput.value] = colorInput.value;
            await this.plugin.saveSettings();
            this.display();
          }
        })
      );
  }
}
